import { damageEnemy } from './enemy'
import { GROUND_Y } from './level'
import { emit, inkSplat } from './particles'
import { bodyRect, overlaps, worldBox } from './physics'
import { hurtPlayer } from './player'
import type { Player, Rect, RiteId, World } from './types'

export interface RiteDef {
  id: RiteId
  name: string
  desc: string
  cost: number
  stam: number
  /** Time into the cast when the rite takes effect. */
  release: number
  total: number
  color: string
}

/** Hedge-witch rites, paid for in candle tallow. */
export const RITES: RiteDef[] = [
  { id: 'wisp', name: "Will-o'-Wisp", desc: 'A pale light that drifts toward your mark.', cost: 9, stam: 6, release: 0.24, total: 0.46, color: '#b8f0d8' },
  { id: 'husk', name: 'Husk Flame', desc: 'Burning corn husks, close and fierce.', cost: 16, stam: 10, release: 0.2, total: 0.6, color: '#ff9a3c' },
  { id: 'briar', name: 'Briar Rite', desc: 'Thorns rise beneath your mark after a breath.', cost: 20, stam: 8, release: 0.34, total: 0.64, color: '#9ccf6a' },
  { id: 'moon', name: 'Harvest Moon', desc: 'The scythe looses a crescent of moonlight.', cost: 28, stam: 14, release: 0.52, total: 0.88, color: '#f1d58a' },
]

export const riteOf = (id: RiteId) => RITES.find((r) => r.id === id)!

export const TALLOW = { regen: 3, perHit: 7 }

const FLAME_BOX: Rect = { x: 8, y: -96, w: 160, h: 86 }

/** Called once when a cast reaches its release point. */
export function releaseRite(w: World, p: Player) {
  const b = p.body
  const f = p.facing
  const e = w.enemy
  const handX = b.x + f * 34
  const handY = b.y - 64
  switch (p.cast) {
    case 'wisp':
      w.projectiles.push({ kind: 'wisp', x: handX, y: handY, vx: f * 560, vy: 0, age: 0, life: 1.6, dmg: 16, poise: 8, rx: 12, ry: 12, hostile: false, hit: false })
      emit(w, 6, handX, handY, { kind: 'spark', colors: ['#b8f0d8', '#e9fff4'], speed: 120, size: 3, life: 0.4, gravity: 0 })
      break
    case 'husk':
      w.hazards.push({ kind: 'flame', x: b.x, y: b.y, dir: f, t: 0, delay: 0, dur: 0.32, dmg: 34, poise: 28, box: FLAME_BOX, hit: false })
      emit(w, 26, handX + f * 30, handY + 10, { kind: 'spark', colors: ['#ffb347', '#ff7a1a', '#ffe08a'], speed: 420, spread: 0.6, dir: f === 1 ? 0 : Math.PI, size: 5, life: 0.45, gravity: -200 })
      emit(w, 10, handX + f * 40, handY + 10, { kind: 'straw', colors: ['#d6b25a', '#8a5a24'], speed: 300, spread: 0.8, dir: f === 1 ? -0.2 : Math.PI + 0.2, size: 8, life: 0.9, gravity: 300 })
      break
    case 'briar': {
      // thorns rise under the locked target, or a fair way ahead
      const tx = p.lockOn && e.state !== 'dead' ? e.body.x : b.x + f * 280
      // thorns always root in the field itself
      w.hazards.push({ kind: 'briar', x: tx, y: GROUND_Y, dir: f, t: 0, delay: 0.45, dur: 0.32, dmg: 38, poise: 45, box: { x: -48, y: -130, w: 96, h: 130 }, hit: false })
      break
    }
    case 'moon':
      w.projectiles.push({ kind: 'moon', x: b.x + f * 50, y: b.y - 58, vx: f * 640, vy: 0, age: 0, life: 1.15, dmg: 52, poise: 34, rx: 26, ry: 52, hostile: false, hit: false })
      w.shake = Math.max(w.shake, 5)
      break
  }
}

function boxOf(px: number, py: number, rx: number, ry: number): Rect {
  return { x: px - rx, y: py - ry, w: rx * 2, h: ry * 2 }
}

