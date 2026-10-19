import type { Creature } from '../sim/creature'
import { hash2 } from '../sim/rng'
import type { Simulation, Tool } from '../sim/sim'
import type { Species } from '../sim/species'
import { Biome, CHUNK, type World } from '../sim/world'
import { bake, inBatches } from './bake'
import { CELL, creatureSvg, FRAMES, ROTATIONS, spriteSize } from './creatureArt'
import { crownSvg, tuftSvg } from './plantArt'
import { paintTerrain } from './terrain'

/** Detail levels for terrain tiles: pixels per world pixel. */
const LEVELS = [1, 0.5, 0.25]
/** The overview covers the whole map at this many pixels per cell. */
const OVERVIEW_PX = 2
/** Tiles are thrown away (oldest first) once they hold more than this many pixels. */
const TILE_BUDGET = 9_000_000
/** Milliseconds per frame spent painting tiles, so panning never stalls. */
const PAINT_MS = 6
/** How sharp creature sprites are baked relative to world pixels. */
const SPRITE_SCALE = 1.5
/** Below this many screen pixels across, creatures are drawn as dots. */
const DOT_BELOW = 9

interface Tile {
  key: string
  cx: number
  cy: number
  level: number
  /** Just the land, painted at half the tile's detail (it's all soft gradients) and kept. */
  terrain: HTMLCanvasElement | null
  /** Terrain with grass and bushes; padded so plants can spill over the edges. */
  ground: HTMLCanvasElement | null
  /** Tree crowns, drawn over the creatures. */
  canopy: HTMLCanvasElement | null
  hasCanopy: boolean
  /** Terrain changed since painting. */
  stale: boolean
  /** When its plants were last drawn (sim time). */
  floraAt: number
  used: number
}

interface SpeciesSprites {
  version: number
  /** [rotation][frame] */
  frames: HTMLCanvasElement[][]
  size: number
  lookSize: number
}

interface Stamp {
  img: HTMLCanvasElement
  size: number
}

export interface Camera {
  x: number
  y: number
  zoom: number
}

export class Renderer {
  ctx: CanvasRenderingContext2D
  cam: Camera = { x: 0, y: 0, zoom: 1 }
  dpr = 1
  private overview = document.createElement('canvas')
  private overviewDirty = new Set<number>()
  private tiles = new Map<string, Tile>()
  private tilePixels = 0
  private scratch = document.createElement('canvas')
  private sprites = new Map<number, SpeciesSprites>()
  private baking = new Set<number>()
  private dotColour = new Map<number, string>()
  private trees: Stamp[] = []
  private bushes: Stamp[] = []
  private tufts: Stamp[] = []
  private frameNo = 0
  private overviewTimer = 0
  private overviewCursor = 0

  constructor(
    public canvas: HTMLCanvasElement,
    private world: World,
  ) {
    this.ctx = canvas.getContext('2d')!
  }

