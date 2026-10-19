import type { Creature } from '../sim/creature'
import type { Simulation, Tool } from '../sim/sim'
import type { Species } from '../sim/species'
import { Biome, CHUNK, type World } from '../sim/world'
import { hash2 } from '../sim/rng'
import { bake, inBatches } from './bake'
import { CELL, creatureSvg, FRAMES, ROTATIONS, spriteSize } from './creatureArt'
import { crownSvg, tuftSvg } from './plantArt'
import { paintTerrain } from './terrain'

interface Chunk {
  terrain: HTMLCanvasElement
  ground: HTMLCanvasElement
  canopy: HTMLCanvasElement
  hasCanopy: boolean
}

interface SpeciesSprites {
  version: number
  /** [rotation][frame] */
  frames: HTMLCanvasElement[][]
  /** World pixels the sprite covers at the species' typical size. */
  size: number
  lookSize: number
}

interface Stamp {
  img: HTMLCanvasElement
  size: number
}

/** How sharp sprites are baked relative to world pixels, so zooming in stays crisp. */
const SPRITE_SCALE = 1.5

export interface Camera {
  x: number
  y: number
  zoom: number
}

export class Renderer {
  ctx: CanvasRenderingContext2D
  cam: Camera = { x: 0, y: 0, zoom: 1 }
  dpr = 1
  private chunks: Chunk[] = []
  private sprites = new Map<number, SpeciesSprites>()
  private baking = new Set<number>()
  private trees: Stamp[] = []
  private bushes: Stamp[] = []
  private tufts: Stamp[] = []
  private floraCursor = 0
  private floraTimer = 0

  constructor(
    public canvas: HTMLCanvasElement,
    private world: World,
  ) {
    this.ctx = canvas.getContext('2d')!
  }

  async load(onProgress: (k: number) => void) {
    const w = this.world
    const n = w.chunks
    // plant stamps: a handful of variants, baked once
    const jobs: (() => Promise<void>)[] = []
    for (let i = 0; i < 6; i++) {
      const t = crownSvg(100 + i, CELL * (2.2 + (i % 3) * 0.4), 105 + i * 6, 'tree')
      jobs.push(() => bake(t.svg, t.size, t.size, 1.5).then((img) => void this.trees.push({ img, size: t.size })))
      const b = crownSvg(200 + i, CELL * 1.2, 95 + i * 5, 'bush')
      jobs.push(() => bake(b.svg, b.size, b.size, 1.5).then((img) => void this.bushes.push({ img, size: b.size })))
      const tf = tuftSvg(300 + i, CELL * 1.1, 85 + i * 6)
      jobs.push(() => bake(tf.svg, tf.size, tf.size, 1.5).then((img) => void this.tufts.push({ img, size: tf.size })))
    }
    await inBatches(jobs)
    for (let cy = 0; cy < n; cy++)
      for (let cx = 0; cx < n; cx++) {
        const c: Chunk = { terrain: document.createElement('canvas'), ground: document.createElement('canvas'), canopy: document.createElement('canvas'), hasCanopy: false }
        paintTerrain(w, cx, cy, c.terrain)
        this.chunks.push(c)
        this.paintFlora(cx, cy)
        onProgress((cy * n + cx + 1) / (n * n))
        // let the page breathe while the island is painted
        if ((cy * n + cx) % 6 === 5) await new Promise((r) => setTimeout(r, 0))
      }
    w.dirty.clear()
  }

  // ------------------------------------------------------------------ caches

