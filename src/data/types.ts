/**
 * Shapes of the JSON resources in this folder: the TypeScript side of
 * Godot's .tres files. Content lives in JSON; the engine only reads it.
 */

import type { Outfit } from '../engine/render/art'

// ------------------------------------------------------------------ rules

/** A test against the game state. Every field given must hold. */
export interface Cond {
  /** Quest id → the stage (or any of the stages) it must be at. */
  quest?: Record<string, string | string[]>
  flag?: string
  notFlag?: string
  /** Item id the player must carry. */
  has?: string
  /** Item id the player must not carry. */
  lacks?: string
}

export type SfxName = 'quest' | 'coin' | 'potion' | 'door' | 'skill' | 'talk'

/** One thing that happens to the game state. Run in order. */
export type Effect =
  | { gold: number }
  | { give: string; count?: number }
  | { take: string; count?: number }
  | { quest: string; stage: string }
  | { journal: string }
  | { note: string; kind?: NoteKind }
  | { sfx: SfxName }
  | { train: string }
  | { heal: number | 'full' }
  /** Sleep for this many hours: fade out, pass time, wake fully rested. */
  | { rest: number }
  | { flag: string; value?: boolean }
  | { end: true }
  | { travel: string; at?: { x: number; z: number; yaw: number } }
  /** Step out of the building you're in, onto the street by its door. */
  | { exitBuilding: true }
  /** Remove the thing that ran this effect from the world. */
  | { remove: true }
  | { if: Cond; do: Effect[]; else?: Effect[] }

export type NoteKind = 'info' | 'skill' | 'quest' | 'level'

/** A response: the first one whose `when` holds is used. */
export interface Rule {
  when?: Cond
  /** Gold it costs. If you can't pay, `poor` is said and nothing else happens. */
  cost?: number
  poor?: string
  /** Said in conversation, or shown as a note when using a thing. One is picked at random. */
  say?: string | string[]
  do?: Effect[]
}

// ---------------------------------------------------------------- content

export type Role = 'reeve' | 'innkeeper' | 'merchant' | 'guard' | 'priest' | 'folk'

export interface NpcDef {
  id: string
  name: string
  title: string
  role: Role
  outfit: Outfit
  home: { x: number; z: number }
  /** How far from home they wander; 0 stands still. */
  wander: number
  greeting: string[]
  /** If set, they live inside this building, at the named spot. */
  inside?: string
  spot?: string
}

export interface Place {
  id: string
  name: string
  x: number
  z: number
}

export type BuildingKind = 'tavern' | 'hall' | 'temple' | 'forge' | 'house'

export interface BuildingDef {
  id: string
  name: string
  kind: BuildingKind
  x: number
  z: number
  w: number
  d: number
  h: number
  /** Degrees; the door faces local +z, so 90 faces +x. */
  rot: 0 | 90 | 180 | 270
  wall: 'plaster' | 'stone' | 'blue' | 'pink'
  roof: 'red' | 'slate' | 'thatch' | 'green'
  sign?: { text: string; pic: 'goose' | 'scales' | 'anvil' | 'sun' }
  spire?: boolean
}

export type EnemyKind = 'rat' | 'skeleton'

export interface EnemyDef {
  name: string
  hp: number
  speed: number
  range: number
  windup: number
  strike: number
  recover: number
  dmg: [number, number]
  sight: number
  w: number
  h: number
  gold: [number, number]
  /** Collision radius. */
  radius: number
  /** Does a hit knock it out of its wind-up? */
  flinch: boolean
  /** Walk cycle speed and bounce. */
  gait: number
  bob: number
  /** Sound it makes as it winds up. */
  tell: 'squeak' | 'bones'
}

export interface ItemDef {
  name: string
  /** Shown in the belongings list (draughts have their own counter). */
  listed?: boolean
  /** Hit points restored when drunk. */
  heal?: number
  /** Extra sword damage while carried. */
  damage?: number
}

export interface QuestDef {
  name: string
  stages: string[]
}

export interface Topic extends Rule {
  id: string
  label: string
  /** Who offers this topic; everyone if left out. */
  roles?: Role[]
  /** Only offered while this holds. */
  show?: Cond
  /** Answer with a rumour about this quest's current stage. */
  rumour?: string
  /** Opens the list of places to ask directions to. */
  places?: boolean
}

export interface DialogueData {
  topics: Topic[]
  places: { prompt: string; back: string; again: string }
  directions: { here: string; there: string; near: string; mid: string; far: string }
}

/** Something in a level you can use: a door, a body, a ring on the floor. */
export interface PropDef {
  /** `{building}` is replaced with the building's name. */
  label: string
  /** Not placed at all while this holds (things already taken). */
  gone?: Cond
  use: Rule[]
}

export interface LevelDef {
  title?: string
  /** Note shown on arriving. */
  arrive: string
  lantern: number
  background?: string
  fog?: { color: string; near: number; far: number }
}

export interface PlayerDef {
  level: string
  hp: number
  stamina: number
  gold: number
  inventory: Record<string, number>
  skills: { id: string; name: string; value: number }[]
  time: { minutes: number; day: number }
  journal: string[]
  note: string
  move: { walk: number; run: number; jump: number; gravity: number }
  staminaUse: { run: number; jump: number; regen: number }
  combat: {
    windup: number
    strike: number
    recover: number
    stamina: number
    reach: number
    arc: number
    damage: number
    bladeDiv: number
    spread: number
    block: number
    blockStamina: number
  }
  levelUp: { raises: number; hp: number; stamina: number }
  respawn: { level: string; x: number; z: number; yaw: number; goldLoss: number; note: string }
  draught: { none: string; full: string; drink: string }
  tired: string
}
