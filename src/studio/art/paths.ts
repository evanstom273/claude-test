/**
 * Path data as editable nodes. Every path is read into absolute cubic
 * segments (lines are kept as lines), so nodes and their control handles
 * can be dragged, added, removed, and written back as clean path data.
 */

export interface PathNode {
  x: number
  y: number
  /** Control handle coming into this node, and going out of it (absolute). Null = straight. */
  in: { x: number; y: number } | null
  out: { x: number; y: number } | null
}

export interface SubPath {
  nodes: PathNode[]
  closed: boolean
}

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi

function tokens(d: string) {
  const out: (string | number)[] = []
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) out.push(m[1] ?? parseFloat(m[2]))
  return out
}

/** Arc to cubic curves (from the SVG spec's endpoint parameterisation). */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, phi: number, fa: number, fs: number, x2: number, y2: number): number[][] {
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]]
  const rad = (phi * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lam > 1) {
    rx *= Math.sqrt(lam)
    ry *= Math.sqrt(lam)
  }
  const sign = fa === fs ? -1 : 1
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const co = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)))
  const cxp = (co * rx * y1p) / ry
  const cyp = (-co * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!fs && dt > 0) dt -= 2 * Math.PI
  if (fs && dt < 0) dt += 2 * Math.PI
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2))
  const out: number[][] = []
  const step = dt / n
  const k = (4 / 3) * Math.tan(step / 4)
  let t = t1
  const pt = (a: number) => [cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos]
  const dpt = (a: number) => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos]
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pt(t)
    const [bx, by] = pt(t + step)
    const [dax, day] = dpt(t)
    const [dbx, dby] = dpt(t + step)
    out.push([ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by])
    t += step
  }
  return out
}

/** Read path data into subpaths of nodes. */
export function parsePath(d: string): SubPath[] {
  const t = tokens(d)
  const subs: SubPath[] = []
  let cur: SubPath | null = null
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let cmd = ''
  let lastCtrl: { x: number; y: number } | null = null
  let lastQ: { x: number; y: number } | null = null
  let i = 0
  const num = () => t[i++] as number
  const last = () => cur!.nodes[cur!.nodes.length - 1]
  const lineTo = (nx: number, ny: number) => {
    cur!.nodes.push({ x: nx, y: ny, in: null, out: null })
    x = nx
    y = ny
  }
  const curveTo = (c1x: number, c1y: number, c2x: number, c2y: number, nx: number, ny: number) => {
    // a control point sitting on its own node is no handle at all
    const same = (ax: number, ay: number, bx: number, by: number) => Math.abs(ax - bx) < 1e-6 && Math.abs(ay - by) < 1e-6
    const l = last()
    l.out = same(c1x, c1y, l.x, l.y) ? null : { x: c1x, y: c1y }
    cur!.nodes.push({ x: nx, y: ny, in: same(c2x, c2y, nx, ny) ? null : { x: c2x, y: c2y }, out: null })
    x = nx
    y = ny
  }
  while (i < t.length) {
    if (typeof t[i] === 'string') cmd = t[i++] as string
    else if (!cmd) {
      i++
      continue
    }
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    if (C === 'Z') {
      if (cur) {
        cur.closed = true
        // a closing node on top of the first one is the same node
        const f = cur.nodes[0]
        const l = last()
        if (cur.nodes.length > 1 && Math.abs(l.x - f.x) < 1e-9 && Math.abs(l.y - f.y) < 1e-9) {
          f.in = l.in
          cur.nodes.pop()
        }
      }
      x = sx
      y = sy
      cmd = ''
      lastCtrl = lastQ = null
      continue
    }
    if (C === 'M') {
      cur = { nodes: [], closed: false }
      subs.push(cur)
      const nx = num() + ox
      const ny = num() + oy
      cur.nodes.push({ x: nx, y: ny, in: null, out: null })
      x = sx = nx
      y = sy = ny
      cmd = rel ? 'l' : 'L'
      lastCtrl = lastQ = null
      continue
    }
    if (!cur) {
      cur = { nodes: [{ x, y, in: null, out: null }], closed: false }
      subs.push(cur)
    }
    if (cur.closed) {
      // drawing on after Z starts a new subpath at the same point
      cur = { nodes: [{ x: sx, y: sy, in: null, out: null }], closed: false }
      subs.push(cur)
    }
    if (C === 'L') {
      lineTo(num() + ox, num() + oy)
      lastCtrl = lastQ = null
    } else if (C === 'H') {
      lineTo(num() + ox, y)
      lastCtrl = lastQ = null
    } else if (C === 'V') {
      lineTo(x, num() + oy)
      lastCtrl = lastQ = null
    } else if (C === 'C') {
      const a = [num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy]
      curveTo(a[0], a[1], a[2], a[3], a[4], a[5])
      lastCtrl = { x: a[2], y: a[3] }
      lastQ = null
    } else if (C === 'S') {
      const r = lastCtrl ? { x: 2 * x - lastCtrl.x, y: 2 * y - lastCtrl.y } : { x, y }
      const a = [num() + ox, num() + oy, num() + ox, num() + oy]
      curveTo(r.x, r.y, a[0], a[1], a[2], a[3])
      lastCtrl = { x: a[0], y: a[1] }
      lastQ = null
    } else if (C === 'Q' || C === 'T') {
      const q: { x: number; y: number } = C === 'Q' ? { x: num() + ox, y: num() + oy } : lastQ ? { x: 2 * x - lastQ.x, y: 2 * y - lastQ.y } : { x, y }
      const nx = num() + ox
      const ny = num() + oy
      curveTo(x + (2 / 3) * (q.x - x), y + (2 / 3) * (q.y - y), nx + (2 / 3) * (q.x - nx), ny + (2 / 3) * (q.y - ny), nx, ny)
      lastQ = q
      lastCtrl = null
    } else if (C === 'A') {
      const [rx, ry, rot, fa, fs] = [num(), num(), num(), num(), num()]
      const nx = num() + ox
      const ny = num() + oy
      for (const c of arcToCubics(x, y, rx, ry, rot, fa, fs, nx, ny)) curveTo(c[0], c[1], c[2], c[3], c[4], c[5])
      lastCtrl = lastQ = null
    } else i++
  }
  return subs.filter((s) => s.nodes.length)
}

