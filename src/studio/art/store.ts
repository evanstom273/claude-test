import Dexie, { type Table } from 'dexie'

/**
 * Everything the studio keeps lives in IndexedDB on this device, through
 * Dexie: saved artworks, the autosaved working copy, settings (including the
 * Gemini API key) and AI usage history. Nothing is sent anywhere.
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

/** The two models the studio offers. */
export type ModelFamily = 'lite' | 'flash'
export type Thinking = 'default' | 'low' | 'high'

export interface AiSettings {
  apiKey: string
  /** Model for edits to existing artwork, and for creating new artwork. */
  editModel: ModelFamily
  createModel: ModelFamily
  thinkingEdit: Thinking
  thinkingCreate: Thinking
  /** Optional, for cost estimates: US dollars per million tokens, per model. */
  prices: Record<ModelFamily, { in: number | null; out: number | null }>
}

export interface Usage {
  id?: number
  time: number
  model: string
  input: number
  output: number
  cost: number | null
}

interface Meta {
  key: string
  value: unknown
}

class StudioDb extends Dexie {
  artworks!: Table<Artwork, string>
  meta!: Table<Meta, string>
  usage!: Table<Usage, number>

  constructor() {
    super('cartoon-studio')
    this.version(2).stores({ artworks: 'id, updated', meta: 'key', usage: '++id, time' })
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

export const DEFAULT_AI: AiSettings = {
  apiKey: '',
  editModel: 'lite',
  createModel: 'lite',
  thinkingEdit: 'default',
  thinkingCreate: 'high',
  prices: { lite: { in: null, out: null }, flash: { in: null, out: null } },
}
export const getAiSettings = async (): Promise<AiSettings> => {
  // earlier versions stored one model id and one pair of prices
  const s = (await getMeta<Partial<AiSettings> & { priceIn?: number | null; priceOut?: number | null }>('ai')) ?? {}
  const prices = s.prices ?? { ...DEFAULT_AI.prices, lite: { in: s.priceIn ?? null, out: s.priceOut ?? null } }
  return { ...DEFAULT_AI, ...s, prices: { ...DEFAULT_AI.prices, ...prices } }
}
export const putAiSettings = (s: AiSettings) => putMeta('ai', s)

export const addUsage = (u: Usage) => db.usage.add(u)
export const usageTotals = async () => {
  const all = await db.usage.toArray()
  return all.reduce(
    (t, u) => ({ requests: t.requests + 1, input: t.input + u.input, output: t.output + u.output, cost: u.cost === null ? t.cost : (t.cost ?? 0) + u.cost }),
    { requests: 0, input: 0, output: 0, cost: null as number | null },
  )
}
export const clearUsage = () => db.usage.clear()

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
