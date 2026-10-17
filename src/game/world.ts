import type { Brazier, Mushroom, Patch, Rock, Solid, Tree, Tuft, World } from './types'

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const WORLD_SIZE = 2400
const CLEARING = 200

export function generateWorld(seed: number): { world: World; braziers: Brazier[] } {
  const rng = mulberry32(seed)
  const size = WORLD_SIZE
  const c = size / 2
  const trees: Tree[] = []
  const rocks: Rock[] = []
  const mushrooms: Mushroom[] = []
  const tufts: Tuft[] = []
  const patches: Patch[] = []
  const braziers: Brazier[] = []

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng() * 0.5
    const d = 520 + rng() * 380
    braziers.push({ id: i, x: c + Math.cos(a) * d, y: c + Math.sin(a) * d, lit: 0, progress: 0 })
  }

  const blocked = (x: number, y: number, r: number) => {
    if (Math.hypot(x - c, y - c) < CLEARING + r) return true
    for (const b of braziers) if (Math.hypot(x - b.x, y - b.y) < 120 + r) return true
    for (const t of trees) if (Math.hypot(x - t.x, y - t.y) < t.r + r + 26) return true
    for (const k of rocks) if (Math.hypot(x - k.x, y - k.y) < k.r + r + 30) return true
    return false
  }

  // A dense ring of trees along the border so the edge of the world reads as forest.
  for (let i = 0; i < size; i += 64) {
    for (const [x, y] of [
      [i, -10],
      [i + 32, size + 10],
      [-10, i + 32],
      [size + 10, i],
    ]) {
      trees.push({ x: x + (rng() - 0.5) * 30, y: y + (rng() - 0.5) * 30, r: 50 + rng() * 22, hue: rng(), rot: rng() * 360 })
    }
  }

  for (let n = 0; n < 6000 && trees.length < 330; n++) {
    const r = 30 + rng() * 32
    const x = 60 + rng() * (size - 120)
    const y = 60 + rng() * (size - 120)
    if (!blocked(x, y, r)) trees.push({ x, y, r, hue: rng(), rot: rng() * 360 })
  }

  for (let n = 0; n < 3000 && rocks.length < 50; n++) {
    const r = 12 + rng() * 20
    const x = 60 + rng() * (size - 120)
    const y = 60 + rng() * (size - 120)
    if (blocked(x, y, r)) continue
    const pts: string[] = []
    const count = 6 + Math.floor(rng() * 3)
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const rr = r * (0.75 + rng() * 0.35)
      pts.push(`${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`)
    }
    rocks.push({ x, y, r, points: pts.join(' ') })
  }

  for (let k = 0; k < 34; k++) {
    const cx = 80 + rng() * (size - 160)
    const cy = 80 + rng() * (size - 160)
    const hue = rng() < 0.7 ? 185 + rng() * 25 : 280 + rng() * 30
    const count = 2 + Math.floor(rng() * 4)
    for (let i = 0; i < count; i++) {
      const x = cx + (rng() - 0.5) * 60
      const y = cy + (rng() - 0.5) * 60
      if (blocked(x, y, 4)) continue
      mushrooms.push({ x, y, size: 3 + rng() * 4, hue, delay: rng() * 3 })
    }
  }

  for (let i = 0; i < 700; i++) {
    tufts.push({ x: rng() * size, y: rng() * size, s: 0.6 + rng() * 0.9, rot: (rng() - 0.5) * 40 })
  }

  const patchColors = ['#1b2b20', '#223322', '#17251f', '#25301f', '#1d2a2a']
  for (let i = 0; i < 60; i++) {
    patches.push({
      x: rng() * size,
      y: rng() * size,
      rx: 120 + rng() * 260,
      ry: 90 + rng() * 200,
      color: patchColors[Math.floor(rng() * patchColors.length)],
    })
  }

  const solids: Solid[] = [
    ...trees.map((t) => ({ x: t.x, y: t.y, r: t.r * 0.62 })),
    ...rocks.map((k) => ({ x: k.x, y: k.y, r: k.r * 0.85 })),
    ...braziers.map((b) => ({ x: b.x, y: b.y, r: 16 })),
  ]

  return { world: { size, trees, rocks, mushrooms, tufts, patches, solids }, braziers }
}
