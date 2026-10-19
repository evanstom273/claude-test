import { corners, isGraphic } from './geometry'
import { artSize } from './validate'

export type Tool = 'select' | 'hand'

/**
 * The canvas: shows the artwork on an artboard you can pan and zoom, and
 * reports taps and drags on its elements. It lives in a shadow root so the
 * artwork's own <style> and ids can't clash with the studio's page.
 */
export class Preview {
  readonly host: HTMLDivElement
  private viewport: HTMLDivElement
  private board: HTMLDivElement
  private grid: HTMLDivElement
  private outline: SVGPolygonElement
  private banner: HTMLDivElement
  private size = { width: 300, height: 150, viewBox: null as number[] | null }
  private zoom = 1
  private pan = { x: 0, y: 0 }
  private fitted = false
  private pointers = new Map<number, { x: number; y: number }>()
  private pinch: { dist: number; zoom: number; mid: { x: number; y: number } } | null = null
  private drag: { el: Element; start: { x: number; y: number }; moved: boolean } | null = null
  private selected: Element | null = null
  tool: Tool = 'select'
  root: SVGSVGElement | null = null
  onZoom: (zoom: number) => void = () => {}
  /** A tap on an element (or on nothing). deep = double-tap, for picking inside groups. */
  onTap: (el: Element | null, deep: boolean) => void = () => {}
  /** Dragging an element: dx, dy in artwork units since the drag began. */
  onDrag: (el: Element, dx: number, dy: number, done: boolean) => void = () => {}
  onPointer: (x: number, y: number) => void = () => {}

