import type * as THREE from 'three'
import type { Collider } from '../world/geo'
import type { EnemyEvent } from './enemy'

/** What every entity gets each frame. */
export interface Tick {
  colliders: Collider[]
  /** The player's position. */
  px: number
  pz: number
  /** Seconds, for idle sway. */
  time: number
  paused: boolean
  /** True while the player is in a conversation. */
  talking: boolean
  /** Enemies report strikes and tells here; the game handles them after the update. */
  events: EnemyEvent[]
}

/**
 * Anything that lives in a level and isn't part of its architecture:
 * people, monsters, things to pick up or use.
 */
export abstract class Entity {
  abstract readonly kind: 'npc' | 'enemy' | 'prop'
  x = 0
  z = 0
  /** Floor height it stands on. */
  y = 0
  /** How close you have to be to use it; 0 means it can't be used. */
  reach = 0
  removed = false

  /** The scene object to add and remove, if it has one of its own. */
  get root(): THREE.Object3D | null {
    return null
  }

  /** The prompt shown when you look at it, or null if it can't be used now. */
  prompt(): string | null {
    return null
  }

  update(_dt: number, _w: Tick) {}

  /** Turn to face the camera (billboards). */
  face(_cam: THREE.Vector3) {}

  /** Called when it's taken out of the world. */
  onRemove() {}
}
