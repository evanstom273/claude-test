import { currentSeg, MOVES } from '../game/enemy'
import { attackPhase, P } from '../game/player'
import { RITES } from '../game/rites'
import type { AttackId, Enemy, Player, RiteId } from '../game/types'

/**
 * Joint angles in degrees. Limbs hang straight down at 0 and positive values
 * swing them forward (toward the facing direction). Knees bend with negative
 * shin values, elbows with positive forearm values. `tool` is relative to the
 * forearm, `lean`/`head` tilt forward when positive.
 *
 * Animation style is cut-out stop-motion: snap quickly into a clear key pose,
 * hold it, snap to the next. Nothing drifts or flops between poses.
 */
export interface Pose {
  lean: number
  head: number
  armF: number
  foreF: number
  armB: number
  foreB: number
  legF: number
  shinF: number
  legB: number
  shinB: number
  tool: number
  crouch: number
  bob: number
  spin: number
}

const KEYS = ['lean', 'head', 'armF', 'foreF', 'armB', 'foreB', 'legF', 'shinF', 'legB', 'shinB', 'tool', 'crouch', 'bob', 'spin'] as const

export const BASE: Pose = { lean: 0, head: 0, armF: 0, foreF: 0, armB: 0, foreB: 0, legF: 0, shinF: 0, legB: 0, shinB: 0, tool: 0, crouch: 0, bob: 0, spin: 0 }

const mk = (p: Partial<Pose>, base: Pose = BASE): Pose => ({ ...base, ...p })

export function mix(a: Pose, b: Pose, k: number): Pose {
  const o = { ...a }
  for (const key of KEYS) o[key] = a[key] + (b[key] - a[key]) * k
  return o
}

const clamp01 = (k: number) => Math.min(1, Math.max(0, k))
const easeOut = (k: number) => 1 - Math.pow(1 - clamp01(k), 3)
const easeInOut = (k: number) => {
  k = clamp01(k)
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
}

/** Snap from one key pose into another over `dur` seconds, then hold. */
const snap = (from: Pose, to: Pose, t: number, dur: number) => mix(from, to, easeOut(t / dur))

/** Hold `pose` for most of a recovery, then settle back to `rest`. */
const holdThenReturn = (pose: Pose, rest: Pose, k: number, holdFrac = 0.55) => (k < holdFrac ? pose : mix(pose, rest, easeInOut((k - holdFrac) / (1 - holdFrac))))

// ---------------------------------------------------------------- player

const P_IDLE = mk({ lean: 4, head: -3, armF: 28, foreF: 52, armB: 8, foreB: 30, legF: 7, shinF: -5, legB: -7, shinB: -4, tool: 96 })