  async load(onProgress: (k: number) => void) {
    const w = this.world
    const jobs: (() => Promise<void>)[] = []
    for (let i = 0; i < 6; i++) {
      const t = crownSvg(100 + i, CELL * (2.2 + (i % 3) * 0.4), 105 + i * 6, 'tree')
      jobs.push(() => bake(t.svg, t.size, t.size, 1).then((img) => void this.trees.push({ img, size: t.size })))
      const b = crownSvg(200 + i, CELL * 1.2, 95 + i * 5, 'bush')
      jobs.push(() => bake(b.svg, b.size, b.size, 1).then((img) => void this.bushes.push({ img, size: b.size })))
      const tf = tuftSvg(300 + i, CELL * 1.1, 85 + i * 6)
      jobs.push(() => bake(tf.svg, tf.size, tf.size, 1).then((img) => void this.tufts.push({ img, size: tf.size })))
    }
    await inBatches(jobs)
    // the overview: the whole island, small, painted chunk by chunk
    const n = w.chunks
    this.overview.width = this.overview.height = w.size * OVERVIEW_PX
    for (let i = 0; i < n * n; i++) {
      this.paintOverview(i)
      onProgress((i + 1) / (n * n))
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0))
    }
    w.dirty.clear()
  }

  // ------------------------------------------------------------------ painting

  private paintOverview(id: number) {
    const w = this.world
    const n = w.chunks
    const cx = id % n
    const cy = Math.floor(id / n)
    const scale = OVERVIEW_PX / CELL
    paintTerrain(w, cx, cy, this.scratch, scale)
    const o = this.overview.getContext('2d')!
    const span = CHUNK * OVERVIEW_PX
    o.drawImage(this.scratch, cx * span, cy * span)
    // trees as dark dots, so forests read even from far away
    for (let y = 0; y < CHUNK; y++)
      for (let x = 0; x < CHUNK; x++) {
        const gx = cx * CHUNK + x
        const gy = cy * CHUNK + y
        if (!w.inBounds(gx, gy)) continue
        const i = w.idx(gx, gy)
        if (w.biome[i] === Biome.Forest && w.plants[i] > 0.35 && hash2(gx, gy, 41) < 0.6) {
          o.fillStyle = hash2(gx, gy, 42) < 0.5 ? '#2c4a2a' : '#3d6436'
          o.fillRect(gx * OVERVIEW_PX, gy * OVERVIEW_PX, OVERVIEW_PX, OVERVIEW_PX)
        }
      }
  }

  private tile(cx: number, cy: number, level: number) {
    const key = `${cx},${cy},${level}`
    let t = this.tiles.get(key)
    if (!t) {
      t = { key, cx, cy, level, terrain: null, ground: null, canopy: null, hasCanopy: false, stale: true, floraAt: -1, used: 0 }
      this.tiles.set(key, t)
    }
    t.used = this.frameNo
    return t
  }

  /** Paints a tile's terrain and plants at its level of detail. */
  private paintTile(t: Tile, time: number) {
    const w = this.world
    const scale = LEVELS[t.level]
    const span = CHUNK * CELL
    const pad = CELL * 2
    const full = Math.round((span + pad * 2) * scale)
    if (!t.ground) {
      t.ground = document.createElement('canvas')
      t.ground.width = t.ground.height = full
      this.tilePixels += full * full
    }
    if (t.stale || !t.terrain) {
      if (!t.terrain) {
        t.terrain = document.createElement('canvas')
        this.tilePixels += Math.round(span * scale * 0.5) ** 2
      }
      paintTerrain(w, t.cx, t.cy, t.terrain, scale * 0.5)
    }
    const g = t.ground.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, full, full)
    g.imageSmoothingEnabled = true
    g.drawImage(t.terrain, Math.round(pad * scale), Math.round(pad * scale), Math.round(span * scale), Math.round(span * scale))
    g.setTransform(scale, 0, 0, scale, 0, 0)
    // tree crowns go on their own layer when close enough to hide creatures under
    const separateCanopy = t.level <= 1
    let k: CanvasRenderingContext2D | null = null
    if (separateCanopy) {
      if (!t.canopy) {
        t.canopy = document.createElement('canvas')
        t.canopy.width = t.canopy.height = full
        this.tilePixels += full * full
      }
      k = t.canopy.getContext('2d')!
      k.setTransform(1, 0, 0, 1, 0, 0)
      k.clearRect(0, 0, full, full)
      k.setTransform(scale, 0, 0, scale, 0, 0)
    }
    t.hasCanopy = false
    for (let y = 0; y < CHUNK; y++)
      for (let x = 0; x < CHUNK; x++) {
        const gx = t.cx * CHUNK + x
        const gy = t.cy * CHUNK + y
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
          const st = this.trees[Math.floor(h2 * this.trees.length)]
          const s = st.size * (0.55 + p * 0.5)
          ;(k ?? g).drawImage(st.img, px - s / 2, py - s / 2, s, s)
          t.hasCanopy = !!k
        } else if (t.level === 2) {
          continue // grass and bushes are too small to see from here
        } else if ((b === Biome.Grass || b === Biome.Forest) && p > 0.55 && h1 < 0.1) {
          const st = this.bushes[Math.floor(h2 * this.bushes.length)]
          const s = st.size * (0.6 + p * 0.5)
          g.drawImage(st.img, px - s / 2, py - s / 2, s, s)
        } else if ((b === Biome.Grass || b === Biome.Hills || b === Biome.Forest) && h1 < 0.45 * p) {
          const st = this.tufts[Math.floor(h2 * this.tufts.length)]
          const s = st.size * (0.5 + p * 0.6)
          g.drawImage(st.img, px - s / 2, py - s / 2, s, s)
        }
      }
    t.stale = false
    t.floraAt = time
  }

  private evict(visible: Set<string>) {
    if (this.tilePixels <= TILE_BUDGET) return
    const old = [...this.tiles.values()].filter((t) => !visible.has(t.key)).sort((a, b) => a.used - b.used)
    for (const t of old) {
      if (this.tilePixels <= TILE_BUDGET * 0.8) break
      for (const c of [t.ground, t.canopy, t.terrain]) if (c) this.tilePixels -= c.width * c.height
      this.tiles.delete(t.key)
    }
  }

  private async bakeSpecies(sp: Species) {
    if (this.baking.has(sp.id) || this.baking.size >= 2) return
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
    // a couple at a time, so a new species never causes a stall
    await inBatches(jobs, 2)
    this.sprites.set(sp.id, { version, frames, size, lookSize: g.size })
    this.baking.delete(sp.id)
  }

  /** Keeps caches current: reshaped land, growing plants, and pictures of new species. */
  update(sim: Simulation, dt: number) {
    const w = this.world
    for (const id of w.dirty) {
      this.overviewDirty.add(id)
      const cx = id % w.chunks
      const cy = Math.floor(id / w.chunks)
      for (let l = 0; l < LEVELS.length; l++) {
        const t = this.tiles.get(`${cx},${cy},${l}`)
        if (t) t.stale = true
      }
    }
    w.dirty.clear()
    // the overview: reshaped chunks straight away, plants slowly in the background
    for (const id of this.overviewDirty) {
      this.paintOverview(id)
      this.overviewDirty.delete(id)
      break
    }
    this.overviewTimer += dt
    if (this.overviewTimer > 0.25) {
      this.overviewTimer = 0
      this.overviewDirty.add(this.overviewCursor++ % (w.chunks * w.chunks))
    }
    // pictures for species that have properly arrived (one-offs borrow their parent's)
    const living = new Set<number>()
    for (const c of sim.creatures) living.add(c.species.id)
    for (const id of living) {
      const sp = sim.species.get(id)
      if (!sp.established) continue
      const have = this.sprites.get(id)
      if (!have || have.version !== sp.lookVersion) void this.bakeSpecies(sp)
    }
  }

  spritesFor(sp: Species, sim: Simulation): SpeciesSprites | null {
    let s: Species | undefined = sp
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

  toWorld(sx: number, sy: number) {
    const { cam } = this
    return { x: cam.x + (sx - this.canvas.clientWidth / 2) / cam.zoom, y: cam.y + (sy - this.canvas.clientHeight / 2) / cam.zoom }
  }

  toScreen(wx: number, wy: number) {
    const { cam } = this
    return { x: (wx - cam.x) * cam.zoom + this.canvas.clientWidth / 2, y: (wy - cam.y) * cam.zoom + this.canvas.clientHeight / 2 }
  }

  get minZoom() {
    const size = this.world.size * CELL
    return (Math.min(this.canvas.clientWidth, this.canvas.clientHeight) / size) * 0.9
  }

  fitWorld() {
    const size = this.world.size * CELL
    this.cam.x = size / 2
    this.cam.y = size / 2
    this.cam.zoom = this.minZoom * 1.15
  }

  clampCamera() {
    const size = this.world.size * CELL
    this.cam.zoom = Math.max(this.minZoom, Math.min(3, this.cam.zoom))
    this.cam.x = Math.max(0, Math.min(size, this.cam.x))
    this.cam.y = Math.max(0, Math.min(size, this.cam.y))
  }

  // -------------------------------------------------------------------- draw

  draw(sim: Simulation, alpha: number, view: { selected: number | null; tool: Tool; cursor: { x: number; y: number } | null; highlight: number | null }) {
    const { ctx, cam } = this
    const w = this.world
    this.frameNo++
    const cw = this.canvas.clientWidth
    const ch = this.canvas.clientHeight
    const k = this.dpr * cam.zoom
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#1d3f58'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(k, 0, 0, k, this.dpr * (cw / 2 - cam.x * cam.zoom), this.dpr * (ch / 2 - cam.y * cam.zoom))
    ctx.imageSmoothingEnabled = true
    // 'high' smoothing is far too slow to scale whole screens of terrain every frame
    ctx.imageSmoothingQuality = 'low'
    const worldPx = w.size * CELL

    // pick the detail level the zoom needs; very far out, the overview alone will do
    const density = k
    const level = density >= 0.7 ? 0 : density >= 0.35 ? 1 : density >= 0.15 ? 2 : -1
    const view0 = this.toWorld(0, 0)
    const view1 = this.toWorld(cw, ch)
    const span = CHUNK * CELL
    const pad = CELL * 2
    const n = w.chunks
    const cx0 = Math.max(0, Math.floor(view0.x / span))
    const cy0 = Math.max(0, Math.floor(view0.y / span))
    const cx1 = Math.min(n - 1, Math.floor(view1.x / span))
    const cy1 = Math.min(n - 1, Math.floor(view1.y / span))
    const shown: Tile[] = []
    const visible = new Set<string>()
    // far out, the overview alone is the whole picture
    if (level < 0) ctx.drawImage(this.overview, 0, 0, worldPx, worldPx)
    if (level >= 0) {
      // paint what's missing, nearest the middle of the screen first, within a time budget
      const want: Tile[] = []
      let oldest: Tile | null = null as Tile | null
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          const t = this.tile(cx, cy, level)
          visible.add(t.key)
          if (!t.ground || t.stale) want.push(t)
          else if (sim.time - t.floraAt > 10 && (!oldest || t.floraAt < oldest.floraAt)) oldest = t
          shown.push(t)
        }
      want.sort((a, b) => (a.ground ? 1 : 0) - (b.ground ? 1 : 0) || Math.hypot(a.cx * span - cam.x, a.cy * span - cam.y) - Math.hypot(b.cx * span - cam.x, b.cy * span - cam.y))
      const start = performance.now()
      for (const t of want) {
        if (performance.now() - start > PAINT_MS) break
        this.paintTile(t, sim.time)
      }
      // growing plants: refresh the stalest tile now and then
      if (oldest && performance.now() - start < PAINT_MS * 0.5) this.paintTile(oldest, sim.time)
      this.evict(visible)
      // the overview fills in only where detail hasn't been painted yet
      for (const t of shown) {
        if (t.ground) continue
        const os = CHUNK * OVERVIEW_PX
        ctx.drawImage(this.overview, t.cx * os, t.cy * os, os, os, t.cx * span, t.cy * span, span + 1 / k, span + 1 / k)
      }
      const sc = LEVELS[level]
      const p = Math.round(pad * sc)
      const inner = Math.round(span * sc)
      // stretched by a screen pixel so neighbouring tiles overlap and no seams show
      const over = 1 / k
      for (const t of shown) if (t.ground) ctx.drawImage(t.ground, p, p, inner, inner, t.cx * span, t.cy * span, span + over, span + over)
      // plants spill over tile edges: draw each tile's border strips on top
      const full = t0full(sc)
      for (const t of shown) {
        if (!t.ground) continue
        const x = t.cx * span - pad
        const y = t.cy * span - pad
        ctx.drawImage(t.ground, 0, 0, full, p, x, y, span + pad * 2, pad)
        ctx.drawImage(t.ground, 0, full - p, full, p, x, y + span + pad, span + pad * 2, pad)
        ctx.drawImage(t.ground, 0, p, p, inner, x, y + pad, pad, span)
        ctx.drawImage(t.ground, full - p, p, p, inner, x + span + pad, y + pad, pad, span)
      }
      function t0full(s: number) {
        return Math.round((span + pad * 2) * s)
      }
    }

    // births: a small ring of light
    for (const b of sim.births) {
      const t = sim.time - b.t
      ctx.strokeStyle = `rgba(255,248,210,${(1 - t) * 0.8})`
      ctx.lineWidth = 1.5 / Math.max(0.5, cam.zoom)
      ctx.beginPath()
      ctx.arc(b.x * CELL, b.y * CELL, 4 + t * 10, 0, Math.PI * 2)
      ctx.stroke()
    }

    // creatures
    const vx0 = view0.x / CELL - 3
    const vy0 = view0.y / CELL - 3
    const vx1 = view1.x / CELL + 3
    const vy1 = view1.y / CELL + 3
    for (const c of sim.creatures) {
      const x = c.px + (c.x - c.px) * alpha
      const y = c.py + (c.y - c.py) * alpha
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue
      this.drawCreature(c, x, y, alpha, sim, view.highlight === c.species.id, k)
    }

    // canopy over the creatures, a little see-through so the forest isn't a black box
    if (level >= 0 && level <= 1) {
      ctx.globalAlpha = 0.93
      for (const t of shown) if (t.hasCanopy && t.canopy) ctx.drawImage(t.canopy, t.cx * span - pad, t.cy * span - pad, span + pad * 2, span + pad * 2)
      ctx.globalAlpha = 1
    }

    const sel = view.selected !== null ? sim.get(view.selected) : undefined
    if (sel) {
      const x = (sel.px + (sel.x - sel.px) * alpha) * CELL
      const y = (sel.py + (sel.y - sel.py) * alpha) * CELL
      ctx.strokeStyle = 'rgba(227,197,128,0.9)'
      ctx.lineWidth = 2 / cam.zoom
      ctx.beginPath()
      ctx.arc(x, y, sel.radius * CELL + 6 / Math.min(1, cam.zoom), 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([4 / cam.zoom, 6 / cam.zoom])
      ctx.strokeStyle = 'rgba(227,197,128,0.35)'
      ctx.beginPath()
      ctx.arc(x, y, sel.genome.sense * CELL, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    this.drawWeather(sim)

    if (view.cursor && view.tool !== 'inspect') {
      const r = { raise: 5, lower: 5, plants: 4, rain: 7, spawn: 1.5, meteor: 5 }[view.tool] * CELL
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 1.5 / cam.zoom
      ctx.beginPath()
      ctx.arc(view.cursor.x, view.cursor.y, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  private drawCreature(c: Creature, x: number, y: number, alpha: number, sim: Simulation, highlight: boolean, k: number) {
    const ctx = this.ctx
    const da = Math.atan2(Math.sin(c.angle - c.pa), Math.cos(c.angle - c.pa))
    const a = c.pa + da * alpha
    const grow = Math.min(1, 0.55 + c.age / 40)
    const r = c.radius * CELL * grow
    // too small to make out: a dot in the species' colour
    if (r * 2 * k < DOT_BELOW) {
      let col = this.dotColour.get(c.species.id)
      if (!col) {
        col = `hsl(${c.species.look.hue.toFixed(0)} 45% 52%)`
        this.dotColour.set(c.species.id, col)
      }
      ctx.fillStyle = highlight ? '#e3c580' : col
      const d = Math.max(r * 1.6, 2 / k)
      ctx.fillRect(x * CELL - d / 2, y * CELL - d / 2, d, d)
      return
    }
    const sp = this.spritesFor(c.species, sim)
    if (!sp) {
      ctx.fillStyle = `hsl(${c.genome.hue} 40% 45%)`
      ctx.beginPath()
      ctx.arc(x * CELL, y * CELL, r, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    // nearest drawn facing, then turned the last few degrees
    const step = (Math.PI * 2) / ROTATIONS
    const rot = ((Math.round(a / step) % ROTATIONS) + ROTATIONS) % ROTATIONS
    const rest = Math.atan2(Math.sin(a - rot * step), Math.cos(a - rot * step))
    const frame = c.moving ? Math.floor(c.stride * FRAMES) % FRAMES : 0
    const img = sp.frames[rot][frame]
    if (!img) return
    const s = sp.size * (c.genome.size / sp.lookSize) * grow
    if (highlight) {
      ctx.fillStyle = 'rgba(227,197,128,0.35)'
      ctx.beginPath()
      ctx.arc(x * CELL, y * CELL, r + 5, 0, Math.PI * 2)
      ctx.fill()
    }
    if (Math.abs(rest) > 0.01) {
      ctx.save()
      ctx.translate(x * CELL, y * CELL)
      ctx.rotate(rest)
      ctx.drawImage(img, -s / 2, -s / 2, s, s)
      ctx.restore()
    } else ctx.drawImage(img, x * CELL - s / 2, y * CELL - s / 2, s, s)
  }

  private drawWeather(sim: Simulation) {
    const ctx = this.ctx
    const t = sim.time
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
      ctx.fillStyle = `rgba(0,0,0,${0.15 + (1 - k) * 0.25})`
      ctx.beginPath()
      ctx.ellipse(tx, ty, m.radius * CELL * (1 - k * 0.7), m.radius * CELL * 0.8 * (1 - k * 0.7), 0, 0, Math.PI * 2)
      ctx.fill()
    }
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
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1 + im.t
        const d = im.r * CELL * (0.3 + k * 1.5)
        ctx.fillStyle = `rgba(60,55,50,${Math.max(0, 0.35 - k * 0.35)})`
        ctx.beginPath()
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d - k * 30, 10 + k * 30, 0, Math.PI * 2)
        ctx.fill()
      }
    }
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
