import { createEnemy, currentSeg, enraged, MOVES } from '../game/enemy'
import type { InputState } from '../game/input'
import { STRAW } from '../game/particles'
import { ATTACKS, attackPhase, createPlayer, P } from '../game/player'
import { RITES, TALLOW } from '../game/rites'
import type { AttackId, Enemy, EnemyMoveId, GameEvent, Player } from '../game/types'
import { buildMap, toScreen, type IsoMap } from './map'

/** Position on the ground plane, in tiles. */
export interface Actor {
  gx: number
  gy: number
  vx: number
  vy: number
  /** Facing angle on the ground plane. */
  ang: number
  r: number
  /** Height above the ground in screen pixels (for the leap). */
  z: number
}

export interface IsoProjectile {
  kind: 'wisp' | 'moon' | 'crow'
  gx: number
  gy: number
  vx: number
  vy: number
  age: number
  life: number
  dmg: number
  poise: number
  r: number
  hostile: boolean
  hit: boolean
}

export interface IsoHazard {
  kind: 'briar' | 'flame'
  gx: number
  gy: number
  ang: number
  t: number
  delay: number
  dur: number
  dmg: number
  poise: number
  hit: boolean
}

export interface IsoParticle {
  gx: number
  gy: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  max: number
  size: number
  color: string
  kind: 'straw' | 'ink' | 'spark' | 'dust'
}

export interface IsoWorld {
  map: IsoMap
  time: number
  freeze: number
  shake: number
  player: Player
  pa: Actor
  enemy: Enemy
  ea: Actor
  leapFrom: { gx: number; gy: number } | null
  landing: { gx: number; gy: number } | null
  strafe: 1 | -1
  rollAng: number
  projectiles: IsoProjectile[]
  hazards: IsoHazard[]
  particles: IsoParticle[]
  splats: { gx: number; gy: number; r: number; rot: number; seed: number; age: number }[]
  cam: { x: number; y: number }
  view: { w: number; h: number }
  events: GameEvent[]
  debug: boolean
}

export const STEP = 1 / 120
const RUN = 4.2
const ROLL_SPEED = 8.6
/** Converts the side-scroller's pixel speeds to tiles per second. */
const PX = 1 / 110

const REACH: Record<AttackId, { range: number; cone: number }> = {
  light1: { range: 1.45, cone: 120 },
  light2: { range: 1.45, cone: 120 },
  light3: { range: 1.6, cone: 120 },
  heavy: { range: 1.75, cone: 140 },
  air: { range: 1.45, cone: 120 },
}

const ENEMY_REACH: Partial<Record<EnemyMoveId, { range: number; cone: number }>> = {
  lunge: { range: 1.05, cone: 90 },
  swipes: { range: 1.5, cone: 120 },
  overhead: { range: 1.6, cone: 70 },
  leap: { range: 1.4, cone: 360 },
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const dist = (a: { gx: number; gy: number }, b: { gx: number; gy: number }) => Math.hypot(a.gx - b.gx, a.gy - b.gy)
const angTo = (a: { gx: number; gy: number }, b: { gx: number; gy: number }) => Math.atan2(b.gy - a.gy, b.gx - a.gx)
const angDiff = (a: number, b: number) => {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}
/** Which way a puppet should face on screen for a ground-plane angle. */
const screenFacing = (ang: number, fallback: 1 | -1): 1 | -1 => {
  const sx = Math.cos(ang) - Math.sin(ang)
  return Math.abs(sx) < 0.2 ? fallback : sx > 0 ? 1 : -1
}

export function createIsoWorld(): IsoWorld {
  const map = buildMap()
  const player = createPlayer()
  const enemy = createEnemy()
  return {
    map,
    time: 0,
    freeze: 0,
    shake: 0,
    player,
    pa: { gx: map.playerSpawn.x, gy: map.playerSpawn.y, vx: 0, vy: 0, ang: 0.8, r: 0.26, z: 0 },
    enemy,
    ea: { gx: map.enemySpawn.x, gy: map.enemySpawn.y, vx: 0, vy: 0, ang: 0, r: 0.38, z: 0 },
    leapFrom: null,
    landing: null,
    strafe: 1,
    rollAng: 0,
    projectiles: [],
    hazards: [],
    particles: [],
    splats: [],
    cam: toScreen(map.playerSpawn.x, map.playerSpawn.y),
    view: { w: 1280, h: 720 },
    events: [],
    debug: false,
  }
}

// ------------------------------------------------------------------ physics

function solidAt(m: IsoMap, tx: number, ty: number) {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return true
  return m.solid[ty][tx]
}

function collide(m: IsoMap, a: Actor) {
  const x0 = Math.floor(a.gx - 1)
  const y0 = Math.floor(a.gy - 1)
  for (let ty = y0; ty <= y0 + 2; ty++)
    for (let tx = x0; tx <= x0 + 2; tx++) {
      if (!solidAt(m, tx, ty)) continue
      const cx = Math.max(tx, Math.min(tx + 1, a.gx))
      const cy = Math.max(ty, Math.min(ty + 1, a.gy))
      const dx = a.gx - cx
      const dy = a.gy - cy
      const d = Math.hypot(dx, dy)
      if (d < a.r) {
        if (d < 1e-4) {
          a.gy = ty + 1 + a.r
          continue
        }
        a.gx += (dx / d) * (a.r - d)
        a.gy += (dy / d) * (a.r - d)
      }
    }
}

function move(m: IsoMap, a: Actor, dt: number) {
  // substeps keep fast dashes from tunnelling through walls
  const n = Math.ceil((Math.hypot(a.vx, a.vy) * dt) / 0.2) || 1
  for (let i = 0; i < n; i++) {
    a.gx += (a.vx * dt) / n
    a.gy += (a.vy * dt) / n
    collide(m, a)
  }
}

const onSlow = (m: IsoMap, a: Actor) => m.slow[Math.floor(a.gy)]?.[Math.floor(a.gx)] ?? false

// --------------------------------------------------------------- particles

function emit(w: IsoWorld, n: number, gx: number, gy: number, z: number, colors: string[], kind: IsoParticle['kind'], speed = 2, up = 120, size = 4, life = 0.8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = speed * rand(0.3, 1)
    const l = life * rand(0.6, 1.1)
    w.particles.push({ gx, gy, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: up * rand(0.4, 1.2), life: l, max: l, size: size * rand(0.6, 1.4), color: colors[Math.floor(Math.random() * colors.length)], kind })
  }
}