const r = (n: number) => {
  const v = Math.round(n * 100) / 100
  return Object.is(v, -0) ? '0' : String(v)
}

/** Write subpaths back as compact absolute path data. */
export function writePath(subs: SubPath[]): string {
  const parts: string[] = []
  for (const s of subs) {
    if (!s.nodes.length) continue
    const n = s.nodes
    parts.push(`M${r(n[0].x)} ${r(n[0].y)}`)
    const seg = (a: PathNode, b: PathNode) => {
      if (!a.out && !b.in) return `L${r(b.x)} ${r(b.y)}`
      const c1 = a.out ?? a
      const c2 = b.in ?? b
      return `C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(b.x)} ${r(b.y)}`
    }
    for (let i = 1; i < n.length; i++) parts.push(seg(n[i - 1], n[i]))
    if (s.closed) {
      const a = n[n.length - 1]
      const b = n[0]
      if (a.out || b.in) parts.push(seg(a, b))
      parts.push('Z')
    }
  }
  return parts.join(' ')
}

/** Basic shapes as path data, so they can be node-edited or combined. */
export function shapeToPath(el: Element): string | null {
  const n = (a: string) => parseFloat(el.getAttribute(a) ?? '0') || 0
  const k = 0.5522847498
  switch (el.localName) {
    case 'path':
      return el.getAttribute('d') ?? ''
    case 'rect': {
      const x = n('x')
      const y = n('y')
      const w = n('width')
      const h = n('height')
      let rx = el.hasAttribute('rx') ? n('rx') : el.hasAttribute('ry') ? n('ry') : 0
      let ry = el.hasAttribute('ry') ? n('ry') : rx
      rx = Math.min(rx, w / 2)
      ry = Math.min(ry, h / 2)
      if (!rx || !ry) return `M${r(x)} ${r(y)} L${r(x + w)} ${r(y)} L${r(x + w)} ${r(y + h)} L${r(x)} ${r(y + h)} Z`
      const kx = rx * k
      const ky = ry * k
      return [
        `M${r(x + rx)} ${r(y)}`,
        `L${r(x + w - rx)} ${r(y)}`,
        `C${r(x + w - rx + kx)} ${r(y)} ${r(x + w)} ${r(y + ry - ky)} ${r(x + w)} ${r(y + ry)}`,
        `L${r(x + w)} ${r(y + h - ry)}`,
        `C${r(x + w)} ${r(y + h - ry + ky)} ${r(x + w - rx + kx)} ${r(y + h)} ${r(x + w - rx)} ${r(y + h)}`,
        `L${r(x + rx)} ${r(y + h)}`,
        `C${r(x + rx - kx)} ${r(y + h)} ${r(x)} ${r(y + h - ry + ky)} ${r(x)} ${r(y + h - ry)}`,
        `L${r(x)} ${r(y + ry)}`,
        `C${r(x)} ${r(y + ry - ky)} ${r(x + rx - kx)} ${r(y)} ${r(x + rx)} ${r(y)}`,
        'Z',
      ].join(' ')
    }
    case 'circle':
    case 'ellipse': {
      const cx = n('cx')
      const cy = n('cy')
      const rx = el.localName === 'circle' ? n('r') : n('rx')
      const ry = el.localName === 'circle' ? n('r') : n('ry')
      const kx = rx * k
      const ky = ry * k
      return [
        `M${r(cx + rx)} ${r(cy)}`,
        `C${r(cx + rx)} ${r(cy + ky)} ${r(cx + kx)} ${r(cy + ry)} ${r(cx)} ${r(cy + ry)}`,
        `C${r(cx - kx)} ${r(cy + ry)} ${r(cx - rx)} ${r(cy + ky)} ${r(cx - rx)} ${r(cy)}`,
        `C${r(cx - rx)} ${r(cy - ky)} ${r(cx - kx)} ${r(cy - ry)} ${r(cx)} ${r(cy - ry)}`,
        `C${r(cx + kx)} ${r(cy - ry)} ${r(cx + rx)} ${r(cy - ky)} ${r(cx + rx)} ${r(cy)}`,
        'Z',
      ].join(' ')
    }
    case 'line':
      return `M${r(n('x1'))} ${r(n('y1'))} L${r(n('x2'))} ${r(n('y2'))}`
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') ?? '').match(NUM)?.map(Number) ?? []
      if (pts.length < 2) return null
      const segs = [`M${r(pts[0])} ${r(pts[1])}`]
      for (let i = 2; i + 1 < pts.length; i += 2) segs.push(`L${r(pts[i])} ${r(pts[i + 1])}`)
      if (el.localName === 'polygon') segs.push('Z')
      return segs.join(' ')
    }
  }
  return null
}

