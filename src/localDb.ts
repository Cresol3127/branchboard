/**
 * Browser-local structured storage for data that must not bloat localStorage:
 * automatic recovery versions, uploaded file bytes, extracted text and RAG chunks.
 * A missing/blocked IndexedDB degrades visibly; it never silently replaces saved data.
 */
const DB_NAME = 'branchboard.local.v1';
const DB_VERSION = 1;

export type StoreName = 'versions' | 'attachmentBlobs' | 'ragChunks';

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Browser storage request failed.'));
  });
}

let opening: Promise<IDBDatabase> | null = null;
export function openLocalDatabase(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not provide IndexedDB storage.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('versions')) {
        const store = database.createObjectStore('versions', { keyPath: 'id' });
        store.createIndex('boardId', 'boardId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!database.objectStoreNames.contains('attachmentBlobs'))
        database.createObjectStore('attachmentBlobs', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('ragChunks')) {
        const store = database.createObjectStore('ragChunks', { keyPath: 'id' });
        store.createIndex('collectionId', 'collectionId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Browser storage could not be opened.'));
    request.onblocked = () =>
      reject(
        new Error('Browser storage is blocked by another open tab. Close other tabs and retry.'),
      );
  });
  return opening;
}

export async function allRecords<T>(storeName: StoreName): Promise<T[]> {
  const database = await openLocalDatabase();
  return requestResult(database.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

export async function getRecord<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const database = await openLocalDatabase();
  return requestResult(database.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

export async function putRecord<T>(storeName: StoreName, value: T): Promise<void> {
  const database = await openLocalDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value as unknown as object);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('Browser storage write failed.'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('Browser storage write was aborted.'));
  });
}

export async function deleteRecord(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const database = await openLocalDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(key);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('Browser storage delete failed.'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('Browser storage delete was aborted.'));
  });
}

export async function deleteRecords(storeName: StoreName, keys: IDBValidKey[]): Promise<void> {
  if (!keys.length) return;
  const database = await openLocalDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  keys.forEach((key) => store.delete(key));
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('Browser storage delete failed.'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('Browser storage delete was aborted.'));
  });
}

export async function clearStore(storeName: StoreName): Promise<void> {
  const database = await openLocalDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).clear();
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('Browser storage clear failed.'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('Browser storage clear was aborted.'));
  });
}

/** Test hook; production tabs keep the shared connection. */
export function closeLocalDatabaseForTests() {
  opening?.then((database) => database.close()).catch(() => {});
  opening = null;
}