const INK = ['#1a0d10', '#2b0f14', '#5c1a1f']

function splat(w: IsoWorld, gx: number, gy: number, heavy: boolean) {
  emit(w, heavy ? 18 : 10, gx, gy, 50, INK, 'ink', heavy ? 3 : 2, 220, heavy ? 5 : 4, 0.7)
  emit(w, heavy ? 8 : 4, gx, gy, 50, STRAW, 'straw', 2.5, 160, 6, 1)
}

function updateParticles(w: IsoWorld, dt: number) {
  for (let i = w.particles.length - 1; i >= 0; i--) {
    const q = w.particles[i]
    q.life -= dt
    if (q.life <= 0) {
      w.particles.splice(i, 1)
      continue
    }
    q.gx += q.vx * dt
    q.gy += q.vy * dt
    const grav = q.kind === 'spark' ? -40 : q.kind === 'dust' ? -30 : q.kind === 'straw' ? 300 : 900
    q.vz -= grav * dt
    q.z += q.vz * dt
    q.vx *= Math.exp(-2 * dt)
    q.vy *= Math.exp(-2 * dt)
    if (q.z <= 0) {
      if (q.kind === 'ink') {
        if (w.splats.length < 60 && Math.random() < 0.5) w.splats.push({ gx: q.gx, gy: q.gy, r: q.size * 1.4, rot: Math.random() * 360, seed: Math.random() * 100, age: 0 })
        w.particles.splice(i, 1)
        continue
      }
      q.z = 0
      q.vz = 0
      q.vx *= 0.5
      q.vy *= 0.5
    }
  }
  if (w.particles.length > 450) w.particles.splice(0, w.particles.length - 450)
  for (let i = w.splats.length - 1; i >= 0; i--) if ((w.splats[i].age += dt) > 40) w.splats.splice(i, 1)
}

// ------------------------------------------------------------------ player

function setState(p: Player, s: Player['state']) {
  p.state = s
  p.t = 0
}

function spend(p: Player, n: number) {
  p.stamina = Math.max(-10, p.stamina - n)
  p.stamDelay = 0.55
}

/** Screen-relative stick input converted to a ground-plane direction. */
function inputDir(input: InputState) {
  const ix = input.dir()
  const iy = input.dirY()
  const mag = Math.min(1, Math.hypot(ix, iy))
  if (mag < 0.01) return null
  const dx = ix / 64 + iy / 32
  const dy = iy / 32 - ix / 64
  const l = Math.hypot(dx, dy)
  return { x: dx / l, y: dy / l, mag }
}

function faceTo(w: IsoWorld, ang: number) {
  w.pa.ang = ang
  w.player.facing = screenFacing(ang, w.player.facing)
}