const P_ATTACK: Record<AttackId, [Pose, Pose, Pose]> = {
  light1: [
    mk({ lean: -4, armF: -35, foreF: 40, tool: 75, armB: -20, foreB: 40, legF: 24, shinF: -12, legB: -22, shinB: -6, crouch: 5 }),
    mk({ lean: 18, armF: 95, foreF: 4, tool: -8, armB: 60, foreB: 20, legF: 34, shinF: -16, legB: -30, shinB: -6, crouch: 9 }),
    mk({ lean: 16, armF: 112, foreF: 12, tool: -28, armB: 66, foreB: 22, legF: 32, shinF: -14, legB: -28, shinB: -6, crouch: 8 }),
  ],
  light2: [
    mk({ lean: 14, armF: 8, foreF: 12, tool: -50, armB: 20, foreB: 30, legF: 30, shinF: -24, legB: -26, shinB: -8, crouch: 11 }),
    mk({ lean: -6, armF: 160, foreF: 8, tool: 4, armB: 110, foreB: 30, legF: 26, shinF: -8, legB: -24, shinB: -4, crouch: 3 }),
    mk({ lean: -6, armF: 170, foreF: 12, tool: 8, armB: 118, foreB: 30, legF: 24, shinF: -8, legB: -22, shinB: -4, crouch: 3 }),
  ],
  light3: [
    mk({ lean: -12, head: -8, armF: 168, foreF: 20, tool: 4, armB: 160, foreB: 30, legF: 22, shinF: -10, legB: -22, shinB: -4, crouch: 3 }),
    mk({ lean: 28, head: 10, armF: 72, foreF: 0, tool: -12, armB: 62, foreB: 8, legF: 46, shinF: -32, legB: -36, shinB: -8, crouch: 17 }),
    mk({ lean: 29, head: 12, armF: 64, foreF: 2, tool: -16, armB: 54, foreB: 10, legF: 45, shinF: -33, legB: -35, shinB: -8, crouch: 18 }),
  ],
  heavy: [
    mk({ lean: -20, head: -12, armF: 176, foreF: 22, tool: 10, armB: 170, foreB: 40, legF: 16, shinF: -6, legB: -26, shinB: -4, crouch: 1 }),
    mk({ lean: 34, head: 14, armF: 74, foreF: -4, tool: -8, armB: 64, foreB: 4, legF: 56, shinF: -52, legB: -42, shinB: -10, crouch: 25 }),
    mk({ lean: 35, head: 15, armF: 70, foreF: -2, tool: -10, armB: 60, foreB: 6, legF: 56, shinF: -53, legB: -42, shinB: -10, crouch: 26 }),
  ],
  air: [
    mk({ lean: -6, armF: 170, foreF: 20, tool: 2, armB: 140, foreB: 30, legF: 44, shinF: -70, legB: -16, shinB: -50 }),
    mk({ lean: 22, armF: 30, foreF: 4, tool: -14, armB: 40, foreB: 20, legF: 50, shinF: -80, legB: -10, shinB: -60 }),
    mk({ lean: 18, armF: 20, foreF: 8, tool: -18, armB: 30, foreB: 26, legF: 44, shinF: -70, legB: -12, shinB: -56 }),
  ],
}

// casting: the back hand does the work; Harvest Moon is loosed with the scythe
const P_CAST: Record<RiteId, [Pose, Pose]> = {
  wisp: [
    mk({ ...P_IDLE, lean: -2, armB: 70, foreB: 110, crouch: 3 }),
    mk({ ...P_IDLE, lean: 10, armB: 92, foreB: -4, legF: 20, shinF: -8, legB: -16, crouch: 5 }),
  ],
  husk: [
    mk({ ...P_IDLE, lean: -8, armB: -30, foreB: 80, legF: 20, legB: -20, crouch: 6 }),
    mk({ ...P_IDLE, lean: 16, armB: 84, foreB: -6, legF: 30, shinF: -14, legB: -28, crouch: 10 }),
  ],
  briar: [
    mk({ ...P_IDLE, lean: -10, head: -10, armB: 165, foreB: 10, crouch: 2 }),
    mk({ ...P_IDLE, lean: 24, head: 12, armB: 40, foreB: -4, legF: 34, shinF: -40, legB: -26, shinB: -10, crouch: 18 }),
  ],
  moon: [P_ATTACK.light3[0], P_ATTACK.light1[1]],
}

