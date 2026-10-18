import * as THREE from 'three'
import type { NpcDef } from '../../data'
import { personTex } from '../render/art'
import { Billboard, resolveCircle } from '../world/geo'
import { Entity, type Tick } from './entity'

/** A townsperson: wanders near home, stops to talk. */
export class Npc extends Entity {
  readonly kind = 'npc'
  reach = 3
  sprite: Billboard
  idle: THREE.Texture
  talking: THREE.Texture
  target: { x: number; z: number } | null = null
  wait = Math.random() * 3
  walk = 0
  talkingTo = false
  mouth = 0

  home: { x: number; z: number }

  constructor(
    public def: NpcDef,
    home?: { x: number; z: number },
  ) {
    super()
    this.home = home ?? def.home
    this.idle = personTex(`npc-${def.id}`, def.outfit)
    this.talking = personTex(`npc-${def.id}`, def.outfit, true)
    this.sprite = new Billboard(this.idle, 1.05, 2.1, 0.45)
    this.x = this.home.x
    this.z = this.home.z
    this.sprite.root.position.set(this.x, 0, this.z)
  }

  get root() {
    return this.sprite.root
  }

  face(cam: THREE.Vector3) {
    this.sprite.face(cam)
  }

  prompt() {
    return `Talk to ${this.def.name}`
  }

  update(dt: number, w: Tick) {
    if (w.paused) dt = 0
    const cols = w.colliders
    const time = w.time
    if (this.talkingTo) {
      // flaps its paper mouth while you read
      this.mouth += dt
      this.sprite.setTexture(Math.floor(this.mouth * 6) % 2 && this.mouth < 2.5 ? this.talking : this.idle)
      this.sprite.mesh.position.y = 0
      this.sprite.mesh.rotation.z = 0
      return
    }
    this.sprite.setTexture(this.idle)
    if (this.def.wander > 0) {
      if (!this.target) {
        this.wait -= dt
        if (this.wait <= 0) {
          const a = Math.random() * Math.PI * 2
          const d = Math.random() * this.def.wander
          this.target = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d }
        }
      } else {
        const dx = this.target.x - this.x
        const dz = this.target.z - this.z
        const d = Math.hypot(dx, dz)
        if (d < 0.2) {
          this.target = null
          this.wait = 2 + Math.random() * 5
        } else {
          const sp = 1.1 * dt
          const p = { x: this.x + (dx / d) * sp, z: this.z + (dz / d) * sp }
          resolveCircle(p, 0.35, cols)
          if (Math.hypot(p.x - this.x, p.z - this.z) < sp * 0.3) {
            this.target = null
            this.wait = 1
          }
          this.x = p.x
          this.z = p.z
          this.walk += dt * 7
        }
      }
    }
    // a paper figure's walk: a bob and a rock from side to side
    const moving = this.target ? 1 : 0
    this.sprite.mesh.position.y = moving * Math.abs(Math.sin(this.walk)) * 0.08
    this.sprite.mesh.rotation.z = moving * Math.sin(this.walk) * 0.05 + Math.sin(time * 1.3 + this.home.x) * 0.01
    this.sprite.root.position.set(this.x, 0, this.z)
  }

  startTalking() {
    this.talkingTo = true
    this.mouth = 0
    this.target = null
  }

  stopTalking() {
    this.talkingTo = false
    this.wait = 2
  }
}