function hurtPlayer(w: IsoWorld, dmg: number, from: { gx: number; gy: number }) {
  const p = w.player
  if (p.state === 'dead') return
  p.hp -= dmg
  p.attack = null
  p.cast = null
  const a = angTo(from, w.pa)
  w.pa.vx = Math.cos(a) * 5
  w.pa.vy = Math.sin(a) * 5
  p.invuln = 0.7
  w.freeze = 0.14
  w.shake = Math.max(w.shake, 12)
  splat(w, w.pa.gx, w.pa.gy, true)
  w.events.push({ type: 'hurt' })
  if (p.hp <= 0) {
    p.hp = 0
    p.lockOn = false
    setState(p, 'dead')
    w.events.push({ type: 'death' })
  } else setState(p, 'hurt')
}

function startAttack(w: IsoWorld, id: AttackId, dir: ReturnType<typeof inputDir>) {
  const p = w.player
  if (p.stamina <= 0) {
    w.events.push({ type: 'noStamina' })
    return false
  }
  if (p.lockOn) faceTo(w, angTo(w.pa, w.ea))
  else if (dir) faceTo(w, Math.atan2(dir.y, dir.x))
  spend(p, ATTACKS[id].stam)
  p.attack = id
  p.hitDone = false
  setState(p, 'attack')
  w.events.push({ type: 'swing', heavy: id === 'heavy' || id === 'light3' })
  return true
}

function tryRoll(w: IsoWorld, input: InputState, dir: ReturnType<typeof inputDir>) {
  const p = w.player
  if (!input.take('roll') && !input.take('jump')) return false
  if (p.stamina <= 0) {
    w.events.push({ type: 'noStamina' })
    return false
  }
  // locked on with no direction: hop back away from him
  const ang = dir ? Math.atan2(dir.y, dir.x) : p.lockOn ? angTo(w.ea, w.pa) : w.pa.ang
  const rollScreen = screenFacing(ang, p.facing)
  if (p.lockOn) faceTo(w, angTo(w.pa, w.ea))
  else faceTo(w, ang)
  p.rollDir = rollScreen
  w.rollAng = ang
  spend(p, P.rollCost)
  p.attack = null
  p.cast = null
  setState(p, 'roll')
  w.events.push({ type: 'roll' })
  emit(w, 6, w.pa.gx, w.pa.gy, 2, ['#6b5a3e', '#8a7550'], 'dust', 1.5, 30, 7, 0.5)
  return true
}

function tryCast(w: IsoWorld, input: InputState, dir: ReturnType<typeof inputDir>) {
  const p = w.player
  if (!input.take('cast')) return false
  const r = RITES[p.rite]
  if (p.tallow < r.cost) {
    w.events.push({ type: 'noTallow' })
    return false
  }
  if (p.stamina <= 0) {
    w.events.push({ type: 'noStamina' })
    return false
  }
  if (p.lockOn) faceTo(w, angTo(w.pa, w.ea))
  else if (dir) faceTo(w, Math.atan2(dir.y, dir.x))
  p.tallow -= r.cost
  spend(p, r.stam)
  p.cast = r.id
  p.castDone = false
  setState(p, 'cast')
  return true
}

function releaseRite(w: IsoWorld) {
  const p = w.player
  const a = w.pa
  const fx = Math.cos(a.ang)
  const fy = Math.sin(a.ang)
  switch (p.cast) {
    case 'wisp':
      w.projectiles.push({ kind: 'wisp', gx: a.gx + fx * 0.4, gy: a.gy + fy * 0.4, vx: fx * 8, vy: fy * 8, age: 0, life: 1.6, dmg: 16, poise: 8, r: 0.45, hostile: false, hit: false })
      break
    case 'husk':
      w.hazards.push({ kind: 'flame', gx: a.gx, gy: a.gy, ang: a.ang, t: 0, delay: 0, dur: 0.32, dmg: 34, poise: 28, hit: false })
      emit(w, 24, a.gx + fx * 0.8, a.gy + fy * 0.8, 40, ['#ffb347', '#ff7a1a', '#ffe08a'], 'spark', 4, 80, 5, 0.45)
      break
    case 'briar': {
      const e = w.ea
      const lock = p.lockOn && w.enemy.state !== 'dead'
      w.hazards.push({ kind: 'briar', gx: lock ? e.gx : a.gx + fx * 3.5, gy: lock ? e.gy : a.gy + fy * 3.5, ang: a.ang, t: 0, delay: 0.45, dur: 0.32, dmg: 38, poise: 45, hit: false })
      break
    }
    case 'moon':
      w.projectiles.push({ kind: 'moon', gx: a.gx + fx * 0.5, gy: a.gy + fy * 0.5, vx: fx * 9, vy: fy * 9, age: 0, life: 1.1, dmg: 52, poise: 34, r: 0.75, hostile: false, hit: false })
      w.shake = Math.max(w.shake, 5)
      break
  }
}