  /** Redraws plants on one chunk: tufts and bushes on the ground layer, tree crowns on the canopy. */
  private paintFlora(cx: number, cy: number) {
    const w = this.world
    const c = this.chunks[cy * w.chunks + cx]
    const size = CHUNK * CELL
    const pad = CELL * 2
    for (const cv of [c.ground, c.canopy]) {
      cv.width = size + pad * 2
      cv.height = size + pad * 2
    }
    const g = c.ground.getContext('2d')!
    g.drawImage(c.terrain, pad, pad)
    const k = c.canopy.getContext('2d')!
    c.hasCanopy = false
    for (let y = 0; y < CHUNK; y++)
      for (let x = 0; x < CHUNK; x++) {
        const gx = cx * CHUNK + x
        const gy = cy * CHUNK + y
        if (!w.inBounds(gx, gy)) continue
        const i = w.idx(gx, gy)
        const p = w.plants[i]
        if (p < 0.12) continue
        const b = w.biome[i]
        const h1 = hash2(gx, gy, 41)
        const h2 = hash2(gx, gy, 42)
        const px = pad + x * CELL + CELL * (0.2 + hash2(gx, gy, 43) * 0.6)
        const py = pad + y * CELL + CELL * (0.2 + hash2(gx, gy, 44) * 0.6)
        if (b === Biome.Forest && p > 0.35 && h1 < 0.4) {
          const t = this.trees[Math.floor(h2 * this.trees.length)]
          const s = t.size * (0.55 + p * 0.5)
          k.drawImage(t.img, px - s / 2, py - s / 2, s, s)
          c.hasCanopy = true
        } else if ((b === Biome.Grass || b === Biome.Forest) && p > 0.55 && h1 < 0.1) {
          const t = this.bushes[Math.floor(h2 * this.bushes.length)]
          const s = t.size * (0.6 + p * 0.5)
          g.drawImage(t.img, px - s / 2, py - s / 2, s, s)
        } else if ((b === Biome.Grass || b === Biome.Hills || b === Biome.Forest) && h1 < 0.45 * p) {
          const t = this.tufts[Math.floor(h2 * this.tufts.length)]
          const s = t.size * (0.5 + p * 0.6)
          g.drawImage(t.img, px - s / 2, py - s / 2, s, s)
        }
      }
  }

  private async bakeSpecies(sp: Species) {
    if (this.baking.has(sp.id)) return
    this.baking.add(sp.id)
    const version = sp.lookVersion
    const g = { ...sp.look }
    const size = spriteSize(g)
    const frames: HTMLCanvasElement[][] = Array.from({ length: ROTATIONS }, () => [])
    const jobs: (() => Promise<void>)[] = []
    for (let r = 0; r < ROTATIONS; r++)
      for (let f = 0; f < FRAMES; f++) {
        const a = (r / ROTATIONS) * Math.PI * 2
        jobs.push(() => bake(creatureSvg(g, a, f), size, size, SPRITE_SCALE).then((c) => void (frames[r][f] = c)))
      }
    await inBatches(jobs, 4)
    this.sprites.set(sp.id, { version, frames, size, lookSize: g.size })
    this.baking.delete(sp.id)
  }

  /** Keeps caches current: repaints reshaped terrain, refreshes plants a chunk at a time, bakes new species. */
  update(sim: Simulation, dt: number) {
    const w = this.world
    // reshaped land: a couple of chunks per frame
    let budget = 3
    for (const id of w.dirty) {
      if (budget-- <= 0) break
      w.dirty.delete(id)
      const cx = id % w.chunks
      const cy = Math.floor(id / w.chunks)
      paintTerrain(w, cx, cy, this.chunks[id].terrain)
      this.paintFlora(cx, cy)
    }
    // plants grow slowly: walk through the chunks, one every so often
    this.floraTimer += dt
    const every = 0.12
    while (this.floraTimer > every) {
      this.floraTimer -= every
      const id = this.floraCursor++ % this.chunks.length
      this.paintFlora(id % w.chunks, Math.floor(id / w.chunks))
    }
    // creature pictures, for every living species (new and changed ones)
    const living = new Set<number>()
    for (const c of sim.creatures) living.add(c.species.id)
    for (const id of living) {
      const sp = sim.species.get(id)
      const have = this.sprites.get(id)
      if (!have || have.version !== sp.lookVersion) void this.bakeSpecies(sp)
    }
  }

  spritesFor(sp: Species, sim: Simulation): SpeciesSprites | null {
    let s: Species | undefined = sp
    // a brand-new species borrows its parent's picture until its own is ready
    while (s) {
      const got = this.sprites.get(s.id)
      if (got) return got
      s = s.parent !== null ? sim.species.get(s.parent) : undefined
    }
    return null
  }

