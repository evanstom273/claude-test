import { fbm } from './noise'
import { hash2 } from './rng'

/** Terrain types, from deep water up to snow. */
export const Biome = { Deep: 0, Shallow: 1, Sand: 2, Grass: 3, Forest: 4, Hills: 5, Rock: 6, Snow: 7 } as const
export type Biome = (typeof Biome)[keyof typeof Biome]

export const SEA_LEVEL = 0.42
/** How much plant matter each biome can hold. */
const CAPACITY = [0, 0, 0.15, 0.8, 1, 0.45, 0.08, 0]
/** Which biome a height and moisture make; also used per pixel when painting. */
export function classify(h: number, m: number): Biome {
  if (h < SEA_LEVEL - 0.08) return Biome.Deep
  if (h < SEA_LEVEL) return Biome.Shallow
  if (h < SEA_LEVEL + 0.03) return Biome.Sand
  if (h < 0.62) return m > 0.52 ? Biome.Forest : Biome.Grass
  if (h < 0.72) return m > 0.6 ? Biome.Forest : Biome.Hills
  if (h < 0.84) return Biome.Rock
  return Biome.Snow
}

/** Chunk size in cells, for redrawing only the bits of terrain that change. */
export const CHUNK = 16

/**
 * The flat world: a square grid of cells with a height, moisture and plant
 * matter each. Heights are 0–1, with the sea at SEA_LEVEL.
 */
export class World {
  readonly height: Float32Array
  readonly moisture: Float32Array
  readonly biome: Uint8Array
  readonly plants: Float32Array
  /** Extra growth from rain, fading over time. */
  readonly rain: Float32Array
  /** Chunks whose terrain changed since the renderer last looked. */
  readonly dirty = new Set<number>()
  /** Rotating start index so the plant update is spread across ticks. */
  private plantCursor = 0

  constructor(
    readonly size: number,
    readonly seed: number,
  ) {
    const n = size * size
    this.height = new Float32Array(n)
    this.moisture = new Float32Array(n)
    this.biome = new Uint8Array(n)
    this.plants = new Float32Array(n)
    this.rain = new Float32Array(n)
    this.generate()
  }

  get chunks() {
    return Math.ceil(this.size / CHUNK)
  }

  idx(x: number, y: number) {
    return y * this.size + x
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size
  }

  /** Height at a world position (cells), clamped to the map. */
  heightAt(x: number, y: number) {
    const cx = Math.max(0, Math.min(this.size - 1, Math.floor(x)))
    const cy = Math.max(0, Math.min(this.size - 1, Math.floor(y)))
    return this.height[this.idx(cx, cy)]
  }

  isLand(x: number, y: number) {
    return this.inBounds(Math.floor(x), Math.floor(y)) && this.heightAt(x, y) > SEA_LEVEL
  }

