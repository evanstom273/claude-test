import type { Box } from './geometry'

/**
 * Snapping: points and moving boxes are pulled onto the grid, guides, the
 * artboard, and the edges and centres of other objects, within a few pixels.
 * The lines it snapped to are returned so they can be shown.
 */

export interface SnapSettings {
  grid: boolean
  guides: boolean
  objects: boolean
  gridSize: number
}

export interface SnapTargets {
  /** Candidate x and y lines in artwork units. */
  xs: number[]
  ys: number[]
  gridSize: number | null
}

export interface SnapLine {
  axis: 'x' | 'y'
  at: number
}

export function targets(settings: SnapSettings, guides: { x: number[]; y: number[] }, boxes: Box[], artboard: Box): SnapTargets {
  const xs: number[] = []
  const ys: number[] = []
  if (settings.guides) {
    xs.push(...guides.x)
    ys.push(...guides.y)
  }
  if (settings.objects) {
    for (const b of [...boxes, artboard]) {
      xs.push(b.x, b.x + b.width / 2, b.x + b.width)
      ys.push(b.y, b.y + b.height / 2, b.y + b.height)
    }
  }
  return { xs, ys, gridSize: settings.grid ? settings.gridSize : null }
}

function nearest(values: number[], grid: number | null, v: number, tol: number) {
  let best: { d: number; to: number; line: boolean } | null = null
  for (const t of values) {
    const d = Math.abs(t - v)
    if (d <= tol && (!best || d < Math.abs(best.d))) best = { d: t - v, to: t, line: true }
  }
  if (grid) {
    const g = Math.round(v / grid) * grid
    const d = Math.abs(g - v)
    if (d <= tol && (!best || d < Math.abs(best.d))) best = { d: g - v, to: g, line: false }
  }
  return best
}

/** Snap a single point. tol is in artwork units. */
export function snapPoint(t: SnapTargets, x: number, y: number, tol: number) {
  const sx = nearest(t.xs, t.gridSize, x, tol)
  const sy = nearest(t.ys, t.gridSize, y, tol)
  const lines: SnapLine[] = []
  if (sx?.line) lines.push({ axis: 'x', at: sx.to })
  if (sy?.line) lines.push({ axis: 'y', at: sy.to })
  return { x: sx ? sx.to : x, y: sy ? sy.to : y, lines }
}

/** Snap a box being moved by (dx, dy): its edges and centre try every target. */
export function snapBox(t: SnapTargets, b: Box, dx: number, dy: number, tol: number) {
  const pick = (edges: number[], values: number[]) => {
    let best: { d: number; to: number; line: boolean } | null = null
    for (const e of edges) {
      const n = nearest(values, null, e, tol)
      if (n && (!best || Math.abs(n.d) < Math.abs(best.d))) best = n
    }
    // the grid only snaps the box's top-left corner, like most editors
    if (t.gridSize) {
      const g = Math.round(edges[0] / t.gridSize) * t.gridSize
      if (Math.abs(g - edges[0]) <= tol && (!best || Math.abs(g - edges[0]) < Math.abs(best.d))) best = { d: g - edges[0], to: g, line: false }
    }
    return best
  }
  const x0 = b.x + dx
  const y0 = b.y + dy
  const sx = pick([x0, x0 + b.width / 2, x0 + b.width], t.xs)
  const sy = pick([y0, y0 + b.height / 2, y0 + b.height], t.ys)
  const lines: SnapLine[] = []
  if (sx?.line) lines.push({ axis: 'x', at: sx.to })
  if (sy?.line) lines.push({ axis: 'y', at: sy.to })
  return { dx: dx + (sx?.d ?? 0), dy: dy + (sy?.d ?? 0), lines }
}
