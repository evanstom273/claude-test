import { CELL } from './render/creatureArt'
import { Renderer } from './render/renderer'
import { isPredator } from './sim/creature'
import type { Genome } from './sim/genome'
import { Simulation, TICK, type SimEvent, type Tool } from './sim/sim'

export interface SpeciesView {
  id: number
  name: string
  population: number
  hue: number
  diet: number
  history: number[]
  parent: string | null
  look: Genome
  extinct: boolean
}

export interface CreatureView {
  id: number
  species: SpeciesView
  generation: number
  age: number
  energy: number
  maxEnergy: number
  state: string
  genome: Genome
  children: number
  kills: number
  lineage: string[]
}

export interface Snapshot {
  time: number
  speed: number
  tool: Tool
  population: number
  species: SpeciesView[]
  extinctCount: number
  events: SimEvent[]
  selected: CreatureView | null
  selectedSpecies: number | null
  follow: boolean
}

export const SPEEDS = [0, 1, 3, 10]

/**
 * Glue between the simulation, the renderer and the UI: the loop, the
 * pointer and keyboard, and a snapshot for React a few times a second.
 */
export class Game {
  sim: Simulation
  renderer: Renderer
  speed = 1
  tool: Tool = 'inspect'
  selected: number | null = null
  selectedSpecies: number | null = null
  follow = false
  private acc = 0
  private raf = 0
  private last = 0
  private listeners = new Set<() => void>()
  private snap: Snapshot
  private snapTimer = 0
  private cursor: { x: number; y: number } | null = null
  private pointers = new Map<number, { x: number; y: number }>()
  private drag: { mode: 'pan' | 'tool' | 'pinch'; sx: number; sy: number; moved: number; dist?: number } | null = null
  private keys = new Set<string>()
  private detachFns: (() => void)[] = []

  constructor(public canvas: HTMLCanvasElement) {
    this.sim = new Simulation()
    this.renderer = new Renderer(canvas, this.sim.world)
    this.snap = this.buildSnapshot()
  }

  async load(onProgress: (k: number) => void) {
    this.renderer.resize()
    this.renderer.fitWorld()
    await this.renderer.load(onProgress)
  }

