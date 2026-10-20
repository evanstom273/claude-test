import Dexie, { type Table } from 'dexie'

/**
 * Everything the studio keeps lives in IndexedDB on this device, through
 * Dexie: saved artworks and the autosaved working copy. Nothing is sent anywhere.
 */

/**
 * Editor information kept beside the SVG (never inside it), so exported
 * artwork stays plain, portable SVG. Later parts of the studio add fields.
 */
export interface ArtMeta {
  guides?: { x: number[]; y: number[] }
  [key: string]: unknown
}

export interface Artwork {
  id: string
  name: string
  svg: string
  meta?: ArtMeta
  created: number
  updated: number
}

export interface Draft {
  id: string | null
  name: string
  svg: string
  meta?: ArtMeta
}

interface Meta {
  key: string
  value: unknown
}

class StudioDb extends Dexie {
  artworks!: Table<Artwork, string>
  meta!: Table<Meta, string>

  constructor() {
    super('cartoon-studio')
    this.version(2).stores({ artworks: 'id, updated', meta: 'key', usage: '++id, time' })
    // the AI assistant is gone: drop its usage history and the stored API key
    this.version(3)
      .stores({ usage: null })
      .upgrade((tx) => tx.table('meta').delete('ai'))
  }
}

const db = new StudioDb()

export const listArtworks = () => db.artworks.orderBy('updated').reverse().toArray()
export const getArtwork = (id: string) => db.artworks.get(id)
export const putArtwork = (a: Artwork) => db.artworks.put(a)
export const deleteArtwork = (id: string) => db.artworks.delete(id)

const getMeta = async <T>(key: string) => {
  const row = (await db.meta.get(key)) as (Meta & { draft?: unknown }) | undefined
  // phase 1 stored the draft under "draft" rather than "value"
  return (row?.value ?? row?.draft) as T | undefined
}
const putMeta = (key: string, value: unknown) => db.meta.put({ key, value })

export const getDraft = () => getMeta<Draft>('draft')
export const putDraft = (draft: Draft) => putMeta('draft', draft)

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
