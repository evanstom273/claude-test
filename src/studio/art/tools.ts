import { applyRoot, corners, isGraphic, ownMatrix, rootBox, toRoot, transformString, unionBox, type Box } from './geometry'
import { loadPaper } from './ops'
import { nearestOnSegment, parsePath, polygonPoints, shapeToPath, splitSegment, writePath, type PathNode, type SubPath } from './paths'
import type { CanvasHandler, CanvasPointer, Preview } from './preview'
import type { SnapLine } from './snap'
import type { SrcElement } from './sourceMap'

/**
 * Canvas tools. Each tool turns pointer events into edits: it previews on
 * the canvas while you drag (by changing the displayed elements directly),
 * and writes to the source once, when you let go.
 */

export type ToolName = 'select' | 'node' | 'rect' | 'ellipse' | 'line' | 'polygon' | 'star' | 'text' | 'pen' | 'pencil' | 'eyedropper' | 'hand'

export interface DrawStyle {
  fill: string
  stroke: string
  strokeWidth: number
}

export interface ToolHost {
  preview: Preview
  els(): SrcElement[]
  valid(): boolean
  selection(): number[]
  select(is: number[], reveal?: boolean): void
  /** Write new transforms for elements (by index) as one undo step. */
  commitTransforms(items: { i: number; m: DOMMatrix }[]): void
  /** Write an attribute on one element. */
  setAttr(i: number, name: string, value: string | null): void
  /** Replace an element's path data (converting a basic shape to a path first). */
  setPath(i: number, d: string): void
  /** Insert new markup in root coordinates into the current layer, and select it. */
  insert(markup: string): void
  isLocked(el: Element): boolean
  snapPoint(x: number, y: number, ignore?: Element[]): { x: number; y: number; lines: SnapLine[] }
  snapMove(box: Box, dx: number, dy: number, ignore: Element[]): { dx: number; dy: number; lines: SnapLine[] }
  guides(): { x: number[]; y: number[] }
  setGuides(g: { x: number[]; y: number[] }): void
  style(): DrawStyle
  shapeOptions(): { sides: number; points: number; inner: number }
  setTool(t: ToolName): void
  /** Something changed that the inspector and overlay should show. */
  changed(): void
  /** Eyedropper picked a style from an element. */
  pick(el: Element): void
  uniqueId(base: string): string
  /** Markup the studio draws under the tools' own (guides, perspective). */
  overlayExtra(): string
}

const r2 = (n: number) => Math.round(n * 100) / 100
const HANDLE = 5

interface Handle {
  kind: 'resize' | 'rotate'
  /** For resize: which way it pulls, -1/0/1 on each axis. */
  hx: number
  hy: number
  x: number
  y: number
}

export class Tools implements CanvasHandler {
  tool: ToolName = 'select'
  private lines: SnapLine[] = []
  private feedback = ''
  // select tool state
  private mode: null | 'move' | 'resize' | 'rotate' | 'marquee' | 'guide' = null
  private start = { x: 0, y: 0, sx: 0, sy: 0 }
  private bases: { i: number; el: SVGGraphicsElement; m: DOMMatrix }[] = []
  private box: Box | null = null
  private handle: Handle | null = null
  private lastTap = { t: 0, target: null as Element | null }
  private marquee: Box | null = null
  private guide: { axis: 'x' | 'y'; index: number } | null = null
  // drawing tools
  private drawStart: { x: number; y: number } | null = null
  private drawNow: { x: number; y: number } | null = null
  private pen: PathNode[] = []
  private penDrag = false
  private hoverAt: { x: number; y: number } | null = null
  private pencil: { x: number; y: number }[] = []
  // node tool
  private nodeEl: number | null = null
  private subs: SubPath[] = []
  private nodeSel = new Set<string>()
  private nodeDrag: null | { kind: 'node' | 'in' | 'out'; key: string; last: { x: number; y: number } } = null
  private nodeMoved = false
  /** The last tap in the node tool: a double-tap is two quick taps on the same spot with no drag between. */
  private nodeTap = { t: 0, key: '' }

  constructor(private h: ToolHost) {}

  private get root() {
    return this.h.preview.root
  }

  private tol(touch: boolean) {
    return (touch ? 16 : 8) * this.h.preview.unitsPerPx
  }

  setTool(t: ToolName) {
    if (this.tool === 'pen' && t !== 'pen') this.finishPen()
    this.tool = t
    this.mode = null
    this.feedback = ''
    this.lastTap = { t: 0, target: null }
    this.h.preview.setHand(t === 'hand')
    this.h.preview.setCrosshair(!['select', 'node', 'hand'].includes(t))
    if (t === 'node') this.enterNode()
    else this.nodeEl = null
    this.draw()
  }

  // ---- selection helpers ----

  private selected(): { i: number; el: SVGGraphicsElement }[] {
    const els = this.h.els()
    const set = new Set(this.h.selection())
    return this.h
      .selection()
      .filter((i) => i !== 0)
      .filter((i) => {
        for (let p = els[i]?.parent; p; p = p.parent) if (set.has(p.i)) return false
        return true
      })
      .map((i) => ({ i, el: this.h.preview.element(i) }))
      .filter((x): x is { i: number; el: SVGGraphicsElement } => !!x.el && isGraphic(x.el))
  }

  selectionBox(): Box | null {
    const root = this.root
    if (!root) return null
    return unionBox(this.selected().map((x) => x.el), root)
  }

  private topOf(el: Element) {
    let t = el
    while (t.parentNode instanceof Element && t.parentNode !== this.root) t = t.parentNode
    return t
  }