export function playerPose(p: Player, time: number): Pose {
  const b = p.body
  switch (p.state) {
    case 'roll': {
      const k = p.t / P.rollTime
      const tuck = mk({ lean: 60, head: 30, armF: 70, foreF: 90, tool: 100, armB: 50, foreB: 100, legF: 95, shinF: -135, legB: 75, shinB: -125 })
      const pose = k < 0.85 ? snap(P_IDLE, tuck, p.t, 0.06) : mix(tuck, P_IDLE, easeOut((k - 0.85) / 0.15))
      // rolling backwards while locked on tumbles the other way
      pose.spin = 360 * easeInOut(k) * (p.rollDir === p.facing ? 1 : -1)
      return pose
    }
    case 'attack': {
      const ph = attackPhase(p)
      if (!ph) return P_IDLE
      const [wind, strike, follow] = P_ATTACK[p.attack!]
      const a = ph.a
      if (ph.phase === 'startup') return snap(P_IDLE, wind, p.t, Math.min(0.09, a.startup * 0.6))
      if (ph.phase === 'active') return snap(wind, strike, p.t - a.startup, 0.045)
      return holdThenReturn(mix(strike, follow, easeOut(ph.k / 0.3)), P_IDLE, ph.k)
    }
    case 'cast': {
      const r = RITES.find((x) => x.id === p.cast)
      if (!r) return P_IDLE
      const [wind, release] = P_CAST[r.id]
      if (p.t < r.release) return snap(P_IDLE, wind, p.t, 0.08)
      const k = (p.t - r.release) / (r.total - r.release)
      return holdThenReturn(snap(wind, release, p.t - r.release, 0.05), P_IDLE, k, 0.6)
    }
    case 'hurt':
      return snap(P_IDLE, mk({ lean: -22, head: -26, armF: -20, foreF: 50, tool: 120, armB: -50, foreB: 30, legF: 24, shinF: -24, legB: -12, shinB: -10, crouch: 4 }), p.t, 0.05)
    case 'heal': {
      const drink = mk({ lean: -6, head: -28, armF: 14, foreF: 30, tool: 140, armB: 125, foreB: 105, legF: 6, shinF: -4, legB: -6, shinB: -3 })
      return p.t < P.healTime - 0.15 ? snap(P_IDLE, drink, p.t, 0.12) : mix(drink, P_IDLE, easeOut((p.t - (P.healTime - 0.15)) / 0.15))
    }
    case 'rest': {
      const kneel = mk({ lean: 22, head: 34, armF: 40, foreF: 40, tool: 110, armB: 30, foreB: 50, legF: 85, shinF: -150, legB: -10, shinB: -100, crouch: 26 })
      return p.t < 1.3 ? snap(P_IDLE, kneel, p.t, 0.25) : mix(kneel, P_IDLE, easeInOut((p.t - 1.3) / 0.3))
    }
    case 'dead': {
      const buckle = mk({ lean: 30, head: 30, armF: 10, foreF: 20, tool: 120, armB: 0, foreB: 10, legF: 70, shinF: -120, legB: 10, shinB: -90, crouch: 30 })
      const fall = mk({ lean: -20, head: -30, armF: -100, foreF: 20, tool: 150, armB: -120, foreB: 10, legF: 20, shinF: -10, legB: 10, shinB: -5, spin: -90 })
      return p.t < 0.35 ? snap(P_IDLE, buckle, p.t, 0.12) : snap(buckle, fall, p.t - 0.35, 0.3)
    }
  }
  // move
  if (!b.onGround) {
    const rise = mk({ lean: 8, head: -4, armF: 60, foreF: 50, tool: 80, armB: 60, foreB: 40, legF: 40, shinF: -70, legB: -18, shinB: -50 })
    const fall = mk({ lean: 6, head: -2, armF: 50, foreF: 50, tool: 86, armB: -30, foreB: 40, legF: 30, shinF: -30, legB: -14, shinB: -16 })
    return mix(rise, fall, clamp01((b.vy + 150) / 300))
  }
  const speed = Math.abs(b.vx) / P.run
  const idle = mk({ ...P_IDLE, bob: Math.sin(time * 2.2) * 0.8 })
  if (speed < 0.08) {
    if (p.landT > 0) return mix(idle, mk({ ...idle, crouch: 10, lean: 14 }), p.landT / 0.12)
    return idle
  }
  // a planted, steady run: legs work, arms and scythe stay put
  const f = p.runPhase
  const run = mk({
    ...P_IDLE,
    lean: 12,
    head: -4,
    armF: 32,
    foreF: 52,
    tool: 100,
    armB: 12 + 10 * Math.sin(f),
    foreB: 40,
    legF: 30 * Math.sin(f),
    shinF: -12 - 34 * Math.max(0, Math.sin(f + 2)),
    legB: 30 * Math.sin(f + Math.PI),
    shinB: -12 - 34 * Math.max(0, Math.sin(f + Math.PI + 2)),
    bob: -Math.abs(Math.cos(f)) * 3,
  })
  return mix(idle, run, Math.min(1, speed * 1.5))
}