  start() {
    this.attach()
    this.last = performance.now()
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000))
      this.last = now
      this.frame(dt)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    for (const f of this.detachFns) f()
  }

  private frame(dt: number) {
    // fixed simulation ticks, as many as the speed asks for (capped so a slow phone doesn't spiral)
    this.acc += dt * this.speed
    let steps = 0
    while (this.acc >= TICK && steps < 30) {
      this.sim.step()
      this.acc -= TICK
      steps++
    }
    if (steps === 30) this.acc = 0
    // held brushes keep working while the pointer is down
    if (this.drag?.mode === 'tool' && this.cursor && ['raise', 'lower', 'plants', 'rain'].includes(this.tool)) this.useTool(dt)
    this.panKeys(dt)
    const sel = this.selected !== null ? this.sim.get(this.selected) : undefined
    if (this.selected !== null && !sel) this.selected = null
    if (sel && this.follow) {
      const r = this.renderer
      r.cam.x += (sel.x * CELL - r.cam.x) * Math.min(1, dt * 6)
      r.cam.y += (sel.y * CELL - r.cam.y) * Math.min(1, dt * 6)
    }
    this.renderer.update(this.sim, dt)
    this.renderer.draw(this.sim, this.speed === 0 ? 1 : Math.min(1, this.acc / TICK), {
      selected: this.selected,
      tool: this.tool,
      cursor: this.cursor,
      highlight: this.selectedSpecies,
    })
    this.snapTimer += dt
    if (this.snapTimer > 0.25) {
      this.snapTimer = 0
      this.publish()
    }
  }

  private panKeys(dt: number) {
    const k = (c: string) => this.keys.has(c)
    const dx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0)
    const dy = (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0)
    if (!dx && !dy) return
    const r = this.renderer
    r.cam.x += (dx * 600 * dt) / r.cam.zoom
    r.cam.y += (dy * 600 * dt) / r.cam.zoom
    this.follow = false
    r.clampCamera()
  }

  // ------------------------------------------------------------------- input

  private attach() {
    const c = this.canvas
    const onResize = () => this.renderer.resize()
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId)
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY })
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.drag = { mode: 'pinch', sx: (a.x + b.x) / 2, sy: (a.y + b.y) / 2, moved: 99, dist: Math.hypot(a.x - b.x, a.y - b.y) }
        return
      }
      const pan = e.button === 1 || e.button === 2 || this.tool === 'inspect'
      this.drag = { mode: pan ? 'pan' : 'tool', sx: e.offsetX, sy: e.offsetY, moved: 0 }
      this.cursor = this.renderer.toWorld(e.offsetX, e.offsetY)
      // one-shot tools fire on press
      if (!pan && (this.tool === 'spawn' || this.tool === 'meteor')) this.useTool(0)
    }
    const move = (e: PointerEvent) => {
      const prev = this.pointers.get(e.pointerId)
      this.cursor = this.renderer.toWorld(e.offsetX, e.offsetY)
      if (!prev) return
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY })
      const r = this.renderer
      if (this.drag?.mode === 'pinch' && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const before = r.toWorld(mx, my)
        r.cam.zoom *= dist / (this.drag.dist || dist)
        r.clampCamera()
        const after = r.toWorld(mx, my)
        r.cam.x += before.x - after.x - (mx - this.drag.sx) / r.cam.zoom
        r.cam.y += before.y - after.y - (my - this.drag.sy) / r.cam.zoom
        this.drag.sx = mx
        this.drag.sy = my
        this.drag.dist = dist
        this.follow = false
        r.clampCamera()
      } else if (this.drag?.mode === 'pan') {
        const dx = e.offsetX - prev.x
        const dy = e.offsetY - prev.y
        this.drag.moved += Math.abs(dx) + Math.abs(dy)
        if (this.drag.moved > 6) {
          r.cam.x -= dx / r.cam.zoom
          r.cam.y -= dy / r.cam.zoom
          this.follow = false
          r.clampCamera()
        }
      }
    }
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId)
      // a tap with the inspect tool picks a creature
      if (this.drag?.mode === 'pan' && this.drag.moved <= 6 && this.tool === 'inspect' && e.button === 0) {
        const w = this.renderer.toWorld(e.offsetX, e.offsetY)
        const c = this.sim.use('inspect', w.x / CELL, w.y / CELL, 0, null)
        this.selected = c?.id ?? null
        if (c) this.selectedSpecies = c.species.id
        this.publish()
      }
      if (this.pointers.size === 0) this.drag = null
      if (e.pointerType !== 'mouse') this.cursor = null
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = this.renderer
      const before = r.toWorld(e.offsetX, e.offsetY)
      r.cam.zoom *= Math.exp(-e.deltaY * 0.0015)
      r.clampCamera()
      const after = r.toWorld(e.offsetX, e.offsetY)
      r.cam.x += before.x - after.x
      r.cam.y += before.y - after.y
      r.clampCamera()
    }
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.type === 'keydown') {
        this.keys.add(e.code)
        if (e.code === 'Space') {
          e.preventDefault()
          this.setSpeed(this.speed === 0 ? 1 : 0)
        }
        const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code)
        if (n >= 0) this.setSpeed(SPEEDS[n])
      } else this.keys.delete(e.code)
    }
    const leave = () => {
      this.cursor = null
    }
    const ctxMenu = (e: Event) => e.preventDefault()
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
    c.addEventListener('pointerleave', leave)
    c.addEventListener('wheel', wheel, { passive: false })
    c.addEventListener('contextmenu', ctxMenu)
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', key)
    window.addEventListener('resize', onResize)
    this.detachFns.push(() => {
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointercancel', up)
      c.removeEventListener('pointerleave', leave)
      c.removeEventListener('wheel', wheel)
      c.removeEventListener('contextmenu', ctxMenu)
      window.removeEventListener('keydown', key)
      window.removeEventListener('keyup', key)
      window.removeEventListener('resize', onResize)
    })
  }

  private useTool(dt: number) {
    if (!this.cursor) return
    this.sim.use(this.tool, this.cursor.x / CELL, this.cursor.y / CELL, dt, this.selectedSpecies)
  }

  // ------------------------------------------------------------- UI controls

  setTool(t: Tool) {
    this.tool = t
    this.publish()
  }

  setSpeed(s: number) {
    this.speed = s
    this.publish()
  }

  selectSpecies(id: number | null) {
    this.selectedSpecies = id === this.selectedSpecies ? null : id
    this.publish()
  }

  deselect() {
    this.selected = null
    this.follow = false
    this.publish()
  }

  toggleFollow() {
    this.follow = !this.follow
    this.publish()
  }

  /** Jumps the camera to a species' most crowded spot. */
  findSpecies(id: number) {
    const members = this.sim.creatures.filter((c) => c.species.id === id)
    if (!members.length) return
    const c = members[Math.floor(members.length / 2)]
    this.selected = c.id
    this.renderer.cam.x = c.x * CELL
    this.renderer.cam.y = c.y * CELL
    this.renderer.cam.zoom = Math.max(this.renderer.cam.zoom, 1)
    this.publish()
  }

  // --------------------------------------------------------------- snapshots

  subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getSnapshot = () => this.snap

  private publish() {
    this.snap = this.buildSnapshot()
    for (const l of this.listeners) l()
  }

  private speciesView = (id: number): SpeciesView => {
    const s = this.sim.species.get(id)
    return {
      id: s.id,
      name: s.name,
      population: s.population,
      hue: s.look.hue,
      diet: s.look.diet,
      history: s.history,
      parent: s.parent !== null ? this.sim.species.get(s.parent).name : null,
      look: s.look,
      extinct: s.extinctAt !== null,
    }
  }

  private buildSnapshot(): Snapshot {
    const sim = this.sim
    const alive = sim.species.all.filter((s) => s.extinctAt === null && s.established).sort((a, b) => b.population - a.population)
    const c = this.selected !== null ? sim.get(this.selected) : undefined
    return {
      time: sim.time,
      speed: this.speed,
      tool: this.tool,
      population: sim.creatures.length,
      species: alive.map((s) => this.speciesView(s.id)),
      extinctCount: sim.species.all.filter((s) => s.extinctAt !== null && s.established).length,
      events: sim.events,
      selected: c
        ? {
            id: c.id,
            species: this.speciesView(c.species.id),
            generation: c.generation,
            age: c.age,
            energy: c.energy,
            maxEnergy: c.maxEnergy,
            state: c.state === 'graze' ? 'Grazing' : c.state === 'hunt' ? 'Hunting' : c.state === 'flee' ? 'Fleeing' : isPredator(c.genome) ? 'Prowling' : 'Wandering',
            genome: c.genome,
            children: c.children,
            kills: c.kills,
            lineage: sim.species.lineage(c.species.id).map((s) => s.name),
          }
        : null,
      selectedSpecies: this.selectedSpecies,
      follow: this.follow,
    }
  }
}
