/**
 * Plants seen from above: tree crowns as clusters of cel-shaded leaf masses,
 * bushes, and grass tufts. Each is an SVG string; variants come from the seed.
 */

const INK = '#16200f'
const f = (n: number) => +n.toFixed(2)

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hsl = (h: number, s: number, l: number) => `hsl(${f(h)} ${f(s)}% ${f(l)}%)`

/** A rounded crown of leaf clumps, light from the upper left, shadow cast down-right. */
export function crownSvg(seed: number, size: number, hue: number, kind: 'tree' | 'bush') {
  const r = rng(seed)
  const S = Math.ceil(size * 1.5)
  const c = S / 2 - size * 0.08
  const R = size / 2
  const clumps: { x: number; y: number; r: number }[] = []
  const n = kind === 'tree' ? 7 + Math.floor(r() * 3) : 4 + Math.floor(r() * 2)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5
    const d = R * (0.35 + r() * 0.25)
    clumps.push({ x: c + Math.cos(a) * d, y: c + Math.sin(a) * d, r: R * (0.42 + r() * 0.14) })
  }
  clumps.push({ x: c - R * 0.08, y: c - R * 0.08, r: R * 0.5 })
  const sat = kind === 'tree' ? 34 : 32
  const dark = hsl(hue, sat, 20)
  const mid = hsl(hue, sat, 31)
  const lite = hsl(hue + 6, sat + 6, 43)
  const glint = hsl(hue + 12, sat + 10, 56)
  const union = clumps.map((k) => `<circle cx="${f(k.x)}" cy="${f(k.y)}" r="${f(k.r)}"/>`).join('')
  let s = ''
  // cast shadow on the ground
  s += `<g transform="translate(${f(size * 0.12)} ${f(size * 0.16)})" fill="#000" opacity="0.32">${union}</g>`
  // the outline is the union's silhouette, then cel bands per clump
  s += `<g fill="${INK}" transform="translate(0 0)">${clumps.map((k) => `<circle cx="${f(k.x)}" cy="${f(k.y)}" r="${f(k.r + 1.3)}"/>`).join('')}</g>`
  s += `<g fill="${dark}">${union}</g>`
  for (const k of clumps) {
    s += `<circle cx="${f(k.x - k.r * 0.12)}" cy="${f(k.y - k.r * 0.15)}" r="${f(k.r * 0.86)}" fill="${mid}"/>`
  }
  for (const k of clumps) {
    s += `<circle cx="${f(k.x - k.r * 0.3)}" cy="${f(k.y - k.r * 0.34)}" r="${f(k.r * 0.5)}" fill="${lite}"/>`
    // a few leaf marks
    for (let j = 0; j < 3; j++) {
      const a = r() * Math.PI * 2
      const d = r() * k.r * 0.6
      s += `<path d="M${f(k.x + Math.cos(a) * d)} ${f(k.y + Math.sin(a) * d)} q${f(k.r * 0.12)} ${f(-k.r * 0.1)} ${f(k.r * 0.24)} 0" stroke="${dark}" stroke-width="0.9" fill="none" opacity="0.7"/>`
    }
  }
  s += `<circle cx="${f(c - R * 0.35)}" cy="${f(c - R * 0.4)}" r="${f(R * 0.13)}" fill="${glint}" opacity="0.8"/>`
  if (kind === 'bush' && r() < 0.6) {
    // berries
    for (let j = 0; j < 4; j++) {
      const a = r() * Math.PI * 2
      const d = R * 0.5 * r()
      s += `<circle cx="${f(c + Math.cos(a) * d)}" cy="${f(c + Math.sin(a) * d)}" r="${f(Math.max(1.4, R * 0.09))}" fill="${hsl(350 + r() * 30, 60, 50)}" stroke="${INK}" stroke-width="0.6"/>`
    }
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${s}</svg>`, size: S }
}

/** A grass tuft seen from above: blades fanning out from a centre. */
export function tuftSvg(seed: number, size: number, hue: number) {
  const r = rng(seed)
  const S = Math.ceil(size)
  const c = S / 2
  let s = ''
  const n = 6 + Math.floor(r() * 4)
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const l = size * (0.25 + r() * 0.22)
    const x2 = c + Math.cos(a) * l
    const y2 = c + Math.sin(a) * l
    const lit = Math.cos(a) * -0.6 + Math.sin(a) * -0.8 > 0
    s += `<path d="M${f(c)} ${f(c)} Q${f(c + Math.cos(a + 0.3) * l * 0.6)} ${f(c + Math.sin(a + 0.3) * l * 0.6)} ${f(x2)} ${f(y2)}" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity="0.6"/>`
    s += `<path d="M${f(c)} ${f(c)} Q${f(c + Math.cos(a + 0.3) * l * 0.6)} ${f(c + Math.sin(a + 0.3) * l * 0.6)} ${f(x2)} ${f(y2)}" stroke="${hsl(hue, 45, lit ? 48 : 30)}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${s}</svg>`, size: S }
}
