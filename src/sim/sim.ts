import { isPredator, maturity, meatEfficiency, plantEfficiency, stats, type Creature } from './creature'
import { mutate, randomGenome, type Genome } from './genome'
import { rng, type Rand } from './rng'
import { HISTORY_STEP, SpeciesRegistry, type Species } from './species'
import { World } from './world'

export const TICK = 0.1

/** The four world sizes: each has twice the land of the one before. */
export const WORLD_SIZES = {
  small: { label: 'Small', cells: 181, cap: 900 },
  medium: { label: 'Medium', cells: 256, cap: 1400 },
  large: { label: 'Large', cells: 362, cap: 2000 },
  huge: { label: 'Huge', cells: 512, cap: 2800 },
} as const
export type WorldSize = keyof typeof WORLD_SIZES
const GRID = 4

export type Tool = 'inspect' | 'raise' | 'lower' | 'plants' | 'rain' | 'spawn' | 'meteor'

export interface SimEvent {
  id: number
  time: number
  text: string
  kind: 'species' | 'extinct' | 'meteor'
  speciesId?: number
}

export interface Meteor {
  x: number
  y: number
  radius: number
  /** Seconds until it lands. */
  eta: number
  id: number
}

/**
 * The living world. Everything runs in fixed ticks so it behaves the same at
 * any speed; positions are in cells.
 */
export class Simulation {
  readonly world: World
  readonly species: SpeciesRegistry
  creatures: Creature[] = []
  time = 0
  events: SimEvent[] = []
  meteors: Meteor[] = []
  /** Recent deaths and births, for little effects in the renderer. */
  births: { x: number; y: number; t: number }[] = []
  impacts: { x: number; y: number; r: number; t: number }[] = []
  rainfalls: { x: number; y: number; r: number; t: number; duration: number; id: number }[] = []
  private r: Rand
  private nextId = 1
  private nextEvent = 1
  private historyTimer = 0
  private grid: number[][] = []
  private byId = new Map<number, Creature>()

  /** Most creatures alive at once, so a phone can keep up. */
  readonly cap: number

  constructor(size: WorldSize = 'small', seed = Math.floor(Math.random() * 1e9)) {
    this.r = rng(seed)
    this.world = new World(WORLD_SIZES[size].cells, seed)
    this.cap = WORLD_SIZES[size].cap
    this.species = new SpeciesRegistry(this.r)
    // three founding species: two grazers and a small hunter
    const herds = Math.max(1, Math.round(this.world.size / 128))
    const hunter = randomGenome(this.r, 0.85)
    hunter.size = 0.9 + this.r() * 0.4
    hunter.speed = Math.max(hunter.speed, 1.2)
    for (const [g, n] of [
      [randomGenome(this.r, 0.05), 26],
      [randomGenome(this.r, 0.15), 22],
      [hunter, 7],
    ] as [Genome, number][]) {
      const sp = this.seedSpecies(g, n)
      for (let h = 1; h < herds; h++) this.addHerd(sp, g, n)
    }
    this.sampleHistory()
  }

  get(id: number) {
    return this.byId.get(id)
  }

  /** A random land cell, preferring grassland. */
  private landSpot(): [number, number] {
    const w = this.world
    for (let i = 0; i < 400; i++) {
      const x = 8 + this.r() * (w.size - 16)
      const y = 8 + this.r() * (w.size - 16)
      const b = w.biome[w.idx(Math.floor(x), Math.floor(y))]
      if (b === 3 || b === 4 || (i > 200 && w.isLand(x, y))) return [x, y]
    }
    return [w.size / 2, w.size / 2]
  }

  seedSpecies(g: Genome, count: number, at?: [number, number]) {
    const sp = this.species.found(g, this.time)
    this.addHerd(sp, g, count, at)
    return sp
  }

  private addHerd(sp: Species, g: Genome, count: number, at?: [number, number]) {
    const [cx, cy] = at ?? this.landSpot()
    for (let i = 0; i < count; i++) {
      const x = cx + (this.r() - 0.5) * 6
      const y = cy + (this.r() - 0.5) * 6
      if (!this.world.isLand(x, y)) continue
      const c = this.spawn(sp, mutate(g, this.r, 0.3), x, y, null, 0)
      c.age = this.r() * maturity(g)
      c.energy = c.maxEnergy * (0.5 + this.r() * 0.3)
    }
  }

