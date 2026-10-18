import { upgrade, type GameState } from './state'

/** Three slots you choose, plus one the game writes whenever you change level. */
export type Slot = 1 | 2 | 3 | 'auto'
export const SLOTS: Slot[] = [1, 2, 3]

export interface SaveMeta {
  slot: Slot
  savedAt: number
  location: string
  date: string
  level: number
}

interface SaveFile {
  meta: SaveMeta
  state: GameState
}

const key = (slot: Slot) => `quillmarch.save.${slot}`

export function writeSave(slot: Slot, state: GameState, meta: Omit<SaveMeta, 'slot' | 'savedAt'>) {
  const file: SaveFile = { meta: { ...meta, slot, savedAt: Date.now() }, state }
  try {
    localStorage.setItem(key(slot), JSON.stringify(file))
    return true
  } catch {
    return false
  }
}

function read(slot: Slot): SaveFile | null {
  try {
    const raw = localStorage.getItem(key(slot))
    if (!raw) return null
    const f = JSON.parse(raw) as SaveFile
    if (f?.state?.version !== 1 || !f.meta) return null
    return f
  } catch {
    return null
  }
}

export const readMeta = (slot: Slot) => read(slot)?.meta ?? null

export function readSave(slot: Slot): GameState | null {
  const f = read(slot)
  return f ? upgrade(f.state) : null
}

/** The most recently written save, for Continue. */
export function latestSave(): Slot | null {
  let best: SaveMeta | null = null
  for (const s of [...SLOTS, 'auto' as const]) {
    const m = readMeta(s)
    if (m && (!best || m.savedAt > best.savedAt)) best = m
  }
  return best?.slot ?? null
}