function updatePlayer(w: IsoWorld, input: InputState, dt: number) {
  const p = w.player
  const a = w.pa
  p.t += dt
  p.invuln = Math.max(0, p.invuln - dt)
  if (input.take('rite') && p.state !== 'dead') {
    p.rite = (p.rite + 1) % RITES.length
    w.events.push({ type: 'riteSwap' })
  }
  if (p.state !== 'cast' && p.state !== 'dead') p.tallow = Math.min(p.maxTallow, p.tallow + TALLOW.regen * dt)
  if (p.stamDelay > 0) p.stamDelay -= dt
  else if (p.state !== 'attack' && p.state !== 'roll') p.stamina = Math.min(p.maxStamina, p.stamina + 62 * (p.state === 'heal' ? 0.5 : 1) * dt)

  const e = w.enemy
  if (p.lockOn && (e.state === 'dead' || dist(a, w.ea) > 9)) p.lockOn = false
  const dir = inputDir(input)
  let want = 0
  let wantAng = a.ang

  switch (p.state) {
    case 'move': {
      if (tryRoll(w, input, dir)) break
      if (tryCast(w, input, dir)) break
      if (input.take('light') && startAttack(w, 'light1', dir)) break
      if (input.take('heavy') && startAttack(w, 'heavy', dir)) break
      if (input.take('heal') && p.flasks > 0) {
        p.flasks--
        p.healed = false
        setState(p, 'heal')
        break
      }
      if (dir) {
        want = RUN * dir.mag
        wantAng = Math.atan2(dir.y, dir.x)
        if (p.lockOn) {
          // backpedalling while locked on is slower
          if (angDiff(wantAng, angTo(a, w.ea)) > Math.PI * 0.6) want *= 0.62
          faceTo(w, angTo(a, w.ea))
        } else faceTo(w, wantAng)
      } else if (p.lockOn) faceTo(w, angTo(a, w.ea))
      break
    }
    case 'roll': {
      const k = p.t / P.rollTime
      const sp = ROLL_SPEED * (1 - k * k * 0.75)
      a.vx = Math.cos(w.rollAng) * sp
      a.vy = Math.sin(w.rollAng) * sp
      if (p.t >= 0.03 && p.t <= 0.3) p.invuln = Math.max(p.invuln, 0.016)
      if (p.t >= P.rollTime) setState(p, 'move')
      break
    }
    case 'attack': {
      const ph = attackPhase(p)!
      if (ph.phase !== 'recovery') {
        const lungeK = ph.phase === 'startup' ? 0.25 + ph.k * 0.75 : 1 - ph.k * 0.5
        const sp = (ph.a.lunge / 70) * lungeK
        a.vx = Math.cos(a.ang) * sp
        a.vy = Math.sin(a.ang) * sp
      }
      if (ph.phase === 'active' && !p.hitDone && e.state !== 'dead' && e.state !== 'dormant') {
        const reach = REACH[p.attack!]
        const d = dist(a, w.ea)
        if (d < reach.range + w.ea.r && angDiff(angTo(a, w.ea), a.ang) < ((reach.cone / 2) * Math.PI) / 180) {
          p.hitDone = true
          const heavy = p.attack === 'heavy' || p.attack === 'light3'
          const crit = damageEnemy(w, ph.a.dmg, ph.a.poise)
          w.freeze = ph.a.hitstop * (crit ? 1.6 : 1)
          w.shake = Math.max(w.shake, ph.a.shake * (crit ? 1.5 : 1))
          w.events.push({ type: 'hit', heavy, crit })
          p.tallow = Math.min(p.maxTallow, p.tallow + TALLOW.perHit * (heavy ? 1.5 : 1))
          splat(w, w.ea.gx, w.ea.gy, heavy || crit)
        }
      }
      if (ph.phase === 'recovery') {
        a.vx *= Math.exp(-14 * dt)
        a.vy *= Math.exp(-14 * dt)
        if (ph.a.next && input.peek('light', 220)) {
          input.take('light')
          if (startAttack(w, ph.a.next, dir)) break
        }
        if (p.attack !== 'heavy' && input.peek('heavy', 160)) {
          input.take('heavy')
          if (startAttack(w, 'heavy', dir)) break
        }
        if (ph.k >= ph.a.rollCancel && (input.peek('roll', 200) || input.peek('jump', 200)) && tryRoll(w, input, dir)) break
        if (ph.k >= 1) {
          p.attack = null
          setState(p, 'move')
        }
      }
      break
    }
    case 'cast': {
      const r = RITES.find((x) => x.id === p.cast)!
      a.vx *= Math.exp(-12 * dt)
      a.vy *= Math.exp(-12 * dt)
      if (!p.castDone && p.t >= r.release) {
        p.castDone = true
        releaseRite(w)
        w.events.push({ type: 'cast', rite: r.id })
      }
      if (p.t >= r.total) {
        p.cast = null
        setState(p, 'move')
      }
      break
    }
    case 'hurt':
      a.vx *= Math.exp(-8 * dt)
      a.vy *= Math.exp(-8 * dt)
      if (p.t > 0.38) setState(p, 'move')
      break
    case 'heal':
      if (dir) {
        want = 1
        wantAng = Math.atan2(dir.y, dir.x)
        if (!p.lockOn) faceTo(w, wantAng)
      }
      if (!p.healed && p.t >= P.healAt) {
        p.healed = true
        p.hp = Math.min(p.maxHp, p.hp + P.healAmount)
        w.events.push({ type: 'heal' })
        emit(w, 14, a.gx, a.gy, 50, ['#f2c14e', '#ffe08a', '#e8a33a'], 'spark', 1, 60, 3, 0.9)
      }
      if (p.t >= P.healTime) setState(p, 'move')
      break
    case 'rest':
      a.vx = a.vy = 0
      if (p.t > 1.6) setState(p, 'move')
      break
    case 'dead':
      a.vx *= Math.exp(-6 * dt)
      a.vy *= Math.exp(-6 * dt)
      break
  }

  if (p.state === 'move' || p.state === 'heal') {
    const slow = onSlow(w.map, a) ? 0.72 : 1
    const k = 1 - Math.exp(-14 * dt)
    a.vx += (Math.cos(wantAng) * want * slow - a.vx) * k
    a.vy += (Math.sin(wantAng) * want * slow - a.vy) * k
  }
  move(w.map, a, dt)

  // the puppet's run cycle and lean read off the speed on screen
  const sp = Math.hypot(a.vx, a.vy)
  p.body.vx = (sp / RUN) * P.run * p.facing
  p.body.onGround = true
  if (sp > 0.2) {
    const forward = Math.cos(Math.atan2(a.vy, a.vx) - a.ang) >= 0 ? 1 : -1
    p.runPhase += forward * (sp / RUN) * dt * 11
  }
}

