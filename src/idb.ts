// Minimal promise wrapper over a single-store IndexedDB database. Shared by the page bundle and
// the service worker (same origin, same database) — which is exactly why localStorage, absent in
// workers, is not an option here.

const DB_NAME = 'moonsender-push'
const STORE = 'kv'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexeddb open failed'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('indexeddb request failed'))
    })
  } finally {
    db.close()
  }
}

export async function idbGet(key: string): Promise<string | undefined> {
  const value = await withStore('readonly', (store) => store.get(key))
  return typeof value === 'string' ? value : undefined
}

export async function idbSet(key: string, value: string): Promise<void> {
  await withStore('readwrite', (store) => store.put(value, key))
}

export async function idbDel(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(key))
}

export const KEY_INSTALLATION = 'installation_id'
export const KEY_TOKEN = 'token'
export const KEY_CONFIG = 'config'
