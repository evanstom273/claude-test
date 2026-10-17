import type { InputState } from './input'
import { LEVEL } from './level'
import { emit } from './particles'
import { groundProbe, moveBody } from './physics'
import type { AttackId, Player, Rect, World } from './types'

export const P = {
  run: 265,
  accGround: 2800,
  accAir: 1600,
  friction: 3200,
  gravity: 2300,
  jumpV: 790,
  jumpCut: 0.45,
  maxFall: 1150,
  coyote: 0.1,
  jumpBuffer: 140,
  rollTime: 0.42,
  rollSpeed: 560,
  rollIFrames: [0.03, 0.3] as const,
  rollCost: 22,
  stamRegen: 62,
  stamDelay: 0.55,
  healTime: 1.05,
  healAt: 0.55,
  healAmount: 45,
  height: 92,
  rollHeight: 46,
}

export interface AttackDef {
  startup: number
  active: number
  recovery: number
  dmg: number
  poise: number
  stam: number
  lunge: number
  box: Rect
  hitstop: number
  shake: number
  next?: AttackId
  /** Fraction of recovery after which a roll can cancel it. */
  rollCancel: number
}

export const ATTACKS: Record<AttackId, AttackDef> = {
  light1: { startup: 0.13, active: 0.09, recovery: 0.27, dmg: 20, poise: 14, stam: 16, lunge: 170, box: { x: 4, y: -84, w: 104, h: 70 }, hitstop: 0.06, shake: 4, next: 'light2', rollCancel: 0.4 },
  light2: { startup: 0.11, active: 0.09, recovery: 0.27, dmg: 20, poise: 14, stam: 16, lunge: 170, box: { x: 4, y: -96, w: 104, h: 84 }, hitstop: 0.06, shake: 4, next: 'light3', rollCancel: 0.4 },
  light3: { startup: 0.24, active: 0.11, recovery: 0.42, dmg: 34, poise: 28, stam: 22, lunge: 260, box: { x: 0, y: -128, w: 122, h: 128 }, hitstop: 0.09, shake: 7, rollCancel: 0.55 },
  heavy: { startup: 0.46, active: 0.12, recovery: 0.5, dmg: 54, poise: 48, stam: 30, lunge: 210, box: { x: -6, y: -150, w: 140, h: 150 }, hitstop: 0.13, shake: 11, rollCancel: 0.6 },
  air: { startup: 0.09, active: 0.16, recovery: 0.22, dmg: 18, poise: 10, stam: 14, lunge: 0, box: { x: -10, y: -96, w: 116, h: 100 }, hitstop: 0.05, shake: 3, rollCancel: 1 },
}

export function createPlayer(): Player {
  return {
    body: { x: LEVEL.playerSpawn.x, y: LEVEL.playerSpawn.y, w: 30, h: P.height, vx: 0, vy: 0, onGround: true },
    facing: 1,
    state: 'move',
    t: 0,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    stamDelay: 0,
    flasks: 3,
    maxFlasks: 3,
    invuln: 0,
    attack: null,
    hitDone: false,
    healed: false,
    coyote: 0,
    jumping: false,
    runPhase: 0,
    landT: 0,
    airT: 0,
    wasOnGround: true,
    dropT: 0,
    lockOn: false,
    rollDir: 1,
  }
}

function spend(p: Player, n: number) {
  p.stamina = Math.max(-10, p.stamina - n)
  p.stamDelay = P.stamDelay
}

function setState(p: Player, s: Player['state']) {
  p.state = s
  p.t = 0
}

export function attackPhase(p: Player) {
  if (!p.attack) return null
  const a = ATTACKS[p.attack]
  if (p.t < a.startup) return { phase: 'startup' as const, k: p.t / a.startup, a }
  if (p.t < a.startup + a.active) return { phase: 'active' as const, k: (p.t - a.startup) / a.active, a }
  return { phase: 'recovery' as const, k: Math.min(1, (p.t - a.startup - a.active) / a.recovery), a }
}

function startAttack(w: World, p: Player, id: AttackId, input: InputState) {
  const a = ATTACKS[id]
  if (p.stamina <= 0) {
    w.events.push({ type: 'noStamina' })
    return false
  }
  const d = input.dir()
  if (p.lockOn) p.facing = w.enemy.body.x >= p.body.x ? 1 : -1
  else if (d) p.facing = d > 0 ? 1 : -1
  spend(p, a.stam)
  p.attack = id
  p.hitDone = false
  setState(p, 'attack')
  w.events.push({ type: 'swing', heavy: id === 'heavy' || id === 'light3' })
  return true
}

