/**
 * Artwork storage in IndexedDB, on this device. Saved artworks live in
 * "artworks"; the working copy (including unsaved changes) is kept in "meta"
 * so it survives a crash or a closed tab.
 */

export interface Artwork {
  id: string
  name: string
  svg: string
  created: number
  updated: number
}

export interface Draft {
  id: string | null
  name: string
  svg: string
}

let dbp: Promise<IDBDatabase> | null = null

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('cartoon-studio', 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('artworks', { keyPath: 'id' })
      req.result.createObjectStore('meta', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const listArtworks = async () => (await run<Artwork[]>('artworks', 'readonly', (s) => s.getAll())).sort((a, b) => b.updated - a.updated)
export const getArtwork = (id: string) => run<Artwork | undefined>('artworks', 'readonly', (s) => s.get(id))
export const putArtwork = (a: Artwork) => run('artworks', 'readwrite', (s) => s.put(a))
export const deleteArtwork = (id: string) => run('artworks', 'readwrite', (s) => s.delete(id))

export const getDraft = async () => (await run<{ key: string; draft: Draft } | undefined>('meta', 'readonly', (s) => s.get('draft')))?.draft
export const putDraft = (draft: Draft) => run('meta', 'readwrite', (s) => s.put({ key: 'draft', draft }))

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