// ------------------------------------------------------------------- enemy

function damageEnemy(w: IsoWorld, dmg: number, poise: number) {
  const e = w.enemy
  const crit = e.state === 'stagger'
  const wasAbove = !enraged(e)
  e.hp -= crit ? dmg * 1.5 : dmg
  e.flash = 0.1
  e.wobble = 1
  e.poiseRegen = 2
  if (e.state === 'dormant') wake(w)
  if (e.state !== 'stagger' && e.state !== 'dead') {
    e.poise -= poise
    if (e.poise <= 0) {
      e.poise = e.maxPoise
      e.state = 'stagger'
      e.t = 0
      e.move = null
      w.landing = null
      w.events.push({ type: 'stagger' })
    }
  }
  if (wasAbove && enraged(e) && e.hp > 0) {
    emit(w, 30, w.ea.gx, w.ea.gy, 70, STRAW, 'straw', 3, 200, 8, 1.6)
    w.events.push({ type: 'aggro' })
  }
  if (e.hp <= 0) {
    e.hp = 0
    e.state = 'dead'
    e.t = 0
    e.move = null
    w.landing = null
    w.events.push({ type: 'harvested' })
    emit(w, 50, w.ea.gx, w.ea.gy, 70, STRAW, 'straw', 4, 260, 9, 2)
  }
  return crit
}

function wake(w: IsoWorld) {
  const e = w.enemy
  e.state = 'stalk'
  e.t = 0
  e.cooldown = 1
  w.events.push({ type: 'aggro' })
  emit(w, 16, w.ea.gx, w.ea.gy, 90, STRAW, 'straw', 2, 120, 7, 1.2)
}

const pick = (opts: [EnemyMoveId | null, number][]) => {
  let r = Math.random() * opts.reduce((s, o) => s + o[1], 0)
  for (const [m, wgt] of opts) if ((r -= wgt) <= 0) return m
  return null
}

function choose(d: number): EnemyMoveId | null {
  if (d < 1.8) return pick([['swipes', 45], ['overhead', 35], ['backstep', 20]])
  if (d < 3.2) return pick([['overhead', 40], ['lunge', 40], [null, 20]])
  if (d < 5) return pick([['lunge', 55], ['crows', 25], [null, 20]])
  return pick([['leap', 40], ['crows', 40], [null, 20]])
}