  // ------------------------------------------------------------------ camera

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(this.canvas.clientWidth * this.dpr)
    this.canvas.height = Math.round(this.canvas.clientHeight * this.dpr)
  }

  /** Screen (CSS pixels) to world pixels. */
  toWorld(sx: number, sy: number) {
    const { cam } = this
    return { x: cam.x + (sx - this.canvas.clientWidth / 2) / cam.zoom, y: cam.y + (sy - this.canvas.clientHeight / 2) / cam.zoom }
  }

  toScreen(wx: number, wy: number) {
    const { cam } = this
    return { x: (wx - cam.x) * cam.zoom + this.canvas.clientWidth / 2, y: (wy - cam.y) * cam.zoom + this.canvas.clientHeight / 2 }
  }

  fitWorld() {
    const size = this.world.size * CELL
    this.cam.x = size / 2
    this.cam.y = size / 2
    this.cam.zoom = Math.min(this.canvas.clientWidth, this.canvas.clientHeight) / size * 1.05
  }

  clampCamera() {
    const size = this.world.size * CELL
    this.cam.zoom = Math.max(0.15, Math.min(3, this.cam.zoom))
    this.cam.x = Math.max(0, Math.min(size, this.cam.x))
    this.cam.y = Math.max(0, Math.min(size, this.cam.y))
  }

  // -------------------------------------------------------------------- draw

  draw(sim: Simulation, alpha: number, view: { selected: number | null; tool: Tool; cursor: { x: number; y: number } | null; highlight: number | null }) {
    const { ctx, cam } = this
    const w = this.world
    const cw = this.canvas.clientWidth
    const ch = this.canvas.clientHeight
    const k = this.dpr * cam.zoom
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#1d3f58'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(k, 0, 0, k, this.dpr * (cw / 2 - cam.x * cam.zoom), this.dpr * (ch / 2 - cam.y * cam.zoom))
    ctx.imageSmoothingQuality = 'high'

    const view0 = this.toWorld(0, 0)
    const view1 = this.toWorld(cw, ch)
    const size = CHUNK * CELL
    const pad = CELL * 2
    const n = w.chunks
    const cx0 = Math.max(0, Math.floor(view0.x / size) - 1)
    const cy0 = Math.max(0, Math.floor(view0.y / size) - 1)
    const cx1 = Math.min(n - 1, Math.floor(view1.x / size) + 1)
    const cy1 = Math.min(n - 1, Math.floor(view1.y / size) + 1)

    // ground: terrain with grass and bushes, drawn as one image per chunk
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks[cy * n + cx]
        ctx.drawImage(c.ground, pad, pad, size + 1, size + 1, cx * size, cy * size, size + 1, size + 1)
      }
    // plants spill over chunk edges, so draw the overhang of neighbours on top
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks[cy * n + cx]
        ctx.drawImage(c.ground, 0, 0, pad, size + pad * 2, cx * size - pad, cy * size - pad, pad, size + pad * 2)
        ctx.drawImage(c.ground, size + pad, 0, pad, size + pad * 2, cx * size + size, cy * size - pad, pad, size + pad * 2)
      }

    // births: a small ring of light
    for (const b of sim.births) {
      const t = (sim.time - b.t) / 1
      ctx.strokeStyle = `rgba(255,248,210,${(1 - t) * 0.8})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(b.x * CELL, b.y * CELL, 4 + t * 10, 0, Math.PI * 2)
      ctx.stroke()
    }

    // creatures
    const sel = view.selected !== null ? sim.get(view.selected) : undefined
    const vx0 = view0.x / CELL - 3
    const vy0 = view0.y / CELL - 3
    const vx1 = view1.x / CELL + 3
    const vy1 = view1.y / CELL + 3
    for (const c of sim.creatures) {
      const x = c.px + (c.x - c.px) * alpha
      const y = c.py + (c.y - c.py) * alpha
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue
      this.drawCreature(c, x, y, alpha, sim, view.highlight === c.species.id)
    }

    // canopy over the creatures, a little see-through so the forest isn't a black box
    ctx.globalAlpha = 0.93
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks[cy * n + cx]
        if (c.hasCanopy) ctx.drawImage(c.canopy, cx * size - pad, cy * size - pad)
      }
    ctx.globalAlpha = 1

    // the selected creature: a ring, and its senses
    if (sel) {
      const x = (sel.px + (sel.x - sel.px) * alpha) * CELL
      const y = (sel.py + (sel.y - sel.py) * alpha) * CELL
      ctx.strokeStyle = 'rgba(227,197,128,0.9)'
      ctx.lineWidth = 2 / cam.zoom
      ctx.beginPath()
      ctx.arc(x, y, sel.radius * CELL + 6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([4 / cam.zoom, 6 / cam.zoom])
      ctx.strokeStyle = 'rgba(227,197,128,0.35)'
      ctx.beginPath()
      ctx.arc(x, y, sel.genome.sense * CELL, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    this.drawWeather(sim)

    // brush outline under the pointer
    if (view.cursor && view.tool !== 'inspect') {
      const r = { raise: 5, lower: 5, plants: 4, rain: 7, spawn: 1.5, meteor: 5 }[view.tool] * CELL
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 1.5 / cam.zoom
      ctx.beginPath()
      ctx.arc(view.cursor.x, view.cursor.y, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  private drawCreature(c: Creature, x: number, y: number, alpha: number, sim: Simulation, highlight: boolean) {
    const ctx = this.ctx
    const sp = this.spritesFor(c.species, sim)
    const da = Math.atan2(Math.sin(c.angle - c.pa), Math.cos(c.angle - c.pa))
    const a = c.pa + da * alpha
    if (!sp) {
      // not baked yet: a placeholder dot in the right colour
      ctx.fillStyle = `hsl(${c.genome.hue} 40% 45%)`
      ctx.beginPath()
      ctx.arc(x * CELL, y * CELL, c.radius * CELL, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    const rot = ((Math.round((a / (Math.PI * 2)) * ROTATIONS) % ROTATIONS) + ROTATIONS) % ROTATIONS
    const frame = c.moving ? Math.floor(c.stride * FRAMES) % FRAMES : 0
    const img = sp.frames[rot][frame]
    if (!img) return
    // each creature is its species' picture, scaled to its own size
    const s = sp.size * (c.genome.size / sp.lookSize) * Math.min(1, 0.55 + c.age / 20)
    if (highlight) {
      ctx.fillStyle = 'rgba(227,197,128,0.35)'
      ctx.beginPath()
      ctx.arc(x * CELL, y * CELL, c.radius * CELL + 5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.drawImage(img, x * CELL - s / 2, y * CELL - s / 2, s, s)
  }

  private drawWeather(sim: Simulation) {
    const ctx = this.ctx
    const t = sim.time
    // falling meteors: a glowing rock with a trail, coming in from the upper right
    for (const m of sim.meteors) {
      const k = Math.max(0, m.eta / 1.4)
      const tx = m.x * CELL
      const ty = m.y * CELL
      const sx = tx + k * 420
      const sy = ty - k * 600
      const grad = ctx.createLinearGradient(sx, sy, sx + 90, sy - 130)
      grad.addColorStop(0, 'rgba(255,200,120,0.9)')
      grad.addColorStop(1, 'rgba(255,120,40,0)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 10
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + 90, sy - 130)
      ctx.stroke()
      ctx.fillStyle = '#4a3a30'
      ctx.strokeStyle = '#1a120c'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(sx, sy, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,170,80,0.85)'
      ctx.beginPath()
      ctx.arc(sx - 2, sy + 2, 5, 0, Math.PI * 2)
      ctx.fill()
      // its target, a shadow that grows as it falls
      ctx.fillStyle = `rgba(0,0,0,${0.15 + (1 - k) * 0.25})`
      ctx.beginPath()
      ctx.ellipse(tx, ty, m.radius * CELL * (1 - k * 0.7), m.radius * CELL * 0.8 * (1 - k * 0.7), 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // impacts: a flash and a shock ring
    for (const im of sim.impacts) {
      const k = (t - im.t) / 3
      const x = im.x * CELL
      const y = im.y * CELL
      if (k < 0.15) {
        ctx.fillStyle = `rgba(255,240,200,${0.8 * (1 - k / 0.15)})`
        ctx.beginPath()
        ctx.arc(x, y, im.r * CELL * 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.strokeStyle = `rgba(255,220,160,${Math.max(0, 0.7 - k)})`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(x, y, im.r * CELL * (1 + k * 4), 0, Math.PI * 2)
      ctx.stroke()
      // smoke drifting up
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1 + im.t
        const d = im.r * CELL * (0.3 + k * 1.5)
        ctx.fillStyle = `rgba(60,55,50,${Math.max(0, 0.35 - k * 0.35)})`
        ctx.beginPath()
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d - k * 30, 10 + k * 30, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // rain: streaks over the cells that are being rained on
    for (const r of sim.rainfalls) {
      const k = (t - r.t) / r.duration
      if (k > 1) continue
      const fade = Math.min(1, (1 - k) * 4, k * 8)
      ctx.fillStyle = `rgba(120,140,160,${0.18 * fade})`
      ctx.beginPath()
      ctx.arc(r.x * CELL, r.y * CELL, r.r * CELL, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(210,225,240,${0.55 * fade})`
      ctx.lineWidth = 1
      for (let i = 0; i < 40; i++) {
        const a = hash2(i, r.id, 1) * Math.PI * 2
        const d = Math.sqrt(hash2(i, r.id, 2)) * r.r * CELL
        const fall = ((t * 3 + hash2(i, r.id, 3)) % 1) * 18
        const x = r.x * CELL + Math.cos(a) * d
        const y = r.y * CELL + Math.sin(a) * d - 9 + fall
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - 2, y + 7)
        ctx.stroke()
      }
    }
  }
}

