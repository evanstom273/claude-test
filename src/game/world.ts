import { createEnemy, currentSeg, damageEnemy, resetEnemy, updateEnemy } from './enemy'
import type { InputState } from './input'
import { GROUND_Y, LEVEL } from './level'
import { emit, inkSplat, updateParticles } from './particles'
import { bodyRect, overlaps, worldBox } from './physics'
import { attackPhase, createPlayer, hurtPlayer, respawnPlayer, restPlayer, updatePlayer } from './player'
import type { World } from './types'

export const STEP = 1 / 120
export const VIEW_H = 640

export function createWorld(): World {
  return {
    time: 0,
    freeze: 0,
    shake: 0,
    player: createPlayer(),
    enemy: createEnemy(),
    particles: [],
    splats: [],
    cam: { x: LEVEL.playerSpawn.x, y: GROUND_Y - VIEW_H * 0.7 },
    view: { w: 1100, h: VIEW_H },
    events: [],
    debug: false,
    deaths: 0,
    kills: 0,
  }
}

export function nearShrine(w: World) {
  return Math.abs(w.player.body.x - LEVEL.shrine.x) < 90 && w.player.body.onGround && w.player.state === 'move'
}

export function rest(w: World) {
  restPlayer(w.player)
  resetEnemy(w.enemy)
  w.events.push({ type: 'rest' })
  emit(w, 30, LEVEL.shrine.x, LEVEL.shrine.y - 80, { kind: 'spark', colors: ['#f2c14e', '#ffe08a', '#e8a33a'], speed: 140, size: 3, life: 1.4, gravity: -120 })
}

export function toggleLock(w: World) {
  const p = w.player
  const e = w.enemy
  if (p.lockOn) p.lockOn = false
  else if (e.state !== 'dead' && p.state !== 'dead' && Math.abs(e.body.x - p.body.x) < 760) p.lockOn = true
  else return
  w.events.push({ type: 'lock', on: p.lockOn })
}

export function respawn(w: World) {
  respawnPlayer(w.player)
  resetEnemy(w.enemy)
  w.particles = []
  w.cam.x = w.player.body.x
}

function combat(w: World) {
  const p = w.player
  const e = w.enemy

  // player → enemy
  const ph = attackPhase(p)
  if (p.state === 'attack' && ph?.phase === 'active' && !p.hitDone && e.state !== 'dead') {
    const box = worldBox(p.body, p.facing, ph.a.box)
    if (overlaps(box, bodyRect(e.body))) {
      p.hitDone = true
      const heavy = p.attack === 'heavy' || p.attack === 'light3'
      const crit = damageEnemy(w, e, ph.a.dmg, ph.a.poise)
      w.freeze = ph.a.hitstop * (crit ? 1.6 : 1)
      w.shake = Math.max(w.shake, ph.a.shake * (crit ? 1.5 : 1))
      w.events.push({ type: 'hit', heavy, crit })
      const hx = (Math.max(box.x, e.body.x - e.body.w / 2) + Math.min(box.x + box.w, e.body.x + e.body.w / 2)) / 2
      const hy = Math.max(box.y, e.body.y - e.body.h) + 40
      inkSplat(w, hx, hy, p.facing === 1 ? -0.3 : Math.PI + 0.3, heavy || crit)
    }
  }

  // enemy → player
  const seg = currentSeg(e)
  if (e.state === 'move' && seg?.kind === 'act' && seg.box && !e.hitDone && p.state !== 'dead') {
    const box = worldBox(e.body, e.facing, seg.box)
    if (overlaps(box, bodyRect(p.body))) {
      if (p.invuln > 0) {
        // a dodge through an attack: a little flourish so it feels earned
        if (p.state === 'roll' && !e.hitDone) emit(w, 4, p.body.x, p.body.y - 30, { kind: 'spark', colors: ['#e9dcc0'], speed: 80, size: 2.5, life: 0.4, gravity: -50 })
      } else {
        e.hitDone = true
        hurtPlayer(w, p, seg.dmg ?? 20, e.body.x)
        w.freeze = 0.14
        w.shake = Math.max(w.shake, 12)
        inkSplat(w, p.body.x, p.body.y - 50, e.facing === 1 ? -0.4 : Math.PI + 0.4, true)
        if (p.hp <= 0) w.deaths++
      }
    }
  }
}

/** One fixed simulation step. Returns false while frozen by hit-stop. */
export function step(w: World, input: InputState) {
  if (w.freeze > 0) {
    w.freeze -= STEP
    return false
  }
  w.time += STEP
  updatePlayer(w, w.player, input, STEP)
  updateEnemy(w, w.enemy, STEP)
  combat(w)
  updateParticles(w, STEP, GROUND_Y)
  w.shake = Math.max(0, w.shake - STEP * 40)
  if (w.enemy.state === 'dead' && w.enemy.t === STEP) w.kills++

  // camera: lead in the facing direction, settle vertically
  const p = w.player.body
  // locked on, the camera frames both of you instead of leading ahead
  const focus = w.player.lockOn ? p.x + (w.enemy.body.x - p.x) * 0.42 : p.x + w.player.facing * 90
  const tx = Math.max(w.view.w / 2, Math.min(LEVEL.width - w.view.w / 2, focus))
  w.cam.x += (tx - w.cam.x) * (1 - Math.exp(-4 * STEP))
  const ty = Math.min(GROUND_Y + 120 - w.view.h, p.y - w.view.h * 0.62)
  w.cam.y += (ty - w.cam.y) * (1 - Math.exp(-3 * STEP))
  return true
}
