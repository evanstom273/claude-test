import { LEVEL } from './level'
import { emit, STRAW } from './particles'
import { moveBody } from './physics'
import type { Enemy, EnemyMoveId, Rect, World } from './types'

export type SegKind = 'tele' | 'act' | 'rec' | 'air'

export interface Seg {
  kind: SegKind
  /** Duration, or [min, max] for a randomised hold. */
  d: number | [number, number]
  /** Forward velocity during the segment (scaled by facing). */
  vx?: number
  /** Turn to face the player during this segment. */
  track?: boolean
  box?: Rect
  dmg?: number
  pose: string
}

/**
 * The Tattered Man's moveset. Every attack has a readable wind-up (tele),
 * a short committed strike (act) and a punishable recovery (rec).
 */
export const MOVES: Record<EnemyMoveId, Seg[]> = {
  lunge: [
    { kind: 'tele', d: 0.62, vx: -50, track: true, pose: 'lungeTele' },
    { kind: 'act', d: 0.22, vx: 900, box: { x: 0, y: -140, w: 130, h: 120 }, dmg: 26, pose: 'lungeAct' },
    { kind: 'rec', d: 0.85, vx: 0, pose: 'lungeRec' },
  ],
  swipes: [
    { kind: 'tele', d: 0.48, vx: 0, track: true, pose: 'swipeTele' },
    { kind: 'act', d: 0.14, vx: 260, box: { x: 0, y: -160, w: 135, h: 140 }, dmg: 18, pose: 'swipe1' },
    { kind: 'tele', d: 0.2, vx: 0, track: true, pose: 'swipeMid' },
    { kind: 'act', d: 0.14, vx: 260, box: { x: 0, y: -160, w: 135, h: 140 }, dmg: 18, pose: 'swipe2' },
    { kind: 'rec', d: 0.75, vx: 0, pose: 'swipeRec' },
  ],
  leap: [
    { kind: 'tele', d: 0.55, vx: 0, track: true, pose: 'leapTele' },
    { kind: 'air', d: 1.6, pose: 'leapAir' },
    { kind: 'act', d: 0.12, vx: 0, box: { x: -120, y: -70, w: 240, h: 70 }, dmg: 28, pose: 'leapLand' },
    { kind: 'rec', d: 1.0, vx: 0, pose: 'leapRec' },
  ],
  overhead: [
    { kind: 'tele', d: 0.45, vx: 0, track: true, pose: 'ohRaise' },
    // the delay: holds at the top for a random beat, punishing panic rolls
    { kind: 'tele', d: [0.3, 0.85], vx: 0, track: false, pose: 'ohHold' },
    { kind: 'act', d: 0.12, vx: 380, box: { x: 10, y: -200, w: 125, h: 200 }, dmg: 32, pose: 'ohStrike' },
    { kind: 'rec', d: 0.9, vx: 0, pose: 'ohRec' },
  ],
  backstep: [{ kind: 'rec', d: 0.42, vx: -380, pose: 'backstep' }],
}

const GRAVITY = 2300

export function createEnemy(): Enemy {
  return {
    body: { x: LEVEL.enemySpawn.x, y: LEVEL.enemySpawn.y, w: 54, h: 168, vx: 0, vy: 0, onGround: true },
    facing: -1,
    state: 'dormant',
    t: 0,
    hp: 340,
    maxHp: 340,
    poise: 70,
    maxPoise: 70,
    poiseRegen: 0,
    move: null,
    seg: 0,
    segT: 0,
    segDur: 0,
    hitDone: false,
    cooldown: 0.6,
    flash: 0,
    wobble: 0,
    headTwitch: 0,
    headTwitchT: 1,
    walkPhase: 0,
    spawnX: LEVEL.enemySpawn.x,
    spawnY: LEVEL.enemySpawn.y,
  }
}

export const currentSeg = (e: Enemy): Seg | null => (e.move ? MOVES[e.move][e.seg] ?? null : null)

function segDuration(s: Seg) {
  return Array.isArray(s.d) ? s.d[0] + Math.random() * (s.d[1] - s.d[0]) : s.d
}

function enterSeg(w: World, e: Enemy, i: number) {
  const seg = MOVES[e.move!][i]
  e.seg = i
  e.segT = 0
  e.segDur = segDuration(seg)
  e.hitDone = false
  if (seg.kind === 'tele' && i === 0) w.events.push({ type: 'tele', move: e.move! })
  if (seg.kind === 'act') w.events.push({ type: e.move === 'leap' ? 'slam' : 'enemyStrike' })
  if (seg.kind === 'air') {
    const p = w.player.body
    const air = (2 * 900) / GRAVITY
    e.body.vy = -900
    e.body.vx = Math.max(-620, Math.min(620, (p.x - e.body.x) / air))
    e.body.onGround = false
  }
  if (e.move === 'leap' && seg.kind === 'act') {
    w.shake = Math.max(w.shake, 14)
    emit(w, 18, e.body.x, e.body.y - 4, { kind: 'dust', colors: ['#6b5a3e', '#8a7550', '#4a3b2a'], speed: 380, spread: 1.0, dir: Math.PI, size: 9, life: 0.6, gravity: -60 })
    emit(w, 18, e.body.x, e.body.y - 4, { kind: 'dust', colors: ['#6b5a3e', '#8a7550', '#4a3b2a'], speed: 380, spread: 1.0, dir: 0, size: 9, life: 0.6, gravity: -60 })
    emit(w, 10, e.body.x, e.body.y - 60, { kind: 'straw', colors: STRAW, speed: 260, size: 8, life: 1.2, gravity: 400 })
  }
}