function enterSeg(w: IsoWorld, i: number) {
  const e = w.enemy
  const seg = MOVES[e.move!][i]
  e.seg = i
  e.segT = 0
  e.segDur = Array.isArray(seg.d) ? rand(seg.d[0], seg.d[1]) : seg.d
  e.hitDone = false
  if (seg.kind === 'tele' && i === 0 && e.move !== 'backstep') w.events.push({ type: 'tele', move: e.move! })
  if (seg.kind === 'act' && e.move !== 'crows') w.events.push({ type: e.move === 'leap' ? 'slam' : 'enemyStrike' })
  if (e.move === 'leap' && seg.kind === 'tele') w.landing = { gx: w.pa.gx, gy: w.pa.gy }
  if (seg.kind === 'air') {
    w.leapFrom = { gx: w.ea.gx, gy: w.ea.gy }
    e.segDur = 0.78
  }
  if (e.move === 'crows' && seg.kind === 'act') e.crowsSent = 0
  if (e.move === 'leap' && seg.kind === 'act') {
    w.landing = null
    w.shake = Math.max(w.shake, 14)
    emit(w, 26, w.ea.gx, w.ea.gy, 4, ['#6b5a3e', '#8a7550', '#4a3b2a'], 'dust', 4, 40, 9, 0.6)
    emit(w, 10, w.ea.gx, w.ea.gy, 60, STRAW, 'straw', 3, 200, 8, 1.2)
  }
}

function updateEnemy(w: IsoWorld, dt: number) {
  const e = w.enemy
  const a = w.ea
  const p = w.player
  e.t += dt
  e.flash = Math.max(0, e.flash - dt)
  e.wobble = Math.max(0, e.wobble - dt * 4)
  if ((e.headTwitchT -= dt) <= 0) {
    e.headTwitch = (Math.random() - 0.5) * 22
    e.headTwitchT = 1.5 + Math.random() * 2.5
  }
  if (e.poiseRegen > 0) e.poiseRegen -= dt
  else e.poise = Math.min(e.maxPoise, e.poise + 25 * dt)

  const d = dist(a, w.pa)
  const toP = angTo(a, w.pa)
  let speed = 0
  let moveAng = toP
  a.z = 0

  switch (e.state) {
    case 'dormant':
      if (d < 3.6 && p.state !== 'dead') wake(w)
      break
    case 'stalk': {
      if (p.state === 'dead') break
      a.ang = toP
      e.cooldown -= dt
      if (d > 5.2) speed = 1.7
      else if (d < 2.2) {
        speed = 1.1
        moveAng = toP + Math.PI
      } else {
        // circles you at a distance, changing direction now and then
        if (Math.random() < dt * 0.4) w.strafe = w.strafe === 1 ? -1 : 1
        speed = 0.8
        moveAng = toP + (Math.PI / 2) * w.strafe
      }
      if (d < 1.2 && e.cooldown > 0.35) e.cooldown -= dt * 1.5
      if (e.cooldown <= 0) {
        const m = choose(d)
        if (m) {
          e.move = m
          e.state = 'move'
          enterSeg(w, 0)
        } else e.cooldown = 0.35
      }
      break
    }
    case 'move': {
      const seg = currentSeg(e)!
      e.segT += dt
      if (seg.track) a.ang = toP
      if (seg.kind === 'air') {
        const k = Math.min(1, e.segT / e.segDur)
        const from = w.leapFrom!
        const to = w.landing ?? from
        a.gx = from.gx + (to.gx - from.gx) * k
        a.gy = from.gy + (to.gy - from.gy) * k
        a.z = 4 * 130 * k * (1 - k)
        if (k >= 1) {
          collide(w.map, a)
          enterSeg(w, e.seg + 1)
        }
        break
      }
      const v = (seg.vx ?? 0) * PX
      speed = Math.abs(v)
      moveAng = v >= 0 ? a.ang : a.ang + Math.PI
      if (seg.kind === 'rec') speed *= Math.max(0, 1 - e.segT * 4)
      if (seg.kind === 'act' && !e.hitDone && p.state !== 'dead' && e.move) {
        const reach = ENEMY_REACH[e.move]
        if (reach && d < reach.range + w.pa.r && (reach.cone >= 360 || angDiff(toP, a.ang) < ((reach.cone / 2) * Math.PI) / 180)) {
          if (p.invuln > 0) {
            if (p.state === 'roll') emit(w, 2, w.pa.gx, w.pa.gy, 30, ['#e9dcc0'], 'spark', 1, 40, 2.5, 0.4)
          } else {
            e.hitDone = true
            hurtPlayer(w, seg.dmg ?? 20, a)
          }
        }
      }
      if (e.move === 'crows' && seg.kind === 'act') {
        const times = [0.05, 0.4, 0.75]
        const spread = [0, -0.32, 0.32]
        while (e.crowsSent < times.length && e.segT >= times[e.crowsSent]) {
          const ang = toP + spread[e.crowsSent]
          w.projectiles.push({ kind: 'crow', gx: a.gx + Math.cos(ang) * 0.5, gy: a.gy + Math.sin(ang) * 0.5, vx: Math.cos(ang) * 5.5, vy: Math.sin(ang) * 5.5, age: 0, life: 3, dmg: 13, poise: 0, r: 0.35, hostile: true, hit: false })
          w.events.push({ type: 'crow' })
          e.crowsSent++
        }
      }
      if (e.segT >= e.segDur) {
        if (e.seg + 1 < MOVES[e.move!].length) enterSeg(w, e.seg + 1)
        else {
          const wasBackstep = e.move === 'backstep'
          e.move = null
          e.state = 'stalk'
          e.cooldown = wasBackstep ? 0.4 : (enraged(e) ? 0.7 : 1.0) + Math.random() * (enraged(e) ? 0.6 : 0.9)
        }
      }
      break
    }
    case 'stagger':
      if (e.t > 1.6) {
        e.state = 'stalk'
        e.cooldown = 0.6
      }
      break
    case 'dead':
      break
  }

  if (e.state !== 'move' || currentSeg(e)?.kind !== 'air') {
    const k = currentSeg(e)?.kind === 'act' ? 1 : 1 - Math.exp(-8 * dt)
    a.vx += (Math.cos(moveAng) * speed - a.vx) * k
    a.vy += (Math.sin(moveAng) * speed - a.vy) * k
    move(w.map, a, dt)
  }
  e.facing = screenFacing(a.ang, e.facing)
  const sp = Math.hypot(a.vx, a.vy)
  e.body.vx = sp * 40 * e.facing
  if (sp > 0.1) e.walkPhase += dt * 6 * (Math.cos(Math.atan2(a.vy, a.vx) - a.ang) >= 0 ? 1 : -1)
}

