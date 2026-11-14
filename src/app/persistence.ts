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

const SAVE_KEY = 'save';
const BACKUP_KEY = 'backup';

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

export async function readSaves(): Promise<StoredSaves> {
  try {
    return { save: await backend.get(SAVE_KEY), backup: await backend.get(BACKUP_KEY) };
  } catch {
    return { save: null, backup: null };
  }
}

let lastBackupAt = 0;

/** Write the save. The previous save is kept as a backup, refreshed at most once a minute. */
export async function writeSave(text: string): Promise<void> {
  const now = Date.now();
  if (now - lastBackupAt > 60_000) {
    const previous = await backend.get(SAVE_KEY);
    if (previous) await backend.set(BACKUP_KEY, previous);
    lastBackupAt = now;
  }
  await backend.set(SAVE_KEY, text);
}

export async function clearSaves(): Promise<void> {
  await backend.remove(SAVE_KEY);
  await backend.remove(BACKUP_KEY);
  await backend.remove(WEB_KEY);
}

// ------------------------------------------------------------- the web --

/**
 * The social web's record (DESIGN.md 63.5): every student's ties, kept apart from the save (decision 3) and written
 * once a game week. The worker squeezes it to text (src/app/webRecord.ts); here it is only stored and read.
 */
const WEB_KEY = 'web';

export async function readWebRecord(): Promise<string | null> {
  try {
    return (await backend.get(WEB_KEY)) || null;
  } catch {
    // A record that cannot be read is grown again from the seed, as a long absence is.
    return null;
  }
}

export async function writeWebRecord(record: string): Promise<void> {
  try {
    await backend.set(WEB_KEY, record);
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
