import * as THREE from 'three'
import { DIALOGUE, ITEMS, levelDef, NPCS, PLAYER, PROPS, type NoteKind } from '../../data'
import type { Outfit } from '../render/art'
import { Enemy, type EnemyEvent } from '../entities/enemy'
import type { Entity, Tick } from '../entities/entity'
import { EntityManager } from '../entities/manager'
import { Npc } from '../entities/npc'
import { Prop } from '../entities/prop'
import { directions, placeFor, placeTopics, rumour, topic, topicsFor, type TopicView } from '../systems/dialogue'
import { apply, check, pick, type RuleHost } from '../systems/rules'
import { advance, clockText, dateText } from '../systems/time'
import { resolveCircle, supportAt } from '../world/geo'
import { buildInterior, doorWorld } from '../world/interiors'
import { asBuilding, buildBarrow, buildTown, BUILDINGS, type Level, type LevelId } from '../world/levels'
import { updateSky } from '../world/sky'
import { sfx, setAmbience } from './audio'
import { Input } from './input'
import { writeSave, type Slot } from './save'
import { count, give, newGame, type GameState } from './state'

export interface DialogueView {
  npcId: string
  name: string
  title: string
  outfit: Outfit
  text: string
  topics: TopicView[]
}

export interface Skill {
  name: string
  value: number
  progress: number
}

export interface Note {
  id: number
  text: string
  at: number
  kind: NoteKind
}

export interface HudState {
  hp: number
  maxHp: number
  stamina: number
  maxStamina: number
  gold: number
  potions: number
  level: number
  clock: string
  date: string
  yaw: number
  prompt: string | null
  notes: Note[]
  dialogue: DialogueView | null
  sheet: boolean
  paused: boolean
  dead: boolean
  fade: number
  swing: number
  blocking: boolean
  moving: boolean
  running: boolean
  hurt: number
  location: string
  journal: string[]
  skills: Skill[]
  items: string[]
  locked: boolean
}

const EYE = 1.62
const RADIUS = 0.35
const { move: MOVE, staminaUse: STAM, combat: COMBAT } = PLAYER

