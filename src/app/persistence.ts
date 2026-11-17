import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './platform';

/**
 * Where saves live. The sim only makes and reads the save text; this file
 * decides where the text goes. See DESIGN.md section 17.5.
 *
 * - Web: IndexedDB, and the app asks the browser to keep it.
 * - iOS app: files in the app's Library folder, which the system never clears
 *   and which is part of the phone's backup.
 */

/**
 * Two campuses can be kept (DESIGN.md 79): the player's own, under the keys it has always had, and a sandbox beside it
 * under keys of its own. Every function that reads or writes a campus names its slot; nothing written for the sandbox
 * ever goes under the real campus's keys.
 */
export type SaveSlot = 'real' | 'sandbox';
const KEYS: Readonly<Record<SaveSlot, { save: string; backup: string; web: string }>> = {
  real: { save: 'save', backup: 'backup', web: 'web' },
  sandbox: { save: 'sandbox-save', backup: 'sandbox-backup', web: 'sandbox-web' },
};
/** Which campus is open, and each one's name for the Menu: a small record of its own. */
const SLOTS_KEY = 'slots';

interface Backend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// ------------------------------------------------------------------ web --

const DB_NAME = 'campus-tycoon';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open storage.'));
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error('Storage failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('Storage was interrupted.'));
    });
  } finally {
    db.close();
  }
}

const webBackend: Backend = {
  async get(key) {
    const value = await run<unknown>('readonly', (s) => s.get(key));
    return typeof value === 'string' ? value : null;
  },
  async set(key, value) {
    await run('readwrite', (s) => s.put(value, key));
  },
  async remove(key) {
    await run('readwrite', (s) => s.delete(key));
  },
};

// ------------------------------------------------------------------ iOS --

const SAVE_FOLDER = 'saves';
const fileFor = (key: string): string => `${SAVE_FOLDER}/${key}.json`;

const nativeBackend: Backend = {
  async get(key) {
    try {
      const result = await Filesystem.readFile({ path: fileFor(key), directory: Directory.Library, encoding: Encoding.UTF8 });
      return typeof result.data === 'string' ? result.data : null;
    } catch {
      // No file yet.
      return null;
    }
  },
  async set(key, value) {
    await Filesystem.writeFile({
      path: fileFor(key),
      directory: Directory.Library,
      encoding: Encoding.UTF8,
      data: value,
      recursive: true,
    });
  },
  async remove(key) {
    try {
      await Filesystem.deleteFile({ path: fileFor(key), directory: Directory.Library });
    } catch {
      // Already gone.
    }
  },
};

const backend: Backend = isNative ? nativeBackend : webBackend;

// --------------------------------------------------------------- shared --

/** Ask the browser not to evict the save. Returns whether it agreed. The app's own files are always kept. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (isNative) return true;
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersistent(): Promise<boolean> {
  if (isNative) return true;
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

export interface StoredSaves {
  save: string | null;
  backup: string | null;
}

export async function readSaves(slot: SaveSlot = 'real'): Promise<StoredSaves> {
  try {
    return { save: await backend.get(KEYS[slot].save), backup: await backend.get(KEYS[slot].backup) };
  } catch {
    return { save: null, backup: null };
  }
}

const lastBackupAt: Record<SaveSlot, number> = { real: 0, sandbox: 0 };

/** Write a campus's save. Its previous save is kept as its backup, refreshed at most once a minute. */
export async function writeSave(text: string, slot: SaveSlot = 'real'): Promise<void> {
  const now = Date.now();
  if (now - lastBackupAt[slot] > 60_000) {
    const previous = await backend.get(KEYS[slot].save);
    if (previous) await backend.set(KEYS[slot].backup, previous);
    lastBackupAt[slot] = now;
  }
  await backend.set(KEYS[slot].save, text);
}

/** Forget one campus: its save, its backup and its social web. The other is left as it is. */
export async function clearSaves(slot: SaveSlot = 'real'): Promise<void> {
  await backend.remove(KEYS[slot].save);
  await backend.remove(KEYS[slot].backup);
  await backend.remove(KEYS[slot].web);
}

/** Which campus is open and what each is called (DESIGN.md 79). `clock`: the tester clock's shift the real campus had. */
export interface SlotRecord {
  open: SaveSlot;
  names: Partial<Record<SaveSlot, string>>;
  realClock?: number;
}

export async function readSlots(): Promise<SlotRecord> {
  try {
    const text = await backend.get(SLOTS_KEY);
    const parsed = text ? (JSON.parse(text) as Partial<SlotRecord>) : null;
    const open: SaveSlot = parsed?.open === 'sandbox' ? 'sandbox' : 'real';
    const names = parsed?.names && typeof parsed.names === 'object' ? parsed.names : {};
    return { open, names, ...(typeof parsed?.realClock === 'number' ? { realClock: parsed.realClock } : {}) };
  } catch {
    return { open: 'real', names: {} };
  }
}

export async function writeSlots(record: SlotRecord): Promise<void> {
  try {
    await backend.set(SLOTS_KEY, JSON.stringify(record));
  } catch {
    // Storage can fail in private browsing: the real campus opens next time.
  }
}

// ------------------------------------------------------------- the web --

/**
 * The social web's record (DESIGN.md 63.5): every student's ties, kept apart from the save (decision 3) and written
 * once a game week. The worker squeezes it to text (src/app/webRecord.ts); here it is only stored and read.
 */
export async function readWebRecord(slot: SaveSlot = 'real'): Promise<string | null> {
  try {
    return (await backend.get(KEYS[slot].web)) || null;
  } catch {
    // A record that cannot be read is grown again from the seed, as a long absence is.
    return null;
  }
}

export async function writeWebRecord(record: string, slot: SaveSlot = 'real'): Promise<void> {
  try {
    await backend.set(KEYS[slot].web, record);
  } catch {
    // Storage can fail in private browsing: the web is grown again next time.
  }
}

function exportFileName(schoolName: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = schoolName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'campus';
  return `${safeName}-save-${stamp}.json`;
}

/** iOS app: write the file where the share sheet can reach it, then open the share sheet. */
async function exportNative(text: string, fileName: string): Promise<'shared'> {
  const written = await Filesystem.writeFile({
    path: `exports/${fileName}`,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    data: text,
    recursive: true,
  });
  try {
    await Share.share({ title: 'Campus Tycoon save', files: [written.uri], dialogTitle: 'Save your campus' });
  } catch {
    // The player closed the share sheet.
  }
  return 'shared';
}

/** Hand the save to the player as a file: the share sheet on a phone, a download elsewhere. */
export async function exportSave(text: string, schoolName: string): Promise<'shared' | 'downloaded'> {
  const fileName = exportFileName(schoolName);
  if (isNative) return exportNative(text, fileName);

  const file = new File([text], fileName, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Campus Tycoon save' });
      return 'shared';
    } catch (err) {
      // The player closed the share sheet. Fall through to a plain download unless they cancelled.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** Let the player pick a save file. Resolves with its text, or null if they picked nothing. */
export function pickSaveFile(): Promise<string | null> {
  return new Promise((resolve) => {
    // Any stale picker from a visit where nothing was chosen.
    document.querySelectorAll('input[data-save-picker]').forEach((old) => old.remove());

    const input = document.createElement('input');
    input.type = 'file';
    // The iOS file picker can be strict about types, so the app accepts any file there and checks what it is given.
    if (!isNative) input.accept = 'application/json,.json';
    input.dataset.savePicker = 'yes';
    input.style.display = 'none';
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      resolve(file ? await file.text() : null);
    };
    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    document.body.appendChild(input);
    input.click();
  });
}