  private spawn(sp: Species, g: Genome, x: number, y: number, parent: Creature | null, generation: number): Creature {
    const s = stats(g)
    const facing = this.r() * Math.PI * 2
    const c: Creature = {
      id: this.nextId++,
      species: sp,
      genome: g,
      generation,
      parentId: parent?.id ?? null,
      x,
      y,
      angle: 0,
      px: x,
      py: y,
      pa: 0,
      energy: s.maxEnergy * 0.4,
      maxEnergy: s.maxEnergy,
      age: 0,
      topSpeed: s.topSpeed,
      radius: s.radius,
      upkeep: s.upkeep,
      stride: this.r(),
      moving: false,
      state: 'wander',
      wanderAngle: this.r() * Math.PI * 2,
      wanderTimer: 0,
      breedCooldown: 20 + this.r() * 20,
      thinkTimer: this.r() * 0.4,
      threat: null,
      prey: null,
      lunge: 0,
      alive: true,
      hungry: 0,
      children: 0,
      kills: 0,
    }
    c.angle = c.pa = facing
    this.creatures.push(c)
    this.byId.set(c.id, c)
    return c
  }

  // ------------------------------------------------------------------ ticking

  step() {
    const dt = TICK
    this.time += dt
    for (const c of this.creatures) {
      c.px = c.x
      c.py = c.y
      c.pa = c.angle
    }
    this.world.growPlants(dt)
    this.buildGrid()
    for (const c of this.creatures) if (c.alive) this.think(c, dt)
    this.landMeteors(dt)
    // remove the dead
    if (this.creatures.some((c) => !c.alive)) {
      this.creatures = this.creatures.filter((c) => {
        if (!c.alive) this.byId.delete(c.id)
        return c.alive
      })
    }
    this.births = this.births.filter((b) => this.time - b.t < 1)
    this.impacts = this.impacts.filter((b) => this.time - b.t < 3)
    this.rainfalls = this.rainfalls.filter((b) => this.time - b.t < b.duration)
    this.historyTimer += dt
    if (this.historyTimer >= HISTORY_STEP) {
      this.historyTimer = 0
      this.sampleHistory()
    }
  }

  private sampleHistory() {
    const members = new Map<number, Genome[]>()
    for (const c of this.creatures) {
      let a = members.get(c.species.id)
      if (!a) members.set(c.species.id, (a = []))
      a.push(c.genome)
    }
    const wasAlive = new Set(this.species.all.filter((s) => s.extinctAt === null).map((s) => s.id))
    const wasEstablished = new Set(this.species.all.filter((s) => s.established).map((s) => s.id))
    this.species.sample(members, this.time)
    for (const s of this.species.all) {
      if (s.established && !wasEstablished.has(s.id) && s.parent !== null) this.event(`A new species, ${s.name}, has evolved from ${this.species.get(s.parent).name}.`, 'species', s.id)
      if (s.established && wasAlive.has(s.id) && s.extinctAt !== null) this.event(`${s.name} has died out.`, 'extinct', s.id)
    }
  }

  event(text: string, kind: SimEvent['kind'], speciesId?: number) {
    this.events = [...this.events, { id: this.nextEvent++, time: this.time, text, kind, speciesId }].slice(-40)
  }

  private buildGrid() {
    const n = Math.ceil(this.world.size / GRID)
    if (this.grid.length !== n * n) this.grid = Array.from({ length: n * n }, () => [])
    for (const cell of this.grid) cell.length = 0
    for (let i = 0; i < this.creatures.length; i++) {
      const c = this.creatures[i]
      const gx = Math.min(n - 1, Math.max(0, Math.floor(c.x / GRID)))
      const gy = Math.min(n - 1, Math.max(0, Math.floor(c.y / GRID)))
      this.grid[gy * n + gx].push(i)
    }
  }

  /** Calls fn for every creature within radius of (x, y). */
  near(x: number, y: number, radius: number, fn: (c: Creature) => void) {
    const n = Math.ceil(this.world.size / GRID)
    const x0 = Math.max(0, Math.floor((x - radius) / GRID))
    const x1 = Math.min(n - 1, Math.floor((x + radius) / GRID))
    const y0 = Math.max(0, Math.floor((y - radius) / GRID))
    const y1 = Math.min(n - 1, Math.floor((y + radius) / GRID))
    const r2 = radius * radius
    for (let gy = y0; gy <= y1; gy++)
      for (let gx = x0; gx <= x1; gx++)
        for (const i of this.grid[gy * n + gx]) {
          const c = this.creatures[i]
          const dx = c.x - x
          const dy = c.y - y
          if (dx * dx + dy * dy <= r2) fn(c)
        }
  }

