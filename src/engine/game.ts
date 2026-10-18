import * as THREE from 'three'
import { sfx, setAmbience } from './audio'
import type { Outfit } from './art'
import { directions, NPCS, PLACES, rumour, type QuestStage } from './dialogue'
import { Enemy, Npc, type EnemyEvent } from './entities'
import { resolveCircle, supportAt } from './geo'
import { buildInterior, doorWorld } from './interiors'
import { Input } from './input'
import { asBuilding, buildBarrow, buildTown, BUILDINGS, type Interactable, type Level, type LevelId } from './levels'

export interface Topic {
  id: string
  label: string
}

export interface DialogueView {
  npcId: string
  name: string
  title: string
  outfit: Outfit
  text: string
  topics: Topic[]
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
  kind: 'info' | 'skill' | 'quest' | 'level'
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
const WALK = 4.2
const RUN = 7
const DAYS = ['Loamsday', 'Tuesk', 'Midweal', 'Thornsday', 'Freeday', 'Hearthday', 'Sunnday']

const SKY_KEYS: [number, number, number, number][] = [
  // hour, sky colour, sun intensity, ambient intensity
  [0, 0x1c2440, 0, 0.35],
  [5, 0x2c3456, 0, 0.4],
  [6.5, 0xe8a87a, 0.6, 0.7],
  [8, 0xbfe0e8, 1.6, 1.05],
  [17, 0xbfe0e8, 1.6, 1.05],
  [19, 0xe89a6a, 0.7, 0.75],
  [20.5, 0x3a3a62, 0.05, 0.45],
  [24, 0x1c2440, 0, 0.35],
]

function skyAt(hour: number) {
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const [h0, c0, s0, a0] = SKY_KEYS[i]
    const [h1, c1, s1, a1] = SKY_KEYS[i + 1]
    if (hour >= h0 && hour <= h1) {
      const k = (hour - h0) / (h1 - h0)
      return { color: new THREE.Color(c0).lerp(new THREE.Color(c1), k), sun: s0 + (s1 - s0) * k, amb: a0 + (a1 - a0) * k }
    }
  }
  return { color: new THREE.Color(SKY_KEYS[0][1]), sun: 0, amb: 0.35 }
}

