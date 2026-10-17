import type { Particle, World } from './types'

const rand = (a: number, b: number) => a + Math.random() * (b - a)

export function emit(w: World, n: number, x: number, y: number, opts: Partial<Particle> & { kind: Particle['kind']; speed?: number; spread?: number; dir?: number; colors: string[] }) {
  const { speed = 200, spread = Math.PI * 2, dir = -Math.PI / 2, colors } = opts
  for (let i = 0; i < n; i++) {
    const a = dir + (Math.random() - 0.5) * spread
    const v = speed * rand(0.35, 1)
    const life = (opts.life ?? 0.8) * rand(0.6, 1.1)
    w.particles.push({
      x: x + rand(-6, 6),
      y: y + rand(-6, 6),
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      rot: rand(0, 360),
      vr: rand(-720, 720),
      life,
      max: life,
      size: (opts.size ?? 4) * rand(0.6, 1.4),
      color: colors[Math.floor(Math.random() * colors.length)],
      kind: opts.kind,
      gravity: opts.gravity ?? 900,
    })
  }
}

export const INK = ['#1a0d10', '#2b0f14', '#5c1a1f']
export const STRAW = ['#d6b25a', '#c79a3a', '#e8cf86', '#a8822e']
export const SCRAP = ['#e9dcc0', '#d8c7a0', '#3b2f3f']

export function inkSplat(w: World, x: number, y: number, dir: number, heavy: boolean) {
  emit(w, heavy ? 22 : 12, x, y, { kind: 'ink', colors: INK, speed: heavy ? 520 : 380, spread: 1.4, dir, size: heavy ? 6 : 4.5, life: 0.7, gravity: 1400 })
  emit(w, heavy ? 10 : 5, x, y, { kind: 'straw', colors: STRAW, speed: 300, spread: 2.4, dir, size: 7, life: 1.1, gravity: 500 })
}

export function updateParticles(w: World, dt: number, groundY: number) {
  for (let i = w.particles.length - 1; i >= 0; i--) {
    const p = w.particles[i]
    p.life -= dt
    if (p.life <= 0) {
      w.particles.splice(i, 1)
      continue
    }
    const drag = p.kind === 'straw' || p.kind === 'scrap' ? 2.2 : p.kind === 'dust' ? 3 : 0.6
    p.vx *= Math.exp(-drag * dt)
    p.vy += p.gravity * dt
    if (p.kind === 'straw' || p.kind === 'scrap') p.vy = Math.min(p.vy, 160)
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rot += p.vr * dt
    if (p.y > groundY) {
      if (p.kind === 'ink') {
        if (w.splats.length < 60 && Math.random() < 0.5) w.splats.push({ x: p.x, y: groundY + 2, r: p.size * 1.6, rot: Math.random() * 360, seed: Math.random() * 100, age: 0 })
        w.particles.splice(i, 1)
        continue
      }
      p.y = groundY
      p.vy *= -0.2
      p.vx *= 0.5
      p.vr *= 0.5
    }
  }
  if (w.particles.length > 500) w.particles.splice(0, w.particles.length - 500)
  for (let i = w.splats.length - 1; i >= 0; i--) {
    const s = w.splats[i]
    s.age += dt
    if (s.age > 40) w.splats.splice(i, 1)
  }
}