// ---------------------------------------------------------------- scarecrow

/** His resting stance: sickles up and forward, ready, not dangling. */
const E_GUARD = mk({ lean: 14, head: 18, armF: 48, foreF: 42, armB: 26, foreB: 52, legF: 8, shinF: -6, legB: -8, shinB: -4 })
/** Dormant: strung up on his stake like any other scarecrow. */
const E_DORMANT = mk({ lean: 0, head: 42, armF: 88, foreF: 4, armB: -88, foreB: -4, legF: 2, shinF: 0, legB: -2, shinB: 0 })

const E_POSES: Record<string, Pose> = {
  lungeTele: mk({ lean: -10, head: 6, armF: -70, foreF: 20, armB: -60, foreB: 20, legF: 34, shinF: -50, legB: -34, shinB: -20, crouch: 26 }),
  lungeAct: mk({ lean: 38, head: 18, armF: 92, foreF: 0, armB: 84, foreB: 0, legF: 50, shinF: -20, legB: -50, shinB: -10, crouch: 12 }),
  lungeRec: mk({ lean: 42, head: 30, armF: 80, foreF: 6, armB: 70, foreB: 6, legF: 46, shinF: -30, legB: -46, shinB: -10, crouch: 18 }),
  swipeTele: mk({ lean: -6, head: 4, armF: 150, foreF: 30, armB: 40, foreB: 60, legF: 18, shinF: -10, legB: -18, shinB: -6, crouch: 6 }),
  swipe1: mk({ lean: 24, head: 14, armF: 20, foreF: 10, armB: 150, foreB: 30, legF: 30, shinF: -16, legB: -26, shinB: -8, crouch: 10 }),
  swipeMid: mk({ lean: 20, head: 12, armF: 24, foreF: 10, armB: 156, foreB: 30, legF: 28, shinF: -16, legB: -24, shinB: -8, crouch: 10 }),
  swipe2: mk({ lean: 30, head: 16, armF: 30, foreF: 20, armB: 20, foreB: 10, legF: 34, shinF: -18, legB: -30, shinB: -8, crouch: 12 }),
  swipeRec: mk({ lean: 30, head: 26, armF: 30, foreF: 20, armB: 24, foreB: 12, legF: 32, shinF: -18, legB: -28, shinB: -8, crouch: 12 }),
  leapTele: mk({ lean: 30, head: -10, armF: -40, foreF: 10, armB: -30, foreB: 10, legF: 72, shinF: -112, legB: 40, shinB: -100, crouch: 46 }),
  leapAir: mk({ lean: 8, head: -6, armF: 160, foreF: 18, armB: 150, foreB: 22, legF: 60, shinF: -90, legB: 20, shinB: -80 }),
  leapLand: mk({ lean: 40, head: 20, armF: 52, foreF: 6, armB: 46, foreB: 8, legF: 72, shinF: -104, legB: -30, shinB: -62, crouch: 40 }),
  leapRec: mk({ lean: 42, head: 34, armF: 46, foreF: 6, armB: 40, foreB: 8, legF: 66, shinF: -96, legB: -28, shinB: -58, crouch: 36 }),
  ohRaise: mk({ lean: -14, head: -10, armF: 175, foreF: 5, armB: 170, foreB: 5, legF: 12, shinF: -6, legB: -14, shinB: -4, crouch: 4 }),
  ohHold: mk({ lean: -18, head: -14, armF: 178, foreF: 6, armB: 172, foreB: 6, legF: 14, shinF: -6, legB: -16, shinB: -4, crouch: 6 }),
  ohStrike: mk({ lean: 40, head: 16, armF: 60, foreF: 0, armB: 55, foreB: 0, legF: 46, shinF: -32, legB: -40, shinB: -10, crouch: 22 }),
  ohRec: mk({ lean: 42, head: 30, armF: 56, foreF: 2, armB: 50, foreB: 2, legF: 46, shinF: -32, legB: -40, shinB: -10, crouch: 22 }),
  // the crow call: arms flung wide on the cross, head thrown back
  crowTele: mk({ lean: -4, head: -26, armF: 92, foreF: 0, armB: -92, foreB: 0, legF: 10, shinF: -4, legB: -10, shinB: -4, crouch: 4 }),
  crowCall: mk({ lean: 2, head: -34, armF: 100, foreF: -6, armB: -100, foreB: 6, legF: 10, shinF: -4, legB: -10, shinB: -4, crouch: 2 }),
  crowRec: mk({ lean: 6, head: -10, armF: 92, foreF: 0, armB: -92, foreB: 0, legF: 10, shinF: -4, legB: -10, shinB: -4, crouch: 2 }),
  backstep: mk({ lean: -10, head: 20, armF: 40, foreF: 40, armB: 20, foreB: 50, legF: 30, shinF: -20, legB: -40, shinB: -10, crouch: 8 }),
}