  private index(el: Element) {
    const v = el.getAttribute('data-art-i')
    return v === null ? null : +v
  }

  private handles(): Handle[] {
    const b = this.selectionBox()
    if (!b) return []
    const p = this.h.preview
    const a = p.toScreen(b.x, b.y)
    const z = p.toScreen(b.x + b.width, b.y + b.height)
    const out: Handle[] = []
    for (const hy of [-1, 0, 1])
      for (const hx of [-1, 0, 1]) {
        if (!hx && !hy) continue
        out.push({ kind: 'resize', hx, hy, x: hx < 0 ? a.x : hx > 0 ? z.x : (a.x + z.x) / 2, y: hy < 0 ? a.y : hy > 0 ? z.y : (a.y + z.y) / 2 })
      }
    out.push({ kind: 'rotate', hx: 0, hy: -1, x: (a.x + z.x) / 2, y: a.y - 28 })
    return out
  }

  // ---- pointer events ----

  down(p: CanvasPointer) {
    if (!this.h.valid() || !this.root) return
    this.start = { x: p.x, y: p.y, sx: p.sx, sy: p.sy }
    switch (this.tool) {
      case 'select':
        return this.selectDown(p)
      case 'node':
        return this.nodeDown(p)
      case 'rect':
      case 'ellipse':
      case 'line':
      case 'polygon':
      case 'star': {
        const s = this.h.snapPoint(p.x, p.y)
        this.drawStart = { x: s.x, y: s.y }
        this.drawNow = { x: s.x, y: s.y }
        this.lines = s.lines
        return this.draw()
      }
      case 'text':
        return this.textAt(p)
      case 'pen':
        return this.penDown(p)
      case 'pencil':
        this.pencil = [{ x: p.x, y: p.y }]
        return this.draw()
      case 'eyedropper':
        if (p.target) this.h.pick(p.target)
        return
    }
  }

  move(p: CanvasPointer) {
    if (this.mode === 'guide') return this.selectMove(p)
    switch (this.tool) {
      case 'select':
        return this.selectMove(p)
      case 'node':
        return this.nodeMove(p)
      case 'rect':
      case 'ellipse':
      case 'line':
      case 'polygon':
      case 'star': {
        if (!this.drawStart) return
        const s = this.h.snapPoint(p.x, p.y)
        this.drawNow = { x: s.x, y: s.y }
        this.lines = s.lines
        this.drawShapeFeedback(p)
        return this.draw()
      }
      case 'pen':
        return this.penMove(p)
      case 'pencil':
        this.pencil.push({ x: p.x, y: p.y })
        return this.draw()
    }
  }

  up(p: CanvasPointer) {
    if (this.mode === 'guide') return this.selectUp(p)
    switch (this.tool) {
      case 'select':
        return this.selectUp(p)
      case 'node':
        return this.nodeUp()
      case 'rect':
      case 'ellipse':
      case 'line':
      case 'polygon':
      case 'star':
        return this.finishShape(p)
      case 'pen':
        this.penDrag = false
        return this.draw()
      case 'pencil':
        return void this.finishPencil()
    }
  }

  hover(p: CanvasPointer) {
    if (this.tool === 'pen' && this.pen.length) {
      this.hoverAt = { x: p.x, y: p.y }
      this.draw()
    }
  }

  cancel() {
    if (this.mode === 'move' || this.mode === 'resize' || this.mode === 'rotate') for (const b of this.bases) this.setLive(b.el, b.m)
    this.mode = null
    this.drawStart = this.drawNow = null
    this.pencil = []
    this.marquee = null
    this.lines = []
    this.draw()
  }

  /** Dragging a new guide out of a ruler. */
  rulerDown(axis: 'x' | 'y', p: CanvasPointer) {
    const g = this.h.guides()
    // a guide on the x axis is a vertical line; dragging from the left ruler makes one
    const vertical = axis === 'y'
    const list = vertical ? g.x : g.y
    list.push(vertical ? p.x : p.y)
    this.h.setGuides(g)
    this.guide = { axis: vertical ? 'x' : 'y', index: list.length - 1 }
    this.mode = 'guide'
    this.draw()
  }

  // ---- select tool ----

  private setLive(el: SVGGraphicsElement, m: DOMMatrix) {
    const t = transformString(m)
    if (t) el.setAttribute('transform', t)
    else el.removeAttribute('transform')
  }

