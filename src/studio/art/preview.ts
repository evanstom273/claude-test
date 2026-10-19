import { artSize } from './validate'

/**
 * The canvas: shows the artwork on an artboard you can pan and zoom. It lives
 * in a shadow root so the artwork's own <style> and ids can't clash with the
 * studio's page.
 */
export class Preview {
  readonly host: HTMLDivElement
  private viewport: HTMLDivElement
  private board: HTMLDivElement
  private grid: HTMLDivElement
  private size = { width: 300, height: 150, viewBox: null as number[] | null }
  private zoom = 1
  private pan = { x: 0, y: 0 }
  private fitted = false
  private pointers = new Map<number, { x: number; y: number }>()
  private pinch: { dist: number; zoom: number; mid: { x: number; y: number } } | null = null
  onZoom: (zoom: number) => void = () => {}

  constructor() {
    this.host = document.createElement('div')
    this.host.className = 'art-canvas'
    const root = this.host.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>
      :host { display: block; position: relative; overflow: hidden; background: #2b2b31; touch-action: none; }
      .viewport { position: absolute; inset: 0; cursor: grab; }
      .viewport.dragging { cursor: grabbing; }
      .board { position: absolute; left: 0; top: 0; transform-origin: 0 0; box-shadow: 0 0 0 1px #0006, 0 6px 24px #0007;
        background: conic-gradient(#fff 25%, #e6e6ea 0 50%, #fff 0 75%, #e6e6ea 0) 0 0 / 16px 16px; }
      .board > svg { position: absolute; inset: 0; display: block; overflow: hidden; }
      .grid { position: absolute; inset: 0; pointer-events: none; display: none; }
      :host(.grid-on) .grid { display: block; }
      :host(.clean) .board { background: none; box-shadow: none; }
      :host(.clean) .grid { display: none; }
    </style><div class="viewport"><div class="board"><div class="grid"></div></div></div>`
    this.viewport = root.querySelector('.viewport')!
    this.board = root.querySelector('.board')!
    this.grid = root.querySelector('.grid')!
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
    this.board.style.width = `${size.width}px`
    this.board.style.height = `${size.height}px`
    this.drawGrid()
    if (changed || !this.fitted) this.fit()
  }

  setGrid(on: boolean) {
    this.host.classList.toggle('grid-on', on)
  }

  /** Preview mode: just the artwork, as it will export, with no editor overlays. */
  setClean(on: boolean) {
    this.host.classList.toggle('clean', on)
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
    const r = this.host.getBoundingClientRect()
    this.zoomTo(this.zoom * k, cx ?? r.width / 2, cy ?? r.height / 2)
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
    const local = (e: PointerEvent | WheelEvent) => {
      const r = this.host.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    // drag to pan; two fingers to pinch-zoom
    this.viewport.addEventListener('pointerdown', (e) => {
      this.viewport.setPointerCapture(e.pointerId)
      this.pointers.set(e.pointerId, local(e))
      this.viewport.classList.add('dragging')
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
      }
    })
    this.viewport.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId)
      if (!prev) return
      const p = local(e)
      this.pointers.set(e.pointerId, p)
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()]
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        this.pan.x += mid.x - this.pinch.mid.x
        this.pan.y += mid.y - this.pinch.mid.y
        this.pinch.mid = mid
        this.zoomTo((this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch.dist, mid.x, mid.y)
      } else if (this.pointers.size === 1) {
        this.pan.x += p.x - prev.x
        this.pan.y += p.y - prev.y
        this.apply()
      }
    })
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId)
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
    this.viewport.addEventListener('dblclick', () => this.fit())
  }
}