export function enemyPose(e: Enemy, time: number): Pose {
  const guard = mk({ ...E_GUARD, head: E_GUARD.head + e.headTwitch, bob: Math.sin(time * 1.6) * 1.2 })
  switch (e.state) {
    case 'dormant':
      return E_DORMANT
    case 'stalk': {
      // waking: he climbs down off the cross
      const base = e.t < 0.7 ? mix(E_DORMANT, guard, easeInOut(e.t / 0.7)) : guard
      const moving = Math.min(1, Math.abs(e.body.vx) / 50)
      if (moving < 0.05) return base
      const f = e.walkPhase
      const walk = mk({
        ...base,
        legF: 16 * Math.sin(f),
        shinF: -6 - 16 * Math.max(0, Math.sin(f + 2)),
        legB: 16 * Math.sin(f + Math.PI),
        shinB: -6 - 16 * Math.max(0, Math.sin(f + Math.PI + 2)),
        bob: -Math.abs(Math.sin(f)) * 3,
      })
      return mix(base, walk, moving)
    }
    case 'move': {
      const seg = currentSeg(e)
      if (!seg) return guard
      const prevName = e.seg > 0 ? MOVES[e.move!][e.seg - 1].pose : null
      const from = prevName ? E_POSES[prevName] : guard
      const to = E_POSES[seg.pose] ?? guard
      const k = e.segT / Math.max(0.001, e.segDur)
      if (seg.kind === 'tele') return snap(from, to, e.segT, 0.14)
      if (seg.kind === 'act') return snap(from, to, e.segT, 0.05)
      if (seg.kind === 'air') return snap(from, to, e.segT, 0.12)
      return holdThenReturn(snap(from, to, e.segT, 0.1), guard, k)
    }
    case 'stagger': {
      const reel = mk({ lean: -26, head: -30, armF: 10, foreF: 30, armB: -20, foreB: 20, legF: 26, shinF: -24, legB: -20, shinB: -10, crouch: 10 })
      return e.t < 1.3 ? snap(guard, reel, e.t, 0.06) : mix(reel, guard, easeInOut((e.t - 1.3) / 0.3))
    }
    case 'dead': {
      const buckle = mk({ lean: 20, head: 50, armF: 10, foreF: 0, armB: -10, foreB: 0, legF: 70, shinF: -120, legB: 50, shinB: -110, crouch: 40 })
      const collapse = mk({ lean: 84, head: 80, armF: 10, foreF: 0, armB: 0, legF: 80, shinF: -150, legB: 60, shinB: -140, crouch: 70 })
      return e.t < 0.5 ? snap(guard, buckle, e.t, 0.15) : snap(buckle, collapse, e.t - 0.5, 0.35)
    }
  }
}