// ------------------------------------------------------------------- rites

function updateMagic(w: IsoWorld, dt: number) {
  const e = w.enemy
  const p = w.player
  for (let i = w.projectiles.length - 1; i >= 0; i--) {
    const q = w.projectiles[i]
    q.age += dt
    if (q.kind === 'wisp' && p.lockOn && e.state !== 'dead') {
      const want = Math.atan2(w.ea.gy - q.gy, w.ea.gx - q.gx)
      const cur = Math.atan2(q.vy, q.vx)
      let dd = want - cur
      while (dd > Math.PI) dd -= Math.PI * 2
      while (dd < -Math.PI) dd += Math.PI * 2
      const turn = Math.max(-2.4 * dt, Math.min(2.4 * dt, dd))
      const sp = Math.hypot(q.vx, q.vy)
      q.vx = Math.cos(cur + turn) * sp
      q.vy = Math.sin(cur + turn) * sp
    }
    q.gx += q.vx * dt
    q.gy += q.vy * dt
    if (q.kind === 'wisp' && Math.random() < dt * 30) w.particles.push({ gx: q.gx, gy: q.gy, z: 45, vx: 0, vy: 0, vz: 10, life: 0.35, max: 0.35, size: 3, color: '#b8f0d8', kind: 'spark' })
    const blocked = solidAt(w.map, Math.floor(q.gx), Math.floor(q.gy)) && q.kind !== 'moon' && w.map.ground[Math.floor(q.gy)]?.[Math.floor(q.gx)] !== 'water'
    if (!q.hostile) {
      if (!q.hit && e.state !== 'dead' && e.state !== 'dormant' && dist(q, w.ea) < q.r + w.ea.r) {
        q.hit = true
        const crit = damageEnemy(w, q.dmg, q.poise)
        w.events.push({ type: 'hit', heavy: q.kind === 'moon', crit })
        w.freeze = q.kind === 'moon' ? 0.08 : 0.035
        w.shake = Math.max(w.shake, q.kind === 'moon' ? 7 : 3)
        splat(w, w.ea.gx, w.ea.gy, q.kind === 'moon')
        if (q.kind === 'wisp') q.life = 0
      }
    } else if (!q.hit && p.state !== 'dead' && dist(q, w.pa) < q.r + w.pa.r && p.invuln <= 0) {
      q.hit = true
      q.life = 0
      hurtPlayer(w, q.dmg, { gx: q.gx - q.vx, gy: q.gy - q.vy })
    }
    if (q.age >= q.life || blocked) w.projectiles.splice(i, 1)
  }

  for (let i = w.hazards.length - 1; i >= 0; i--) {
    const h = w.hazards[i]
    h.t += dt
    if (h.kind === 'flame') {
      h.gx = w.pa.gx
      h.gy = w.pa.gy
    }
    if (h.kind === 'briar' && h.t >= h.delay && h.t - dt < h.delay) {
      w.events.push({ type: 'thorns' })
      w.shake = Math.max(w.shake, 5)
      emit(w, 14, h.gx, h.gy, 2, ['#4a3b2a', '#6b5a3e'], 'dust', 2.5, 40, 8, 0.5)
    }
    const live = h.t >= h.delay && h.t < h.delay + h.dur
    if (live && !h.hit && e.state !== 'dead' && e.state !== 'dormant') {
      const d = dist(h, w.ea)
      const inside = h.kind === 'briar' ? d < 0.95 + w.ea.r : d < 2.2 + w.ea.r && angDiff(angTo(h, w.ea), h.ang) < 0.62
      if (inside) {
        h.hit = true
        const crit = damageEnemy(w, h.dmg, h.poise)
        w.events.push({ type: 'hit', heavy: true, crit })
        w.freeze = 0.07
        w.shake = Math.max(w.shake, 6)
        splat(w, w.ea.gx, w.ea.gy, true)
      }
    }
    if (h.t >= h.delay + h.dur + 0.5) w.hazards.splice(i, 1)
  }
}