  private think(c: Creature, dt: number) {
    const g = c.genome
    const w = this.world
    c.age += dt
    c.hungry += dt
    c.breedCooldown -= dt
    c.lunge -= dt

    // look around: hunters look for prey, everyone looks for hunters
    let threat: Creature | null = null
    let threatD = Infinity
    let prey: Creature | null = c.prey !== null ? (this.byId.get(c.prey) ?? null) : null
    if (prey && !prey.alive) prey = null
    const hunts = isPredator(g)
    let bestPrey: Creature | null = null
    let bestPreyScore = Infinity
    // looking around is the expensive part, so each creature only does it a few times a second
    c.thinkTimer -= dt
    const looks = c.thinkTimer <= 0
    if (looks) c.thinkTimer = 0.35 + this.r() * 0.15
    else if (c.threat !== null) {
      const o = this.byId.get(c.threat)
      if (o && o.alive && Math.hypot(o.x - c.x, o.y - c.y) < g.sense) {
        threat = o
        threatD = Math.hypot(o.x - c.x, o.y - c.y)
      }
    }
    if (looks) this.near(c.x, c.y, g.sense, (o) => {
      if (o === c || !o.alive || o.species === c.species) return
      const d = Math.hypot(o.x - c.x, o.y - c.y)
      if (isPredator(o.genome) && o.genome.size > g.size * 0.6 && d < Math.min(g.sense, 6) * 0.7 && d < threatD) {
        threat = o
        threatD = d
      }
      // creatures in the forest are hard to spot
      const hidden = w.biome[w.idx(Math.floor(o.x), Math.floor(o.y))] === 4 && d > g.sense * 0.4
      if (hunts && !prey && !hidden && o.genome.size < g.size * 2.2) {
        const score = d / (o.genome.size + 0.2)
        if (score < bestPreyScore) {
          bestPreyScore = score
          bestPrey = o
        }
      }
    })
    if (hunts && !prey && bestPrey && c.energy < c.maxEnergy * 0.6) prey = bestPrey
    c.prey = prey?.id ?? null
    if (looks) c.threat = (threat as Creature | null)?.id ?? null

    let want = 0 // 0 stop, 1 walk, 1.25 run
    let heading = c.angle
    const eatsPlants = plantEfficiency(g) > 0.05
    const cell = w.idx(Math.floor(c.x), Math.floor(c.y))
    const t = threat as Creature | null

    if (t && !(hunts && g.size > t.genome.size * 1.1)) {
      c.state = 'flee'
      heading = Math.atan2(c.y - t.y, c.x - t.x)
      // panic is short-lived: tired prey slows down
      want = c.energy > c.maxEnergy * 0.3 ? 1.15 : 0.8
    } else if (prey) {
      c.state = 'hunt'
      heading = Math.atan2(prey.y - c.y, prey.x - c.x)
      want = 1.45
      const d = Math.hypot(prey.x - c.x, prey.y - c.y)
      if (d < c.radius + prey.radius + 0.15 && c.lunge <= 0) {
        // the lunge: often misses, and bigger prey is harder to bring down
        c.lunge = 1.2
        const odds = Math.min(1, Math.pow(g.size / prey.genome.size, 2))
        if (this.r() < odds * 0.45) {
          prey.alive = false
          c.energy = Math.min(c.maxEnergy, c.energy + prey.maxEnergy * 1.1 * meatEfficiency(g) + 5)
          c.hungry = 0
          c.kills++
          c.prey = null
        } else {
          c.energy -= 3
          prey.angle = Math.atan2(prey.y - c.y, prey.x - c.x)
          // give up on a chase that keeps failing
          if (this.r() < 0.35) c.prey = null
        }
      }
    } else if (eatsPlants && w.plants[cell] > 0.12 && c.energy < c.maxEnergy * 0.95) {
      c.state = 'graze'
      want = 0
      const bite = Math.min(w.plants[cell] - 0.02, 0.35 * g.size * dt)
      w.plants[cell] -= bite
      c.energy = Math.min(c.maxEnergy, c.energy + bite * 55 * plantEfficiency(g))
      c.hungry = 0
    } else {
      c.state = 'wander'
      // hungry plant eaters sniff out greener ground; everyone else meanders
      c.wanderTimer -= dt
      if (c.wanderTimer <= 0) {
        c.wanderTimer = 1 + this.r() * 2.5
        c.wanderAngle += (this.r() - 0.5) * 2.2
        if (eatsPlants && c.energy < c.maxEnergy * 0.8) {
          let best = -1
          for (let k = 0; k < 6; k++) {
            const a = this.r() * Math.PI * 2
            const rr = 1 + this.r() * g.sense
            const px = c.x + Math.cos(a) * rr
            const py = c.y + Math.sin(a) * rr
            if (!w.isLand(px, py)) continue
            const p = w.plants[w.idx(Math.floor(px), Math.floor(py))]
            if (p > best) {
              best = p
              c.wanderAngle = a
            }
          }
        }
      }
      heading = c.wanderAngle
      want = 0.55
    }

    // turn smoothly towards where it wants to go
    const da = Math.atan2(Math.sin(heading - c.angle), Math.cos(heading - c.angle))
    c.angle += Math.max(-5 * dt, Math.min(5 * dt, da))
    const sp = c.topSpeed * want
    c.moving = sp > 0.01
    if (c.moving) {
      const nx = c.x + Math.cos(c.angle) * sp * dt
      const ny = c.y + Math.sin(c.angle) * sp * dt
      if (w.isLand(nx, ny) && nx > 1 && ny > 1 && nx < w.size - 1 && ny < w.size - 1) {
        c.x = nx
        c.y = ny
        c.stride += (sp * dt) / (0.6 * g.size)
      } else {
        // the shore: turn away
        c.wanderAngle = c.angle + Math.PI * (0.6 + this.r() * 0.8)
        c.angle += Math.PI * 0.5 * (this.r() < 0.5 ? -1 : 1) * dt * 4
      }
    }

    // the cost of living, more when running
    c.energy -= (c.upkeep + (c.moving ? g.speed * g.speed * 0.35 * want : 0)) * dt
    if (!w.isLand(c.x, c.y)) c.energy -= 20 * dt // drowning, after the land drops away
    if (c.energy <= 0 || c.age > g.lifespan) c.alive = false

    // breeding: a well-fed adult splits off a child
    if (c.alive && c.age > maturity(g) && c.breedCooldown <= 0 && c.energy > c.maxEnergy * (0.85 - g.fertility * 0.15) && this.creatures.length < this.cap) {
      this.breed(c)
    }
  }