/** Points of a regular polygon or star centred on (cx, cy). */
export function polygonPoints(cx: number, cy: number, radius: number, sides: number, inner: number | null, rotation = -90) {
  const pts: string[] = []
  const n = inner === null ? sides : sides * 2
  for (let i = 0; i < n; i++) {
    const a = ((rotation + (360 / n) * i) * Math.PI) / 180
    const rad = inner !== null && i % 2 ? radius * inner : radius
    pts.push(`${r(cx + rad * Math.cos(a))},${r(cy + rad * Math.sin(a))}`)
  }
  return pts.join(' ')
}

/** Split a cubic segment at t (de Casteljau), for adding a node on a curve. */
export function splitSegment(a: PathNode, b: PathNode, t: number) {
  const p0 = { x: a.x, y: a.y }
  const p1 = a.out ?? p0
  const p3 = { x: b.x, y: b.y }
  const p2 = b.in ?? p3
  const lerp = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
  if (!a.out && !b.in) {
    const m = lerp(p0, p3)
    return { mid: { x: m.x, y: m.y, in: null, out: null } as PathNode, aOut: null, bIn: null }
  }
  const p01 = lerp(p0, p1)
  const p12 = lerp(p1, p2)
  const p23 = lerp(p2, p3)
  const p012 = lerp(p01, p12)
  const p123 = lerp(p12, p23)
  const m = lerp(p012, p123)
  return { mid: { x: m.x, y: m.y, in: p012, out: p123 } as PathNode, aOut: p01, bIn: p23 }
}

/** The nearest point on a segment: its t and distance, by sampling then refining. */
export function nearestOnSegment(a: PathNode, b: PathNode, px: number, py: number) {
  const p0 = { x: a.x, y: a.y }
  const p1 = a.out ?? p0
  const p3 = { x: b.x, y: b.y }
  const p2 = b.in ?? p3
  const at = (t: number) => {
    const u = 1 - t
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    }
  }
  let best = { t: 0, d: Infinity }
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    const q = at(t)
    const d = Math.hypot(q.x - px, q.y - py)
    if (d < best.d) best = { t, d }
  }
  for (let step = 1 / 80; step > 1e-4; step /= 2) {
    for (const t of [best.t - step, best.t + step]) {
      if (t < 0 || t > 1) continue
      const q = at(t)
      const d = Math.hypot(q.x - px, q.y - py)
      if (d < best.d) best = { t, d }
    }
  }
  return best
}
