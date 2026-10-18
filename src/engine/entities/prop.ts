import { PROPS, type PropDef } from '../../data'
import type { PropSpawn } from '../world/levels'
import { Entity } from './entity'

/** A usable thing in a level: a door, a body to search, a ring on the floor. */
export class Prop extends Entity {
  readonly kind = 'prop'
  def: PropDef
  /** Values for `{id}` and `{building}` in the prop's text and effects. */
  params: Record<string, string>

  constructor(public spawn: PropSpawn) {
    super()
    this.def = PROPS[spawn.def]
    if (!this.def) throw new Error(`Unknown prop "${spawn.def}"`)
    this.x = spawn.x
    this.z = spawn.z
    this.y = spawn.y ?? 0
    this.reach = spawn.radius + 1
    this.params = spawn.building ? { id: spawn.building.id, building: spawn.building.name } : {}
  }

  prompt() {
    return fill(this.def.label, this.params)
  }

  onRemove() {
    // its sprite belongs to the level's scenery, so just hide it
    if (this.spawn.sprite) this.spawn.sprite.root.visible = false
  }
}

/** Replaces `{key}` in text with the matching value. */
export const fill = (s: string, params: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m)
