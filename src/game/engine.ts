import type { GameState, Input, Shade, ShadeKind, Stats, World } from './types'
import { generateWorld } from './world'

const EMBER_TARGET = 12
const BRAZIER_COST = 25
const BRAZIER_BURN = 50
const BRAZIER_RANGE = 52
const FLARE_COST = 10
const FLARE_CD = 8

export function baseStats(): Stats {
  return {
    lightMul: 1,
    burnMul: 1,
    speedMul: 1,
    drainMul: 1,
    flareCdMul: 1,
    flareRadiusMul: 1,
    magnet: 0,
    emberMul: 1,
    armor: 0,
    sparks: 0,
    brazierCostMul: 1,
    brazierRadiusMul: 1,
  }
}

export const quotaFor = (night: number) => 10 + (night - 1) * 4

export function createGame(seed = Math.floor(Math.random() * 1e9)): GameState {
  const { world, braziers } = generateWorld(seed)
  const s: GameState = {
    phase: 'night',
    world,
    player: { x: world.size / 2, y: world.size / 2, vx: 0, vy: 0, r: 14, fuel: 80, maxFuel: 100, invuln: 0, flareCd: 0 },
    embers: [],
    shades: [],
    particles: [],
    sparks: [],
    braziers,
    flare: null,
    stats: baseStats(),
    taken: {},
    night: 1,
    collected: 0,
    quota: quotaFor(1),
    totalEmbers: 0,
    kills: 0,
    score: 0,
    time: 0,
    nightTime: 0,
    spawnTimer: 4,
    shake: 0,
    nextId: 1,
    events: [],
  }
  for (let i = 0; i < EMBER_TARGET; i++) spawnEmber(s, 140, 1000)
  return s
}

export function lightRadius(s: GameState) {
  return (50 + (s.player.fuel / 100) * 235) * s.stats.lightMul
}

export function brazierRadius(s: GameState, lit: number) {
  if (lit <= 0) return 0
  const fade = Math.min(1, lit / 8)
  return (110 + 70 * fade) * s.stats.brazierRadiusMul
}

export function brazierCost(s: GameState) {
  return Math.round(BRAZIER_COST * s.stats.brazierCostMul)
}

export function flareReady(s: GameState) {
  return s.player.flareCd <= 0 && s.player.fuel > FLARE_COST + 2
}

export function flareCooldownTotal(s: GameState) {
  return FLARE_CD * s.stats.flareCdMul
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function insideSolid(w: World, x: number, y: number, r: number) {
  for (const o of w.solids) {
    const dx = x - o.x
    const dy = y - o.y
    if (dx * dx + dy * dy < (o.r + r) * (o.r + r)) return true
  }
  return false
}

function collide(w: World, e: { x: number; y: number }, r: number) {
  for (const o of w.solids) {
    const dx = e.x - o.x
    const dy = e.y - o.y
    const min = o.r + r
    const d2 = dx * dx + dy * dy
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || 0.001
      e.x += (dx / d) * (min - d)
      e.y += (dy / d) * (min - d)
    }
  }
  const pad = 40
  e.x = Math.max(pad, Math.min(w.size - pad, e.x))
  e.y = Math.max(pad, Math.min(w.size - pad, e.y))
}

function spawnEmber(s: GameState, minD: number, maxD: number) {
  const p = s.player
  for (let tries = 0; tries < 20; tries++) {
    const a = Math.random() * Math.PI * 2
    const d = rand(minD, maxD)
    const x = p.x + Math.cos(a) * d
    const y = p.y + Math.sin(a) * d
    if (x < 80 || y < 80 || x > s.world.size - 80 || y > s.world.size - 80) continue
    if (insideSolid(s.world, x, y, 14)) continue
    s.embers.push({ id: s.nextId++, x, y, vx: 0, vy: 0, value: 10, phase: Math.random() * 10 })
    return
  }
}

function dropEmber(s: GameState, x: number, y: number) {
  const a = Math.random() * Math.PI * 2
  s.embers.push({ id: s.nextId++, x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, value: 8, phase: Math.random() * 10 })
}

