import { GROUND_Y, LEVEL } from './level'
import { emit, STRAW } from './particles'
import { moveBody } from './physics'
import { sendCrow } from './rites'
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
 * The Tattered Man's moveset. Every attack has a distinct held wind-up
 * (with its own eye colour and sound), a short committed strike and a
 * generous recovery you can punish.
 */
export const MOVES: Record<EnemyMoveId, Seg[]> = {
  lunge: [
    { kind: 'tele', d: 0.78, vx: 0, track: true, pose: 'lungeTele' },
    { kind: 'act', d: 0.24, vx: 980, box: { x: 0, y: -150, w: 140, h: 130 }, dmg: 26, pose: 'lungeAct' },
    { kind: 'rec', d: 1.05, vx: 0, pose: 'lungeRec' },
  ],
  swipes: [
    { kind: 'tele', d: 0.58, vx: 0, track: true, pose: 'swipeTele' },
    { kind: 'act', d: 0.14, vx: 140, box: { x: 0, y: -160, w: 130, h: 140 }, dmg: 17, pose: 'swipe1' },
    { kind: 'tele', d: 0.3, vx: 0, track: true, pose: 'swipeMid' },
    { kind: 'act', d: 0.14, vx: 140, box: { x: 0, y: -160, w: 130, h: 140 }, dmg: 17, pose: 'swipe2' },
    { kind: 'rec', d: 0.95, vx: 0, pose: 'swipeRec' },
  ],
  leap: [
    { kind: 'tele', d: 0.82, vx: 0, track: true, pose: 'leapTele' },
    { kind: 'air', d: 1.6, pose: 'leapAir' },
    { kind: 'act', d: 0.12, vx: 0, box: { x: -130, y: -70, w: 260, h: 70 }, dmg: 26, pose: 'leapLand' },
    { kind: 'rec', d: 1.2, vx: 0, pose: 'leapRec' },
  ],
  overhead: [
    { kind: 'tele', d: 0.5, vx: 0, track: true, pose: 'ohRaise' },
    // the delay: holds at the top for a random beat, so panic rolls get punished
    { kind: 'tele', d: [0.3, 0.8], vx: 0, track: false, pose: 'ohHold' },
    { kind: 'act', d: 0.12, vx: 320, box: { x: 10, y: -200, w: 125, h: 200 }, dmg: 30, pose: 'ohStrike' },
    { kind: 'rec', d: 1.1, vx: 0, pose: 'ohRec' },
  ],
  crows: [
    { kind: 'tele', d: 0.75, vx: 0, track: true, pose: 'crowTele' },
    { kind: 'act', d: 0.95, vx: 0, track: true, pose: 'crowCall' },
    { kind: 'rec', d: 0.6, vx: 0, pose: 'crowRec' },
  ],
  backstep: [{ kind: 'rec', d: 0.42, vx: -380, pose: 'backstep' }],
}

/** Eye colour for each attack's wind-up, so you can learn them by sight. */
export const MOVE_EYE: Record<EnemyMoveId, string> = {
  lunge: '#ff8a1a',
  swipes: '#ffd23a',
  overhead: '#ff2a2a',
  leap: '#f4f0e6',
  crows: '#b07cff',
  backstep: '#ff8a1a',
}

const GRAVITY = 2300

export function createEnemy(): Enemy {
  return {
    body: { x: LEVEL.enemySpawn.x, y: LEVEL.enemySpawn.y, w: 54, h: 168, vx: 0, vy: 0, onGround: true },
    facing: -1,
    state: 'dormant',
    t: 0,
    hp: 420,
    maxHp: 420,
    poise: 80,
    maxPoise: 80,
    poiseRegen: 0,
    move: null,
    seg: 0,
    segT: 0,
    segDur: 0,
    hitDone: false,
    cooldown: 0.8,
    flash: 0,
    wobble: 0,
    headTwitch: 0,
    headTwitchT: 1,
    walkPhase: 0,
    spawnX: LEVEL.enemySpawn.x,
    spawnY: LEVEL.enemySpawn.y,
    landX: null,
    crowsSent: 0,
  }
}

export const currentSeg = (e: Enemy): Seg | null => (e.move ? MOVES[e.move][e.seg] ?? null : null)

export const enraged = (e: Enemy) => e.hp < e.maxHp * 0.5

function segDuration(s: Seg) {
  return Array.isArray(s.d) ? s.d[0] + Math.random() * (s.d[1] - s.d[0]) : s.d
}

