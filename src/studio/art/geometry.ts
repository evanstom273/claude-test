/**
 * Geometry for selected elements: bounding boxes in artwork units, and the
 * transform maths for moving, resizing and rotating them. Transforms are
 * written back as readable translate/rotate/skewX/scale.
 */

export const isGraphic = (el: Element): el is SVGGraphicsElement => typeof (el as SVGGraphicsElement).getBBox === 'function'

/** Matrix from an element's own user space to the root artwork's user space. */
export function toRoot(el: SVGGraphicsElement, root: SVGSVGElement) {
  const r = root.getScreenCTM()
  const m = el.getScreenCTM()
  if (!r || !m) return new DOMMatrix()
  return DOMMatrix.fromMatrix(r).inverse().multiply(DOMMatrix.fromMatrix(m))
}

/** Matrix from the element's parent's user space to root space. */
export function parentToRoot(el: SVGGraphicsElement, root: SVGSVGElement) {
  const p = el.parentNode as Element | null
  if (!p || p === root || !isGraphic(p)) return new DOMMatrix()
  return toRoot(p, root)
}

/** The element's own transform attribute as one matrix. */
export function ownMatrix(el: SVGGraphicsElement) {
  const t = el.transform?.baseVal
  const m = t && t.numberOfItems ? t.consolidate()?.matrix : null
  return m ? DOMMatrix.fromMatrix(m) : new DOMMatrix()
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The four corners of the element's box, in root units. */
export function corners(el: SVGGraphicsElement, root: SVGSVGElement) {
  let b: DOMRect
  try {
    b = el.getBBox()
  } catch {
    return null
  }
  const m = toRoot(el, root)
  return [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x + b.width, b.y + b.height],
    [b.x, b.y + b.height],
  ].map(([x, y]) => m.transformPoint(new DOMPoint(x, y)))
}

/** Axis-aligned bounds in root units. */
export function rootBox(el: SVGGraphicsElement, root: SVGSVGElement): Box | null {
  const c = corners(el, root)
  if (!c) return null
  const xs = c.map((p) => p.x)
  const ys = c.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

const r3 = (n: number) => {
  const v = Math.round(n * 1000) / 1000
  return Object.is(v, -0) ? 0 : v
}

/** Split a matrix into translate · rotate · skewX · scale. */
export function decompose(m: DOMMatrix) {
  const { a, b, c, d, e, f } = m
  const sx = Math.hypot(a, b)
  const r = Math.atan2(b, a)
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const t = cos * c + sin * d
  const sy = -sin * c + cos * d
  return { tx: e, ty: f, rotate: (r * 180) / Math.PI, skewX: sy ? (Math.atan(t / sy) * 180) / Math.PI : 0, sx, sy }
}

/** A transform attribute value for a matrix, or null for none. */
export function transformString(m: DOMMatrix) {
  const p = decompose(m)
  const parts: string[] = []
  if (r3(p.tx) || r3(p.ty)) parts.push(`translate(${r3(p.tx)} ${r3(p.ty)})`)
  if (r3(p.rotate)) parts.push(`rotate(${r3(p.rotate)})`)
  if (r3(p.skewX)) parts.push(`skewX(${r3(p.skewX)})`)
  if (r3(p.sx) !== 1 || r3(p.sy) !== 1) parts.push(r3(p.sx) === r3(p.sy) ? `scale(${r3(p.sx)})` : `scale(${r3(p.sx)} ${r3(p.sy)})`)
  return parts.length ? parts.join(' ') : null
}

/** Express a change made in root space as a change in the element's parent space. */
export function inParent(el: SVGGraphicsElement, root: SVGSVGElement, rootChange: DOMMatrix) {
  const p = parentToRoot(el, root)
  return p.inverse().multiply(rootChange).multiply(p)
}

/** New transform after moving by (dx, dy) root units. */
export function moved(el: SVGGraphicsElement, root: SVGSVGElement, dx: number, dy: number, base = ownMatrix(el)) {
  return inParent(el, root, new DOMMatrix().translate(dx, dy)).multiply(base)
}

/** New transform after scaling the bounds to a new width and height, anchored top-left. */
export function resized(el: SVGGraphicsElement, root: SVGSVGElement, box: Box, width: number, height: number) {
  const sx = box.width ? width / box.width : 1
  const sy = box.height ? height / box.height : 1
  const change = new DOMMatrix().translate(box.x, box.y).scale(sx, sy).translate(-box.x, -box.y)
  return inParent(el, root, change).multiply(ownMatrix(el))
}

/** New transform after rotating by delta degrees about the element's centre. */
export function rotated(el: SVGGraphicsElement, root: SVGSVGElement, delta: number) {
  const box = rootBox(el, root)
  if (!box) return ownMatrix(el)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const change = new DOMMatrix().translate(cx, cy).rotate(delta).translate(-cx, -cy)
  return inParent(el, root, change).multiply(ownMatrix(el))
}

/** The element's rotation as it appears in the artwork, in degrees. */
export function rootRotation(el: SVGGraphicsElement, root: SVGSVGElement) {
  return decompose(toRoot(el, root)).rotate
}

/** The element's new own transform after a change made in root space. */
export function applyRoot(el: SVGGraphicsElement, root: SVGSVGElement, change: DOMMatrix, base = ownMatrix(el)) {
  return inParent(el, root, change).multiply(base)
}

/** Bounds of several elements together, in root units. */
export function unionBox(els: SVGGraphicsElement[], root: SVGSVGElement): Box | null {
  let b: Box | null = null
  for (const el of els) {
    const r = rootBox(el, root)
    if (!r) continue
    if (!b) b = { ...r }
    else {
      const x2 = Math.max(b.x + b.width, r.x + r.width)
      const y2 = Math.max(b.y + b.height, r.y + r.height)
      b.x = Math.min(b.x, r.x)
      b.y = Math.min(b.y, r.y)
      b.width = x2 - b.x
      b.height = y2 - b.y
    }
  }
  return b
}

/** A point of a box picked by a 3×3 origin grid (0..2 across, 0..2 down). */
export function boxPoint(b: Box, ox: number, oy: number) {
  return { x: b.x + (b.width * ox) / 2, y: b.y + (b.height * oy) / 2 }
}
