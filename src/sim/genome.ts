import type { Rand } from './rng'

/** Everything a creature passes on. Numbers are ranges, mutated a little each generation. */
export interface Genome {
  /** Body scale: 0.5 (mouse) to 2.6 (bull). */
  size: number
  /** Relative walking speed. */
  speed: number
  /** 0 eats plants, 1 eats meat, in between eats both less well. */
  diet: number
  /** How far it notices food and danger, in cells. */
  sense: number
  hue: number
  /** Second colour for markings, offset from the main hue. */
  accent: number
  /** 0 plain, 1 stripes, 2 spots. */
  pattern: number
  /** Body segments, 1 to 4. */
  segments: number
  /** Leg pairs, 0 (slithers) to 4. */
  legs: number
  legLength: number
  headSize: number
  eyes: number
  /** Horn size; under 0.25 there are none. */
  horns: number
  /** Back spikes; under 0.25 there are none. */
  spikes: number
  tail: number
  /** How readily it breeds: higher breeds sooner but with less to give each child. */
  fertility: number
  /** Seconds of life. */
  lifespan: number
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

const RANGES: Record<keyof Genome, [number, number, boolean?]> = {
  size: [0.5, 2.6],
  speed: [0.4, 2],
  diet: [0, 1],
  sense: [2, 12],
  hue: [0, 360],
  accent: [0, 360],
  pattern: [0, 2, true],
  segments: [1, 4, true],
  legs: [0, 4, true],
  legLength: [0.2, 1],
  headSize: [0.6, 1.5],
  eyes: [1, 5, true],
  horns: [0, 1],
  spikes: [0, 1],
  tail: [0, 1],
  fertility: [0.5, 1.5],
  lifespan: [240, 720],
}

const KEYS = Object.keys(RANGES) as (keyof Genome)[]

export function randomGenome(r: Rand, diet?: number): Genome {
  const g = {} as Genome
  for (const k of KEYS) {
    const [lo, hi, int] = RANGES[k]
    const v = lo + r() * (hi - lo)
    g[k] = int ? Math.round(v) : v
  }
  if (diet !== undefined) g.diet = diet
  // a fresh species shouldn't start as a full-size predator
  if (g.diet > 0.6) g.size = Math.min(g.size, 1.6)
  return g
}

const gauss = (r: Rand) => (r() + r() + r() - 1.5) * 0.8

/** A child's genome: every gene drifts a little; body plans occasionally gain or lose a part. */
export function mutate(parent: Genome, r: Rand, rate = 1): Genome {
  const g = { ...parent }
  for (const k of KEYS) {
    const [lo, hi, int] = RANGES[k]
    if (int) {
      if (r() < 0.02 * rate) g[k] = clamp(g[k] + (r() < 0.5 ? -1 : 1), lo, hi)
    } else if (k === 'hue' || k === 'accent') {
      g[k] = (g[k] + gauss(r) * 3 * rate + 360) % 360
    } else {
      g[k] = clamp(g[k] + gauss(r) * (hi - lo) * 0.02 * rate, lo, hi)
    }
  }
  return g
}

/** How different two genomes are; around 1 means a new species. */
export function distance(a: Genome, b: Genome) {
  let d = 0
  for (const k of KEYS) {
    const [lo, hi, int] = RANGES[k]
    let diff = Math.abs(a[k] - b[k])
    if (k === 'hue' || k === 'accent') diff = Math.min(diff, 360 - diff)
    const w = int ? 1.2 : k === 'diet' ? 2.5 : k === 'size' ? 1.5 : 1
    d += (diff / (hi - lo)) * w
  }
  return d
}

/** Average genome, for drawing a species as it is now rather than as it started. */
export function meanGenome(gs: Genome[]): Genome {
  const out = { ...gs[0] }
  for (const k of KEYS) {
    const [, , int] = RANGES[k]
    let v = 0
    for (const g of gs) v += g[k]
    v /= gs.length
    out[k] = int ? Math.round(v) : v
  }
  return out
}

const ONSETS = ['gr', 'th', 'm', 'v', 'sk', 'p', 'qu', 'l', 'dr', 'z', 'b', 'n', 'ch', 'f', 'r', 'h', 'tr', 'gl']
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ae', 'io', 'y']
const ENDS = ['us', 'ax', 'odon', 'ix', 'ops', 'ura', 'ella', 'or', 'id', 'aria', 'ex', 'iformes']

/** A made-up Latin-ish name. */
export function speciesName(r: Rand) {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const word = (syll: number, end: string) => {
    let w = ''
    for (let i = 0; i < syll; i++) w += pick(ONSETS) + pick(VOWELS)
    return w + end
  }
  const genus = word(1 + Math.floor(r() * 2), pick(ENDS))
  const epithet = word(1 + Math.floor(r() * 2), pick(['us', 'a', 'is', 'um', 'ens', 'ii']))
  return `${genus.charAt(0).toUpperCase()}${genus.slice(1)} ${epithet}`
}
