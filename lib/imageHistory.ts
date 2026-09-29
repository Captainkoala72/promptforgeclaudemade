import type { PromptImage } from "./images";

const DB_NAME = "prompt-forge-images";
const STORE = "runs";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, resolve: (value: T) => void) => void
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      action(tx.objectStore(STORE), (value) => { result = value; });
    });
  } finally {
    db.close();
  }
}

export function saveRunImages(id: string, images: PromptImage[]): Promise<void> {
  return transaction<void>("readwrite", (store, resolve) => {
    const request = store.put(images, id);
    request.onsuccess = () => resolve();
  });
}

export function loadRunImages(id: string): Promise<PromptImage[]> {
  return transaction<PromptImage[]>("readonly", (store, resolve) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
  });
}

export function clearRunImages(): Promise<void> {
  return transaction<void>("readwrite", (store, resolve) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
  });
}

export function pruneRunImages(ids: string[]): Promise<void> {
  const keep = new Set(ids);
  return transaction<void>("readwrite", (store, resolve) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve();
      if (!keep.has(String(cursor.key))) cursor.delete();
      cursor.continue();
    };
  });
}
