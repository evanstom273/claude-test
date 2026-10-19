import type { Genome } from './genome'
import type { Species } from './species'

export interface Creature {
  id: number
  species: Species
  genome: Genome
  generation: number
  parentId: number | null
  x: number
  y: number
  /** Facing, radians; 0 points east (+x), π/2 south (+y). */
  angle: number
  /** Position and facing at the previous tick, for smooth drawing between ticks. */
  px: number
  py: number
  pa: number
  energy: number
  maxEnergy: number
  age: number
  /** Cells per second at full stride. */
  topSpeed: number
  /** Body radius in cells, for bumping and biting. */
  radius: number
  /** Energy burned per second standing still. */
  upkeep: number
  /** Advances with distance walked, for the walk cycle. */
  stride: number
  moving: boolean
  state: 'wander' | 'graze' | 'hunt' | 'flee'
  wanderAngle: number
  wanderTimer: number
  breedCooldown: number
  /** Id of the creature it is chasing, if hunting. */
  prey: number | null
  /** Seconds until it can lunge again after a bite. */
  lunge: number
  alive: boolean
  /** Seconds since it last ate, for the inspector. */
  hungry: number
  children: number
  kills: number
}

/** Derived stats from the genes: bigger bodies hold more and burn more; long legs are fast. */
export function stats(g: Genome) {
  const legFactor = g.legs === 0 ? 0.55 : 0.75 + g.legs * 0.07 + g.legLength * 0.35
  return {
    maxEnergy: 60 * Math.pow(g.size, 1.25),
    topSpeed: 1.5 * g.speed * legFactor * Math.pow(g.size, 0.15),
    radius: 0.28 * g.size * (0.75 + g.segments * 0.15),
    upkeep: 0.55 * Math.pow(g.size, 0.85) + g.sense * 0.025 + g.eyes * 0.02,
  }
}

/** How well it gets energy from plants and from meat. */
export const plantEfficiency = (g: Genome) => Math.pow(1 - g.diet, 1.4)
export const meatEfficiency = (g: Genome) => Math.pow(g.diet, 1.4)
export const isPredator = (g: Genome) => g.diet > 0.45
export const maturity = (g: Genome) => 12 + g.size * 8