  private generate() {
    const { size, seed } = this
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const nx = x / size
        const ny = y / size
        // an island: noise pulled down towards the edges
        const dx = nx - 0.5
        const dy = ny - 0.5
        const d = Math.sqrt(dx * dx + dy * dy) * 2
        const falloff = Math.max(0, 1 - Math.pow(d, 2.2))
        const n = fbm(nx * 5, ny * 5, seed)
        const ridge = 1 - Math.abs(fbm(nx * 3, ny * 3, seed + 7) * 2 - 1)
        const h = (n * 0.75 + ridge * 0.35) * (0.25 + falloff * 0.95) - 0.05
        const i = this.idx(x, y)
        this.height[i] = Math.max(0, Math.min(1, h))
        this.moisture[i] = fbm(nx * 4 + 31, ny * 4 + 17, seed + 3)
      }
    for (let i = 0; i < size * size; i++) this.classify(i)
    // start with plants about half grown wherever they can live
    for (let i = 0; i < size * size; i++) this.plants[i] = CAPACITY[this.biome[i]] * (0.4 + hash2(i, 9, seed) * 0.5)
  }

  private classify(i: number) {
    this.biome[i] = classify(this.height[i], this.moisture[i])
  }

  capacity(i: number) {
    return CAPACITY[this.biome[i]]
  }

  private markDirty(x: number, y: number) {
    const c = this.chunks
    const cx = Math.floor(x / CHUNK)
    const cy = Math.floor(y / CHUNK)
    // neighbours too: cliffs and shores draw across chunk edges
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const X = cx + ox
        const Y = cy + oy
        if (X >= 0 && Y >= 0 && X < c && Y < c) this.dirty.add(Y * c + X)
      }
  }

  /** Raises (amount > 0) or lowers the land in a soft circle. */
  terraform(cx: number, cy: number, radius: number, amount: number) {
    const r = Math.ceil(radius)
    for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++)
      for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
        if (!this.inBounds(x, y)) continue
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius
        if (d >= 1) continue
        const i = this.idx(x, y)
        const k = (1 - d * d) * amount
        this.height[i] = Math.max(0, Math.min(1, this.height[i] + k))
        const before = this.biome[i]
        this.classify(i)
        if (this.biome[i] !== before) this.plants[i] = Math.min(this.plants[i], this.capacity(i))
        this.markDirty(x, y)
      }
  }

  /** A crater: blasts the land down and burns the plants. */
  crater(cx: number, cy: number, radius: number) {
    const r = Math.ceil(radius * 1.6)
    for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++)
      for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
        if (!this.inBounds(x, y)) continue
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius
        if (d > 1.6) continue
        const i = this.idx(x, y)
        // a bowl with a raised rim
        const dh = d < 1 ? -0.16 * (1 - d * d) : 0.05 * (1 - (d - 1) / 0.6)
        this.height[i] = Math.max(0, Math.min(1, this.height[i] + dh))
        this.classify(i)
        if (d < 1.3) this.plants[i] = 0
        this.markDirty(x, y)
      }
  }

  seedPlants(cx: number, cy: number, radius: number) {
    this.paint(cx, cy, radius, (i, k) => (this.plants[i] = Math.max(this.plants[i], this.capacity(i) * (0.5 + 0.5 * k))))
  }

  rainOn(cx: number, cy: number, radius: number) {
    this.paint(cx, cy, radius, (i, k) => (this.rain[i] = Math.min(1, this.rain[i] + 0.6 * k)))
  }

  private paint(cx: number, cy: number, radius: number, fn: (i: number, k: number) => void) {
    const r = Math.ceil(radius)
    for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++)
      for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
        if (!this.inBounds(x, y)) continue
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius
        if (d < 1) fn(this.idx(x, y), 1 - d)
      }
  }

  /** Plants grow towards what the land can hold and creep into bare ground. Spread over ticks. */
  growPlants(dt: number, share = 0.25) {
    const n = this.size * this.size
    const count = Math.ceil(n * share)
    const step = dt / share
    const s = this.size
    for (let k = 0; k < count; k++) {
      const i = (this.plantCursor + k) % n
      const cap = this.capacity(i)
      if (cap <= 0) continue
      const p = this.plants[i]
      const wet = 1 + this.rain[i] * 2.5 + this.moisture[i] * 0.5
      if (p > 0.01) this.plants[i] = Math.min(cap, p + p * (1 - p / cap) * 0.05 * wet * step)
      else {
        // bare ground is reseeded from a neighbour
        const x = i % s
        const y = (i / s) | 0
        const nb = (x > 0 ? this.plants[i - 1] : 0) + (x < s - 1 ? this.plants[i + 1] : 0) + (y > 0 ? this.plants[i - s] : 0) + (y < s - 1 ? this.plants[i + s] : 0)
        if (nb > 0.6 && hash2(i, Math.floor(this.plantCursor / 7), 3) < 0.02 * step * wet) this.plants[i] = 0.05
      }
      if (this.rain[i] > 0) this.rain[i] = Math.max(0, this.rain[i] - 0.02 * step)
    }
    this.plantCursor = (this.plantCursor + count) % n
  }
}