export function burst(s: GameState, x: number, y: number, n: number, colors: string[], speed = 160, size = 3, life = 0.8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = speed * (0.3 + Math.random() * 0.7)
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: life * (0.5 + Math.random() * 0.5),
      max: life,
      size: size * (0.6 + Math.random() * 0.8),
      color: colors[Math.floor(Math.random() * colors.length)],
      drag: 3,
    })
  }
}

const SHADE_COLORS: Record<ShadeKind, string[]> = {
  shade: ['#a78bfa', '#7c3aed', '#c4b5fd'],
  wraith: ['#67e8f9', '#22d3ee', '#a5f3fc'],
  hulk: ['#f87171', '#dc2626', '#fecaca'],
}
export const SHADE_EYE: Record<ShadeKind, string> = { shade: '#d8b4fe', wraith: '#a5f3fc', hulk: '#fca5a5' }

function spawnShade(s: GameState, viewRadius: number) {
  const p = s.player
  const n = s.night
  let kind: ShadeKind = 'shade'
  const roll = Math.random()
  if (n >= 3 && roll < Math.min(0.22, 0.06 * (n - 2))) kind = 'hulk'
  else if (n >= 2 && roll > 1 - Math.min(0.4, 0.15 + 0.05 * (n - 2))) kind = 'wraith'

  const hpScale = 1 + 0.14 * (n - 1)
  const base = {
    shade: { r: 16, hp: 46, speed: 66 + n * 4 },
    wraith: { r: 11, hp: 22, speed: 128 + n * 5 },
    hulk: { r: 28, hp: 170, speed: 44 + n * 2 },
  }[kind]

  for (let tries = 0; tries < 10; tries++) {
    const a = Math.random() * Math.PI * 2
    const d = viewRadius + rand(40, 160)
    const x = p.x + Math.cos(a) * d
    const y = p.y + Math.sin(a) * d
    if (x < 50 || y < 50 || x > s.world.size - 50 || y > s.world.size - 50) continue
    if (insideSolid(s.world, x, y, base.r)) continue
    const shade: Shade = {
      id: s.nextId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: base.r,
      hp: base.hp * hpScale,
      maxHp: base.hp * hpScale,
      speed: base.speed,
      seed: Math.random() * 100,
      age: 0,
      burning: 0,
      hurtFlash: 0,
      lastFlare: -1,
    }
    s.shades.push(shade)
    return
  }
}

function damageShade(sh: Shade, amount: number) {
  sh.hp -= amount
  sh.hurtFlash = 0.12
}

function killShade(s: GameState, sh: Shade) {
  burst(s, sh.x, sh.y, sh.kind === 'hulk' ? 34 : 18, SHADE_COLORS[sh.kind], sh.kind === 'hulk' ? 240 : 170, 3.5, 0.9)
  s.kills++
  s.score += sh.kind === 'hulk' ? 25 : sh.kind === 'wraith' ? 8 : 5
  s.events.push({ type: 'kill', kind: sh.kind })
  const dropChance = sh.kind === 'hulk' ? 1 : 0.28
  if (Math.random() < dropChance) dropEmber(s, sh.x, sh.y)
  if (sh.kind === 'hulk') {
    dropEmber(s, sh.x, sh.y)
    s.shake = Math.max(s.shake, 6)
  }
}