function enterSeg(w: World, e: Enemy, i: number) {
  const seg = MOVES[e.move!][i]
  e.seg = i
  e.segT = 0
  e.segDur = segDuration(seg)
  e.hitDone = false
  if (seg.kind === 'tele' && i === 0 && e.move !== 'backstep') w.events.push({ type: 'tele', move: e.move! })
  if (seg.kind === 'act' && e.move !== 'crows') w.events.push({ type: e.move === 'leap' ? 'slam' : 'enemyStrike' })
  if (e.move === 'leap' && seg.kind === 'tele') {
    e.landX = Math.max(80, Math.min(LEVEL.width - 80, w.player.body.x))
  }
  if (seg.kind === 'air') {
    const air = (2 * 900) / GRAVITY
    // commits to the spot marked during the wind-up
    const tx = e.landX ?? w.player.body.x
    e.body.vy = -900
    e.body.vx = Math.max(-640, Math.min(640, (tx - e.body.x) / air))
    e.body.onGround = false
  }
  if (e.move === 'crows' && seg.kind === 'act') e.crowsSent = 0
  if (e.move === 'leap' && seg.kind === 'act') {
    e.landX = null
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

const pick = (opts: [EnemyMoveId | null, number][]) => {
  let r = Math.random() * opts.reduce((s, o) => s + o[1], 0)
  for (const [m, wgt] of opts) if ((r -= wgt) <= 0) return m
  return null
}

/** Chooses an attack that suits the distance; null means keep pacing. */
function choose(dx: number, dy: number): EnemyMoveId | null {
  const d = Math.abs(dx)
  if (dy < -70 && d < 420) return 'leap'
  if (d < 170) return pick([['swipes', 45], ['overhead', 35], ['backstep', 20]])
  if (d < 300) return pick([['overhead', 40], ['lunge', 40], [null, 20]])
  if (d < 470) return pick([['lunge', 55], ['crows', 25], [null, 20]])
  return pick([['leap', 40], ['crows', 40], [null, 20]])
}

export function damageEnemy(w: World, e: Enemy, dmg: number, poise: number) {
  const crit = e.state === 'stagger'
  const wasAbove = !enraged(e)
  e.hp -= crit ? dmg * 1.5 : dmg
  e.flash = 0.1
  e.wobble = 1
  e.poiseRegen = 2
  if (e.state !== 'stagger' && e.state !== 'dead') {
    e.poise -= poise
    if (e.poise <= 0) {
      e.poise = e.maxPoise
      e.state = 'stagger'
      e.t = 0
      e.move = null
      e.landX = null
      e.body.vx = -e.facing * 160
      w.events.push({ type: 'stagger' })
    }
  }
  if (e.state === 'dormant') {
    e.state = 'stalk'
    e.t = 0
    e.cooldown = 0.9
    w.events.push({ type: 'aggro' })
  }
  if (wasAbove && enraged(e) && e.hp > 0) {
    // half health: straw bursts from his coat and he gets meaner
    emit(w, 30, e.body.x, e.body.y - 100, { kind: 'straw', colors: STRAW, speed: 340, size: 9, life: 1.6, gravity: 400 })
    w.events.push({ type: 'aggro' })
  }
  if (e.hp <= 0) {
    e.hp = 0
    e.state = 'dead'
    e.t = 0
    e.move = null
    e.landX = null
    w.events.push({ type: 'harvested' })
    emit(w, 50, e.body.x, e.body.y - 90, { kind: 'straw', colors: STRAW, speed: 420, size: 9, life: 2, gravity: 500 })
    emit(w, 20, e.body.x, e.body.y - 110, { kind: 'scrap', colors: ['#54405a', '#a68a5b', '#3a2c40'], speed: 360, size: 10, life: 2.2, gravity: 400 })
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
    e.headTwitch = (Math.random() - 0.5) * 22
    e.headTwitchT = 1.5 + Math.random() * 2.5
  }
  if (e.poiseRegen > 0) e.poiseRegen -= dt
  else e.poise = Math.min(e.maxPoise, e.poise + 25 * dt)

  const dx = p.body.x - b.x
  const dy = p.body.y - b.y
  const playerDead = p.state === 'dead'

  switch (e.state) {
    case 'dormant': {
      b.vx = 0
      if (Math.abs(dx) < 700 && !playerDead) {
        e.state = 'stalk'
        e.t = 0
        e.cooldown = 0.9
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
      // he likes to hold you at arm's length and pace, not crowd you
      let want = 0
      if (d > 430) want = 105
      else if (d < 200) want = -70
      else want = Math.sin(e.t * 0.9) * 35
      b.vx += (e.facing * want - b.vx) * (1 - Math.exp(-5 * dt))
      if (Math.abs(b.vx) > 5) e.walkPhase += dt * 6 * (b.vx * e.facing > 0 ? 1 : -1)
      // if you hug him he won't wait long
      if (d < 120 && e.cooldown > 0.35) e.cooldown -= dt * 1.5
      if (e.cooldown <= 0) {
        const m = choose(dx, dy)
        if (m) startMove(w, e, m)
        else e.cooldown = 0.35
      }
      break
    }
    case 'move': {
      const seg = currentSeg(e)!
      e.segT += dt
      if (seg.track) e.facing = dx >= 0 ? 1 : -1
      if (seg.kind === 'air') {
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
      if (e.move === 'crows' && seg.kind === 'act') {
        // three crows, spaced out, mixing heights: jump the low ones, roll the high ones
        const times = [0.05, 0.4, 0.75]
        while (e.crowsSent < times.length && e.segT >= times[e.crowsSent]) {
          const height = e.crowsSent === 1 ? 'low' : Math.random() < 0.5 ? 'high' : 'low'
          sendCrow(w, b.x, b.y, e.facing, height)
          e.crowsSent++
        }
      }
      if (seg.kind !== 'air' && e.segT >= e.segDur) {
        if (e.seg + 1 < MOVES[e.move!].length) enterSeg(w, e, e.seg + 1)
        else {
          const wasBackstep = e.move === 'backstep'
          e.move = null
          e.state = 'stalk'
          // real breathing room between attacks; less once he's hurt
          const base = enraged(e) ? 0.7 : 1.0
          e.cooldown = wasBackstep ? 0.4 : base + Math.random() * (enraged(e) ? 0.6 : 0.9)
        }
      }
      break
    }
    case 'stagger': {
      b.vx *= Math.exp(-5 * dt)
      if (e.t > 1.6) {
        e.state = 'stalk'
        e.cooldown = 0.6
      }
      break
    }
    case 'dead': {
      b.vx *= Math.exp(-5 * dt)
      break
    }
  }

  b.vy = Math.min(1200, b.vy + GRAVITY * dt)
  moveBody(b, LEVEL, dt)
  if (b.y > GROUND_Y) b.y = GROUND_Y
}

export function resetEnemy(e: Enemy) {
  Object.assign(e, createEnemy())
}
