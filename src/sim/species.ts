import { distance, meanGenome, speciesName, type Genome } from './genome'
import type { Rand } from './rng'

export interface Species {
  id: number
  name: string
  /** The genome it was founded with; members that drift too far from this found a new species. */
  founder: Genome
  /** Average genome of the living members, refreshed now and then; used for its picture. */
  look: Genome
  /** Bumped whenever `look` changes enough to need a new picture. */
  lookVersion: number
  parent: number | null
  bornAt: number
  extinctAt: number | null
  population: number
  /** A lone mutant isn't news: a species counts once it has a few members. */
  established: boolean
  /** Population over time, sampled every HISTORY_STEP seconds. */
  history: number[]
  peak: number
}

/** Seconds between population samples. */
export const HISTORY_STEP = 2
const HISTORY_MAX = 400
/** Genetic distance at which a lineage counts as a new species. */
export const SPECIATION = 1.4
/** Members a new species needs before it is shown and announced. */
export const ESTABLISHED = 4

export class SpeciesRegistry {
  all: Species[] = []
  private nextId = 1

  constructor(private r: Rand) {}

  get(id: number) {
    return this.all.find((s) => s.id === id)!
  }

  found(genome: Genome, time: number, parent: number | null = null): Species {
    const s: Species = {
      id: this.nextId++,
      name: speciesName(this.r),
      founder: { ...genome },
      look: { ...genome },
      lookVersion: 0,
      parent,
      bornAt: time,
      extinctAt: null,
      population: 0,
      established: false,
      history: [],
      peak: 0,
    }
    this.all.push(s)
    return s
  }

  /** The species a newborn belongs to: its parent's, unless it has drifted too far from how that species looks now. */
  assign(parentSpecies: Species, child: Genome, time: number): Species {
    if (distance(child, parentSpecies.look) < SPECIATION) return parentSpecies
    return this.found(child, time, parentSpecies.id)
  }

  /** Recount, record history, and refresh each species' look from its living members. */
  sample(members: Map<number, Genome[]>, time: number) {
    for (const s of this.all) {
      const gs = members.get(s.id) ?? []
      s.population = gs.length
      if (gs.length >= ESTABLISHED) s.established = true
      s.peak = Math.max(s.peak, gs.length)
      if (s.extinctAt !== null) continue
      s.history.push(gs.length)
      if (s.history.length > HISTORY_MAX) s.history.shift()
      if (gs.length === 0 && s.history.length > 1) s.extinctAt = time
      else if (gs.length > 0) {
        const m = meanGenome(gs)
        if (distance(m, s.look) > 0.35) {
          s.look = m
          s.lookVersion++
        }
      }
    }
  }

  /** The chain of ancestors, oldest last. */
  lineage(id: number) {
    const out: Species[] = []
    let s: Species | undefined = this.get(id)
    while (s && s.parent !== null) {
      s = this.get(s.parent)
      if (s) out.push(s)
    }
    return out
  }
}