// ------------------------------------------------------------------- world

export function nearShrine(w: IsoWorld) {
  const s = w.map.shrine
  return Math.hypot(w.pa.gx - (s.x + 0.5), w.pa.gy - (s.y + 0.5)) < 1.7 && w.player.state === 'move'
}

function resetEnemy(w: IsoWorld) {
  Object.assign(w.enemy, createEnemy())
  Object.assign(w.ea, { gx: w.map.enemySpawn.x, gy: w.map.enemySpawn.y, vx: 0, vy: 0, ang: 0, z: 0 })
  w.landing = null
  w.projectiles = []
  w.hazards = []
}

export function rest(w: IsoWorld) {
  const p = w.player
  p.lockOn = false
  p.hp = p.maxHp
  p.flasks = p.maxFlasks
  p.stamina = p.maxStamina
  p.tallow = p.maxTallow
  p.attack = null
  p.cast = null
  setState(p, 'rest')
  resetEnemy(w)
  w.events.push({ type: 'rest' })
  emit(w, 30, w.map.shrine.x + 0.5, w.map.shrine.y + 0.5, 80, ['#f2c14e', '#ffe08a', '#e8a33a'], 'spark', 1.2, 80, 3, 1.4)
}

export function respawn(w: IsoWorld) {
  Object.assign(w.player, createPlayer())
  Object.assign(w.pa, { gx: w.map.shrine.x + 0.5, gy: w.map.shrine.y + 1.6, vx: 0, vy: 0 })
  setState(w.player, 'rest')
  resetEnemy(w)
  w.particles = []
}

export function toggleLock(w: IsoWorld) {
  const p = w.player
  const e = w.enemy
  if (p.lockOn) p.lockOn = false
  // you can't lock on to a scarecrow that hasn't moved yet: that would give the game away
  else if (e.state !== 'dead' && e.state !== 'dormant' && p.state !== 'dead' && dist(w.pa, w.ea) < 7) p.lockOn = true
  else return
  w.events.push({ type: 'lock', on: p.lockOn })
}

export function stepIso(w: IsoWorld, input: InputState) {
  if (w.freeze > 0) {
    w.freeze -= STEP
    return
  }
  w.time += STEP
  updatePlayer(w, input, STEP)
  updateEnemy(w, STEP)
  updateMagic(w, STEP)
  updateParticles(w, STEP)
  w.shake = Math.max(0, w.shake - STEP * 40)

  // locked on, the camera frames both of you
  const lock = w.player.lockOn
  const s = toScreen(lock ? w.pa.gx + (w.ea.gx - w.pa.gx) * 0.4 : w.pa.gx, lock ? w.pa.gy + (w.ea.gy - w.pa.gy) * 0.4 : w.pa.gy)
  w.cam.x += (s.x - w.cam.x) * (1 - Math.exp(-5 * STEP))
  w.cam.y += (s.y - 40 - w.cam.y) * (1 - Math.exp(-5 * STEP))
}