  private selectDown(p: CanvasPointer) {
    // handles first
    const tol = p.touch ? 18 : 9
    const hit = this.handles().find((hd) => Math.hypot(hd.x - p.sx, hd.y - p.sy) <= tol)
    if (hit && this.selected().length) {
      this.handle = hit
      this.box = this.selectionBox()
      this.bases = this.selected().map((x) => ({ ...x, m: ownMatrix(x.el) }))
      this.mode = hit.kind === 'rotate' ? 'rotate' : 'resize'
      return
    }
    // guides, when not over an object
    if (!p.target) {
      const g = this.h.guides()
      const near = (v: number, at: number) => Math.abs(v - at) * (1 / this.h.preview.unitsPerPx) <= (p.touch ? 12 : 5)
      const gx = g.x.findIndex((v) => near(v, p.x))
      const gy = g.y.findIndex((v) => near(v, p.y))
      if (gx >= 0 || gy >= 0) {
        this.guide = gx >= 0 ? { axis: 'x', index: gx } : { axis: 'y', index: gy }
        this.mode = 'guide'
        return
      }
    }
    let target = p.target && !this.h.isLocked(p.target) ? p.target : null
    const deep = !!target && (p.mod || (p.time - this.lastTap.t < 350 && this.lastTap.target === p.target))
    this.lastTap = { t: p.time, target: p.target }
    if (!target) {
      if (!p.shift) this.h.select([])
      this.mode = 'marquee'
      this.marquee = { x: p.x, y: p.y, width: 0, height: 0 }
      return
    }
    // double-tap a path that's already selected to edit its nodes
    if (deep && !p.mod && ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(target.localName) && this.h.selection().includes(this.index(target)!)) {
      this.h.setTool('node')
      return
    }
    if (!deep) {
      const sel = this.h.selection().map((i) => this.h.preview.element(i))
      const inside = sel.find((s) => s && s !== this.root && s.contains(target!))
      target = inside ?? this.topOf(target)
    }
    const i = this.index(target)
    if (i === null) return
    if (p.shift) {
      const cur = this.h.selection()
      this.h.select(cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i])
      return
    }
    if (!this.h.selection().includes(i)) this.h.select([i])
    this.bases = this.selected().map((x) => ({ ...x, m: ownMatrix(x.el) }))
    this.box = this.selectionBox()
    this.mode = 'move'
  }

  private selectMove(p: CanvasPointer) {
    const root = this.root
    if (!root) return
    if (this.mode === 'marquee' && this.marquee) {
      this.marquee = { x: Math.min(this.start.x, p.x), y: Math.min(this.start.y, p.y), width: Math.abs(p.x - this.start.x), height: Math.abs(p.y - this.start.y) }
      return this.draw()
    }
    if (this.mode === 'guide' && this.guide) {
      const g = this.h.guides()
      const s = this.h.snapPoint(p.x, p.y)
      ;(this.guide.axis === 'x' ? g.x : g.y)[this.guide.index] = this.guide.axis === 'x' ? s.x : s.y
      this.h.setGuides(g)
      return this.draw()
    }
    if (!this.box || !this.bases.length) return
    let change: DOMMatrix | null = null
    if (this.mode === 'move') {
      let dx = p.x - this.start.x
      let dy = p.y - this.start.y
      if (Math.hypot(p.sx - this.start.sx, p.sy - this.start.sy) < 3) return
      if (p.shift) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }
      const s = this.h.snapMove(this.box, dx, dy, this.bases.map((b) => b.el))
      this.lines = s.lines
      change = new DOMMatrix().translate(s.dx, s.dy)
    } else if (this.mode === 'resize' && this.handle) {
      const b = this.box
      const hd = this.handle
      // the anchor is the opposite side (or the centre with Alt)
      const ax = p.alt ? b.x + b.width / 2 : hd.hx < 0 ? b.x + b.width : b.x
      const ay = p.alt ? b.y + b.height / 2 : hd.hy < 0 ? b.y + b.height : b.y
      const s = this.h.snapPoint(p.x, p.y, this.bases.map((x) => x.el))
      this.lines = s.lines
      const from = { x: hd.hx < 0 ? b.x : b.x + b.width, y: hd.hy < 0 ? b.y : b.y + b.height }
      let sx = hd.hx && from.x !== ax ? (s.x - ax) / (from.x - ax) : 1
      let sy = hd.hy && from.y !== ay ? (s.y - ay) / (from.y - ay) : 1
      if (p.alt) {
        sx = hd.hx ? (s.x - ax) / ((hd.hx < 0 ? b.x : b.x + b.width) - ax) : 1
        sy = hd.hy ? (s.y - ay) / ((hd.hy < 0 ? b.y : b.y + b.height) - ay) : 1
      }
      if (p.shift && hd.hx && hd.hy) {
        const k = Math.max(Math.abs(sx), Math.abs(sy))
        sx = Math.sign(sx || 1) * k
        sy = Math.sign(sy || 1) * k
      }
      if (!Number.isFinite(sx) || Math.abs(sx) < 1e-3) sx = 1e-3
      if (!Number.isFinite(sy) || Math.abs(sy) < 1e-3) sy = 1e-3
      change = new DOMMatrix().translate(ax, ay).scale(sx, sy).translate(-ax, -ay)
    } else if (this.mode === 'rotate') {
      const b = this.box
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      let a = ((Math.atan2(p.y - cy, p.x - cx) - Math.atan2(this.start.y - cy, this.start.x - cx)) * 180) / Math.PI
      if (p.shift) a = Math.round(a / 15) * 15
      this.feedback = `${Math.round(a)}°`
      change = new DOMMatrix().translate(cx, cy).rotate(a).translate(-cx, -cy)
    }
    if (change) {
      for (const b of this.bases) this.setLive(b.el, applyRoot(b.el, root, change, b.m))
      this.h.changed()
      this.draw()
    }
  }

  private selectUp(p: CanvasPointer) {
    const root = this.root
    const mode = this.mode
    this.mode = null
    this.lines = []
    this.feedback = ''
    if (mode === 'marquee' && this.marquee && root) {
      const m = this.marquee
      this.marquee = null
      if (m.width * (1 / this.h.preview.unitsPerPx) > 3 || m.height * (1 / this.h.preview.unitsPerPx) > 3) {
        const hits: number[] = []
        for (const el of [...root.children]) {
          if (!isGraphic(el) || this.h.isLocked(el) || el.localName === 'defs') continue
          const b = rootBox(el, root)
          if (b && b.width + b.height > 0 && b.x < m.x + m.width && b.x + b.width > m.x && b.y < m.y + m.height && b.y + b.height > m.y) {
            const i = this.index(el)
            if (i !== null) hits.push(i)
          }
        }
        this.h.select(p.shift ? [...new Set([...this.h.selection(), ...hits])] : hits)
      }
      return this.draw()
    }
    if (mode === 'guide' && this.guide) {
      // dropping a guide back on its ruler removes it
      const g = this.h.guides()
      const off = this.guide.axis === 'x' ? p.sx < 18 : p.sy < 18
      if (off) (this.guide.axis === 'x' ? g.x : g.y).splice(this.guide.index, 1)
      this.h.setGuides(g)
      this.guide = null
      return this.draw()
    }
    if ((mode === 'move' || mode === 'resize' || mode === 'rotate') && this.bases.length) {
      const moved = this.bases.some((b) => (b.el.getAttribute('transform') ?? '') !== (transformString(b.m) ?? ''))
      const items = this.bases.map((b) => ({ i: b.i, m: ownMatrix(b.el) }))
      for (const b of this.bases) this.setLive(b.el, b.m)
      this.bases = []
      if (moved) this.h.commitTransforms(items)
    }
    this.draw()
  }

  // ---- shapes ----

  private shapeBox(p: CanvasPointer) {
    const a = this.drawStart!
    let b = this.drawNow!
    if (p.shift && this.tool !== 'line') {
      const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
      b = { x: a.x + Math.sign(b.x - a.x || 1) * d, y: a.y + Math.sign(b.y - a.y || 1) * d }
    }
    if (p.alt && this.tool !== 'line') return { x: a.x - Math.abs(b.x - a.x), y: a.y - Math.abs(b.y - a.y), width: 2 * Math.abs(b.x - a.x), height: 2 * Math.abs(b.y - a.y) }
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
  }

  private shapeMarkup(b: Box, p: CanvasPointer | null): string {
    const s = this.h.style()
    const paint = `fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"`
    const o = this.h.shapeOptions()
    switch (this.tool) {
      case 'rect':
        return `<rect id="${this.h.uniqueId('rect')}" x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.width)}" height="${r2(b.height)}" ${paint}/>`
      case 'ellipse':
        return b.width === b.height
          ? `<circle id="${this.h.uniqueId('circle')}" cx="${r2(b.x + b.width / 2)}" cy="${r2(b.y + b.height / 2)}" r="${r2(b.width / 2)}" ${paint}/>`
          : `<ellipse id="${this.h.uniqueId('ellipse')}" cx="${r2(b.x + b.width / 2)}" cy="${r2(b.y + b.height / 2)}" rx="${r2(b.width / 2)}" ry="${r2(b.height / 2)}" ${paint}/>`
      case 'line': {
        const a = this.drawStart!
        let z = this.drawNow!
        if (p?.shift) {
          // snap to 45° steps
          const ang = Math.round(Math.atan2(z.y - a.y, z.x - a.x) / (Math.PI / 4)) * (Math.PI / 4)
          const len = Math.hypot(z.x - a.x, z.y - a.y)
          z = { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len }
        }
        return `<line id="${this.h.uniqueId('line')}" x1="${r2(a.x)}" y1="${r2(a.y)}" x2="${r2(z.x)}" y2="${r2(z.y)}" stroke="${s.stroke === 'none' ? '#1a1410' : s.stroke}" stroke-width="${s.strokeWidth || 4}" stroke-linecap="round"/>`
      }
      case 'polygon':
      case 'star': {
        const star = this.tool === 'star'
        const rad = Math.min(b.width, b.height) / 2
        const pts = polygonPoints(b.x + b.width / 2, b.y + b.height / 2, rad, star ? o.points : o.sides, star ? o.inner : null)
        return `<polygon id="${this.h.uniqueId(star ? 'star' : 'polygon')}" points="${pts}" ${paint} stroke-linejoin="round"/>`
      }
    }
    return ''
  }

  private drawShapeFeedback(p: CanvasPointer) {
    const b = this.shapeBox(p)
    // show the shape itself, drawn in screen space as a dashed outline
    const pv = this.h.preview
    const a = pv.toScreen(b.x, b.y)
    const s = 1 / pv.unitsPerPx
    const markup = this.shapeMarkup(b, p)
    this.feedback = `<g transform="translate(${a.x - b.x * s} ${a.y - b.y * s}) scale(${s})" opacity="0.6">${markup.replace(/stroke-width="[^"]*"/, `stroke-width="${pv.unitsPerPx * 1.5}" stroke-dasharray="${pv.unitsPerPx * 5} ${pv.unitsPerPx * 4}"`).replace(/stroke="none"/, 'stroke="#3a8dff"')}</g>
      <text x="${a.x}" y="${a.y - 8}" fill="#9cc4ff" font-size="11" font-family="system-ui">${Math.round(b.width)} × ${Math.round(b.height)}</text>`
  }

  private finishShape(p: CanvasPointer) {
    if (!this.drawStart || !this.drawNow) return
    const tapped = Math.hypot(p.sx - this.start.sx, p.sy - this.start.sy) < 4
    if (tapped) {
      // a tap makes a 100-unit shape there, which is easier than dragging on a phone
      const c = this.drawStart
      this.drawNow = this.tool === 'line' ? { x: c.x + 100, y: c.y } : { x: c.x + 50, y: c.y + 50 }
      this.drawStart = this.tool === 'line' ? c : { x: c.x - 50, y: c.y - 50 }
    }
    const b = this.shapeBox(p)
    const markup = b.width > 0.5 || b.height > 0.5 || this.tool === 'line' ? this.shapeMarkup(b, p) : ''
    this.drawStart = this.drawNow = null
    this.feedback = ''
    this.lines = []
    if (markup) this.h.insert(markup)
    this.draw()
  }

  private textAt(p: CanvasPointer) {
    const text = prompt('Text:')?.trim()
    if (!text) return
    const s = this.h.style()
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const pt = this.h.snapPoint(p.x, p.y)
    this.h.insert(`<text id="${this.h.uniqueId('text')}" x="${r2(pt.x)}" y="${r2(pt.y)}" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="${s.fill === 'none' ? '#1a1410' : s.fill}">${esc}</text>`)
  }

  // ---- pen ----

  private penDown(p: CanvasPointer) {
    const s = this.h.snapPoint(p.x, p.y)
    const first = this.pen[0]
    if (first && this.pen.length > 1 && Math.hypot(first.x - p.x, first.y - p.y) <= this.tol(p.touch)) {
      this.finishPen(true)
      return
    }
    // tapping the last node again finishes an open path
    const last = this.pen[this.pen.length - 1]
    if (last && this.pen.length > 1 && Math.hypot(last.x - p.x, last.y - p.y) <= this.tol(p.touch)) {
      this.finishPen(false)
      return
    }
    this.pen.push({ x: s.x, y: s.y, in: null, out: null })
    this.penDrag = true
    this.lines = s.lines
    this.draw()
  }

  private penMove(p: CanvasPointer) {
    if (!this.penDrag) return
    const n = this.pen[this.pen.length - 1]
    if (Math.hypot(p.sx - this.start.sx, p.sy - this.start.sy) < 4) return
    // dragging pulls out smooth handles
    n.out = { x: p.x, y: p.y }
    n.in = { x: 2 * n.x - p.x, y: 2 * n.y - p.y }
    this.draw()
  }

  /** Finish the pen path; closed joins it back to the first node. */
  finishPen(closed = false) {
    if (this.pen.length > 1) {
      const s = this.h.style()
      const d = writePath([{ nodes: this.pen, closed }])
      this.h.insert(`<path id="${this.h.uniqueId('path')}" d="${d}" fill="${closed ? s.fill : 'none'}" stroke="${s.stroke === 'none' ? '#1a1410' : s.stroke}" stroke-width="${s.strokeWidth || 4}" stroke-linecap="round" stroke-linejoin="round"/>`)
    }
    this.pen = []
    this.hoverAt = null
    this.draw()
  }

  // ---- pencil ----

  private async finishPencil() {
    const pts = this.pencil
    this.pencil = []
    this.draw()
    if (pts.length < 2) return
    const paper = await loadPaper()
    const path = new paper.Path(pts.map((q) => new paper.Point(q.x, q.y)))
    // smooth the wobble out, more when zoomed out
    path.simplify(2.5 * this.h.preview.unitsPerPx)
    const d = path.pathData
    paper.project.clear()
    const s = this.h.style()
    this.h.insert(`<path id="${this.h.uniqueId('stroke')}" d="${d}" fill="none" stroke="${s.stroke === 'none' ? '#1a1410' : s.stroke}" stroke-width="${s.strokeWidth || 4}" stroke-linecap="round" stroke-linejoin="round"/>`)
  }

  // ---- node tool ----

  /** Start editing the nodes of the selected shape. */
  enterNode() {
    const sel = this.h.selection().filter((i) => i !== 0)
    const i = sel.find((n) => ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(this.h.els()[n]?.name))
    this.nodeEl = i ?? null
    this.nodeSel.clear()
    this.loadNodes()
  }

  /** Re-read the path after the source changed. */
  loadNodes() {
    if (this.nodeEl === null) return (this.subs = [])
    const el = this.h.preview.element(this.nodeEl)
    if (!el) {
      this.nodeEl = null
      this.subs = []
      return
    }
    this.subs = parsePath(shapeToPath(el) ?? '')
  }

  /** Follow the selection: the node tool edits whatever path is selected. */
  followSelection() {
    if (this.tool !== 'node') return
    const sel = this.h.selection()
    if (this.nodeEl !== null && sel.length === 1 && sel[0] === this.nodeEl) return this.loadNodes()
    this.enterNode()
  }

  private nodeMatrix() {
    const el = this.nodeEl !== null ? this.h.preview.element(this.nodeEl) : null
    return el && this.root && isGraphic(el) ? toRoot(el, this.root) : new DOMMatrix()
  }

  private nodeAt(sx: number, sy: number, tol: number) {
    const m = this.nodeMatrix()
    const pv = this.h.preview
    const scr = (q: { x: number; y: number }) => {
      const a = m.transformPoint(new DOMPoint(q.x, q.y))
      return pv.toScreen(a.x, a.y)
    }
    // handles of selected nodes first, then nodes
    for (const [si, s] of this.subs.entries())
      for (const [ni, n] of s.nodes.entries()) {
        const key = `${si}:${ni}`
        if (!this.nodeSel.has(key)) continue
        for (const k of ['in', 'out'] as const) {
          const hd = n[k]
          if (!hd) continue
          const q = scr(hd)
          if (Math.hypot(q.x - sx, q.y - sy) <= tol) return { kind: k, key }
        }
      }
    for (const [si, s] of this.subs.entries())
      for (const [ni, n] of s.nodes.entries()) {
        const q = scr(n)
        if (Math.hypot(q.x - sx, q.y - sy) <= tol) return { kind: 'node' as const, key: `${si}:${ni}` }
      }
    return null
  }

  private node(key: string) {
    const [si, ni] = key.split(':').map(Number)
    return this.subs[si]?.nodes[ni]
  }

  private toLocal(x: number, y: number) {
    const q = this.nodeMatrix().inverse().transformPoint(new DOMPoint(x, y))
    return { x: q.x, y: q.y }
  }

  private nodeDown(p: CanvasPointer) {
    if (this.nodeEl === null) {
      // pick a shape to edit
      if (p.target) {
        const i = this.index(p.target)
        if (i !== null) {
          this.h.select([i])
          this.enterNode()
          this.draw()
        }
      }
      return
    }
    const hit = this.nodeAt(p.sx, p.sy, p.touch ? 16 : 8)
    const key = hit ? `${hit.kind}:${hit.key}` : `seg:${Math.round(p.sx / 10)}:${Math.round(p.sy / 10)}`
    const double = p.time - this.nodeTap.t < 350 && this.nodeTap.key === key
    this.nodeTap = { t: double ? 0 : p.time, key }
    if (hit) {
      if (hit.kind === 'node') {
        if (double) {
          this.toggleSmooth(hit.key)
          return
        }
        if (p.shift) {
          if (this.nodeSel.has(hit.key)) this.nodeSel.delete(hit.key)
          else this.nodeSel.add(hit.key)
        } else if (!this.nodeSel.has(hit.key)) this.nodeSel = new Set([hit.key])
      }
      this.nodeDrag = { kind: hit.kind, key: hit.key, last: this.toLocal(p.x, p.y) }
      this.nodeMoved = false
      this.h.changed()
      return this.draw()
    }
    // double-tap on the outline adds a node there
    const seg = this.segmentAt(p)
    if (seg && double) {
      this.addNodeAt(seg.si, seg.ni, seg.t)
      return
    }
    if (p.target && this.index(p.target) !== this.nodeEl) {
      const i = this.index(p.target)
      if (i !== null) {
        this.h.select([i])
        this.enterNode()
      }
    } else this.nodeSel.clear()
    this.h.changed()
    this.draw()
  }

  private segmentAt(p: CanvasPointer) {
    const q = this.toLocal(p.x, p.y)
    const tol = this.tol(p.touch)
    let best: { si: number; ni: number; t: number; d: number } | null = null
    for (const [si, s] of this.subs.entries()) {
      const n = s.nodes
      const count = s.closed ? n.length : n.length - 1
      for (let ni = 0; ni < count; ni++) {
        const r = nearestOnSegment(n[ni], n[(ni + 1) % n.length], q.x, q.y)
        if (r.d <= tol && (!best || r.d < best.d)) best = { si, ni, t: r.t, d: r.d }
      }
    }
    return best
  }

  private nodeMove(p: CanvasPointer) {
    const d = this.nodeDrag
    if (!d) return
    const q = this.toLocal(p.x, p.y)
    const dx = q.x - d.last.x
    const dy = q.y - d.last.y
    d.last = q
    if (!this.nodeMoved && Math.hypot(p.sx - this.start.sx, p.sy - this.start.sy) < 3) return
    this.nodeMoved = true
    this.nodeTap = { t: 0, key: '' }
    if (d.kind === 'node') {
      for (const key of this.nodeSel) {
        const n = this.node(key)
        if (!n) continue
        n.x += dx
        n.y += dy
        if (n.in) n.in = { x: n.in.x + dx, y: n.in.y + dy }
        if (n.out) n.out = { x: n.out.x + dx, y: n.out.y + dy }
      }
    } else {
      const n = this.node(d.key)
      if (!n) return
      n[d.kind] = { x: q.x, y: q.y }
      // keep the curve smooth: the opposite handle turns to match, keeping its length (Alt breaks it)
      const other = d.kind === 'in' ? 'out' : 'in'
      const o = n[other]
      if (o && !p.alt) {
        const len = Math.hypot(o.x - n.x, o.y - n.y)
        const a = Math.atan2(n.y - q.y, n.x - q.x)
        n[other] = { x: n.x + Math.cos(a) * len, y: n.y + Math.sin(a) * len }
      }
    }
    this.livePath()
    this.draw()
  }

  private livePath() {
    const el = this.nodeEl !== null ? this.h.preview.element(this.nodeEl) : null
    if (el?.localName === 'path') el.setAttribute('d', writePath(this.subs))
  }

  private nodeUp() {
    if (this.nodeDrag && this.nodeMoved) this.commitNodes()
    this.nodeDrag = null
  }

  private commitNodes() {
    if (this.nodeEl === null) return
    this.h.setPath(this.nodeEl, writePath(this.subs))
  }

  // node operations, also used by the inspector's Path section

  get nodeSelection() {
    return this.nodeSel.size
  }

  get editingNodes() {
    return this.tool === 'node' && this.nodeEl !== null
  }

  toggleSmooth(key?: string) {
    const keys = key ? [key] : [...this.nodeSel]
    for (const k of keys) {
      const [si, ni] = k.split(':').map(Number)
      const s = this.subs[si]
      const n = s?.nodes[ni]
      if (!n) continue
      if (n.in || n.out) {
        n.in = n.out = null
      } else {
        // make handles along the line between the neighbours, a third of the way to each
        const prev = s.nodes[(ni - 1 + s.nodes.length) % s.nodes.length]
        const next = s.nodes[(ni + 1) % s.nodes.length]
        const a = Math.atan2(next.y - prev.y, next.x - prev.x)
        const l1 = Math.hypot(n.x - prev.x, n.y - prev.y) / 3
        const l2 = Math.hypot(next.x - n.x, next.y - n.y) / 3
        n.in = { x: n.x - Math.cos(a) * l1, y: n.y - Math.sin(a) * l1 }
        n.out = { x: n.x + Math.cos(a) * l2, y: n.y + Math.sin(a) * l2 }
      }
    }
    this.commitNodes()
  }

  deleteNodes() {
    if (!this.nodeSel.size) return
    const byS = new Map<number, number[]>()
    for (const k of this.nodeSel) {
      const [si, ni] = k.split(':').map(Number)
      byS.set(si, [...(byS.get(si) ?? []), ni])
    }
    for (const [si, list] of byS) this.subs[si].nodes = this.subs[si].nodes.filter((_, n) => !list.includes(n))
    this.subs = this.subs.filter((s) => s.nodes.length > 1)
    this.nodeSel.clear()
    if (this.subs.length) this.commitNodes()
  }

  /** Add a node halfway along the segment after each selected node. */
  addNodes() {
    const keys = [...this.nodeSel].sort().reverse()
    if (!keys.length) return
    for (const k of keys) {
      const [si, ni] = k.split(':').map(Number)
      const s = this.subs[si]
      if (!s || (!s.closed && ni === s.nodes.length - 1)) continue
      this.addNodeAt(si, ni, 0.5, false)
    }
    this.commitNodes()
  }

  private addNodeAt(si: number, ni: number, t: number, commit = true) {
    const s = this.subs[si]
    const a = s.nodes[ni]
    const bi = (ni + 1) % s.nodes.length
    const b = s.nodes[bi]
    const sp = splitSegment(a, b, t)
    a.out = sp.aOut
    b.in = sp.bIn
    s.nodes.splice(ni + 1, 0, sp.mid)
    this.nodeSel = new Set([`${si}:${ni + 1}`])
    if (commit) this.commitNodes()
  }

  /** Close an open subpath, or open a closed one. */
  toggleClosed() {
    const si = [...this.nodeSel].map((k) => +k.split(':')[0])[0] ?? 0
    const s = this.subs[si]
    if (!s) return
    s.closed = !s.closed
    this.commitNodes()
  }

  /** Split the path at the selected node: a closed path opens there; an open one becomes two. */
  splitAtNode() {
    const k = [...this.nodeSel][0]
    if (!k) return
    const [si, ni] = k.split(':').map(Number)
    const s = this.subs[si]
    if (!s) return
    if (s.closed) {
      s.nodes = [...s.nodes.slice(ni), ...s.nodes.slice(0, ni), { ...s.nodes[ni], in: s.nodes[ni].in, out: null }]
      s.nodes[0] = { ...s.nodes[0], in: null }
      s.closed = false
    } else {
      if (ni === 0 || ni === s.nodes.length - 1) return
      const a: SubPath = { nodes: s.nodes.slice(0, ni + 1).map((n) => ({ ...n })), closed: false }
      const b: SubPath = { nodes: s.nodes.slice(ni).map((n) => ({ ...n })), closed: false }
      a.nodes[a.nodes.length - 1].out = null
      b.nodes[0].in = null
      this.subs.splice(si, 1, a, b)
    }
    this.nodeSel.clear()
    this.commitNodes()
  }

  /** Join two selected end nodes: of the same open subpath (closing it) or of two (merging them). */
  joinNodes() {
    const keys = [...this.nodeSel].map((k) => k.split(':').map(Number))
    if (keys.length !== 2) return
    const [[sa, na], [sb, nb]] = keys
    const A = this.subs[sa]
    const B = this.subs[sb]
    const isEnd = (s: SubPath, n: number) => !s.closed && (n === 0 || n === s.nodes.length - 1)
    if (!isEnd(A, na) || !isEnd(B, nb)) return
    if (sa === sb) {
      A.closed = true
    } else {
      // orient A to end at na and B to start at nb, then join
      const a = na === 0 ? A.nodes.slice().reverse().map((n) => ({ ...n, in: n.out, out: n.in })) : A.nodes
      const b = nb === 0 ? B.nodes : B.nodes.slice().reverse().map((n) => ({ ...n, in: n.out, out: n.in }))
      const merged: SubPath = { nodes: [...a, ...b], closed: false }
      this.subs = this.subs.filter((_, i) => i !== sa && i !== sb)
      this.subs.push(merged)
    }
    this.nodeSel.clear()
    this.commitNodes()
  }

  // ---- overlay ----

  /** Draw selection handles, tool feedback and snap lines. Extra markup (guides etc.) goes underneath. */
  draw() {
    const pv = this.h.preview
    const root = this.root
    const parts: string[] = [this.h.overlayExtra()]
    const W = 100000
    for (const l of this.lines) {
      const q = pv.toScreen(l.at, l.at)
      parts.push(l.axis === 'x' ? `<line x1="${q.x}" y1="-${W}" x2="${q.x}" y2="${W}" stroke="#ff4fa3" stroke-width="1"/>` : `<line x1="-${W}" y1="${q.y}" x2="${W}" y2="${q.y}" stroke="#ff4fa3" stroke-width="1"/>`)
    }
    if (root && this.tool !== 'node') {
      // an outline on each selected object, and handles round the lot
      for (const { el } of this.selected()) {
        const c = corners(el, root)
        if (c) parts.push(`<polygon points="${c.map((q) => pv.toScreen(q.x, q.y)).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#3a8dff" stroke-width="1" stroke-dasharray="4 3"/>`)
      }
      if (this.tool === 'select' && this.selected().length && this.mode !== 'marquee') {
        const hs = this.handles()
        const b = this.selectionBox()!
        const a = pv.toScreen(b.x, b.y)
        const z = pv.toScreen(b.x + b.width, b.y + b.height)
        parts.push(`<rect x="${a.x}" y="${a.y}" width="${z.x - a.x}" height="${z.y - a.y}" fill="none" stroke="#3a8dff" stroke-width="1"/>`)
        const rot = hs.find((x) => x.kind === 'rotate')!
        parts.push(`<line x1="${rot.x}" y1="${rot.y}" x2="${rot.x}" y2="${a.y}" stroke="#3a8dff"/>`)
        for (const hd of hs) parts.push(hd.kind === 'rotate' ? `<circle cx="${rot.x}" cy="${rot.y}" r="${HANDLE + 1}" fill="#fff" stroke="#3a8dff" stroke-width="1.5"/>` : `<rect x="${hd.x - HANDLE}" y="${hd.y - HANDLE}" width="${HANDLE * 2}" height="${HANDLE * 2}" fill="#fff" stroke="#3a8dff" stroke-width="1.5"/>`)
      }
    }
    if (this.marquee) {
      const a = pv.toScreen(this.marquee.x, this.marquee.y)
      const z = pv.toScreen(this.marquee.x + this.marquee.width, this.marquee.y + this.marquee.height)
      parts.push(`<rect x="${a.x}" y="${a.y}" width="${z.x - a.x}" height="${z.y - a.y}" fill="#3a8dff22" stroke="#3a8dff" stroke-dasharray="4 3"/>`)
    }
    if (this.tool === 'node' && this.nodeEl !== null) {
      const m = this.nodeMatrix()
      const scr = (q: { x: number; y: number }) => {
        const a = m.transformPoint(new DOMPoint(q.x, q.y))
        return pv.toScreen(a.x, a.y)
      }
      // the outline, then handles for selected nodes, then nodes
      const outline = this.subs.map((s) => ({ nodes: s.nodes.map((n) => ({ ...scr(n), in: n.in && scr(n.in), out: n.out && scr(n.out) })), closed: s.closed }))
      parts.push(`<path d="${writePath(outline)}" fill="none" stroke="#3a8dff" stroke-width="1"/>`)
      for (const [si, s] of this.subs.entries())
        for (const [ni, n] of s.nodes.entries()) {
          if (!this.nodeSel.has(`${si}:${ni}`)) continue
          const q = scr(n)
          for (const k of ['in', 'out'] as const) {
            const hd = n[k]
            if (!hd) continue
            const hq = scr(hd)
            parts.push(`<line x1="${q.x}" y1="${q.y}" x2="${hq.x}" y2="${hq.y}" stroke="#ff8a3a"/><circle cx="${hq.x}" cy="${hq.y}" r="4" fill="#ff8a3a"/>`)
          }
        }
      for (const [si, s] of this.subs.entries())
        for (const [ni, n] of s.nodes.entries()) {
          const q = scr(n)
          const on = this.nodeSel.has(`${si}:${ni}`)
          const smooth = !!(n.in || n.out)
          parts.push(smooth ? `<circle cx="${q.x}" cy="${q.y}" r="${HANDLE}" fill="${on ? '#3a8dff' : '#fff'}" stroke="#3a8dff" stroke-width="1.5"/>` : `<rect x="${q.x - HANDLE}" y="${q.y - HANDLE}" width="${HANDLE * 2}" height="${HANDLE * 2}" fill="${on ? '#3a8dff' : '#fff'}" stroke="#3a8dff" stroke-width="1.5"/>`)
        }
    }
    if (this.tool === 'pen' && this.pen.length) {
      const nodes = this.pen.map((n) => ({ ...pv.toScreen(n.x, n.y), in: n.in && pv.toScreen(n.in.x, n.in.y), out: n.out && pv.toScreen(n.out.x, n.out.y) }))
      parts.push(`<path d="${writePath([{ nodes, closed: false }])}" fill="none" stroke="#3a8dff" stroke-width="1.5"/>`)
      const last = nodes[nodes.length - 1]
      if (this.hoverAt && !this.penDrag) {
        const hq = pv.toScreen(this.hoverAt.x, this.hoverAt.y)
        parts.push(`<line x1="${last.x}" y1="${last.y}" x2="${hq.x}" y2="${hq.y}" stroke="#3a8dff" stroke-dasharray="4 3"/>`)
      }
      for (const n of nodes) {
        if (n.out) parts.push(`<line x1="${n.x}" y1="${n.y}" x2="${n.out.x}" y2="${n.out.y}" stroke="#ff8a3a"/><circle cx="${n.out.x}" cy="${n.out.y}" r="3" fill="#ff8a3a"/>`)
        parts.push(`<rect x="${n.x - 4}" y="${n.y - 4}" width="8" height="8" fill="#fff" stroke="#3a8dff" stroke-width="1.5"/>`)
      }
    }
    if (this.tool === 'pencil' && this.pencil.length > 1) {
      parts.push(`<polyline points="${this.pencil.map((q) => pv.toScreen(q.x, q.y)).map((q) => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="#3a8dff" stroke-width="2"/>`)
    }
    if (this.feedback) {
      if (this.feedback.startsWith('<')) parts.push(this.feedback)
      else {
        const b = this.selectionBox()
        if (b) {
          const a = pv.toScreen(b.x + b.width / 2, b.y)
          parts.push(`<text x="${a.x}" y="${a.y - 40}" fill="#9cc4ff" font-size="12" font-family="system-ui" text-anchor="middle">${this.feedback}</text>`)
        }
      }
    }
    pv.drawOverlay(parts.join(''))
  }
}