export function update(s: GameState, input: Input, dtRaw: number, viewRadius: number) {
  const dt = Math.min(dtRaw, 1 / 20)
  s.time += dt
  updateParticles(s, dt)
  updateFlare(s, dt)
  s.shake = Math.max(0, s.shake - dt * 30)
  if (s.phase !== 'night') return

  const p = s.player
  const st = s.stats
  s.nightTime += dt

  // --- player movement
  const speed = 215 * st.speedMul
  const k = 1 - Math.exp(-14 * dt)
  p.vx += (input.mx * speed - p.vx) * k
  p.vy += (input.my * speed - p.vy) * k
  p.x += p.vx * dt
  p.y += p.vy * dt
  collide(s.world, p, p.r)

  p.invuln = Math.max(0, p.invuln - dt)
  p.flareCd = Math.max(0, p.flareCd - dt)

  // --- fuel drain
  const drain = (2.6 + 0.3 * (s.night - 1)) * st.drainMul
  p.fuel -= drain * dt

  // trailing flame motes
  if (Math.random() < dt * (8 + Math.hypot(p.vx, p.vy) / 12)) {
    s.particles.push({
      x: p.x + rand(-6, 6),
      y: p.y + rand(-4, 8),
      vx: -p.vx * 0.2 + rand(-15, 15),
      vy: -p.vy * 0.2 - rand(20, 50),
      life: 0.7,
      max: 0.7,
      size: rand(1.5, 3),
      color: Math.random() < 0.5 ? '#fbbf24' : '#fb923c',
      drag: 1.5,
    })
  }

  // --- flare
  if (input.flare && flareReady(s)) {
    p.fuel -= FLARE_COST
    p.flareCd = flareCooldownTotal(s)
    s.flare = { id: s.nextId++, t: 0, r: 0, max: 380 * st.flareRadiusMul }
    s.shake = Math.max(s.shake, 9)
    s.events.push({ type: 'flare' })
    burst(s, p.x, p.y, 40, ['#fde68a', '#fbbf24', '#fff7ed'], 420, 3, 0.7)
  }

  // --- braziers
  const lights: { x: number; y: number; r: number }[] = [{ x: p.x, y: p.y, r: lightRadius(s) }]
  const cost = brazierCost(s)
  for (const b of s.braziers) {
    const d = Math.hypot(p.x - b.x, p.y - b.y)
    if (b.lit > 0) {
      b.lit = Math.max(0, b.lit - dt)
      const r = brazierRadius(s, b.lit)
      lights.push({ x: b.x, y: b.y, r })
      if (d < r * 0.85) p.fuel = Math.min(p.maxFuel, p.fuel + 3.4 * dt)
      if (Math.random() < dt * 14) {
        s.particles.push({
          x: b.x + rand(-8, 8),
          y: b.y + rand(-6, 6),
          vx: rand(-10, 10),
          vy: -rand(40, 80),
          life: 0.9,
          max: 0.9,
          size: rand(1.5, 3.5),
          color: Math.random() < 0.5 ? '#fdba74' : '#fde047',
          drag: 1,
        })
      }
    } else if (d < BRAZIER_RANGE && p.fuel > cost + 6) {
      b.progress += dt / 1.1
      if (b.progress >= 1) {
        b.progress = 0
        b.lit = BRAZIER_BURN
        p.fuel -= cost
        s.score += 15
        s.events.push({ type: 'brazier' })
        burst(s, b.x, b.y, 36, ['#fde68a', '#fb923c', '#f97316'], 260, 3, 1)
      }
    } else {
      b.progress = Math.max(0, b.progress - dt * 2)
    }
  }

  // --- embers
  const magnet = 80 + st.magnet
  for (let i = s.embers.length - 1; i >= 0; i--) {
    const e = s.embers[i]
    e.phase += dt
    e.x += e.vx * dt
    e.y += e.vy * dt
    e.vx *= Math.exp(-4 * dt)
    e.vy *= Math.exp(-4 * dt)
    const dx = p.x - e.x
    const dy = p.y - e.y
    const d = Math.hypot(dx, dy)
    if (d < magnet && d > 0) {
      const pull = 380 * (1 - d / magnet) + 60
      e.x += (dx / d) * pull * dt
      e.y += (dy / d) * pull * dt
    }
    if (d < p.r + 10) {
      s.embers.splice(i, 1)
      p.fuel = Math.min(p.maxFuel, p.fuel + e.value * st.emberMul)
      s.collected++
      s.totalEmbers++
      s.score += 10
      s.events.push({ type: 'pickup' })
      burst(s, e.x, e.y, 10, ['#fde68a', '#fbbf24', '#fb923c'], 120, 2.5, 0.6)
      for (let j = 0; j < st.sparks; j++) {
        const a = Math.random() * Math.PI * 2
        s.sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 2.2 })
      }
    }
  }
  if (s.embers.length < EMBER_TARGET && Math.random() < dt * 1.5) spawnEmber(s, 300, 1000)
  // Despawn embers that drifted far behind so new ones appear near the action.
  for (let i = s.embers.length - 1; i >= 0; i--) {
    const e = s.embers[i]
    if (Math.hypot(e.x - p.x, e.y - p.y) > 1500) s.embers.splice(i, 1)
  }

  // --- spawn shades
  s.spawnTimer -= dt
  const maxShades = 14 + s.night * 6
  if (s.spawnTimer <= 0 && s.shades.length < maxShades) {
    const interval = Math.max(0.35, 2.0 - s.night * 0.2 - s.nightTime * 0.01)
    s.spawnTimer = interval * rand(0.6, 1.4)
    const pack = s.night >= 4 && Math.random() < 0.25 ? 3 : 1
    for (let i = 0; i < pack; i++) spawnShade(s, viewRadius)
  }

  // --- shades
  const flare = s.flare
  for (let i = s.shades.length - 1; i >= 0; i--) {
    const sh = s.shades[i]
    sh.age += dt
    sh.hurtFlash = Math.max(0, sh.hurtFlash - dt)
    const dx = p.x - sh.x
    const dy = p.y - sh.y
    const d = Math.hypot(dx, dy) || 1

    let burn = 0
    for (const l of lights) {
      const ld = Math.hypot(sh.x - l.x, sh.y - l.y)
      if (ld < l.r) burn = Math.max(burn, 0.35 + 0.65 * (1 - ld / l.r))
    }
    sh.burning = burn
    if (burn > 0) {
      const resist = sh.kind === 'hulk' ? 0.45 : 1
      damageShade(sh, 17 * st.burnMul * burn * resist * dt)
      sh.hurtFlash = 0
      if (Math.random() < dt * 10 * burn) {
        s.particles.push({
          x: sh.x + rand(-sh.r, sh.r) * 0.6,
          y: sh.y + rand(-sh.r, sh.r) * 0.6,
          vx: rand(-10, 10),
          vy: -rand(30, 60),
          life: 0.6,
          max: 0.6,
          size: rand(1.5, 3),
          color: SHADE_COLORS[sh.kind][0],
          drag: 1,
        })
      }
    }

    if (flare && sh.lastFlare !== flare.id && d < flare.r + sh.r) {
      sh.lastFlare = flare.id
      damageShade(sh, 75 * st.burnMul)
      const kb = sh.kind === 'hulk' ? 260 : 560
      sh.vx -= (dx / d) * kb
      sh.vy -= (dy / d) * kb
    }

    const slow = burn > 0 ? (sh.kind === 'hulk' ? 0.85 : 0.7) : 1
    let tx = dx / d
    let ty = dy / d
    if (sh.kind === 'wraith') {
      const w = Math.sin(sh.age * 5 + sh.seed) * 0.8
      const ox = -ty * w
      const oy = tx * w
      tx += ox
      ty += oy
    }
    const want = sh.speed * slow * Math.min(1, sh.age / 0.6)
    const sk = 1 - Math.exp(-5 * dt)
    sh.vx += (tx * want - sh.vx) * sk
    sh.vy += (ty * want - sh.vy) * sk

    // light separation from other shades
    for (const o of s.shades) {
      if (o === sh) continue
      const ox = sh.x - o.x
      const oy = sh.y - o.y
      const min = sh.r + o.r
      const od2 = ox * ox + oy * oy
      if (od2 < min * min && od2 > 0.01) {
        const od = Math.sqrt(od2)
        sh.x += (ox / od) * (min - od) * 0.5
        sh.y += (oy / od) * (min - od) * 0.5
      }
    }

    sh.x += sh.vx * dt
    sh.y += sh.vy * dt
    collide(s.world, sh, sh.r * 0.8)

    // contact with player
    if (d < sh.r + p.r && p.invuln <= 0) {
      const dmg = (sh.kind === 'hulk' ? 24 : sh.kind === 'wraith' ? 10 : 15) * (1 - st.armor)
      p.fuel -= dmg
      p.invuln = 1.0
      s.shake = Math.max(s.shake, 12)
      s.events.push({ type: 'hurt' })
      burst(s, p.x, p.y, 22, ['#fb923c', '#f97316', '#fde68a'], 240, 3, 0.7)
      sh.vx = (-dx / d) * 420
      sh.vy = (-dy / d) * 420
      p.vx += (dx / d) * 380
      p.vy += (dy / d) * 380
    }

    if (sh.hp <= 0) {
      killShade(s, sh)
      s.shades.splice(i, 1)
    } else if (d > 1700) {
      s.shades.splice(i, 1)
    }
  }

  // --- sparks (homing)
  for (let i = s.sparks.length - 1; i >= 0; i--) {
    const sp = s.sparks[i]
    sp.life -= dt
    let target: Shade | null = null
    let best = 420
    for (const sh of s.shades) {
      const d = Math.hypot(sh.x - sp.x, sh.y - sp.y)
      if (d < best) {
        best = d
        target = sh
      }
    }
    if (target) {
      const dx = target.x - sp.x
      const dy = target.y - sp.y
      const d = Math.hypot(dx, dy) || 1
      const tk = 1 - Math.exp(-6 * dt)
      sp.vx += ((dx / d) * 420 - sp.vx) * tk
      sp.vy += ((dy / d) * 420 - sp.vy) * tk
      if (d < target.r + 4) {
        damageShade(target, 30 * st.burnMul)
        burst(s, sp.x, sp.y, 6, ['#fde68a', '#fbbf24'], 120, 2, 0.4)
        sp.life = 0
      }
    } else {
      sp.vx *= Math.exp(-1.5 * dt)
      sp.vy *= Math.exp(-1.5 * dt)
    }
    sp.x += sp.vx * dt
    sp.y += sp.vy * dt
    if (sp.life <= 0) s.sparks.splice(i, 1)
  }
  for (let i = s.shades.length - 1; i >= 0; i--) {
    if (s.shades[i].hp <= 0) {
      killShade(s, s.shades[i])
      s.shades.splice(i, 1)
    }
  }

  // --- end conditions
  if (p.fuel <= 0) {
    p.fuel = 0
    s.phase = 'over'
    s.events.push({ type: 'death' })
    s.shake = 18
    burst(s, p.x, p.y, 70, ['#fbbf24', '#fb923c', '#78716c', '#a8a29e'], 300, 4, 1.4)
    return
  }
  if (s.collected >= s.quota) {
    s.phase = 'dawn'
    s.score += 100 * s.night
    s.events.push({ type: 'dawn' })
    for (const sh of s.shades) burst(s, sh.x, sh.y, 12, SHADE_COLORS[sh.kind], 140, 3, 1)
    s.shades = []
    s.sparks = []
  }
}

function updateParticles(s: GameState, dt: number) {
  for (let i = s.particles.length - 1; i >= 0; i--) {
    const q = s.particles[i]
    q.life -= dt
    if (q.life <= 0) {
      s.particles.splice(i, 1)
      continue
    }
    const f = Math.exp(-q.drag * dt)
    q.vx *= f
    q.vy *= f
    q.x += q.vx * dt
    q.y += q.vy * dt
  }
  if (s.particles.length > 600) s.particles.splice(0, s.particles.length - 600)
}

function updateFlare(s: GameState, dt: number) {
  const f = s.flare
  if (!f) return
  f.t += dt
  const k = Math.min(1, f.t / 0.5)
  f.r = f.max * (1 - Math.pow(1 - k, 3))
  if (f.t > 0.75) s.flare = null
}

export function startNextNight(s: GameState) {
  s.night++
  s.collected = 0
  s.quota = quotaFor(s.night)
  s.nightTime = 0
  s.spawnTimer = 3
  s.player.fuel = Math.min(s.player.maxFuel, s.player.fuel + 25)
  s.player.invuln = 1.5
  s.phase = 'night'
}
