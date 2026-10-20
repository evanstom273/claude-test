import { artSize } from './validate'

/** A pointer on the canvas, in artwork units (x, y) and canvas pixels (sx, sy). */
export interface CanvasPointer {
  x: number
  y: number
  sx: number
  sy: number
  /** The artwork element under the pointer (never the root), if any. */
  target: Element | null
  shift: boolean
  alt: boolean
  mod: boolean
  touch: boolean
  time: number
}

export interface CanvasHandler {
  down(p: CanvasPointer): void
  move(p: CanvasPointer): void
  up(p: CanvasPointer): void
  /** Pointer moving with no button held (mouse only). */
  hover(p: CanvasPointer): void
  /** A second finger arrived: abandon whatever the tool was doing. */
  cancel(): void
}

/**
 * The canvas: shows the artwork on an artboard you can pan and zoom, and
 * passes pointer events in artwork coordinates to the current tool. Panning
 * is the hand tool, two fingers, the middle button, Space+drag or the wheel.
 * It lives in a shadow root so the artwork's own <style> and ids can't clash
 * with the studio's page. Tools draw handles and guides on the overlay, which
 * is in canvas pixels so lines stay crisp at any zoom.
 */
export class Preview {
  readonly host: HTMLDivElement
  readonly overlay: SVGGElement
  private viewport: HTMLDivElement
  private board: HTMLDivElement
  private grid: HTMLDivElement
  private rulerTop: HTMLCanvasElement
  private rulerLeft: HTMLCanvasElement
  private size = { width: 300, height: 150, viewBox: null as number[] | null }
  private zoom = 1
  private pan = { x: 0, y: 0 }
  private fitted = false
  private pointers = new Map<number, { x: number; y: number }>()
  private pinch: { dist: number; zoom: number; mid: { x: number; y: number } } | null = null
  private panning: number | null = null
  private toolDown: number | null = null
  private space = false
  hand = false
  root: SVGSVGElement | null = null
  handler: CanvasHandler | null = null
  rulers = false
  onZoom: (zoom: number) => void = () => {}
  /** The view moved (pan, zoom, new artwork): redraw anything on the overlay. */
  onView: () => void = () => {}
  onPointer: (x: number, y: number) => void = () => {}
  /** Pressing on a ruler: start dragging out a guide. */
  onRuler: (axis: 'x' | 'y', p: CanvasPointer) => void = () => {}

