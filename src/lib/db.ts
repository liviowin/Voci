/**
 * Schlanker, promise-basierter Zugriff auf IndexedDB (ohne Zusatzbibliothek).
 * Alle Daten bleiben im Browser; nichts wird an einen Server übertragen.
 */
export const DB_NAME = 'franzoesisch-lernen'
export const DB_VERSION = 1

export const STORES = ['lists', 'words', 'cards', 'logs', 'exams', 'tests', 'kv'] as const
export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB wird von diesem Browser nicht unterstützt.'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (ev) => {
      const db = req.result
      // Migrationen schrittweise nach Version
      if (ev.oldVersion < 1) {
        db.createObjectStore('lists', { keyPath: 'id' })
        const words = db.createObjectStore('words', { keyPath: 'id' })
        words.createIndex('listId', 'listId')
        const cards = db.createObjectStore('cards', { keyPath: 'id' })
        cards.createIndex('wordId', 'wordId')
        const logs = db.createObjectStore('logs', { keyPath: 'id' })
        logs.createIndex('ts', 'ts')
        logs.createIndex('cardId', 'cardId')
        db.createObjectStore('exams', { keyPath: 'id' })
        db.createObjectStore('tests', { keyPath: 'id' })
        db.createObjectStore('kv')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Datenbank konnte nicht geöffnet werden.'))
    req.onblocked = () => reject(new Error('Die Datenbank ist in einem anderen Tab blockiert. Bitte andere Tabs schliessen.'))
  })
  return dbPromise
}

const wrap = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transaktion abgebrochen'))
  })

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return wrap(db.transaction('kv').objectStore('kv').get(key)) as Promise<T | undefined>
}

export async function setKv(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('kv', 'readwrite')
  tx.objectStore('kv').put(value, key)
  return done(tx)
}

export interface WriteOp {
  store: StoreName
  put?: unknown[]
  del?: string[]
}

/** Mehrere Änderungen atomar in einer Transaktion schreiben. */
export async function write(ops: WriteOp[]): Promise<void> {
  const names = [...new Set(ops.map((o) => o.store))]
  if (!names.length) return
  const db = await openDb()
  const tx = db.transaction(names, 'readwrite')
  for (const op of ops) {
    const s = tx.objectStore(op.store)
    op.put?.forEach((v) => s.put(v))
    op.del?.forEach((k) => s.delete(k))
  }
  return done(tx)
}

export async function clearAll(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([...STORES], 'readwrite')
  STORES.forEach((s) => tx.objectStore(s).clear())
  return done(tx)
}

/** Browser bitten, die Daten nicht automatisch zu löschen. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  ).replace(/-/g, '').slice(0, 16)