export class Game {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600)
  input = new Input()
  level!: Level
  npcs: Npc[] = []
  enemies: Enemy[] = []
  lantern = new THREE.PointLight(0xffdcb0, 0, 20, 1.2)

  // player
  pos = new THREE.Vector3()
  vel = new THREE.Vector3()
  yaw = 0
  pitch = 0
  onGround = true
  hp = 60
  maxHp = 60
  stamina = 80
  maxStamina = 80
  stamDelay = 0
  gold = 25
  potions = 2
  level_ = 1
  raises = 0
  whetstone = false
  items: string[] = []
  skills: Skill[] = [
    { name: 'Blade', value: 18, progress: 0 },
    { name: 'Block', value: 14, progress: 0 },
    { name: 'Athletics', value: 12, progress: 0 },
    { name: 'Etiquette', value: 10, progress: 0 },
  ]
  quest: QuestStage = 'none'
  journal: string[] = ['Arrived in Brindle, a market town in the Quillmarch, with 25 gold and a sword that has seen better days.']
  metNpcs = new Set<string>()
  searchedJory = false

  swing = { phase: 'none' as 'none' | 'windup' | 'strike' | 'recover', t: 0, count: 0 }
  blocking = false
  hurtCount = 0
  shake = 0
  bob = 0
  stepAcc = 0
  runAcc = 0
  minutes = 8 * 60 + 30
  day = 0
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
  focusTarget: { kind: 'npc'; npc: Npc } | { kind: 'item'; it: Interactable } | null = null

  private listeners = new Set<() => void>()
  private snapshot: HudState
  private lastPublish = 0
  private raf = 0
  private last = performance.now()
  private detach: (() => void) | null = null

  constructor(public canvas: HTMLCanvasElement) {
    // phones get a lighter renderer: no MSAA, a lower pixel ratio, cheaper shadows
    const mobile = window.matchMedia?.('(pointer: coarse)').matches
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.camera.add(this.lantern)
    this.scene.add(this.camera)
    this.loadLevel('town')
    this.snapshot = this.buildSnapshot()
    this.note('You arrive at Brindle as the morning bells ring.', 'info')
    this.input.onAction = (a) => this.onAction(a)
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
    const h = Math.floor(this.minutes / 60) % 24
    const m = Math.floor(this.minutes % 60)
    return {
      hp: this.hp,
      maxHp: this.maxHp,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      gold: this.gold,
      potions: this.potions,
      level: this.level_,
      clock: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
      date: `${DAYS[this.day % 7]}, ${12 + this.day}th of Harvestide`,
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
      running: Math.hypot(this.vel.x, this.vel.z) > WALK + 0.5,
      hurt: this.hurtCount,
      location: this.level.title ?? (this.level.id === 'town' ? 'Brindle' : 'The Hollow Barrow'),
      journal: this.journal,
      skills: this.skills.map((s) => ({ ...s })),
      items: this.items,
      locked: document.pointerLockElement === this.canvas,
    }
  }

  publish(now = performance.now()) {
    this.lastPublish = now
    this.notes = this.notes.filter((n) => now - n.at < 6000)
    this.snapshot = this.buildSnapshot()
    for (const l of this.listeners) l()
  }

  note(text: string, kind: Note['kind'] = 'info') {
    this.notes = [...this.notes, { id: this.noteId++, text, at: performance.now(), kind }].slice(-5)
    this.publish()
  }

  /** True while a menu or conversation has the player's attention. */
  get busy() {
    return !!this.dialogue || this.sheet || this.paused || this.dead || this.fade > 0.5
  }

  // ------------------------------------------------------------------ levels

  loadLevel(id: LevelId) {
    if (this.level) this.scene.remove(this.level.group)
    for (const n of this.npcs) this.scene.remove(n.sprite.root)
    for (const e of this.enemies) this.scene.remove(e.sprite.root)
    this.npcs = []
    this.enemies = []
    const bdef = id.startsWith('in:') ? BUILDINGS.find((b) => `in:${b.id}` === id) : null
    this.level = id === 'town' ? buildTown() : bdef ? buildInterior(asBuilding(bdef)) : buildBarrow()
    this.scene.add(this.level.group)
    if (id === 'town' || bdef) {
      // everyone lives somewhere: out in town, or inside at their post
      for (const def of NPCS) {
        if ((def.inside ?? null) !== (bdef?.id ?? null)) continue
        const spot = def.spot ? this.level.spots?.[def.spot] : undefined
        const n = new Npc(def, spot ?? (bdef ? { x: 0, z: 0 } : undefined))
        this.npcs.push(n)
        this.scene.add(n.sprite.root)
      }
    } else {
      for (const s of this.level.enemies) {
        const e = new Enemy(s.kind, s.x, s.z)
        this.enemies.push(e)
        this.scene.add(e.sprite.root)
      }
      // once the ring is taken it stays taken
      if (this.quest !== 'none' && this.quest !== 'accepted') {
        const ring = this.level.interactables.find((i) => i.id === 'ring')
        if (ring?.sprite) ring.sprite.root.visible = false
        this.level.interactables = this.level.interactables.filter((i) => i.id !== 'ring')
      }
    }
    const s = this.level.spawn
    this.pos.set(s.x, 0, s.z)
    this.vel.set(0, 0, 0)
    this.yaw = s.yaw
    this.pitch = 0
    this.lantern.intensity = id === 'barrow' ? 4.5 : 0
    setAmbience(this.level.outdoors)
    if (id === 'barrow') {
      this.scene.background = new THREE.Color(0x0e0b09)
      this.scene.fog = new THREE.Fog(0x0e0b09, 3, 24)
    } else if (bdef) {
      this.scene.background = new THREE.Color(0x1a120c)
      this.scene.fog = null
    }
  }

  private travel(id: LevelId) {
    this.pendingLevel = id
    this.fadeTarget = 1
    sfx.door()
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
      this.note(this.pendingLevel === 'town' ? 'You climb back up into the daylight. Or the night. Whichever it is.' : 'The air goes cold and smells of old earth.')
      this.pendingLevel = null
      this.fadeTarget = 0
    }

    if (!this.paused) {
      this.minutes += dt * 2
      if (this.minutes >= 24 * 60) {
        this.minutes -= 24 * 60
        this.day++
      }
    }

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

    const cols = this.level.colliders
    for (const n of this.npcs) n.update(this.paused ? 0 : dt, cols, performance.now() / 1000)
    if (!this.paused && !this.dialogue) {
      const events: EnemyEvent[] = []
      for (const e of this.enemies) e.update(dt, this.pos.x, this.pos.z, cols, events)
      for (const ev of events) this.onEnemyEvent(ev)
    }
    for (const n of this.npcs) n.sprite.face(this.camera.position)
    for (const e of this.enemies) e.sprite.face(this.camera.position)
    for (const b of this.level.billboards) b.face(this.camera.position)

    this.updateCamera(dt)
    this.updateSky()
    this.updateFocus()
  }

  private updatePlayer(dt: number) {
    const look = this.input
    this.yaw -= look.lookX
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - look.lookY))
    look.lookX = look.lookY = 0

    const mv = look.readMove()
    this.blocking = look.held('block') && this.stamina > 0 && this.swing.phase === 'none'
    const wantRun = look.held('run') && this.stamina > 1 && mv.y > 0.3 && !this.blocking
    let speed = wantRun ? RUN : WALK
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

    if (this.onGround && look.take('jump') && this.stamina > 5) {
      this.vel.y = 5.4
      this.onGround = false
      this.spend(6)
      sfx.jump()
    }
    this.vel.y -= 15 * dt
    const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt }
    resolveCircle(p, RADIUS, this.level.colliders, this.pos.y)
    const moved = Math.hypot(p.x - this.pos.x, p.z - this.pos.z)
    this.pos.x = p.x
    this.pos.z = p.z
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
      this.stamina = Math.max(0, this.stamina - 11 * dt)
      this.stamDelay = 0.6
      this.runAcc += moved
      if (this.runAcc > 40) {
        this.runAcc = 0
        this.train('Athletics')
      }
    } else if (this.stamDelay > 0) this.stamDelay -= dt
    else this.stamina = Math.min(this.maxStamina, this.stamina + 16 * dt)

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
    this.stamina = Math.max(0, this.stamina - n)
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

  private updateSky() {
    const lvl = this.level
    const hour = this.minutes / 60
    const night = hour < 6.5 || hour > 19.5
    for (const l of lvl.nightLights) l.mesh.material = night ? l.night : l.day
    if (lvl.buildingId && lvl.hemi) lvl.hemi.intensity = night ? 0.45 : 0.95
    if (!lvl.outdoors || !lvl.sun || !lvl.hemi) return
    const s = skyAt(hour)
    this.scene.background = s.color
    if (!(this.scene.fog instanceof THREE.Fog)) this.scene.fog = new THREE.Fog(s.color, 70, 300)
    ;(this.scene.fog as THREE.Fog).color.copy(s.color)
    ;(this.scene.fog as THREE.Fog).near = 70
    ;(this.scene.fog as THREE.Fog).far = 300
    // the sun climbs from the east (+x) and sets in the west
    const a = ((hour - 6) / 12) * Math.PI
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.35).normalize()
    lvl.sun.intensity = s.sun
    lvl.sun.position.copy(this.pos).addScaledVector(dir, 80)
    lvl.sun.target.position.copy(this.pos)
    lvl.sun.color.setHSL(0.1, 0.6, hour < 8 || hour > 17 ? 0.75 : 0.9)
    lvl.hemi.intensity = s.amb
    if (lvl.sky) {
      lvl.sky.sun.position.copy(this.camera.position).addScaledVector(dir, 220)
      lvl.sky.sun.lookAt(this.camera.position)
      lvl.sky.sun.visible = dir.y > -0.1
      lvl.sky.moon.position.copy(this.camera.position).addScaledVector(dir, -220)
      lvl.sky.moon.lookAt(this.camera.position)
      lvl.sky.moon.visible = dir.y < 0.1
      for (const c of lvl.sky.clouds) {
        c.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0004)
        c.lookAt(this.camera.position.x, c.position.y, this.camera.position.z)
      }
    }
  }

  // -------------------------------------------------------------- interaction

  private updateFocus() {
    if (this.busy) {
      this.prompt = null
      return
    }
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    let best: Game['focusTarget'] = null
    let bestScore = Infinity
    const consider = (x: number, z: number, reach: number) => {
      const dx = x - this.pos.x
      const dz = z - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d > reach) return Infinity
      const dot = (dx * fx + dz * fz) / (d || 1)
      if (dot < 0.75 && d > 1) return Infinity
      return d - dot
    }
    for (const n of this.npcs) {
      if (this.pos.y > 1.2) continue
      const sc = consider(n.x, n.z, 3)
      if (sc < bestScore) {
        bestScore = sc
        best = { kind: 'npc', npc: n }
      }
    }
    for (const it of this.level.interactables) {
      if (Math.abs(this.pos.y - (it.y ?? 0)) > 1.2) continue
      const sc = consider(it.x, it.z, it.radius + 1)
      if (sc < bestScore) {
        bestScore = sc
        best = { kind: 'item', it }
      }
    }
    this.focusTarget = best
    this.prompt = !best ? null : best.kind === 'npc' ? `Talk to ${best.npc.def.name}` : best.it.label
  }

  private interact() {
    const f = this.focusTarget
    if (!f) return
    if (f.kind === 'npc') return this.talk(f.npc)
    const it = f.it
    if (it.id.startsWith('door:')) {
      this.travel(`in:${it.id.slice(5)}`)
      return
    }
    switch (it.id) {
      case 'exit': {
        // step back out into the street, facing away from the door
        const b = BUILDINGS.find((x) => x.id === this.level.buildingId)
        if (b) {
          const { out } = doorWorld(asBuilding(b))
          this.pendingSpawn = { x: out.x, z: out.z, yaw: out.yaw }
        }
        this.travel('town')
        break
      }
      case 'enterBarrow':
        if (this.quest === 'none') this.note('A cold draught breathes out of the barrow. You go in anyway.')
        this.travel('barrow')
        break
      case 'leaveBarrow':
        // come out standing at the barrow's mouth, facing town
        this.pendingSpawn = { x: 0, z: 84.8, yaw: 0 }
        this.travel('town')
        break
      case 'ring':
        it.sprite!.root.visible = false
        this.level.interactables = this.level.interactables.filter((i) => i !== it)
        this.items.push("The Reeve's signet")
        if (this.quest === 'accepted' || this.quest === 'none') {
          this.quest = 'found'
          this.journal = [...this.journal, "Found the Reeve's signet beside what was left of Jory Quickfingers. Return it to Aldous Penhallow in Brindle."]
          this.note("You take the Reeve's signet.", 'quest')
          sfx.quest()
        }
        break
      case 'jory':
        if (this.searchedJory) {
          this.note('Jory has nothing else to give. Poor Jory.')
          break
        }
        this.searchedJory = true
        this.gold += 6
        sfx.coin()
        this.note("A crumpled note in Jory's coat: 'Fence the ring in Coldharbour. Tell nobody. ESPECIALLY not Mother Tansy.' And 6 gold.")
        break
    }
  }

  // ----------------------------------------------------------------- combat

  private startSwing() {
    if (this.swing.phase !== 'none' || this.blocking) return
    if (this.stamina < 4) {
      this.note('You are too tired to swing.')
      return
    }
    this.spend(9)
    this.swing = { phase: 'windup', t: 0, count: this.swing.count + 1 }
    sfx.swing()
    this.publish()
  }

  private updateCombat(dt: number) {
    const s = this.swing
    if (s.phase === 'none') return
    s.t += dt
    if (s.phase === 'windup' && s.t >= 0.13) {
      s.phase = 'strike'
      s.t = 0
      this.resolveSwing()
    } else if (s.phase === 'strike' && s.t >= 0.1) {
      s.phase = 'recover'
      s.t = 0
    } else if (s.phase === 'recover' && s.t >= 0.24) {
      s.phase = 'none'
    }
  }

  private resolveSwing() {
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    const blade = this.skills[0].value
    let hitAny = false
    for (const e of this.enemies) {
      if (!e.alive) continue
      const dx = e.x - this.pos.x
      const dz = e.z - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d > 2.4) continue
      if ((dx * fx + dz * fz) / (d || 1) < 0.72) continue
      const dmg = Math.round(5 + blade / 5 + (this.whetstone ? 3 : 0) + Math.random() * 4)
      const killed = e.hurt(dmg, this.pos.x, this.pos.z)
      hitAny = true
      sfx.hit(killed)
      this.shake = Math.max(this.shake, 0.6)
      if (killed) this.onKill(e)
    }
    if (hitAny) this.train('Blade')
  }

  private onKill(e: Enemy) {
    sfx.bones()
    const [lo, hi] = e.stats.gold
    const g = Math.round(lo + Math.random() * (hi - lo))
    if (g > 0) {
      this.gold += g
      setTimeout(() => sfx.coin(), 250)
      this.note(`The ${e.kind} falls. You find ${g} gold.`)
    } else this.note(`The ${e.kind} falls.`)
  }

  private onEnemyEvent(ev: EnemyEvent) {
    if (ev.type === 'tele') {
      if (ev.enemy.kind === 'skeleton') sfx.bones()
      else sfx.squeak()
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
      dmg *= 0.2
      this.spend(10)
      sfx.block()
      this.shake = Math.max(this.shake, 0.4)
      this.train('Block')
    } else {
      sfx.hurt()
      this.hurtCount++
      this.shake = Math.max(this.shake, 1.4)
      navigator.vibrate?.(60)
    }
    this.hp = Math.max(0, this.hp - dmg)
    if (this.hp <= 0) this.die()
    this.publish()
  }

  private drinkPotion() {
    if (this.potions <= 0) {
      this.note('You have no healing draughts left.')
      return
    }
    if (this.hp >= this.maxHp) {
      this.note('You are already in fine health.')
      return
    }
    this.potions--
    this.hp = Math.min(this.maxHp, this.hp + 35)
    sfx.potion()
    this.note('You drink a healing draught. It tastes of honey and pennies.')
  }

  private die() {
    this.dead = true
    this.deadT = 0
    this.swing.phase = 'none'
    sfx.death()
    if (document.pointerLockElement) document.exitPointerLock()
  }

  private respawn() {
    this.dead = false
    const lost = Math.floor(this.gold * 0.1)
    this.gold -= lost
    this.hp = this.maxHp
    this.stamina = this.maxStamina
    this.loadLevel('in:temple')
    this.pos.set(0, 0, 0.5)
    this.yaw = 0
    this.fade = 1
    this.fadeTarget = 0
    this.note(`You wake on the cold floor of the Temple of the Lantern. Sister Ide took ${lost} gold for her trouble.`)
  }

  // ----------------------------------------------------------- skills, levels

  train(name: string) {
    const s = this.skills.find((k) => k.name === name)!
    s.progress++
    const need = 2 + Math.floor(s.value / 10)
    if (s.progress < need) return
    s.progress = 0
    s.value++
    sfx.skill()
    this.note(`Your ${name} skill has increased to ${s.value}.`, 'skill')
    this.raises++
    if (this.raises >= 5) {
      this.raises = 0
      this.level_++
      this.maxHp += 10
      this.maxStamina += 6
      this.hp = this.maxHp
      setTimeout(() => sfx.levelUp(), 300)
      this.note(`You feel more experienced. You are now level ${this.level_}.`, 'level')
    }
  }

  // ---------------------------------------------------------------- dialogue

  private talk(n: Npc) {
    this.talkingTo = n
    n.startTalking()
    if (!this.metNpcs.has(n.def.id)) {
      this.metNpcs.add(n.def.id)
      this.train('Etiquette')
    }
    if (document.pointerLockElement) document.exitPointerLock()
    const greet = n.def.greeting[Math.floor(Math.random() * n.def.greeting.length)]
    this.setDialogue(n, greet)
    sfx.talk()
  }

  private topicsFor(n: Npc): Topic[] {
    const t: Topic[] = []
    const role = n.def.role
    if (role === 'reeve') {
      if (this.quest === 'none') t.push({ id: 'work', label: 'Is there any work?' })
      if (this.quest === 'accepted') t.push({ id: 'signet', label: 'About your signet...' })
      if (this.quest === 'found') t.push({ id: 'return', label: 'Return the signet' })
    }
    if (role === 'innkeeper') {
      t.push({ id: 'draught15', label: 'Buy a healing draught (15 gold)' })
      t.push({ id: 'room', label: 'Rent a room for the night (10 gold)' })
    }
    if (role === 'merchant') {
      t.push({ id: 'draught12', label: 'Buy a healing draught (12 gold)' })
      if (!this.whetstone) t.push({ id: 'whetstone', label: 'Buy a whetstone (40 gold)' })
    }
    if (role === 'priest') t.push({ id: 'blessing', label: 'Ask for a blessing (5 gold)' })
    if (role === 'guard') t.push({ id: 'road', label: "What's down the south road?" })
    if (role === 'folk' && this.quest === 'none') t.push({ id: 'work', label: 'Is there any work?' })
    t.push({ id: 'rumours', label: 'Any news?' })
    t.push({ id: 'where', label: 'Where is...' })
    t.push({ id: 'bye', label: 'Farewell' })
    return t
  }

  private setDialogue(n: Npc, text: string, topics = this.topicsFor(n)) {
    n.mouth = 0
    this.dialogue = { npcId: n.def.id, name: n.def.name, title: n.def.title, outfit: n.def.outfit, text, topics }
    this.publish()
  }

  choose(topicId: string) {
    const n = this.talkingTo
    if (!n) return
    sfx.talk()
    const pay = (cost: number) => {
      if (this.gold < cost) return false
      this.gold -= cost
      sfx.coin()
      return true
    }
    if (topicId.startsWith('place:')) {
      const p = PLACES.find((x) => `place:${x.id}` === topicId)!
      const b = BUILDINGS.find((x) => x.id === this.level.buildingId)
      const from = b ? doorWorld(asBuilding(b)).door : { x: n.x, z: n.z }
      return this.setDialogue(n, directions(from.x, from.z, p))
    }
    switch (topicId) {
      case 'bye':
        return this.endDialogue()
      case 'where':
        return this.setDialogue(n, 'Where are you trying to get to?', [...PLACES.map((p) => ({ id: `place:${p.id}`, label: cap(p.name) })), { id: 'back', label: 'Never mind' }])
      case 'back':
        return this.setDialogue(n, 'Anything else?')
      case 'rumours':
        return this.setDialogue(n, rumour(this.quest))
      case 'road':
        return this.setDialogue(n, "The barrow? Out the south gate, follow the road till the trees close in. Big grassy lump, stone door, smells like a cellar that's given up. Rats, mostly. And worse, further down.")
      case 'work':
        if (n.def.role === 'reeve') {
          this.quest = 'accepted'
          this.journal = [...this.journal, "Aldous Penhallow, Reeve of Brindle, wants his signet ring back. Jory Quickfingers stole it and fled into the Hollow Barrow, south of town. Reward promised."]
          sfx.quest()
          this.note('Journal updated: The Reeve\'s Signet', 'quest')
          return this.setDialogue(
            n,
            "Work? Oh, thank the Lantern. My signet ring, my seal of office, has been stolen. Jory Quickfingers, a thief of no particular talent. He fled south into the Hollow Barrow three nights ago and hasn't come out. Fetch me that ring and I will pay you a hundred and fifty gold. And I'll be very, very grateful, which is worth at least another ten.",
          )
        }
        return this.setDialogue(n, 'Work? Go and see the Reeve. He has been asking everyone, even the ducks.')
      case 'signet':
        return this.setDialogue(n, "The barrow is south, out of the gate and down the road. Jory went in with a candle and no sense. Bring me the ring. Please. I've had to sign everything with my thumb.")
      case 'return': {
        this.quest = 'done'
        this.items = this.items.filter((i) => i !== "The Reeve's signet")
        this.gold += 150
        this.journal = [...this.journal, "Returned the signet to the Reeve. He paid 150 gold and wept a little. Brindle owes you one."]
        sfx.quest()
        this.note('Quest complete: The Reeve\'s Signet. You receive 150 gold.', 'quest')
        this.train('Etiquette')
        return this.setDialogue(n, "My ring! My beautiful, official ring! And poor Jory... well, he did steal it. Here: a hundred and fifty gold, as promised. Brindle is in your debt. I shall write you a letter of thanks. With my seal on it. Because I can, now.")
      }
      case 'draught15':
      case 'draught12': {
        const cost = topicId === 'draught15' ? 15 : 12
        if (!pay(cost)) return this.setDialogue(n, "That's more gold than you've got, love. I don't do tabs.")
        this.potions++
        return this.setDialogue(n, n.def.role === 'innkeeper' ? "There you go. Don't drink it all at once. Actually, do, that's how it works." : 'One healing draught! Shake well. Do not shake the person drinking it.')
      }
      case 'whetstone':
        if (!pay(40)) return this.setDialogue(n, 'Forty gold, friend. I can see your purse from here, and it is not forty gold.')
        this.whetstone = true
        this.items.push('A whetstone (your sword bites harder)')
        return this.setDialogue(n, "A fine whetstone. Give that blade a proper edge. Your sword will thank you. Swords don't talk, mind, but you'll know.")
      case 'room':
        if (!pay(10)) return this.setDialogue(n, 'Ten gold for a bed. Come back when you can afford sleeping.')
        this.endDialogue()
        this.fade = 1
        this.fadeTarget = 0
        this.minutes += 8 * 60
        if (this.minutes >= 24 * 60) {
          this.minutes -= 24 * 60
          this.day++
        }
        this.hp = this.maxHp
        this.stamina = this.maxStamina
        this.note('You sleep for eight hours in a bed that only slightly smells of goose.')
        return
      case 'blessing':
        if (!pay(5)) return this.setDialogue(n, 'Five gold, child. The Lantern does not burn on goodwill alone. It burns on oil, which costs money.')
        this.hp = this.maxHp
        sfx.potion()
        return this.setDialogue(n, 'Be warm and be lit. There. Your wounds are mended, and your soul is marginally tidier.')
    }
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
