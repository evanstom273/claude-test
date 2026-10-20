import type { ChangeSpec } from '@codemirror/state'
import { applyRoot, isGraphic, moved, parentToRoot, rootBox, toRoot, transformString, unionBox, type Box } from './geometry'
import { parsePath, shapeToPath, writePath, type SubPath } from './paths'
import { attr, chunk, childIndent, idsIn, insertionPoint, uniqueId, withFreshIds, type SrcElement } from './sourceMap'

/**
 * Object operations. Each one works out text changes to the source and
 * applies them in one go, so it's a single undo step and everything it
 * doesn't touch stays exactly as written.
 */

export type Mapper = (pos: number, assoc?: -1 | 1) => number

export interface OpsHost {
  source(): string
  els(): SrcElement[]
  root(): SVGSVGElement | null
  element(i: number): Element | null
  selection(): number[]
  /** Apply changes as one undo step, then select the elements starting at the positions `select` returns (in the new text). */
  apply(changes: ChangeSpec[], select?: (map: Mapper) => number[]): void
  flash(msg: string): void
}

const GEOMETRY = new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points', 'd', 'pathLength'])
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
/** Attributes a group passes down to its children when it's ungrouped. */
const INHERITED = new Set(['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'color', 'visibility', 'clip-rule', 'paint-order'])

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/** Rewrite an element's opening tag with some attributes changed (null removes), returning the element's new text. */
export function retag(el: SrcElement, src: string, set: Record<string, string | null>, rename?: string) {
  const text = src.slice(el.start, el.end)
  const open = src.slice(el.start, el.openEnd)
  let tag = open
  // work backwards so earlier offsets stay valid
  const edits: { from: number; to: number; insert: string }[] = []
  for (const [name, value] of Object.entries(set)) {
    const a = attr(el, name)
    if (a) {
      if (value === null) {
        let s = a.start - el.start
        while (s > 0 && /\s/.test(open[s - 1])) s--
        edits.push({ from: s, to: a.end - el.start, insert: '' })
      } else edits.push({ from: a.valueStart - el.start, to: a.valueEnd - el.start, insert: esc(value) })
    } else if (value !== null) {
      const at = el.attrs.length ? el.attrs[el.attrs.length - 1].end - el.start : 1 + el.name.length
      edits.push({ from: at, to: at, insert: ` ${name}="${esc(value)}"` })
    }
  }
  edits.sort((a, b) => b.from - a.from)
  for (const e of edits) tag = tag.slice(0, e.from) + e.insert + tag.slice(e.to)
  if (rename) {
    tag = `<${rename}${tag.slice(1 + el.name.length)}`
    let rest = text.slice(open.length)
    if (!el.selfClosing) rest = rest.replace(new RegExp(`</${el.name}>$`), `</${rename}>`)
    return tag + rest
  }
  return tag + text.slice(open.length)
}

export class Ops {
  constructor(private h: OpsHost) {}

  private get src() {
    return this.h.source()
  }

  /** The selection without the root and without anything inside another selected element. */
  topLevel(): SrcElement[] {
    const els = this.h.els()
    const sel = this.h.selection().filter((i) => i !== 0).map((i) => els[i])
    const set = new Set(sel)
    return sel
      .filter((e) => {
        for (let p = e.parent; p; p = p.parent) if (set.has(p)) return false
        return true
      })
      .sort((a, b) => a.start - b.start)
  }

  /** Where the selected elements start now, to follow them through an edit. */
  private keptStarts() {
    const els = this.h.els()
    return this.h.selection().map((i) => els[i].start)
  }

  private graphics(sel: SrcElement[]) {
    return sel.map((e) => ({ e, el: this.h.element(e.i) })).filter((x): x is { e: SrcElement; el: SVGGraphicsElement } => !!x.el && isGraphic(x.el))
  }

  // ---- structure ----

  group() {
    const sel = this.topLevel()
    if (!sel.length) return
    const parent = sel[0].parent
    if (!parent || sel.some((e) => e.parent !== parent)) return this.h.flash('Select things in the same group to group them')
    const src = this.src
    const last = sel[sel.length - 1]
    const lc = chunk(last, src)
    const indent = lc.lead.replace(/^\n/, '')
    const id = uniqueId('group', idsIn(src))
    const body = sel.map((e) => {
      const c = chunk(e, src)
      return `\n${indent}  ${c.text.replace(new RegExp(`\n${c.lead.replace(/^\n/, '')}`, 'g'), `\n${c.lead.replace(/^\n/, '')}  `)}`
    })
    const markup = `${lc.lead}<g id="${id}">${body.join('')}\n${indent}</g>`
    const changes: ChangeSpec[] = sel.slice(0, -1).map((e) => {
      const c = chunk(e, src)
      return { from: c.from, to: c.to, insert: '' }
    })
    changes.push({ from: lc.from, to: lc.to, insert: markup })
    this.h.apply(changes, (map) => [map(lc.from, -1) + lc.lead.length])
  }

  ungroup() {
    const groups = this.topLevel().filter((e) => e.name === 'g')
    if (!groups.length) return this.h.flash('Select a group to ungroup')
    const src = this.src
    const changes: ChangeSpec[] = []
    const picks: { from: number; offset: number }[] = []
    for (const g of groups) {
      const gt = attr(g, 'transform')?.value.trim() ?? ''
      const pass: Record<string, string> = {}
      for (const a of g.attrs) if (INHERITED.has(a.name)) pass[a.name] = a.value
      const gOpacity = attr(g, 'opacity')?.value
      const innerStart = g.openEnd
      const innerEnd = insertionPoint(g, src) ?? g.end
      let out = ''
      let p = innerStart
      const dedent = (t: string) => t.replace(/\n {2}/g, '\n')
      const offsets: number[] = []
      for (const c of g.children) {
        out += dedent(src.slice(p, c.start))
        const set: Record<string, string | null> = {}
        if (gt) set.transform = `${gt} ${attr(c, 'transform')?.value ?? ''}`.trim()
        for (const [k, v] of Object.entries(pass)) if (!attr(c, k)) set[k] = v
        if (gOpacity) set.opacity = String(+(parseFloat(gOpacity) * parseFloat(attr(c, 'opacity')?.value ?? '1')).toFixed(3))
        offsets.push(out.length)
        out += dedent(retag(c, src, set))
        p = c.end
      }
      out += dedent(src.slice(p, innerEnd)).replace(/\s+$/, '')
      // drop the group's own leading line break so the children sit where it was
      const lead = out.match(/^\s*/)![0]
      out = out.slice(lead.length)
      changes.push({ from: g.start, to: g.end, insert: out })
      for (const o of offsets) picks.push({ from: g.start, offset: o - lead.length })
    }
    this.h.apply(changes, (map) => picks.map((k) => map(k.from, -1) + k.offset))
  }

  duplicate() {
    const sel = this.topLevel()
    if (!sel.length) return
    const src = this.src
    const taken = idsIn(src)
    const changes: ChangeSpec[] = []
    const picks: { at: number; lead: number }[] = []
    for (const e of sel) {
      const c = chunk(e, src)
      const lead = c.lead || '\n'
      changes.push({ from: e.end, insert: lead + withFreshIds(c.text, taken) })
      picks.push({ at: e.end, lead: lead.length })
    }
    this.h.apply(changes, (map) => picks.map((p) => map(p.at, -1) + p.lead))
  }

  remove() {
    const sel = this.topLevel()
    if (!sel.length) return
    const src = this.src
    this.h.apply(sel.map((e) => {
      const c = chunk(e, src)
      return { from: c.from, to: c.to, insert: '' }
    }), () => [])
  }

  /** Change stacking order: forward/backward one step, or to the front/back of its group. */
  reorder(kind: 'forward' | 'backward' | 'front' | 'back') {
    const sel = this.topLevel()
    if (!sel.length) return
    const src = this.src
    const byParent = new Map<SrcElement, SrcElement[]>()
    for (const e of sel) if (e.parent) byParent.set(e.parent, [...(byParent.get(e.parent) ?? []), e])
    const changes: ChangeSpec[] = []
    const picks: { from: number; offset: number }[] = []
    for (const [parent, chosen] of byParent) {
      const kids = parent.children
      // each child owns the text from the end of the previous one up to its own end (comments travel with it)
      const pieces = kids.map((k, n) => ({ el: k, text: src.slice(n ? kids[n - 1].end : parent.openEnd, k.end) }))
      const picked = new Set(chosen)
      let order = pieces.slice()
      if (kind === 'front') order = [...pieces.filter((x) => !picked.has(x.el)), ...pieces.filter((x) => picked.has(x.el))]
      else if (kind === 'back') order = [...pieces.filter((x) => picked.has(x.el)), ...pieces.filter((x) => !picked.has(x.el))]
      else if (kind === 'forward') {
        for (let n = order.length - 2; n >= 0; n--) if (picked.has(order[n].el) && !picked.has(order[n + 1].el)) [order[n], order[n + 1]] = [order[n + 1], order[n]]
      } else {
        for (let n = 1; n < order.length; n++) if (picked.has(order[n].el) && !picked.has(order[n - 1].el)) [order[n], order[n - 1]] = [order[n - 1], order[n]]
      }
      let out = ''
      for (const pc of order) {
        if (picked.has(pc.el)) picks.push({ from: parent.openEnd, offset: out.length + pc.text.length - (pc.el.end - pc.el.start) })
        out += pc.text
      }
      changes.push({ from: parent.openEnd, to: kids[kids.length - 1].end, insert: out })
    }
    this.h.apply(changes, (map) => picks.map((p) => map(p.from, -1) + p.offset))
  }

  // ---- transforms ----

  /** Apply a change made in root space to every selected object. */
  transformAll(change: DOMMatrix) {
    const root = this.h.root()
    if (!root) return
    const src = this.src
    const items = this.graphics(this.topLevel())
    const keep = this.keptStarts()
    this.h.apply(items.map(({ e, el }) => this.transformChange(e, src, applyRoot(el, root, change))).filter((c): c is ChangeSpec => !!c), (map) => keep.map((p) => map(p, 1)))
  }

  transformChange(e: SrcElement, src: string, m: DOMMatrix): ChangeSpec | null {
    const t = transformString(m)
    const a = attr(e, 'transform')
    if (a) {
      if (t === null) {
        let s = a.start
        while (s > 0 && /\s/.test(src[s - 1])) s--
        return { from: s, to: a.end, insert: '' }
      }
      return { from: a.valueStart, to: a.valueEnd, insert: t }
    }
    if (t === null) return null
    const at = e.attrs.length ? e.attrs[e.attrs.length - 1].end : e.start + 1 + e.name.length
    return { from: at, insert: ` transform="${t}"` }
  }

  selectionBox(): Box | null {
    const root = this.h.root()
    if (!root) return null
    return unionBox(this.graphics(this.topLevel()).map((x) => x.el), root)
  }

  flip(axis: 'x' | 'y') {
    const b = this.selectionBox()
    if (!b) return
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    this.transformAll(new DOMMatrix().translate(cx, cy).scale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1).translate(-cx, -cy))
  }

  /** Line objects up with each other, or with the artboard when only one is selected. */
  align(kind: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom', artboard: Box) {
    const root = this.h.root()
    if (!root) return
    const items = this.graphics(this.topLevel())
    if (!items.length) return
    const ref = items.length === 1 ? artboard : unionBox(items.map((x) => x.el), root)!
    const src = this.src
    const keep = this.keptStarts()
    const changes = items
      .map(({ e, el }) => {
        const b = rootBox(el, root)
        if (!b) return null
        let dx = 0
        let dy = 0
        if (kind === 'left') dx = ref.x - b.x
        if (kind === 'hcenter') dx = ref.x + ref.width / 2 - (b.x + b.width / 2)
        if (kind === 'right') dx = ref.x + ref.width - (b.x + b.width)
        if (kind === 'top') dy = ref.y - b.y
        if (kind === 'vcenter') dy = ref.y + ref.height / 2 - (b.y + b.height / 2)
        if (kind === 'bottom') dy = ref.y + ref.height - (b.y + b.height)
        return dx || dy ? this.transformChange(e, src, moved(el, root, dx, dy)) : null
      })
      .filter((c): c is ChangeSpec => !!c)
    this.h.apply(changes, (map) => keep.map((p) => map(p, 1)))
  }

  /** Space three or more objects evenly between the outermost two. */
  distribute(axis: 'x' | 'y') {
    const root = this.h.root()
    if (!root) return
    const items = this.graphics(this.topLevel())
      .map((x) => ({ ...x, b: rootBox(x.el, root)! }))
      .filter((x) => x.b)
    if (items.length < 3) return this.h.flash('Select at least three objects to distribute')
    const c = (b: Box) => (axis === 'x' ? b.x + b.width / 2 : b.y + b.height / 2)
    items.sort((a, b) => c(a.b) - c(b.b))
    const first = c(items[0].b)
    const step = (c(items[items.length - 1].b) - first) / (items.length - 1)
    const src = this.src
    const keep = this.keptStarts()
    const changes = items
      .map((x, n) => {
        const d = first + step * n - c(x.b)
        return Math.abs(d) > 1e-6 ? this.transformChange(x.e, src, moved(x.el, root, axis === 'x' ? d : 0, axis === 'y' ? d : 0)) : null
      })
      .filter((ch): ch is ChangeSpec => !!ch)
    this.h.apply(changes, (map) => keep.map((p) => map(p, 1)))
  }

  // ---- paths ----

  /** The new text of a shape turned into a <path>, keeping its other attributes. */
  pathText(e: SrcElement, d: string, src = this.src) {
    const set: Record<string, string | null> = {}
    for (const a of e.attrs) if (GEOMETRY.has(a.name)) set[a.name] = null
    set.d = d
    return retag(e, src, set, e.name === 'path' ? undefined : 'path')
  }

  toPath() {
    const sel = this.topLevel().filter((e) => SHAPES.has(e.name) && e.name !== 'path')
    if (!sel.length) return this.h.flash('Select rectangles, circles, ellipses, lines or polygons to convert')
    const src = this.src
    const changes: ChangeSpec[] = []
    for (const e of sel) {
      const el = this.h.element(e.i)
      const d = el && shapeToPath(el)
      if (d) changes.push({ from: e.start, to: e.end, insert: this.pathText(e, d, src) })
    }
    this.h.apply(changes, (map) => sel.map((e) => map(e.start, -1)))
  }

  /** Path data of a shape, with points mapped through a matrix. */
  private mappedPath(el: Element, m: DOMMatrix): SubPath[] {
    const subs = parsePath(shapeToPath(el) ?? '')
    const tp = (p: { x: number; y: number }) => {
      const q = m.transformPoint(new DOMPoint(p.x, p.y))
      return { x: q.x, y: q.y }
    }
    for (const s of subs)
      for (const n of s.nodes) {
        const q = tp(n)
        if (n.in) n.in = tp(n.in)
        if (n.out) n.out = tp(n.out)
        n.x = q.x
        n.y = q.y
      }
    return subs
  }

  /** Merge several shapes into one compound path (the bottom one keeps its look). */
  combine() {
    const root = this.h.root()
    const items = this.graphics(this.topLevel()).filter((x) => SHAPES.has(x.e.name))
    if (!root || items.length < 2) return this.h.flash('Select two or more shapes to combine')
    const [first, ...rest] = items
    const inv = toRoot(first.el, root).inverse()
    const subs = [...this.mappedPath(first.el, new DOMMatrix()), ...rest.flatMap((x) => this.mappedPath(x.el, inv.multiply(toRoot(x.el, root))))]
    const src = this.src
    const changes: ChangeSpec[] = [{ from: first.e.start, to: first.e.end, insert: this.pathText(first.e, writePath(subs), src) }]
    for (const x of rest) {
      const c = chunk(x.e, src)
      changes.push({ from: c.from, to: c.to, insert: '' })
    }
    this.h.apply(changes, (map) => [map(first.e.start, -1)])
  }

  /** Union, subtract (the bottom shape minus the rest), intersect or exclude, using Paper.js. */
  async boolean(op: 'unite' | 'subtract' | 'intersect' | 'exclude') {
    const root = this.h.root()
    const items = this.graphics(this.topLevel()).filter((x) => SHAPES.has(x.e.name))
    if (!root || items.length < 2) return this.h.flash('Select two or more shapes')
    const paper = await loadPaper()
    const shapes = items.map(({ el }) => {
      const p = new paper.CompoundPath(shapeToPath(el) ?? '')
      const m = toRoot(el, root)
      p.transform(new paper.Matrix(m.a, m.b, m.c, m.d, m.e, m.f))
      return p
    })
    let result: paper.PathItem = shapes[0]
    for (const s of shapes.slice(1)) result = result[op](s, { insert: false }) as paper.PathItem
    const back = parentToRoot(items[0].el, root).inverse()
    result.transform(new paper.Matrix(back.a, back.b, back.c, back.d, back.e, back.f))
    const d = result.pathData
    paper.project.clear()
    if (!d) return this.h.flash('Nothing is left after that operation')
    const src = this.src
    const first = items[0].e
    let text = this.pathText(first, d, src)
    // the result is already in its parent's space, so the old transform no longer applies
    text = text.replace(/\stransform="[^"]*"/, '')
    if (op === 'exclude' && !/fill-rule=/.test(text)) text = text.replace(/^<path/, '<path fill-rule="evenodd"')
    const changes: ChangeSpec[] = [{ from: first.start, to: first.end, insert: text }]
    for (const x of items.slice(1)) {
      const c = chunk(x.e, src)
      changes.push({ from: c.from, to: c.to, insert: '' })
    }
    this.h.apply(changes, (map) => [map(first.start, -1)])
  }

  /** Smooth away unnecessary nodes (Paper.js), keeping the shape. */
  async simplify(tolerance = 1) {
    const items = this.graphics(this.topLevel()).filter((x) => x.e.name === 'path')
    if (!items.length) return this.h.flash('Select a path to simplify')
    const paper = await loadPaper()
    const changes: ChangeSpec[] = []
    for (const { e } of items) {
      const p = new paper.CompoundPath(attr(e, 'd')?.value ?? '')
      for (const c of p.children as paper.Path[]) c.simplify(tolerance)
      const a = attr(e, 'd')!
      changes.push({ from: a.valueStart, to: a.valueEnd, insert: p.pathData })
    }
    paper.project.clear()
    this.h.apply(changes, (map) => items.map((x) => map(x.e.start, 1)))
  }

  /** Where new things go: inside the selected group, else beside the selection, else at the end of the artwork. */
  insertTarget(): SrcElement | null {
    const els = this.h.els()
    const sel = this.h.selection().map((i) => els[i])
    const g = sel.find((e) => e.name === 'g' || e.i === 0)
    if (g) return g
    if (sel[0]?.parent) return sel[0].parent
    return els[0] ?? null
  }

  /** Insert markup (in root coordinates) into the current layer, and select it. */
  insert(markup: string) {
    const root = this.h.root()
    const target = this.insertTarget()
    if (!root || !target) return
    const src = this.src
    const at = insertionPoint(target, src)
    if (at === null) return
    // inside a transformed group, cancel the group's transform so root coordinates still land right
    if (target.i !== 0) {
      const el = this.h.element(target.i)
      if (el && isGraphic(el)) {
        const t = transformString(toRoot(el, root).inverse())
        if (t) markup = markup.replace(/^<(\w+)/, `<$1 transform="${t}"`)
      }
    }
    const indent = childIndent(target, src)
    const lead = `\n${indent}`
    this.h.apply([{ from: at, insert: lead + markup }], (map) => [map(at, -1) + lead.length])
  }
}

type PaperScope = typeof import('paper')
let paperP: Promise<PaperScope> | null = null
/** Paper.js, loaded the first time a path operation needs it. */
export function loadPaper() {
  paperP ??= import('paper/dist/paper-core').then((m) => {
    const paper = ((m as unknown as { default?: PaperScope }).default ?? m) as PaperScope
    paper.setup(new paper.Size(10, 10))
    return paper
  })
  return paperP
}