export function updateRites(w: World, dt: number) {
  const e = w.enemy
  const p = w.player
  const eRect = bodyRect(e.body)

  for (let i = w.projectiles.length - 1; i >= 0; i--) {
    const q = w.projectiles[i]
    q.age += dt
    if (q.kind === 'wisp' && p.lockOn && e.state !== 'dead') {
      // gentle homing toward the marked target
      const ty = e.body.y - e.body.h * 0.55
      const want = Math.atan2(ty - q.y, e.body.x - q.x)
      const cur = Math.atan2(q.vy, q.vx)
      let d = want - cur
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      const turn = Math.max(-2.2 * dt, Math.min(2.2 * dt, d))
      const sp = Math.hypot(q.vx, q.vy)
      q.vx = Math.cos(cur + turn) * sp
      q.vy = Math.sin(cur + turn) * sp
    }
    if (q.kind === 'crow') q.y += Math.sin(q.age * 14) * 18 * dt
    q.x += q.vx * dt
    q.y += q.vy * dt
    if (q.kind === 'wisp' && Math.random() < dt * 30) w.particles.push({ x: q.x, y: q.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, rot: 0, vr: 0, life: 0.35, max: 0.35, size: 3, color: '#b8f0d8', kind: 'spark', gravity: -30 })
    if (q.kind === 'moon' && Math.random() < dt * 40) w.particles.push({ x: q.x - Math.sign(q.vx) * 10, y: q.y + (Math.random() - 0.5) * 80, vx: -q.vx * 0.1, vy: 0, rot: 0, vr: 0, life: 0.4, max: 0.4, size: 2.5, color: '#f1d58a', kind: 'spark', gravity: 0 })

    const r = boxOf(q.x, q.y, q.rx, q.ry)
    if (!q.hostile) {
      if (!q.hit && e.state !== 'dead' && overlaps(r, eRect)) {
        q.hit = true
        const crit = damageEnemy(w, e, q.dmg, q.poise)
        w.events.push({ type: 'hit', heavy: q.kind === 'moon', crit })
        w.freeze = q.kind === 'moon' ? 0.08 : 0.035
        w.shake = Math.max(w.shake, q.kind === 'moon' ? 7 : 3)
        inkSplat(w, q.x, q.y, q.vx > 0 ? -0.3 : Math.PI + 0.3, q.kind === 'moon')
        if (q.kind === 'wisp') {
          emit(w, 12, q.x, q.y, { kind: 'spark', colors: ['#b8f0d8', '#e9fff4'], speed: 200, size: 3, life: 0.5, gravity: 0 })
          q.life = 0
        }
      }
    } else if (!q.hit && p.state !== 'dead' && overlaps(r, bodyRect(p.body))) {
      if (p.invuln <= 0) {
        q.hit = true
        q.life = 0
        hurtPlayer(w, p, q.dmg, q.x - q.vx)
        w.freeze = 0.1
        w.shake = Math.max(w.shake, 8)
        emit(w, 14, q.x, q.y, { kind: 'scrap', colors: ['#1a0d10', '#2a2030'], speed: 220, size: 6, life: 0.8, gravity: 300 })
        if (p.hp <= 0) w.deaths++
      }
    }
    if (q.age >= q.life || q.x < -100 || q.x > 2800) w.projectiles.splice(i, 1)
  }

  for (let i = w.hazards.length - 1; i >= 0; i--) {
    const h = w.hazards[i]
    h.t += dt
    if (h.kind === 'briar' && h.t >= h.delay && h.t - dt < h.delay) {
      w.events.push({ type: 'thorns' })
      w.shake = Math.max(w.shake, 5)
      emit(w, 14, h.x, h.y - 6, { kind: 'dust', colors: ['#4a3b2a', '#6b5a3e'], speed: 160, spread: 1.6, size: 8, life: 0.5, gravity: -40 })
    }
    const live = h.t >= h.delay && h.t < h.delay + h.dur
    if (live && !h.hit && e.state !== 'dead') {
      const anchor = h.kind === 'flame' ? p.body : { x: h.x, y: h.y, w: 0, h: 0, vx: 0, vy: 0, onGround: true }
      const box = worldBox(anchor, h.dir, h.box)
      if (overlaps(box, eRect)) {
        h.hit = true
        const crit = damageEnemy(w, e, h.dmg, h.poise)
        w.events.push({ type: 'hit', heavy: true, crit })
        w.freeze = 0.07
        w.shake = Math.max(w.shake, 6)
        inkSplat(w, e.body.x, e.body.y - 70, h.kind === 'flame' ? (h.dir === 1 ? -0.3 : Math.PI + 0.3) : -Math.PI / 2, true)
      }
    }
    if (h.t >= h.delay + h.dur + 0.5) w.hazards.splice(i, 1)
  }
}

/** Hostile crows the Tattered Man calls: one at a time, at readable heights. */
export function sendCrow(w: World, x: number, y: number, dir: 1 | -1, height: 'high' | 'low') {
  const cy = height === 'low' ? y - 22 : y - 78
  w.projectiles.push({ kind: 'crow', x: x + dir * 30, y: cy, vx: dir * 430, vy: 0, age: 0, life: 3, dmg: 13, poise: 0, rx: 22, ry: 13, hostile: true, hit: false })
  w.events.push({ type: 'crow' })
}
