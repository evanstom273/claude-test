import * as THREE from 'three'
import { personTex, ratTex, skeletonTex } from './art'
import type { NpcDef } from './dialogue'
import { Billboard, resolveCircle, segmentBlocked, type Collider } from './geo'

export class Npc {
  sprite: Billboard
  idle: THREE.Texture
  talking: THREE.Texture
  x: number
  z: number
  target: { x: number; z: number } | null = null
  wait = Math.random() * 3
  walk = 0
  talkingTo = false
  mouth = 0

  constructor(public def: NpcDef) {
    this.idle = personTex(`npc-${def.id}`, def.outfit)
    this.talking = personTex(`npc-${def.id}`, def.outfit, true)
    this.sprite = new Billboard(this.idle, 1.05, 2.1, 0.45)
    this.x = def.home.x
    this.z = def.home.z
    this.sprite.root.position.set(this.x, 0, this.z)
  }

  update(dt: number, cols: Collider[], time: number) {
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
          this.target = { x: this.def.home.x + Math.cos(a) * d, z: this.def.home.z + Math.sin(a) * d }
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
    this.sprite.mesh.rotation.z = moving * Math.sin(this.walk) * 0.05 + Math.sin(time * 1.3 + this.def.home.x) * 0.01
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

export type EnemyKind = 'rat' | 'skeleton'
type EState = 'idle' | 'chase' | 'windup' | 'strike' | 'recover' | 'hurt' | 'dead'

export interface EnemyStats {
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
}

export const ENEMY: Record<EnemyKind, EnemyStats> = {
  rat: { hp: 12, speed: 3.4, range: 1.3, windup: 0.38, strike: 0.15, recover: 0.55, dmg: [3, 6], sight: 9, w: 0.9, h: 0.9, gold: [0, 3] },
  skeleton: { hp: 38, speed: 2.3, range: 1.9, windup: 0.68, strike: 0.2, recover: 0.95, dmg: [9, 13], sight: 13, w: 1.15, h: 2.3, gold: [4, 14] },
}

export interface EnemyEvent {
  type: 'strike' | 'tele' | 'death'
  enemy: Enemy
  dmg?: number
}

export class Enemy {
  sprite: Billboard
  stats: EnemyStats
  hp: number
  state: EState = 'idle'
  t = 0
  x: number
  z: number
  vx = 0
  vz = 0
  cooldown = 0
  flash = 0
  walk = Math.random() * 10
  hitDone = false
  looted = false
  frames: Record<string, THREE.Texture>

  constructor(public kind: EnemyKind, x: number, z: number) {
    this.stats = ENEMY[kind]
    this.hp = this.stats.hp
    this.x = x
    this.z = z
    this.frames =
      kind === 'rat'
        ? { idle: ratTex('idle'), windup: ratTex('bite'), strike: ratTex('bite'), hurt: ratTex('hurt') }
        : { idle: skeletonTex('idle'), windup: skeletonTex('windup'), strike: skeletonTex('strike'), hurt: skeletonTex('hurt') }
    this.sprite = new Billboard(this.frames.idle, this.stats.w, this.stats.h, this.stats.w * 0.4)
    this.sprite.mat.emissive = new THREE.Color(0x000000)
    this.sprite.root.position.set(x, 0, z)
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
    if (this.kind === 'rat' || this.state !== 'windup') {
      this.state = 'hurt'
      this.t = 0
    }
    return false
  }

  update(dt: number, px: number, pz: number, cols: Collider[], events: EnemyEvent[]) {
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
      this.walk += dt * (this.kind === 'rat' ? 16 : 8)
    } else {
      this.vx *= Math.exp(-8 * dt)
      this.vz *= Math.exp(-8 * dt)
    }
    if (this.alive) {
      const p = { x: this.x + this.vx * dt, z: this.z + this.vz * dt }
      resolveCircle(p, this.kind === 'rat' ? 0.3 : 0.4, cols)
      this.x = p.x
      this.z = p.z
    }

    // frames and paper motion
    const frame = this.state === 'windup' ? 'windup' : this.state === 'strike' || (this.state === 'recover' && this.t < 0.25) ? 'strike' : this.state === 'hurt' ? 'hurt' : 'idle'
    this.sprite.setTexture(this.frames[frame])
    this.sprite.mat.emissive.setScalar(this.flash > 0 ? 0.8 : 0)
    const moving = move > 0
    this.sprite.mesh.position.y = moving ? Math.abs(Math.sin(this.walk)) * (this.kind === 'rat' ? 0.06 : 0.1) : 0
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