  constructor() {
    this.host = document.createElement('div')
    this.host.className = 'art-canvas'
    const root = this.host.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>
      :host { display: block; position: relative; overflow: hidden; background: #202026; touch-action: none; }
      .viewport { position: absolute; inset: 0; }
      :host(.hand) .viewport { cursor: grab; }
      .viewport.dragging { cursor: grabbing; }
      .board { position: absolute; left: 0; top: 0; transform-origin: 0 0; box-shadow: 0 0 0 1px #0006, 0 6px 24px #0007;
        background: conic-gradient(#fff 25%, #e6e6ea 0 50%, #fff 0 75%, #e6e6ea 0) 0 0 / 16px 16px; }
      .board > svg { position: absolute; inset: 0; display: block; overflow: hidden; }
      .grid { position: absolute; inset: 0; pointer-events: none; display: none; }
      :host(.grid-on) .grid { display: block; }
      :host(.clean) .board { background: none; box-shadow: none; }
      :host(.clean) .grid, :host(.clean) .overlay { display: none; }
      .overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
      .overlay polygon { fill: none; stroke: #3a8dff; stroke-width: 1.5; stroke-dasharray: 5 4; }
      .banner { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); padding: 6px 12px; border-radius: 999px; background: #7c4dffe6; color: #fff; font: 600 12px system-ui, sans-serif; pointer-events: none; }
      .banner[hidden] { display: none; }
    </style><div class="viewport"><div class="board"><div class="grid"></div></div></div>
    <svg class="overlay"><polygon/></svg><div class="banner" hidden>Previewing AI change</div>`
    this.viewport = root.querySelector('.viewport')!
    this.board = root.querySelector('.board')!
    this.grid = root.querySelector('.grid')!
    this.outline = root.querySelector('polygon')!
    this.banner = root.querySelector('.banner')!
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
    else this.drawSelection()
  }

  /** The displayed element with a given source index. */
  element(i: number) {
    return this.root?.querySelector(`[data-art-i="${i}"]`) ?? (this.root?.getAttribute('data-art-i') === String(i) ? this.root : null)
  }

  select(el: Element | null) {
    this.selected = el
    this.drawSelection()
  }

  setTool(t: Tool) {
    this.tool = t
    this.host.classList.toggle('hand', t === 'hand')
  }

  setGrid(on: boolean) {
    this.host.classList.toggle('grid-on', on)
  }

  /** Preview mode: just the artwork, as it will export, with no editor overlays. */
  setClean(on: boolean) {
    this.host.classList.toggle('clean', on)
  }

  setBanner(text: string | null) {
    this.banner.hidden = !text
    if (text) this.banner.textContent = text
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
    this.drawSelection()
  }

  /** How artwork units map to canvas pixels: scale, and where the origin lands. */
  private mapping() {
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

  drawSelection() {
    const el = this.selected
    if (!el || !this.root || !el.isConnected || !isGraphic(el)) {
      this.outline.setAttribute('points', '')
      return
    }
    const c = el === this.root ? null : corners(el, this.root)
    const m = this.mapping()
    const pts = c ?? [
      { x: this.size.viewBox?.[0] ?? 0, y: this.size.viewBox?.[1] ?? 0 },
      { x: (this.size.viewBox?.[0] ?? 0) + (this.size.viewBox?.[2] ?? this.size.width), y: this.size.viewBox?.[1] ?? 0 },
      { x: (this.size.viewBox?.[0] ?? 0) + (this.size.viewBox?.[2] ?? this.size.width), y: (this.size.viewBox?.[1] ?? 0) + (this.size.viewBox?.[3] ?? this.size.height) },
      { x: this.size.viewBox?.[0] ?? 0, y: (this.size.viewBox?.[1] ?? 0) + (this.size.viewBox?.[3] ?? this.size.height) },
    ]
    this.outline.setAttribute('points', pts.map((p) => `${(m.x + p.x * m.s).toFixed(1)},${(m.y + p.y * m.s).toFixed(1)}`).join(' '))
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

  private bindInput() {
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = this.host.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    let lastTap = { t: 0, x: 0, y: 0 }
    this.viewport.addEventListener('pointerdown', (e) => {
      this.viewport.setPointerCapture(e.pointerId)
      const p = local(e)
      this.pointers.set(e.pointerId, p)
      if (this.pointers.size === 2) {
        // a second finger turns any drag into a pinch
        if (this.drag?.moved) this.onDrag(this.drag.el, 0, 0, true)
        this.drag = null
        const [a, b] = [...this.pointers.values()]
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
        return
      }
      const hit = this.tool === 'select' ? (e.composedPath()[0] as Element).closest?.('[data-art-i]') : null
      const target = hit && hit !== this.root ? hit : null
      this.drag = target ? { el: target, start: p, moved: false } : null
      if (!target) this.viewport.classList.add('dragging')
      // taps are reported on the way down so selection feels instant
      const deep = e.timeStamp - lastTap.t < 350 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 10
      lastTap = { t: e.timeStamp, x: p.x, y: p.y }
      if (this.tool === 'select') this.onTap(target, deep)
    })
    this.viewport.addEventListener('pointermove', (e) => {
      const p = local(e)
      const art = this.toArt(p.x, p.y)
      this.onPointer(art.x, art.y)
      const prev = this.pointers.get(e.pointerId)
      if (!prev) return
      this.pointers.set(e.pointerId, p)
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()]
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        this.pan.x += mid.x - this.pinch.mid.x
        this.pan.y += mid.y - this.pinch.mid.y
        this.pinch.mid = mid
        this.zoomTo((this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch.dist, mid.x, mid.y)
      } else if (this.drag) {
        const d = { x: p.x - this.drag.start.x, y: p.y - this.drag.start.y }
        if (!this.drag.moved && Math.hypot(d.x, d.y) < 4) return
        this.drag.moved = true
        const s = this.mapping().s
        this.onDrag(this.drag.el, d.x / s, d.y / s, false)
      } else if (this.pointers.size === 1) {
        this.pan.x += p.x - prev.x
        this.pan.y += p.y - prev.y
        this.apply()
      }
    })
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId)
      if (this.drag && !this.pointers.size) {
        if (this.drag.moved) {
          const p = local(e)
          const s = this.mapping().s
          this.onDrag(this.drag.el, (p.x - this.drag.start.x) / s, (p.y - this.drag.start.y) / s, true)
        }
        this.drag = null
      }
      if (this.pointers.size < 2) this.pinch = null
      if (!this.pointers.size) this.viewport.classList.remove('dragging')
    }
    this.viewport.addEventListener('pointerup', up)
    this.viewport.addEventListener('pointercancel', up)
    // wheel scrolls; ctrl/cmd + wheel (and trackpad pinch) zooms at the pointer
    this.viewport.addEventListener(
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