  constructor() {
    this.host = document.createElement('div')
    this.host.className = 'art-canvas'
    this.host.tabIndex = 0
    const root = this.host.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>
      :host { display: block; position: relative; overflow: hidden; background: #202026; touch-action: none; outline: none; }
      .viewport { position: absolute; inset: 0; }
      :host(.hand) .viewport { cursor: grab; }
      :host(.crosshair) .viewport { cursor: crosshair; }
      .viewport.dragging { cursor: grabbing; }
      .board { position: absolute; left: 0; top: 0; transform-origin: 0 0; box-shadow: 0 0 0 1px #0006, 0 6px 24px #0007;
        background: conic-gradient(#fff 25%, #e6e6ea 0 50%, #fff 0 75%, #e6e6ea 0) 0 0 / 16px 16px; }
      .board > svg { position: absolute; inset: 0; display: block; overflow: hidden; }
      .grid { position: absolute; inset: 0; pointer-events: none; display: none; }
      :host(.grid-on) .grid { display: block; }
      :host(.clean) .board { background: none; box-shadow: none; }
      :host(.clean) .grid, :host(.clean) .overlay { display: none; }
      .overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
      canvas.ruler { position: absolute; display: none; z-index: 2; background: #17171c; }
      :host(.rulers) canvas.ruler { display: block; }
      .rt { left: 0; top: 0; height: 18px; width: 100%; cursor: s-resize; }
      .rl { left: 0; top: 0; width: 18px; height: 100%; cursor: e-resize; }
    </style><div class="viewport"><div class="board"><div class="grid"></div></div></div>
    <svg class="overlay"><g></g></svg><canvas class="ruler rt"></canvas><canvas class="ruler rl"></canvas>`
    this.viewport = root.querySelector('.viewport')!
    this.board = root.querySelector('.board')!
    this.grid = root.querySelector('.grid')!
    this.overlay = root.querySelector('.overlay g')!
    this.rulerTop = root.querySelector('.rt')!
    this.rulerLeft = root.querySelector('.rl')!
    this.bindInput()
    new ResizeObserver(() => {
      if (!this.fitted) this.fit()
      else this.apply()
    }).observe(this.host)
  }

  /** Swap in a freshly parsed and cleaned artwork. */
  show(svg: SVGSVGElement) {
    const node = document.importNode(svg, true) as SVGSVGElement
    const size = artSize(node)
    const changed = size.width !== this.size.width || size.height !== this.size.height
    this.size = size
    node.style.width = `${size.width}px`
    node.style.height = `${size.height}px`
    this.board.querySelector('svg')?.remove()
    this.board.insertBefore(node, this.grid)
    this.root = node
    this.board.style.width = `${size.width}px`
    this.board.style.height = `${size.height}px`
    this.drawGrid()
    if (changed || !this.fitted) this.fit()
    else this.onView()
  }

  /** The displayed element with a given source index. */
  element(i: number): Element | null {
    if (!this.root) return null
    if (this.root.getAttribute('data-art-i') === String(i)) return this.root
    return this.root.querySelector(`[data-art-i="${i}"]`)
  }

  setHand(on: boolean) {
    this.hand = on
    this.host.classList.toggle('hand', on)
  }

  setCrosshair(on: boolean) {
    this.host.classList.toggle('crosshair', on)
  }

  setGrid(on: boolean) {
    this.host.classList.toggle('grid-on', on)
  }

  setRulers(on: boolean) {
    this.rulers = on
    this.host.classList.toggle('rulers', on)
    this.drawRulers()
  }

  /** Preview mode: just the artwork, as it will export, with no editor overlays. */
  setClean(on: boolean) {
    this.host.classList.toggle('clean', on)
  }

  get artSize() {
    return this.size
  }

  /** The artwork's own coordinate box (its viewBox, or 0 0 width height). */
  get artBox() {
    const vb = this.size.viewBox
    return vb ? { x: vb[0], y: vb[1], width: vb[2], height: vb[3] } : { x: 0, y: 0, width: this.size.width, height: this.size.height }
  }

  fit() {
    const r = this.host.getBoundingClientRect()
    if (!r.width || !r.height) return
    const pad = 24
    const z = Math.min((r.width - pad * 2) / this.size.width, (r.height - pad * 2) / this.size.height)
    this.zoom = Math.max(0.02, Math.min(64, z))
    this.pan = { x: (r.width - this.size.width * this.zoom) / 2, y: (r.height - this.size.height * this.zoom) / 2 }
    this.fitted = true
    this.apply()
  }

  /** Zoom so an artwork-space box fills the view. */
  fitBox(b: { x: number; y: number; width: number; height: number }) {
    const r = this.host.getBoundingClientRect()
    if (!r.width || !r.height || !b.width || !b.height) return
    const unit = this.mapping().s / this.zoom
    const pad = 40
    const z = Math.max(0.02, Math.min(64, Math.min((r.width - pad * 2) / (b.width * unit), (r.height - pad * 2) / (b.height * unit))))
    this.zoom = z
    const m = this.mapping()
    this.pan.x += r.width / 2 - (m.x + (b.x + b.width / 2) * m.s)
    this.pan.y += r.height / 2 - (m.y + (b.y + b.height / 2) * m.s)
    this.apply()
  }

  /** Zoom by a factor, keeping the point under (cx, cy) still. Defaults to the centre. */
  zoomBy(k: number, cx?: number, cy?: number) {
    this.zoomTo(this.zoom * k, cx, cy)
  }

  zoomTo(z: number, cx?: number, cy?: number) {
    const r = this.host.getBoundingClientRect()
    cx ??= r.width / 2
    cy ??= r.height / 2
    const nz = Math.max(0.02, Math.min(64, z))
    this.pan.x = cx - ((cx - this.pan.x) * nz) / this.zoom
    this.pan.y = cy - ((cy - this.pan.y) * nz) / this.zoom
    this.zoom = nz
    this.apply()
  }

  private apply() {
    this.board.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`
    this.onZoom(this.zoom)
    this.drawRulers()
    this.onView()
  }

  /** How artwork units map to canvas pixels: scale, and where the origin lands. */
  mapping() {
    const vb = this.size.viewBox
    const s = this.zoom * (vb ? Math.min(this.size.width / vb[2], this.size.height / vb[3]) : 1)
    const ox = vb ? (this.size.width - vb[2] * (s / this.zoom)) / 2 : 0
    const oy = vb ? (this.size.height - vb[3] * (s / this.zoom)) / 2 : 0
    return { s, x: this.pan.x + ox * this.zoom - (vb ? vb[0] * s : 0), y: this.pan.y + oy * this.zoom - (vb ? vb[1] * s : 0) }
  }

  /** Artwork coordinates of a canvas pixel. */
  toArt(px: number, py: number) {
    const m = this.mapping()
    return { x: (px - m.x) / m.s, y: (py - m.y) / m.s }
  }

  /** Canvas pixel of an artwork coordinate. */
  toScreen(x: number, y: number) {
    const m = this.mapping()
    return { x: m.x + x * m.s, y: m.y + y * m.s }
  }

  /** Artwork units per canvas pixel. */
  get unitsPerPx() {
    return 1 / this.mapping().s
  }

  /** Clear and redraw the overlay with SVG markup in canvas pixels. */
  drawOverlay(markup: string) {
    this.overlay.innerHTML = markup
  }

  /** A grid in the artwork's own units: fine lines every 10, stronger every 50. */
  private drawGrid() {
    const { width, viewBox } = this.size
    const unit = viewBox ? width / viewBox[2] : 1
    const ox = viewBox ? -viewBox[0] * unit : 0
    const oy = viewBox ? -viewBox[1] * (this.size.height / viewBox[3]) : 0
    const minor = 10 * unit
    const major = 50 * unit
    this.grid.style.background = [
      `linear-gradient(#3a6fd866 1px, transparent 1px) ${ox}px ${oy}px / ${major}px ${major}px`,
      `linear-gradient(90deg, #3a6fd866 1px, transparent 1px) ${ox}px ${oy}px / ${major}px ${major}px`,
      `linear-gradient(#3a6fd822 1px, transparent 1px) ${ox}px ${oy}px / ${minor}px ${minor}px`,
      `linear-gradient(90deg, #3a6fd822 1px, transparent 1px) ${ox}px ${oy}px / ${minor}px ${minor}px`,
    ].join(',')
  }

  /** Rulers along the top and left, in artwork units. */
  private drawRulers() {
    if (!this.rulers) return
    const r = this.host.getBoundingClientRect()
    const dpr = devicePixelRatio || 1
    const m = this.mapping()
    // pick a tick spacing that's about 60px apart on screen
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]
    const step = steps.find((s) => s * m.s >= 60) ?? 5000
    for (const [c, axis] of [[this.rulerTop, 'x'], [this.rulerLeft, 'y']] as const) {
      const len = axis === 'x' ? r.width : r.height
      c.width = (axis === 'x' ? len : 18) * dpr
      c.height = (axis === 'x' ? 18 : len) * dpr
      const g = c.getContext('2d')!
      g.scale(dpr, dpr)
      g.fillStyle = '#17171c'
      g.fillRect(0, 0, axis === 'x' ? len : 18, axis === 'x' ? 18 : len)
      g.strokeStyle = '#6a6a78'
      g.fillStyle = '#9a9aa6'
      g.font = '9px system-ui, sans-serif'
      g.lineWidth = 1
      const origin = axis === 'x' ? m.x : m.y
      const first = Math.floor(-origin / m.s / step) * step
      for (let v = first; origin + v * m.s < len; v += step / 5) {
        const p = Math.round(origin + v * m.s) + 0.5
        const major = Math.abs(v / step - Math.round(v / step)) < 1e-6
        const t = major ? 10 : 4
        g.beginPath()
        if (axis === 'x') {
          g.moveTo(p, 18)
          g.lineTo(p, 18 - t)
        } else {
          g.moveTo(18, p)
          g.lineTo(18 - t, p)
        }
        g.stroke()
        if (major) {
          const label = String(Math.round(v))
          if (axis === 'x') g.fillText(label, p + 2, 9)
          else {
            g.save()
            g.translate(9, p - 2)
            g.rotate(-Math.PI / 2)
            g.fillText(label, 0, 0)
            g.restore()
          }
        }
      }
    }
  }

  private bindInput() {
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = this.host.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const pointer = (e: PointerEvent): CanvasPointer => {
      const p = local(e)
      const a = this.toArt(p.x, p.y)
      const hit = (e.composedPath()[0] as Element)?.closest?.('[data-art-i]') ?? null
      return { x: a.x, y: a.y, sx: p.x, sy: p.y, target: hit && hit !== this.root ? hit : null, shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey, touch: e.pointerType === 'touch', time: e.timeStamp }
    }
    this.host.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        this.space = true
        this.host.classList.add('hand')
        e.preventDefault()
      }
    })
    this.host.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.space = false
        this.host.classList.toggle('hand', this.hand)
      }
    })
    for (const [c, axis] of [[this.rulerTop, 'x'], [this.rulerLeft, 'y']] as const) {
      c.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        this.viewport.setPointerCapture(e.pointerId)
        this.pointers.set(e.pointerId, local(e))
        this.toolDown = e.pointerId
        this.onRuler(axis, pointer(e))
      })
    }
    this.viewport.addEventListener('pointerdown', (e) => {
      this.host.focus({ preventScroll: true })
      this.viewport.setPointerCapture(e.pointerId)
      const p = local(e)
      this.pointers.set(e.pointerId, p)
      if (this.pointers.size === 2) {
        // a second finger turns whatever was happening into a pinch
        if (this.toolDown !== null) this.handler?.cancel()
        this.toolDown = null
        this.panning = null
        const [a, b] = [...this.pointers.values()]
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
        return
      }
      if (this.hand || this.space || e.button === 1) {
        this.panning = e.pointerId
        this.viewport.classList.add('dragging')
        return
      }
      if (e.button !== 0) return
      this.toolDown = e.pointerId
      this.handler?.down(pointer(e))
    })
    this.viewport.addEventListener('pointermove', (e) => {
      const p = local(e)
      const art = this.toArt(p.x, p.y)
      this.onPointer(art.x, art.y)
      const prev = this.pointers.get(e.pointerId)
      if (!prev) {
        if (e.pointerType === 'mouse') this.handler?.hover(pointer(e))
        return
      }
      this.pointers.set(e.pointerId, p)
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()]
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        this.pan.x += mid.x - this.pinch.mid.x
        this.pan.y += mid.y - this.pinch.mid.y
        this.pinch.mid = mid
        this.zoomTo((this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch.dist, mid.x, mid.y)
      } else if (this.panning === e.pointerId) {
        this.pan.x += p.x - prev.x
        this.pan.y += p.y - prev.y
        this.apply()
      } else if (this.toolDown === e.pointerId) this.handler?.move(pointer(e))
    })
    const up = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return
      this.pointers.delete(e.pointerId)
      if (this.toolDown === e.pointerId) {
        this.toolDown = null
        if (e.type === 'pointercancel') this.handler?.cancel()
        else this.handler?.up(pointer(e))
      }
      if (this.panning === e.pointerId) this.panning = null
      if (this.pointers.size < 2) this.pinch = null
      if (!this.pointers.size) this.viewport.classList.remove('dragging')
    }
    this.viewport.addEventListener('pointerup', up)
    this.viewport.addEventListener('pointercancel', up)
    // wheel scrolls; ctrl/cmd + wheel (and trackpad pinch) zooms at the pointer
    this.host.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        if (e.ctrlKey || e.metaKey) {
          const p = local(e)
          this.zoomBy(Math.exp(-e.deltaY * 0.01), p.x, p.y)
        } else {
          this.pan.x -= e.deltaX
          this.pan.y -= e.deltaY
          this.apply()
        }
      },
      { passive: false },
    )
  }
}
