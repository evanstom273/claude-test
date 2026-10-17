export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f1 = (n: number) => n.toFixed(1)

/**
 * A cut-paper silhouette: a top edge following `heightAt` with small torn
 * jitter, closed down to `bottom`.
 */
export function tornShape(x0: number, x1: number, bottom: number, heightAt: (x: number) => number, r: () => number, step = 14, jitter = 3) {
  let d = `M${f1(x0)} ${f1(bottom)}`
  for (let x = x0; x <= x1 + step; x += step * (0.6 + r() * 0.8)) {
    const xx = Math.min(x, x1)
    d += `L${f1(xx)} ${f1(heightAt(xx) + (r() - 0.5) * jitter * 2)}`
    if (xx === x1) break
  }
  d += `L${f1(x1)} ${f1(bottom)}Z`
  return d
}

/** Smooth layered noise from a few sines, cheap and deterministic. */
export function hills(seed: number, amp: number, base: number) {
  const r = rng(seed)
  const waves = Array.from({ length: 4 }, (_, i) => ({ f: (0.0015 + r() * 0.002) * (i + 1), p: r() * 10, a: amp / (i + 1.3) }))
  return (x: number) => base + waves.reduce((s, w) => s + Math.sin(x * w.f + w.p) * w.a, 0)
}

/** Polygon with irregular, slightly torn outline around a centre. */
export function blob(cx: number, cy: number, rx: number, ry: number, r: () => number, n = 14, rough = 0.12) {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const k = 1 + (r() - 0.5) * rough * 2
    d += `${i ? 'L' : 'M'}${f1(cx + Math.cos(a) * rx * k)} ${f1(cy + Math.sin(a) * ry * k)}`
  }
  return d + 'Z'
}

/** A twisted, leafless tree silhouette rooted at (x, y). */
export function deadTree(x: number, y: number, h: number, r: () => number) {
  const parts: string[] = []
  const branch = (bx: number, by: number, ang: number, len: number, w: number, depth: number) => {
    const ex = bx + Math.sin(ang) * len
    const ey = by - Math.cos(ang) * len
    const nx = Math.cos(ang) * w
    const ny = Math.sin(ang) * w
    const w2 = w * 0.62
    const nx2 = Math.cos(ang) * w2
    const ny2 = Math.sin(ang) * w2
    const bend = (r() - 0.5) * len * 0.3
    const mx = (bx + ex) / 2 + Math.cos(ang) * bend
    const my = (by + ey) / 2 + Math.sin(ang) * bend
    parts.push(
      `M${f1(bx - nx)} ${f1(by - ny)}Q${f1(mx - nx)} ${f1(my - ny)} ${f1(ex - nx2)} ${f1(ey - ny2)}L${f1(ex + nx2)} ${f1(ey + ny2)}Q${f1(mx + nx)} ${f1(my + ny)} ${f1(bx + nx)} ${f1(by + ny)}Z`,
    )
    if (depth <= 0 || w2 < 0.8) return
    const kids = depth > 2 ? 2 : 2 + (r() < 0.4 ? 1 : 0)
    for (let i = 0; i < kids; i++) {
      const spread = (i / Math.max(1, kids - 1) - 0.5) * 1.5 + (r() - 0.5) * 0.5
      branch(ex, ey, ang + spread, len * (0.55 + r() * 0.25), w2, depth - 1)
    }
  }
  branch(x, y, (r() - 0.5) * 0.25, h * 0.42, h * 0.045, 4)
  return parts.join('')
}