function tryRoll(w: World, p: Player, input: InputState) {
  if (!p.body.onGround) return false
  if (!input.take('roll')) return false
  if (p.stamina <= 0) {
    w.events.push({ type: 'noStamina' })
    return false
  }
  const d = input.dir()
  if (p.lockOn) {
    // locked on: roll the way you're pushing, or hop back away from him
    p.facing = w.enemy.body.x >= p.body.x ? 1 : -1
    p.rollDir = d ? (d > 0 ? 1 : -1) : ((-p.facing) as 1 | -1)
  } else {
    if (d) p.facing = d > 0 ? 1 : -1
    p.rollDir = p.facing
  }
  spend(p, P.rollCost)
  setState(p, 'roll')
  p.attack = null
  p.body.h = P.rollHeight
  w.events.push({ type: 'roll' })
  emit(w, 6, p.body.x, p.body.y - 4, { kind: 'dust', colors: ['#6b5a3e', '#8a7550'], speed: 120, spread: 1.2, dir: p.rollDir === 1 ? Math.PI : 0, size: 7, life: 0.5, gravity: -40 })
  return true
}

export function hurtPlayer(w: World, p: Player, dmg: number, fromX: number) {
  if (p.state === 'dead') return
  p.hp -= dmg
  p.attack = null
  p.body.h = P.height
  const dir = p.body.x < fromX ? -1 : 1
  p.body.vx = dir * 330
  p.body.vy = -260
  p.invuln = 0.7
  w.events.push({ type: 'hurt' })
  if (p.hp <= 0) {
    p.hp = 0
    setState(p, 'dead')
    w.events.push({ type: 'death' })
  } else setState(p, 'hurt')
}

