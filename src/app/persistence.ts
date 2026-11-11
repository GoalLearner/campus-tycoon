/**
 * Where saves live. On the web that is IndexedDB, and the app asks the browser
 * to keep it. The sim only makes and reads the save text; this file decides
 * where the text goes. See DESIGN.md section 17.5.
 */

const DB_NAME = 'campus-tycoon';
const STORE = 'kv';
const SAVE_KEY = 'save';
const BACKUP_KEY = 'backup';

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

async function get(key: string): Promise<string | null> {
  const value = await run<unknown>('readonly', (s) => s.get(key));
  return typeof value === 'string' ? value : null;
}

async function set(key: string, value: string): Promise<void> {
  await run('readwrite', (s) => s.put(value, key));
}

async function remove(key: string): Promise<void> {
  await run('readwrite', (s) => s.delete(key));
}

/** Ask the browser not to evict the save. Returns whether it agreed. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersistent(): Promise<boolean> {
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
    return { save: await get(SAVE_KEY), backup: await get(BACKUP_KEY) };
  } catch {
    return { save: null, backup: null };
  }
}

let lastBackupAt = 0;

/** Write the save. The previous save is kept as a backup, refreshed at most once a minute. */
export async function writeSave(text: string): Promise<void> {
  const now = Date.now();
  if (now - lastBackupAt > 60_000) {
    const previous = await get(SAVE_KEY);
    if (previous) await set(BACKUP_KEY, previous);
    lastBackupAt = now;
  }
  await set(SAVE_KEY, text);
}

export async function clearSaves(): Promise<void> {
  await remove(SAVE_KEY);
  await remove(BACKUP_KEY);
}

/** Hand the save to the player as a file: the share sheet on a phone, a download elsewhere. */
export async function exportSave(text: string, schoolName: string): Promise<'shared' | 'downloaded'> {
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = schoolName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'campus';
  const fileName = `${safeName}-save-${stamp}.json`;
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
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
