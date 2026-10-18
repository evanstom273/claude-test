import type * as THREE from 'three'
import type { Entity, Tick } from './entity'

/** Owns the entities in the current level and keeps the scene in step with them. */
export class EntityManager {
  list: Entity[] = []

  constructor(private scene: THREE.Scene) {}

  add<T extends Entity>(e: T): T {
    this.list.push(e)
    if (e.root) this.scene.add(e.root)
    return e
  }

  remove(e: Entity) {
    if (e.removed) return
    e.removed = true
    if (e.root) this.scene.remove(e.root)
    e.onRemove()
    this.list = this.list.filter((x) => x !== e)
  }

  clear() {
    for (const e of this.list) if (e.root) this.scene.remove(e.root)
    this.list = []
  }

  of<T extends Entity>(type: abstract new (...args: never[]) => T): T[] {
    return this.list.filter((e): e is T => e instanceof type)
  }

  update(dt: number, w: Tick) {
    for (const e of this.list) e.update(dt, w)
  }

  face(cam: THREE.Vector3) {
    for (const e of this.list) e.face(cam)
  }
}