export class Game implements RuleHost {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600)
  input = new Input()
  level!: Level
  entities = new EntityManager(this.scene)
  lantern = new THREE.PointLight(0xffdcb0, 0, 20, 1.2)

  /** The playthrough: everything that gets saved. */
  state: GameState

  // the player's body, moment to moment
  pos = new THREE.Vector3()
  vel = new THREE.Vector3()
  yaw = 0
  pitch = 0
  onGround = true
  stamDelay = 0

  swing = { phase: 'none' as 'none' | 'windup' | 'strike' | 'recover', t: 0, count: 0 }
  blocking = false
  hurtCount = 0
  shake = 0
  bob = 0
  stepAcc = 0
  runAcc = 0
  dead = false
  deadT = 0
  fade = 1
  fadeTarget = 0
  pendingLevel: LevelId | null = null
  pendingSpawn: { x: number; z: number; yaw: number } | null = null
  dialogue: DialogueView | null = null
  talkingTo: Npc | null = null
  sheet = false
  paused = false
  notes: Note[] = []
  noteId = 0
  prompt: string | null = null
  focusTarget: Entity | null = null

  private listeners = new Set<() => void>()
  private snapshot: HudState
  private lastPublish = 0
  private raf = 0
  private last = performance.now()
  private detach: (() => void) | null = null

  constructor(
    public canvas: HTMLCanvasElement,
    loaded?: GameState,
  ) {
    // phones get a lighter renderer: no MSAA, a lower pixel ratio, cheaper shadows
    const mobile = window.matchMedia?.('(pointer: coarse)').matches
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.camera.add(this.lantern)
    this.scene.add(this.camera)
    this.state = loaded ?? newGame()
    this.loadLevel(this.state.level)
    const at = this.state.player.at
    if (at) {
      this.pos.set(at.x, at.y, at.z)
      this.yaw = at.yaw
    }
    this.snapshot = this.buildSnapshot()
    this.note(loaded ? 'You pick up where you left off.' : PLAYER.note, 'info')
    this.input.onAction = (a) => this.onAction(a)
  }

  get p() {
    return this.state.player
  }

  start() {
    this.detach = this.input.attach(this.canvas)
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.update(dt)
      this.renderer.render(this.scene, this.camera)
      if (now - this.lastPublish > 80) this.publish(now)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.detach?.()
    this.renderer.dispose()
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.fov = w / h < 1 ? 85 : 70
    this.camera.updateProjectionMatrix()
  }

  // ------------------------------------------------------------ state for React

  subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  getSnapshot = () => this.snapshot

  private buildSnapshot(): HudState {
    const p = this.p
    return {
      hp: p.hp,
      maxHp: p.maxHp,
      stamina: p.stamina,
      maxStamina: p.maxStamina,
      gold: p.gold,
      potions: count(this.state, 'potion'),
      level: p.level,
      clock: clockText(this.state.time),
      date: dateText(this.state.time),
      yaw: this.yaw,
      prompt: this.prompt,
      notes: this.notes,
      dialogue: this.dialogue,
      sheet: this.sheet,
      paused: this.paused,
      dead: this.dead,
      fade: this.fade,
      swing: this.swing.count,
      blocking: this.blocking,
      moving: Math.hypot(this.vel.x, this.vel.z) > 0.5 && this.onGround,
      running: Math.hypot(this.vel.x, this.vel.z) > MOVE.walk + 0.5,
      hurt: this.hurtCount,
      location: this.location,
      journal: this.state.journal,
      skills: PLAYER.skills.map((s) => ({ name: s.name, ...this.state.skills[s.id] })),
      items: Object.keys(this.state.inventory)
        .filter((id) => ITEMS[id]?.listed !== false)
        .map((id) => ITEMS[id]?.name ?? id),
      locked: document.pointerLockElement === this.canvas,
    }
  }

  get location() {
    return this.level.title ?? levelDef(this.level.id).title ?? ''
  }

  publish(now = performance.now()) {
    this.lastPublish = now
    this.notes = this.notes.filter((n) => now - n.at < 6000)
    this.snapshot = this.buildSnapshot()
    for (const l of this.listeners) l()
  }

  note(text: string, kind: NoteKind = 'info') {
    this.notes = [...this.notes, { id: this.noteId++, text, at: performance.now(), kind }].slice(-5)
    this.publish()
  }

  /** True while a menu or conversation has the player's attention. */
  get busy() {
    return !!this.dialogue || this.sheet || this.paused || this.dead || this.fade > 0.5
  }

  // ------------------------------------------------------------------- saves

  /** The state with where you're standing written into it, ready to save. */
  capture(): GameState {
    this.p.at = { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw }
    return structuredClone(this.state)
  }

  save(slot: Slot) {
    const ok = writeSave(slot, this.capture(), { location: this.location, date: `${dateText(this.state.time)}, ${clockText(this.state.time)}`, level: this.p.level })
    if (slot !== 'auto') this.note(ok ? 'Saved.' : 'Could not save: the browser refused.')
    return ok
  }

  // ------------------------------------------------------------------ levels

  loadLevel(id: LevelId) {
    if (this.level) this.scene.remove(this.level.group)
    this.entities.clear()
    const bdef = id.startsWith('in:') ? BUILDINGS.find((b) => `in:${b.id}` === id) : null
    this.level = id === 'town' ? buildTown() : bdef ? buildInterior(asBuilding(bdef)) : buildBarrow()
    this.state.level = id
    this.scene.add(this.level.group)
    if (id === 'town' || bdef) {
      // everyone lives somewhere: out in town, or inside at their post
      for (const def of NPCS) {
        if ((def.inside ?? null) !== (bdef?.id ?? null)) continue
        const spot = def.spot ? this.level.spots?.[def.spot] : undefined
        this.entities.add(new Npc(def, spot ?? (bdef ? { x: 0, z: 0 } : undefined)))
      }
    }
    for (const s of this.level.enemies) this.entities.add(new Enemy(s.kind, s.x, s.z))
    for (const s of this.level.props) {
      // once a thing is taken it stays taken
      const gone = PROPS[s.def]?.gone
      if (gone && check(this.state, gone)) {
        if (s.sprite) s.sprite.root.visible = false
        continue
      }
      this.entities.add(new Prop(s))
    }
    const s = this.level.spawn
    this.pos.set(s.x, 0, s.z)
    this.vel.set(0, 0, 0)
    this.yaw = s.yaw
    this.pitch = 0
    const def = levelDef(id)
    this.lantern.intensity = def.lantern
    setAmbience(this.level.outdoors)
    if (def.background) {
      this.scene.background = new THREE.Color(def.background)
      this.scene.fog = def.fog ? new THREE.Fog(def.fog.color, def.fog.near, def.fog.far) : null
    }
  }

  travel(id: LevelId, at?: { x: number; z: number; yaw: number }) {
    if (at) this.pendingSpawn = at
    this.pendingLevel = id
    this.fadeTarget = 1
    sfx.door()
  }

  /** Step back out into the street, facing away from the door. */
  exitBuilding() {
    const b = BUILDINGS.find((x) => x.id === this.level.buildingId)
    if (b) {
      const { out } = doorWorld(asBuilding(b))
      this.pendingSpawn = { x: out.x, z: out.z, yaw: out.yaw }
    }
    this.travel('town')
  }

  // ------------------------------------------------------------------ update

  update(dt: number) {
    this.input.pollGamepad(dt)
    // fades for travel and resting
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 5)
    if (this.pendingLevel && this.fade > 0.97) {
      this.loadLevel(this.pendingLevel)
      if (this.pendingSpawn) {
        this.pos.set(this.pendingSpawn.x, 0, this.pendingSpawn.z)
        this.yaw = this.pendingSpawn.yaw
        this.pendingSpawn = null
      }
      this.note(levelDef(this.pendingLevel).arrive)
      this.pendingLevel = null
      this.fadeTarget = 0
      this.save('auto')
    }

    if (!this.paused) advance(this.state.time, dt * 2)

    if (!this.busy) {
      this.updatePlayer(dt)
      this.updateCombat(dt)
    } else {
      this.input.lookX = this.input.lookY = 0
      this.vel.x *= 0.8
      this.vel.z *= 0.8
    }
    if (this.dead) {
      this.deadT += dt
      if (this.deadT > 3.5) this.respawn()
    }

    const tick: Tick = { colliders: this.level.colliders, px: this.pos.x, pz: this.pos.z, time: performance.now() / 1000, paused: this.paused, talking: !!this.dialogue, events: [] }
    this.entities.update(dt, tick)
    for (const ev of tick.events) this.onEnemyEvent(ev)
    this.entities.face(this.camera.position)
    for (const b of this.level.billboards) b.face(this.camera.position)

    this.updateCamera(dt)
    updateSky(this.scene, this.level, this.state.time.minutes / 60, this.pos, this.camera)
    this.updateFocus()
  }

  private updatePlayer(dt: number) {
    const look = this.input
    const p = this.p
    this.yaw -= look.lookX
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - look.lookY))
    look.lookX = look.lookY = 0

    const mv = look.readMove()
    this.blocking = look.held('block') && p.stamina > 0 && this.swing.phase === 'none'
    const wantRun = look.held('run') && p.stamina > 1 && mv.y > 0.3 && !this.blocking
    let speed = wantRun ? MOVE.run : MOVE.walk
    if (this.blocking) speed *= 0.5
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    const rx = Math.cos(this.yaw)
    const rz = -Math.sin(this.yaw)
    const tx = (fx * mv.y + rx * mv.x) * speed
    const tz = (fz * mv.y + rz * mv.x) * speed
    const k = Math.min(1, dt * (this.onGround ? 12 : 3))
    this.vel.x += (tx - this.vel.x) * k
    this.vel.z += (tz - this.vel.z) * k

    if (this.onGround && look.take('jump') && p.stamina > 5) {
      this.vel.y = MOVE.jump
      this.onGround = false
      this.spend(STAM.jump)
      sfx.jump()
    }
    this.vel.y -= MOVE.gravity * dt
    const np = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt }
    resolveCircle(np, RADIUS, this.level.colliders, this.pos.y)
    const moved = Math.hypot(np.x - this.pos.x, np.z - this.pos.z)
    this.pos.x = np.x
    this.pos.z = np.z
    // floors, stairs and daises: step up onto them, follow them down, fall off edges
    const support = supportAt(this.level.surfaces, this.pos.x, this.pos.z, this.pos.y)
    const wasGround = this.onGround
    this.pos.y += this.vel.y * dt
    if (this.pos.y <= support || (wasGround && this.vel.y <= 0 && this.pos.y - support < 0.35)) {
      if (!wasGround && this.vel.y < -6) sfx.step(true)
      this.pos.y = support
      this.vel.y = 0
      this.onGround = true
    } else this.onGround = false

    // stamina: running drains it, standing still restores it
    if (wantRun && moved > 0.01) {
      p.stamina = Math.max(0, p.stamina - STAM.run * dt)
      this.stamDelay = 0.6
      this.runAcc += moved
      if (this.runAcc > 40) {
        this.runAcc = 0
        this.train('athletics')
      }
    } else if (this.stamDelay > 0) this.stamDelay -= dt
    else p.stamina = Math.min(p.maxStamina, p.stamina + STAM.regen * dt)

    if (this.onGround && moved > 0.001) {
      this.bob += moved * 2.2
      this.stepAcc += moved
      if (this.stepAcc > (wantRun ? 2.1 : 1.6)) {
        this.stepAcc = 0
        sfx.step(this.level.id === 'barrow' || Math.abs(this.pos.x) < 3 || Math.hypot(this.pos.x, this.pos.z) < 14)
      }
    }

    if (look.take('potion')) this.drinkPotion()
    if (look.take('use')) this.interact()
    if (look.take('attack')) this.startSwing()
  }

  private spend(n: number) {
    this.p.stamina = Math.max(0, this.p.stamina - n)
    this.stamDelay = 0.7
  }

  private updateCamera(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 3)
    const sx = (Math.random() - 0.5) * this.shake * 0.08
    const sy = (Math.random() - 0.5) * this.shake * 0.08
    const bobY = Math.sin(this.bob * 2) * 0.045 * (this.onGround ? 1 : 0)
    this.camera.position.set(this.pos.x + sx, this.pos.y + EYE + bobY + sy - (this.dead ? Math.min(1.3, this.deadT * 1.5) : 0), this.pos.z)
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.y = this.yaw
    this.camera.rotation.x = this.pitch
    this.camera.rotation.z = this.dead ? Math.min(0.5, this.deadT * 0.6) : 0
  }

  // -------------------------------------------------------------- interaction

  private updateFocus() {
    if (this.busy) {
      this.prompt = null
      return
    }
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    let best: Entity | null = null
    let bestScore = Infinity
    for (const e of this.entities.list) {
      if (!e.reach || Math.abs(this.pos.y - e.y) > 1.2) continue
      const dx = e.x - this.pos.x
      const dz = e.z - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d > e.reach) continue
      const dot = (dx * fx + dz * fz) / (d || 1)
      if (dot < 0.75 && d > 1) continue
      if (d - dot < bestScore) {
        bestScore = d - dot
        best = e
      }
    }
    this.focusTarget = best
    this.prompt = best?.prompt() ?? null
  }

  private interact() {
    const f = this.focusTarget
    if (f instanceof Npc) return this.talk(f)
    if (!(f instanceof Prop)) return
    const rule = pick(this.state, f.def.use)
    if (!rule) return
    const line = apply(this, rule, { params: f.params, remove: () => this.entities.remove(f) })
    if (line) this.note(line)
  }

  // ----------------------------------------------------------------- combat

  private startSwing() {
    if (this.swing.phase !== 'none' || this.blocking) return
    if (this.p.stamina < 4) {
      this.note(PLAYER.tired)
      return
    }
    this.spend(COMBAT.stamina)
    this.swing = { phase: 'windup', t: 0, count: this.swing.count + 1 }
    sfx.swing()
    this.publish()
  }

  private updateCombat(dt: number) {
    const s = this.swing
    if (s.phase === 'none') return
    s.t += dt
    if (s.phase === 'windup' && s.t >= COMBAT.windup) {
      s.phase = 'strike'
      s.t = 0
      this.resolveSwing()
    } else if (s.phase === 'strike' && s.t >= COMBAT.strike) {
      s.phase = 'recover'
      s.t = 0
    } else if (s.phase === 'recover' && s.t >= COMBAT.recover) {
      s.phase = 'none'
    }
  }

  /** Extra damage from what you carry (a whetstone, say). */
  private get bonusDamage() {
    let d = 0
    for (const [id, n] of Object.entries(this.state.inventory)) if (n > 0) d += ITEMS[id]?.damage ?? 0
    return d
  }

  private resolveSwing() {
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    const blade = this.state.skills.blade.value
    let hitAny = false
    for (const e of this.entities.of(Enemy)) {
      if (!e.alive) continue
      const dx = e.x - this.pos.x
      const dz = e.z - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d > COMBAT.reach) continue
      if ((dx * fx + dz * fz) / (d || 1) < COMBAT.arc) continue
      const dmg = Math.round(COMBAT.damage + blade / COMBAT.bladeDiv + this.bonusDamage + Math.random() * COMBAT.spread)
      const killed = e.hurt(dmg, this.pos.x, this.pos.z)
      hitAny = true
      sfx.hit(killed)
      this.shake = Math.max(this.shake, 0.6)
      if (killed) this.onKill(e)
    }
    if (hitAny) this.train('blade')
  }

  private onKill(e: Enemy) {
    sfx.bones()
    const [lo, hi] = e.stats.gold
    const g = Math.round(lo + Math.random() * (hi - lo))
    if (g > 0) {
      this.p.gold += g
      setTimeout(() => sfx.coin(), 250)
      this.note(`The ${e.stats.name} falls. You find ${g} gold.`)
    } else this.note(`The ${e.stats.name} falls.`)
  }

  private onEnemyEvent(ev: EnemyEvent) {
    if (ev.type === 'tele') {
      sfx[ev.enemy.stats.tell]()
      return
    }
    if (ev.type !== 'strike' || this.dead) return
    let dmg = ev.dmg ?? 5
    const e = ev.enemy
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    const dx = e.x - this.pos.x
    const dz = e.z - this.pos.z
    const facing = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) > 0.35
    if (this.blocking && facing) {
      dmg *= COMBAT.block
      this.spend(COMBAT.blockStamina)
      sfx.block()
      this.shake = Math.max(this.shake, 0.4)
      this.train('block')
    } else {
      sfx.hurt()
      this.hurtCount++
      this.shake = Math.max(this.shake, 1.4)
      navigator.vibrate?.(60)
    }
    this.p.hp = Math.max(0, this.p.hp - dmg)
    if (this.p.hp <= 0) this.die()
    this.publish()
  }

  private drinkPotion() {
    const d = PLAYER.draught
    if (count(this.state, 'potion') <= 0) {
      this.note(d.none)
      return
    }
    if (this.p.hp >= this.p.maxHp) {
      this.note(d.full)
      return
    }
    give(this.state, 'potion', -1)
    this.heal(ITEMS.potion.heal ?? 0)
    sfx.potion()
    this.note(d.drink)
  }

  heal(hp: number | 'full') {
    this.p.hp = hp === 'full' ? this.p.maxHp : Math.min(this.p.maxHp, this.p.hp + hp)
  }

  /** Sleep: fade to black, pass the hours, wake fully rested. */
  rest(hours: number) {
    this.fade = 1
    this.fadeTarget = 0
    advance(this.state.time, hours * 60)
    this.p.hp = this.p.maxHp
    this.p.stamina = this.p.maxStamina
  }

  private die() {
    this.dead = true
    this.deadT = 0
    this.swing.phase = 'none'
    sfx.death()
    if (document.pointerLockElement) document.exitPointerLock()
  }

  private respawn() {
    const r = PLAYER.respawn
    this.dead = false
    const lost = Math.floor(this.p.gold * r.goldLoss)
    this.p.gold -= lost
    this.p.hp = this.p.maxHp
    this.p.stamina = this.p.maxStamina
    this.loadLevel(r.level)
    this.pos.set(r.x, 0, r.z)
    this.yaw = r.yaw
    this.fade = 1
    this.fadeTarget = 0
    this.note(r.note.replace('{lost}', String(lost)))
    this.save('auto')
  }

  // ----------------------------------------------------------- skills, levels

  train(id: string) {
    const s = this.state.skills[id]
    const name = PLAYER.skills.find((k) => k.id === id)?.name ?? id
    s.progress++
    const need = 2 + Math.floor(s.value / 10)
    if (s.progress < need) return
    s.progress = 0
    s.value++
    sfx.skill()
    this.note(`Your ${name} skill has increased to ${s.value}.`, 'skill')
    const p = this.p
    const lv = PLAYER.levelUp
    p.raises++
    if (p.raises >= lv.raises) {
      p.raises = 0
      p.level++
      p.maxHp += lv.hp
      p.maxStamina += lv.stamina
      p.hp = p.maxHp
      setTimeout(() => sfx.levelUp(), 300)
      this.note(`You feel more experienced. You are now level ${p.level}.`, 'level')
    }
  }

  // ---------------------------------------------------------------- dialogue

  private talk(n: Npc) {
    this.talkingTo = n
    n.startTalking()
    if (!this.state.flags[`met:${n.def.id}`]) {
      this.state.flags[`met:${n.def.id}`] = true
      this.train('etiquette')
    }
    if (document.pointerLockElement) document.exitPointerLock()
    const greet = n.def.greeting[Math.floor(Math.random() * n.def.greeting.length)]
    this.setDialogue(n, greet)
    sfx.talk()
  }

  private setDialogue(n: Npc, text: string, topics = topicsFor(this.state, n.def)) {
    n.mouth = 0
    this.dialogue = { npcId: n.def.id, name: n.def.name, title: n.def.title, outfit: n.def.outfit, text, topics }
    this.publish()
  }

  choose(topicId: string) {
    const n = this.talkingTo
    if (!n) return
    sfx.talk()
    const place = placeFor(topicId)
    if (place) {
      const b = BUILDINGS.find((x) => x.id === this.level.buildingId)
      const from = b ? doorWorld(asBuilding(b)).door : { x: n.x, z: n.z }
      return this.setDialogue(n, directions(from.x, from.z, place))
    }
    if (topicId === 'back') return this.setDialogue(n, DIALOGUE.places.again)
    const t = topic(topicId)
    if (!t) return
    if (t.places) return this.setDialogue(n, DIALOGUE.places.prompt, placeTopics())
    if (t.rumour) return this.setDialogue(n, rumour(this.state, t.rumour))
    const line = apply(this, t)
    if (line && this.talkingTo) this.setDialogue(n, line)
  }

  endDialogue() {
    this.talkingTo?.stopTalking()
    this.talkingTo = null
    this.dialogue = null
    this.publish()
  }

  // ------------------------------------------------------------------- menus

  private onAction(a: string) {
    if (a === 'pause') {
      if (this.dialogue) return this.endDialogue()
      if (this.sheet) return this.toggleSheet()
      this.paused = !this.paused
      if (this.paused && document.pointerLockElement) document.exitPointerLock()
      this.publish()
    }
    if (a === 'sheet' && !this.dialogue && !this.dead) this.toggleSheet()
  }

  toggleSheet() {
    this.sheet = !this.sheet
    if (this.sheet && document.pointerLockElement) document.exitPointerLock()
    this.publish()
  }

  setPaused(p: boolean) {
    this.paused = p
    this.publish()
  }

  lockPointer() {
    if (!this.busy && document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.()
  }
}