function startMove(w: World, e: Enemy, m: EnemyMoveId) {
  e.move = m
  e.state = 'move'
  enterSeg(w, e, 0)
}

function choose(dx: number, dy: number): EnemyMoveId | null {
  const d = Math.abs(dx)
  const r = Math.random()
  if (dy < -70 && d < 360) return 'leap'
  if (d < 150) {
    if (r < 0.15) return 'backstep'
    if (r < 0.55) return 'swipes'
    if (r < 0.85) return 'overhead'
    return 'lunge'
  }
  if (d < 360) {
    if (r < 0.55) return 'lunge'
    if (r < 0.7) return 'overhead'
    return null
  }
  if (d < 640 && r < 0.45) return 'leap'
  return null
}

export function damageEnemy(w: World, e: Enemy, dmg: number, poise: number) {
  const crit = e.state === 'stagger'
  e.hp -= crit ? dmg * 1.5 : dmg
  e.flash = 0.1
  e.wobble = 1
  e.poiseRegen = 2
  if (e.state !== 'stagger') {
    e.poise -= poise
    if (e.poise <= 0) {
      e.poise = e.maxPoise
      e.state = 'stagger'
      e.t = 0
      e.move = null
      e.body.vx = -e.facing * 160
      w.events.push({ type: 'stagger' })
    }
  }
  if (e.state === 'dormant') {
    e.state = 'stalk'
    w.events.push({ type: 'aggro' })
  }
  if (e.hp <= 0) {
    e.hp = 0
    e.state = 'dead'
    e.t = 0
    e.move = null
    w.events.push({ type: 'harvested' })
    emit(w, 50, e.body.x, e.body.y - 90, { kind: 'straw', colors: STRAW, speed: 420, size: 9, life: 2, gravity: 500 })
    emit(w, 20, e.body.x, e.body.y - 110, { kind: 'scrap', colors: ['#3b2f3f', '#a68a5b', '#2a2030'], speed: 360, size: 10, life: 2.2, gravity: 400 })
  }
  return crit
}

export function updateEnemy(w: World, e: Enemy, dt: number) {
  const b = e.body
  const p = w.player
  e.t += dt
  e.flash = Math.max(0, e.flash - dt)
  e.wobble = Math.max(0, e.wobble - dt * 4)
  e.headTwitchT -= dt
  if (e.headTwitchT <= 0) {
    e.headTwitch = (Math.random() - 0.5) * 50
    e.headTwitchT = 0.4 + Math.random() * 2.2
  }
  if (e.poiseRegen > 0) e.poiseRegen -= dt
  else e.poise = Math.min(e.maxPoise, e.poise + 25 * dt)

  const dx = p.body.x - b.x
  const dy = p.body.y - b.y
  const playerDead = p.state === 'dead'
  let gravity = GRAVITY

  switch (e.state) {
    case 'dormant': {
      b.vx = 0
      if (Math.abs(dx) < 560 && !playerDead) {
        e.state = 'stalk'
        e.t = 0
        e.cooldown = 0.5
        w.events.push({ type: 'aggro' })
      }
      break
    }
    case 'stalk': {
      if (playerDead) {
        b.vx *= Math.exp(-6 * dt)
        break
      }
      e.facing = dx >= 0 ? 1 : -1
      e.cooldown -= dt
      const d = Math.abs(dx)
      const want = d > 130 ? 95 : d < 80 ? -60 : 0
      b.vx += (e.facing * want - b.vx) * (1 - Math.exp(-6 * dt))
      if (Math.abs(b.vx) > 5) e.walkPhase += dt * 7
      if (e.cooldown <= 0) {
        const m = choose(dx, dy)
        if (m) startMove(w, e, m)
        else e.cooldown = 0.15
      }
      break
    }
    case 'move': {
      const seg = currentSeg(e)!
      e.segT += dt
      if (seg.track) e.facing = dx >= 0 ? 1 : -1
      if (seg.kind === 'air') {
        gravity = GRAVITY
        if (b.onGround && e.segT > 0.1) {
          enterSeg(w, e, e.seg + 1)
          b.vx = 0
          break
        }
      } else {
        const v = (seg.vx ?? 0) * e.facing
        const k = seg.kind === 'act' ? 1 : 1 - Math.exp(-10 * dt)
        b.vx += (v - b.vx) * k
        if (seg.kind === 'rec') b.vx *= Math.exp(-6 * dt)
      }
      if (seg.kind !== 'air' && e.segT >= e.segDur) {
        if (e.seg + 1 < MOVES[e.move!].length) enterSeg(w, e, e.seg + 1)
        else {
          e.move = null
          e.state = 'stalk'
          e.cooldown = 0.25 + Math.random() * 0.7
        }
      }
      break
    }
    case 'stagger': {
      b.vx *= Math.exp(-5 * dt)
      if (e.t > 1.5) {
        e.state = 'stalk'
        e.cooldown = 0.3
      }
      break
    }
    case 'dead': {
      b.vx *= Math.exp(-5 * dt)
      break
    }
  }

  b.vy = Math.min(1200, b.vy + gravity * dt)
  moveBody(b, LEVEL, dt)
}

export function resetEnemy(e: Enemy) {
  Object.assign(e, createEnemy())
}
