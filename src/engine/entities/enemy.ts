import * as THREE from 'three'
import { ENEMIES, type EnemyDef, type EnemyKind } from '../../data'
import { ratTex, skeletonTex } from '../render/art'
import { Billboard, resolveCircle, segmentBlocked } from '../world/geo'
import { Entity, type Tick } from './entity'

type EState = 'idle' | 'chase' | 'windup' | 'strike' | 'recover' | 'hurt' | 'dead'

export interface EnemyEvent {
  type: 'strike' | 'tele' | 'death'
  enemy: Enemy
  dmg?: number
}

export class Enemy extends Entity {
  readonly kind = 'enemy'
  sprite: Billboard
  stats: EnemyDef
  hp: number
  state: EState = 'idle'
  t = 0
  vx = 0
  vz = 0
  cooldown = 0
  flash = 0
  walk = Math.random() * 10
  hitDone = false
  looted = false
  frames: Record<string, THREE.Texture>

  constructor(
    public type: EnemyKind,
    x: number,
    z: number,
  ) {
    super()
    this.stats = ENEMIES[type]
    this.hp = this.stats.hp
    this.x = x
    this.z = z
    this.frames =
      type === 'rat'
        ? { idle: ratTex('idle'), windup: ratTex('bite'), strike: ratTex('bite'), hurt: ratTex('hurt') }
        : { idle: skeletonTex('idle'), windup: skeletonTex('windup'), strike: skeletonTex('strike'), hurt: skeletonTex('hurt') }
    this.sprite = new Billboard(this.frames.idle, this.stats.w, this.stats.h, this.stats.w * 0.4)
    this.sprite.mat.emissive = new THREE.Color(0x000000)
    this.sprite.root.position.set(x, 0, z)
  }

  get root() {
    return this.sprite.root
  }

  face(cam: THREE.Vector3) {
    this.sprite.face(cam)
  }

  get alive() {
    return this.state !== 'dead'
  }

  hurt(dmg: number, fromX: number, fromZ: number) {
    if (!this.alive) return false
    this.hp -= dmg
    this.flash = 0.14
    const dx = this.x - fromX
    const dz = this.z - fromZ
    const d = Math.hypot(dx, dz) || 1
    this.vx = (dx / d) * 3
    this.vz = (dz / d) * 3
    if (this.hp <= 0) {
      this.state = 'dead'
      this.t = 0
      return true
    }
    // rats flinch out of their bite; skeletons commit to the swing
    if (this.stats.flinch || this.state !== 'windup') {
      this.state = 'hurt'
      this.t = 0
    }
    return false
  }

  update(dt: number, w: Tick) {
    if (w.paused || w.talking) return
    const { px, pz, colliders: cols, events } = w
    const s = this.stats
    this.t += dt
    this.flash = Math.max(0, this.flash - dt)
    const dx = px - this.x
    const dz = pz - this.z
    const d = Math.hypot(dx, dz)
    let move = 0

    switch (this.state) {
      case 'idle':
        if (d < s.sight && !segmentBlocked(this.x, this.z, px, pz, cols)) this.state = 'chase'
        break
      case 'chase':
        this.cooldown -= dt
        if (d > s.sight * 1.8) this.state = 'idle'
        else if (d < s.range && this.cooldown <= 0) {
          this.state = 'windup'
          this.t = 0
          events.push({ type: 'tele', enemy: this })
        } else if (d > s.range * 0.8) move = s.speed
        break
      case 'windup':
        if (this.t >= s.windup) {
          this.state = 'strike'
          this.t = 0
          this.hitDone = false
        }
        break
      case 'strike':
        if (!this.hitDone) {
          this.hitDone = true
          // the strike only lands if you're still in reach
          if (d < s.range + 0.35) events.push({ type: 'strike', enemy: this, dmg: s.dmg[0] + Math.random() * (s.dmg[1] - s.dmg[0]) })
        }
        if (this.t >= s.strike) {
          this.state = 'recover'
          this.t = 0
        }
        break
      case 'recover':
        if (this.t >= s.recover) {
          this.state = 'chase'
          this.cooldown = 0.3 + Math.random() * 0.6
        }
        break
      case 'hurt':
        if (this.t >= 0.28) this.state = 'chase'
        break
      case 'dead':
        break
    }

    if (move > 0 && d > 0.01) {
      this.vx += ((dx / d) * move - this.vx) * Math.min(1, dt * 8)
      this.vz += ((dz / d) * move - this.vz) * Math.min(1, dt * 8)
      this.walk += dt * s.gait
    } else {
      this.vx *= Math.exp(-8 * dt)
      this.vz *= Math.exp(-8 * dt)
    }
    if (this.alive) {
      const p = { x: this.x + this.vx * dt, z: this.z + this.vz * dt }
      resolveCircle(p, s.radius, cols)
      this.x = p.x
      this.z = p.z
    }

    // frames and paper motion
    const frame = this.state === 'windup' ? 'windup' : this.state === 'strike' || (this.state === 'recover' && this.t < 0.25) ? 'strike' : this.state === 'hurt' ? 'hurt' : 'idle'
    this.sprite.setTexture(this.frames[frame])
    this.sprite.mat.emissive.setScalar(this.flash > 0 ? 0.8 : 0)
    const moving = move > 0
    this.sprite.mesh.position.y = moving ? Math.abs(Math.sin(this.walk)) * s.bob : 0
    this.sprite.mesh.rotation.z = moving ? Math.sin(this.walk) * 0.06 : this.state === 'windup' ? Math.sin(this.t * 60) * 0.012 : 0
    if (this.state === 'dead') {
      // the cut-out tips over backwards and lies flat
      const k = Math.min(1, this.t / 0.45)
      this.sprite.mesh.rotation.x = -(Math.PI / 2) * (1 - Math.pow(1 - k, 3))
      this.sprite.mesh.position.y = 0.03
    }
    this.sprite.root.position.set(this.x, 0, this.z)
  }
}