export function updatePlayer(w: World, p: Player, input: InputState, dt: number) {
  const b = p.body
  p.t += dt
  p.invuln = Math.max(0, p.invuln - dt)
  p.landT = Math.max(0, p.landT - dt)

  // stamina
  if (p.stamDelay > 0) p.stamDelay -= dt
  else if (p.state !== 'attack' && p.state !== 'roll') {
    const rate = p.state === 'heal' ? 0.5 : 1
    p.stamina = Math.min(p.maxStamina, p.stamina + P.stamRegen * rate * dt)
  }

  const dirIn = input.dir()
  const target = w.enemy
  if (p.lockOn && (target.state === 'dead' || Math.abs(target.body.x - b.x) > 950 || p.state === 'dead')) p.lockOn = false
  const lockFace: 1 | -1 = target.body.x >= b.x ? 1 : -1
  let gravity = P.gravity
  let control = 1
  let maxSpeed = P.run

  switch (p.state) {
    case 'move': {
      if (p.lockOn) {
        p.facing = lockFace
        // backing away while facing him is slower, like a backpedal
        if (dirIn && Math.sign(dirIn) !== p.facing) maxSpeed = P.run * 0.62
      } else if (dirIn) p.facing = dirIn > 0 ? 1 : -1
      if (b.onGround) p.coyote = P.coyote
      else p.coyote -= dt

      if (b.onGround && input.held('down') && input.peek('jump', P.jumpBuffer) && onOneWay(b)) {
        input.take('jump')
        p.dropT = 0.2
        b.onGround = false
      }
      if (input.peek('jump', P.jumpBuffer) && p.coyote > 0) {
        input.take('jump')
        b.vy = -P.jumpV
        p.coyote = 0
        p.jumping = true
        b.onGround = false
        w.events.push({ type: 'jump' })
        emit(w, 5, b.x, b.y - 2, { kind: 'dust', colors: ['#6b5a3e', '#8a7550'], speed: 90, spread: 2.5, dir: -Math.PI / 2, size: 6, life: 0.4, gravity: -40 })
      }
      if (p.jumping && !input.held('jump') && b.vy < 0) {
        b.vy *= P.jumpCut
        p.jumping = false
      }
      if (b.vy >= 0) p.jumping = false

      if (tryRoll(w, p, input)) break
      if (input.take('light')) {
        if (startAttack(w, p, b.onGround ? 'light1' : 'air', input)) break
      }
      if (b.onGround && input.take('heavy')) {
        if (startAttack(w, p, 'heavy', input)) break
      }
      if (b.onGround && input.take('heal')) {
        if (p.flasks > 0) {
          p.flasks--
          p.healed = false
          setState(p, 'heal')
          break
        }
      }
      break
    }
    case 'roll': {
      const k = p.t / P.rollTime
      const speed = P.rollSpeed * (1 - k * k * 0.75)
      b.vx = p.rollDir * speed
      control = 0
      if (p.t >= P.rollIFrames[0] && p.t <= P.rollIFrames[1]) p.invuln = Math.max(p.invuln, 0.016)
      if (p.t >= P.rollTime) {
        b.h = P.height
        if (p.lockOn) p.facing = lockFace
        setState(p, 'move')
      }
      break
    }
    case 'attack': {
      const ph = attackPhase(p)!
      const a = ph.a
      control = 0
      if (p.attack === 'air') {
        control = 0.6
        gravity = P.gravity * 0.75
        if (b.onGround && ph.phase !== 'startup') {
          p.attack = null
          setState(p, 'move')
          break
        }
      } else if (ph.phase !== 'recovery') {
        const lungeK = ph.phase === 'startup' ? 0.25 + ph.k * 0.75 : 1 - ph.k * 0.5
        b.vx = p.facing * a.lunge * lungeK
      } else {
        b.vx *= Math.exp(-14 * dt)
      }
      if (ph.phase === 'recovery') {
        if (a.next && input.peek('light', 220)) {
          input.take('light')
          if (startAttack(w, p, a.next, input)) break
        }
        if (p.attack !== 'heavy' && input.peek('heavy', 160)) {
          input.take('heavy')
          if (startAttack(w, p, 'heavy', input)) break
        }
        if (ph.k >= a.rollCancel && input.peek('roll', 200) && tryRoll(w, p, input)) break
        if (ph.k >= 1) {
          p.attack = null
          setState(p, 'move')
        }
      }
      break
    }
    case 'hurt': {
      control = 0
      if (b.onGround) b.vx *= Math.exp(-8 * dt)
      if (p.t > 0.38) setState(p, 'move')
      break
    }
    case 'heal': {
      maxSpeed = 70
      control = 0.5
      if (p.lockOn) p.facing = lockFace
      else if (dirIn) p.facing = dirIn > 0 ? 1 : -1
      if (!p.healed && p.t >= P.healAt) {
        p.healed = true
        p.hp = Math.min(p.maxHp, p.hp + P.healAmount)
        w.events.push({ type: 'heal' })
        emit(w, 14, b.x, b.y - 50, { kind: 'spark', colors: ['#f2c14e', '#ffe08a', '#e8a33a'], speed: 90, size: 3, life: 0.9, gravity: -160 })
      }
      if (p.t >= P.healTime) setState(p, 'move')
      break
    }
    case 'rest': {
      control = 0
      b.vx *= Math.exp(-12 * dt)
      if (p.t > 1.6) setState(p, 'move')
      break
    }
    case 'dead': {
      control = 0
      if (b.onGround) b.vx *= Math.exp(-6 * dt)
      break
    }
  }

  if (control > 0) {
    const want = dirIn * maxSpeed
    const acc = b.onGround ? (dirIn ? P.accGround : P.friction) : P.accAir
    const dv = want - b.vx
    const step = acc * control * dt
    b.vx += Math.max(-step, Math.min(step, dv))
  }

  b.vy = Math.min(P.maxFall, b.vy + gravity * dt)
  p.dropT = Math.max(0, p.dropT - dt)
  moveBody(b, LEVEL, dt, p.dropT > 0)
  if (!b.onGround && b.vy === 0 && groundProbe(b, LEVEL)) b.onGround = true

  if (b.onGround && !p.wasOnGround) {
    if (p.airT > 0.25) {
      p.landT = 0.12
      w.events.push({ type: 'land' })
      emit(w, 6, b.x, b.y - 2, { kind: 'dust', colors: ['#6b5a3e', '#8a7550'], speed: 120, spread: 1.0, dir: Math.PI, size: 6, life: 0.4, gravity: -40 })
      emit(w, 6, b.x, b.y - 2, { kind: 'dust', colors: ['#6b5a3e', '#8a7550'], speed: 120, spread: 1.0, dir: 0, size: 6, life: 0.4, gravity: -40 })
    }
    if (p.state === 'attack' && p.attack === 'air') {
      p.attack = null
      setState(p, 'move')
    }
  }
  p.airT = b.onGround ? 0 : p.airT + dt
  p.wasOnGround = b.onGround
  // the run cycle plays backwards when backpedalling
  if (b.onGround && Math.abs(b.vx) > 20) p.runPhase += (b.vx * p.facing > 0 ? 1 : -1) * (Math.abs(b.vx) / P.run) * dt * 11
}

function onOneWay(b: Player['body']) {
  return LEVEL.platforms.some((pl) => pl.oneWay && Math.abs(b.y - pl.y) < 1 && b.x + b.w / 2 > pl.x && b.x - b.w / 2 < pl.x + pl.w)
}

export function restPlayer(p: Player) {
  p.lockOn = false
  p.hp = p.maxHp
  p.flasks = p.maxFlasks
  p.stamina = p.maxStamina
  p.attack = null
  p.body.h = P.height
  setState(p, 'rest')
}

export function respawnPlayer(p: Player) {
  const fresh = createPlayer()
  Object.assign(p, fresh)
  p.body.x = LEVEL.shrine.x + 70
  p.body.y = LEVEL.shrine.y
  setState(p, 'rest')
}
