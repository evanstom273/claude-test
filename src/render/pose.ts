import { currentSeg, MOVES } from '../game/enemy'
import { attackPhase, P } from '../game/player'
import type { AttackId, Enemy, Player } from '../game/types'

/**
 * Joint angles in degrees. Limbs hang straight down at 0 and positive values
 * swing them forward (toward the facing direction). Knees bend with negative
 * shin values, elbows with positive forearm values. `tool` is relative to the
 * forearm, `lean`/`head` tilt forward when positive.
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
  toolB: number
  crouch: number
  bob: number
  spin: number
}

const KEYS = ['lean', 'head', 'armF', 'foreF', 'armB', 'foreB', 'legF', 'shinF', 'legB', 'shinB', 'tool', 'toolB', 'crouch', 'bob', 'spin'] as const

export const BASE: Pose = { lean: 0, head: 0, armF: 0, foreF: 0, armB: 0, foreB: 0, legF: 0, shinF: 0, legB: 0, shinB: 0, tool: 0, toolB: 0, crouch: 0, bob: 0, spin: 0 }

const mk = (p: Partial<Pose>, base: Pose = BASE): Pose => ({ ...base, ...p })

export function mix(a: Pose, b: Pose, k: number): Pose {
  const o = { ...a }
  for (const key of KEYS) o[key] = a[key] + (b[key] - a[key]) * k
  return o
}

const easeOut = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3)
const easeInOut = (k: number) => {
  k = Math.min(1, Math.max(0, k))
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
}

// ---------------------------------------------------------------- player

const P_IDLE = mk({ lean: 4, head: -3, armF: 28, foreF: 52, armB: -10, foreB: 22, legF: 7, shinF: -5, legB: -7, shinB: -4, tool: 96 })

const P_ATTACK: Record<AttackId, [Pose, Pose, Pose]> = {
  light1: [
    mk({ lean: -4, armF: -35, foreF: 40, tool: 75, armB: -25, foreB: 40, legF: 24, shinF: -12, legB: -22, shinB: -6, crouch: 5 }),
    mk({ lean: 18, armF: 95, foreF: 4, tool: -8, armB: 60, foreB: 20, legF: 36, shinF: -16, legB: -30, shinB: -6, crouch: 9 }),
    mk({ lean: 14, armF: 125, foreF: 18, tool: -40, armB: 72, foreB: 24, legF: 30, shinF: -12, legB: -28, shinB: -6, crouch: 7 }),
  ],
  light2: [
    mk({ lean: 14, armF: 8, foreF: 12, tool: -50, armB: 20, foreB: 30, legF: 30, shinF: -24, legB: -26, shinB: -8, crouch: 11 }),
    mk({ lean: -6, armF: 168, foreF: 8, tool: 4, armB: 120, foreB: 30, legF: 26, shinF: -8, legB: -24, shinB: -4, crouch: 3 }),
    mk({ lean: -8, armF: 186, foreF: 18, tool: 12, armB: 130, foreB: 30, legF: 22, shinF: -8, legB: -22, shinB: -4, crouch: 2 }),
  ],
  light3: [
    mk({ lean: -12, head: -8, armF: 168, foreF: 20, tool: 4, armB: 160, foreB: 30, legF: 22, shinF: -10, legB: -22, shinB: -4, crouch: 3 }),
    mk({ lean: 28, head: 10, armF: 72, foreF: 0, tool: -12, armB: 62, foreB: 8, legF: 46, shinF: -32, legB: -36, shinB: -8, crouch: 17 }),
    mk({ lean: 30, head: 12, armF: 52, foreF: 4, tool: -22, armB: 46, foreB: 10, legF: 44, shinF: -34, legB: -34, shinB: -8, crouch: 19 }),
  ],
  heavy: [
    mk({ lean: -20, head: -12, armF: 176, foreF: 22, tool: 10, armB: 170, foreB: 40, legF: 16, shinF: -6, legB: -26, shinB: -4, crouch: 1 }),
    mk({ lean: 34, head: 14, armF: 74, foreF: -4, tool: -8, armB: 64, foreB: 4, legF: 56, shinF: -52, legB: -42, shinB: -10, crouch: 25 }),
    mk({ lean: 36, head: 16, armF: 66, foreF: -2, tool: -10, armB: 58, foreB: 6, legF: 56, shinF: -54, legB: -42, shinB: -10, crouch: 26 }),
  ],
  air: [
    mk({ lean: -6, armF: 190, foreF: 20, tool: 2, armB: 150, foreB: 30, legF: 44, shinF: -70, legB: -16, shinB: -50 }),
    mk({ lean: 22, armF: 30, foreF: 4, tool: -14, armB: 40, foreB: 20, legF: 50, shinF: -80, legB: -10, shinB: -60 }),
    mk({ lean: 16, armF: 8, foreF: 10, tool: -20, armB: 20, foreB: 30, legF: 40, shinF: -60, legB: -14, shinB: -50 }),
  ],
}

export function playerPose(p: Player, time: number): Pose {
  const b = p.body
  switch (p.state) {
    case 'roll': {
      const k = p.t / P.rollTime
      const tuck = mk({ lean: 60, head: 30, armF: 70, foreF: 90, tool: 100, armB: 50, foreB: 100, legF: 95, shinF: -135, legB: 75, shinB: -125 })
      const blend = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1
      const pose = mix(P_IDLE, tuck, easeOut(blend))
      // rolling backwards while locked on tumbles the other way
      pose.spin = 360 * easeInOut(k) * (p.rollDir === p.facing ? 1 : -1)
      return pose
    }
    case 'attack': {
      const ph = attackPhase(p)
      if (!ph) return P_IDLE
      const [wind, strike, follow] = P_ATTACK[p.attack!]
      if (ph.phase === 'startup') return mix(P_IDLE, wind, easeOut(ph.k * 1.15))
      if (ph.phase === 'active') return mix(wind, strike, easeOut(ph.k * 1.6))
      if (ph.k < 0.45) return mix(strike, follow, easeOut(ph.k / 0.45))
      return mix(follow, P_IDLE, easeInOut((ph.k - 0.45) / 0.55))
    }
    case 'hurt':
      return mk({ lean: -22, head: -26, armF: -20, foreF: 50, tool: 120, armB: -60, foreB: 30, legF: 24, shinF: -24, legB: -12, shinB: -10, crouch: 4 })
    case 'heal': {
      const k = Math.min(1, p.t / 0.3) * Math.min(1, (P.healTime - p.t) / 0.25)
      const drink = mk({ lean: -6, head: -28, armF: 14, foreF: 30, tool: 140, armB: 125, foreB: 105, legF: 6, shinF: -4, legB: -6, shinB: -3 })
      return mix(P_IDLE, drink, easeOut(k))
    }
    case 'rest': {
      const k = Math.min(1, p.t / 0.4) * Math.min(1, (1.6 - p.t) / 0.3)
      const kneel = mk({ lean: 22, head: 34, armF: 40, foreF: 40, tool: 110, armB: 30, foreB: 50, legF: 85, shinF: -150, legB: -10, shinB: -100, crouch: 26 })
      return mix(P_IDLE, kneel, easeOut(k))
    }
    case 'dead': {
      const k = easeOut(p.t / 0.6)
      const fall = mk({ lean: -20, head: -30, armF: -100, foreF: 20, tool: 150, armB: -120, foreB: 10, legF: 20, shinF: -10, legB: 10, shinB: -5, spin: -90 })
      return mix(P_IDLE, fall, k)
    }
  }
  // move
  if (!b.onGround) {
    const rising = b.vy < 0
    const air = mk({ lean: 8, head: -4, armF: 60, foreF: 50, tool: 80, armB: rising ? 60 : -40, foreB: 40, legF: 40, shinF: rising ? -70 : -40, legB: -18, shinB: rising ? -50 : -20 })
    return air
  }
  const speed = Math.abs(b.vx) / P.run
  const breathe = Math.sin(time * 2.2)
  const idle = mk({ ...P_IDLE, lean: P_IDLE.lean + breathe * 1.2, bob: breathe * 0.8 })
  if (speed < 0.08) {
    if (p.landT > 0) return mix(idle, mk({ ...idle, crouch: 10, lean: 14 }), p.landT / 0.12)
    return idle
  }
  const f = p.runPhase
  const swing = (o: number) => Math.sin(f + o)
  const knee = (o: number) => -14 - 48 * Math.max(0, Math.sin(f + o + 2.0))
  const run = mk({
    lean: 15,
    head: -6,
    armF: 34 + 8 * swing(Math.PI),
    foreF: 52,
    tool: 104,
    armB: 34 * swing(0),
    foreB: 46,
    legF: 40 * swing(0),
    shinF: knee(0),
    legB: 40 * swing(Math.PI),
    shinB: knee(Math.PI),
    bob: -Math.abs(Math.cos(f)) * 4,
  })
  return mix(idle, run, Math.min(1, speed * 1.5))
}

// ---------------------------------------------------------------- scarecrow

const E_POSES: Record<string, Pose> = {
  idle: mk({ lean: 10, head: 26, armF: 8, foreF: 6, armB: -6, foreB: 4, legF: 4, shinF: -2, legB: -4, shinB: -2 }),
  lungeTele: mk({ lean: -18, head: 6, armF: -75, foreF: 30, armB: -62, foreB: 34, legF: 30, shinF: -40, legB: -30, shinB: -28, crouch: 22 }),
  lungeAct: mk({ lean: 42, head: 18, armF: 102, foreF: -8, armB: 84, foreB: 2, legF: 52, shinF: -20, legB: -46, shinB: -10, crouch: 14 }),
  lungeRec: mk({ lean: 46, head: 44, armF: 36, foreF: 10, armB: 28, foreB: 10, legF: 40, shinF: -42, legB: -36, shinB: -12, crouch: 22 }),
  swipeTele: mk({ lean: -8, head: 0, armF: 165, foreF: 40, armB: 142, foreB: 50, legF: 16, shinF: -10, legB: -16, shinB: -6, crouch: 8 }),
  swipe1: mk({ lean: 26, head: 14, armF: 28, foreF: 8, armB: 152, foreB: 40, legF: 32, shinF: -18, legB: -26, shinB: -8, crouch: 12 }),
  swipeMid: mk({ lean: 18, head: 10, armF: 40, foreF: 10, armB: 172, foreB: 40, legF: 28, shinF: -16, legB: -24, shinB: -8, crouch: 10 }),
  swipe2: mk({ lean: 34, head: 18, armF: 62, foreF: 10, armB: 18, foreB: 2, legF: 36, shinF: -20, legB: -30, shinB: -8, crouch: 14 }),
  swipeRec: mk({ lean: 30, head: 38, armF: 18, foreF: 8, armB: 8, foreB: 6, legF: 30, shinF: -18, legB: -26, shinB: -8, crouch: 12 }),
  leapTele: mk({ lean: 36, head: -12, armF: -84, foreF: 18, armB: -72, foreB: 22, legF: 72, shinF: -112, legB: 40, shinB: -100, crouch: 46 }),
  leapAir: mk({ lean: 8, head: -6, armF: 172, foreF: 18, armB: 160, foreB: 22, legF: 48, shinF: -72, legB: -22, shinB: -58 }),
  leapLand: mk({ lean: 42, head: 24, armF: 62, foreF: 6, armB: 52, foreB: 8, legF: 72, shinF: -104, legB: -30, shinB: -62, crouch: 42 }),
  leapRec: mk({ lean: 46, head: 48, armF: 28, foreF: 6, armB: 22, foreB: 8, legF: 62, shinF: -90, legB: -28, shinB: -56, crouch: 32 }),
  ohRaise: mk({ lean: -14, head: -12, armF: 192, foreF: 18, armB: 182, foreB: 20, legF: 12, shinF: -6, legB: -14, shinB: -4, crouch: 4 }),
  ohHold: mk({ lean: -18, head: -18, armF: 200, foreF: 24, armB: 190, foreB: 26, legF: 14, shinF: -6, legB: -16, shinB: -4, crouch: 6 }),
  ohStrike: mk({ lean: 40, head: 16, armF: 70, foreF: 0, armB: 60, foreB: 2, legF: 46, shinF: -32, legB: -40, shinB: -10, crouch: 22 }),
  ohRec: mk({ lean: 44, head: 42, armF: 30, foreF: 4, armB: 24, foreB: 6, legF: 44, shinF: -32, legB: -38, shinB: -10, crouch: 22 }),
  backstep: mk({ lean: -12, head: 30, armF: -22, foreF: 20, armB: -30, foreB: 20, legF: 30, shinF: -20, legB: -40, shinB: -10, crouch: 6 }),
}

export function enemyPose(e: Enemy, time: number): Pose {
  const sway = Math.sin(time * 1.3 + 1) * 4
  const idle = mk({ ...E_POSES.idle, lean: E_POSES.idle.lean + sway, head: E_POSES.idle.head + e.headTwitch })
  switch (e.state) {
    case 'dormant':
      return mk({ ...idle, lean: 2 + sway * 0.5, head: 40, armF: 2, armB: -2 })
    case 'stalk': {
      const f = e.walkPhase
      const moving = Math.min(1, Math.abs(e.body.vx) / 60)
      const walk = mk({
        ...idle,
        lean: 20 + sway,
        legF: 24 * Math.sin(f),
        shinF: -6 - 26 * Math.max(0, Math.sin(f + 2)),
        legB: 24 * Math.sin(f + Math.PI),
        shinB: -6 - 26 * Math.max(0, Math.sin(f + Math.PI + 2)),
        armF: 10 - 14 * Math.sin(f - 0.6),
        armB: -4 + 14 * Math.sin(f - 0.6),
        foreF: 10,
        foreB: 8,
        bob: -Math.abs(Math.sin(f)) * 6,
      })
      return mix(idle, walk, moving)
    }
    case 'move': {
      const seg = currentSeg(e)
      if (!seg) return idle
      const prevName = e.seg > 0 ? MOVES[e.move!][e.seg - 1].pose : null
      const from = prevName ? E_POSES[prevName] : idle
      let to = E_POSES[seg.pose] ?? idle
      if (seg.pose === 'ohHold') {
        const tr = Math.sin(time * 70) * 2.5
        to = mk({ ...to, armF: to.armF + tr, armB: to.armB - tr, head: to.head + e.headTwitch * 0.6 })
      }
      const k = e.segT / Math.max(0.001, e.segDur)
      if (seg.kind === 'tele') return mix(from, to, easeOut(k * 1.1))
      if (seg.kind === 'act') return mix(from, to, easeOut(k * 2.2))
      if (seg.kind === 'air') return mix(from, to, easeOut(e.segT / 0.25))
      // recovery eases back toward idle at the end
      const rec = mix(from, to, easeOut(k * 3))
      return k > 0.7 ? mix(rec, idle, easeInOut((k - 0.7) / 0.3)) : rec
    }
    case 'stagger': {
      const w = Math.sin(e.t * 9)
      return mk({ lean: -28 + w * 6, head: -40 + w * 10, armF: -40 + w * 30, foreF: 30, armB: 120 - w * 30, foreB: 40, legF: 26, shinF: -24, legB: -20, shinB: -10, crouch: 8 })
    }
    case 'dead': {
      const k = easeOut(e.t / 1.2)
      return mix(idle, mk({ lean: 84, head: 80, armF: 10, foreF: 0, armB: 0, legF: 80, shinF: -150, legB: 60, shinB: -140, crouch: 70 }), k)
    }
  }
}