  private breed(c: Creature) {
    const g = mutate(c.genome, this.r)
    const sp = this.species.assign(c.species, g, this.time)
    const a = this.r() * Math.PI * 2
    const x = c.x + Math.cos(a) * c.radius * 2
    const y = c.y + Math.sin(a) * c.radius * 2
    if (!this.world.isLand(x, y)) return
    const child = this.spawn(sp, g, x, y, c, c.generation + 1)
    const gift = c.maxEnergy * (0.55 - c.genome.fertility * 0.15)
    child.energy = Math.min(child.maxEnergy, gift)
    c.energy -= gift + 4
    c.children++
    c.breedCooldown = 30 + (1.5 - c.genome.fertility) * 30 + this.r() * 15
    this.births.push({ x, y, t: this.time })
  }

  // -------------------------------------------------------------------- tools

  /** Applies a tool at a world position; `dt` scales brushes that are held down. */
  use(tool: Tool, x: number, y: number, dt: number, selected: number | null): Creature | null {
    const w = this.world
    switch (tool) {
      case 'raise':
        w.terraform(x, y, 5, 0.12 * dt)
        break
      case 'lower':
        w.terraform(x, y, 5, -0.12 * dt)
        break
      case 'plants':
        w.seedPlants(x, y, 4)
        break
      case 'rain':
        w.rainOn(x, y, 7)
        // one cloud per patch of sky, refreshed while the brush is held there
        if (!this.rainfalls.some((r) => Math.hypot(r.x - x, r.y - y) < 3 && this.time - r.t < r.duration - 1)) this.rainfalls.push({ x, y, r: 7, t: this.time, duration: 6, id: this.nextId++ })
        break
      case 'spawn': {
        if (!w.isLand(x, y)) return null
        const sp = selected !== null ? this.species.get(selected) : null
        if (sp && sp.extinctAt === null) {
          for (let i = 0; i < 4; i++) {
            const c = this.spawn(sp, mutate(sp.look, this.r, 0.3), x + (this.r() - 0.5) * 2, y + (this.r() - 0.5) * 2, null, 0)
            c.energy = c.maxEnergy * 0.7
          }
        } else {
          const s = this.seedSpecies(randomGenome(this.r, this.r() < 0.25 ? 0.6 + this.r() * 0.3 : this.r() * 0.3), 8, [x, y])
          this.event(`You have created ${s.name}.`, 'species', s.id)
        }
        break
      }
      case 'meteor':
        this.meteors.push({ x, y, radius: 4 + this.r() * 2, eta: 1.4, id: this.nextId++ })
        break
      case 'inspect': {
        let best: Creature | null = null
        let bd = 2.5
        this.near(x, y, 2.5, (c) => {
          const d = Math.hypot(c.x - x, c.y - y) - c.radius
          if (d < bd) {
            bd = d
            best = c
          }
        })
        return best
      }
    }
    return null
  }

  private landMeteors(dt: number) {
    for (const m of this.meteors) {
      m.eta -= dt
      if (m.eta > 0) continue
      this.world.crater(m.x, m.y, m.radius)
      let killed = 0
      this.near(m.x, m.y, m.radius * 1.3, (c) => {
        c.alive = false
        killed++
      })
      this.impacts.push({ x: m.x, y: m.y, r: m.radius, t: this.time })
      this.event(killed ? `A meteor strikes, killing ${killed}.` : 'A meteor strikes empty ground.', 'meteor')
    }
    this.meteors = this.meteors.filter((m) => m.eta > 0)
  }
}
