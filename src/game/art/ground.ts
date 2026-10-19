// A bit of background for the test scene: cel-shaded grass, with stones and flowers.

/** One seamless tile of grass, world pixels. */
export const GRASS_TILE = 384

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f = (n: number) => +n.toFixed(1)

/** Grass: a mottled base, darker patches, and tufts of blades lit from the upper left. */
export function grassSvg(seed = 7) {
  const r = rng(seed)
  const S = GRASS_TILE
  let body = `<rect width="${S}" height="${S}" fill="#4f6a3a"/>`
  // soft patches, repeated across the edges so the tile wraps
  const wrap = (x: number, y: number, draw: (x: number, y: number) => string) => {
    let s = ''
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) s += draw(x + dx, y + dy)
    return s
  }
  for (let i = 0; i < 14; i++) {
    const x = r() * S
    const y = r() * S
    const rx = 30 + r() * 60
    const ry = rx * (0.5 + r() * 0.3)
    const c = r() < 0.5 ? '#46603a' : '#58743f'
    body += wrap(x, y, (X, Y) => `<ellipse cx="${f(X)}" cy="${f(Y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${c}" opacity="0.7"/>`)
  }
  // tufts: three to five blades, a dark side and a lit side
  for (let i = 0; i < 70; i++) {
    const x = r() * S
    const y = r() * S
    const n = 3 + Math.floor(r() * 3)
    const h = 6 + r() * 7
    const blades = Array.from({ length: n }, (_, k) => ({ ox: (k - n / 2) * 2.2 + r() * 1.5, lean: (r() - 0.5) * 5, lit: k < n / 2 }))
    body += wrap(x, y, (X, Y) =>
      blades
        .map(
          ({ ox, lean, lit }) =>
            `<path d="M${f(X + ox - 1.2)} ${f(Y)} Q${f(X + ox + lean * 0.4)} ${f(Y - h * 0.6)} ${f(X + ox + lean)} ${f(Y - h)} Q${f(X + ox + lean * 0.3 + 0.6)} ${f(Y - h * 0.5)} ${f(X + ox + 1.2)} ${f(Y)}Z" fill="${lit ? '#7c9a4e' : '#3e5530'}" stroke="#2a3a22" stroke-width="0.6"/>`,
        )
        .join(''),
    )
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>`
}

/** A mossy stone, seen from the elevated three-quarter view. */
export function stoneSvg(seed: number) {
  const r = rng(seed)
  const w = 40 + r() * 40
  const h = w * (0.55 + r() * 0.2)
  const W = Math.ceil(w + 16)
  const H = Math.ceil(h + 16)
  const cx = W / 2
  const by = H - 6
  const pts: string[] = []
  const N = 9
  for (let i = 0; i < N; i++) {
    const t = Math.PI + (i / (N - 1)) * Math.PI
    const rr = 0.85 + r() * 0.2
    pts.push(`${f(cx + Math.cos(t) * (w / 2) * rr)},${f(by + Math.sin(t) * h * rr)}`)
  }
  const outline = `M${f(cx - w / 2)} ${by} L${pts.join(' L')} L${f(cx + w / 2)} ${by} Q${f(cx)} ${by + 5} ${f(cx - w / 2)} ${by}Z`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><radialGradient id="g" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#9a978c"/><stop offset="0.55" stop-color="#7a776d"/><stop offset="0.56" stop-color="#626058"/><stop offset="1" stop-color="#4a4842"/></radialGradient>
    <clipPath id="c"><path d="${outline}"/></clipPath>
    <radialGradient id="s"><stop offset="0" stop-color="#000" stop-opacity="0.4"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="${f(cx + 3)}" cy="${by}" rx="${f(w * 0.6)}" ry="${f(h * 0.25)}" fill="url(#s)"/>
    <path d="${outline}" fill="url(#g)"/>
    <g clip-path="url(#c)"><ellipse cx="${f(cx - w * 0.15)}" cy="${f(by - h * 0.95)}" rx="${f(w * 0.35)}" ry="${f(h * 0.25)}" fill="#6f8a48"/><ellipse cx="${f(cx - w * 0.2)}" cy="${f(by - h * 1.0)}" rx="${f(w * 0.2)}" ry="${f(h * 0.12)}" fill="#8aa45a"/>
    <path d="M${f(cx + w * 0.1)} ${f(by - h * 0.7)} l${f(w * 0.08)} ${f(h * 0.3)} l${f(-w * 0.05)} ${f(h * 0.25)}" stroke="#3a3833" stroke-width="1.2" fill="none"/></g>
    <path d="${outline}" fill="none" stroke="#1e1d1a" stroke-width="1.4" stroke-linejoin="round"/>
  </svg>`
}

/** A small clump of flowers. */
export function flowersSvg(seed: number, colour: string) {
  const r = rng(seed)
  let s = ''
  for (let i = 0; i < 5; i++) {
    const x = 6 + r() * 20
    const y = 10 + r() * 10
    s += `<path d="M${f(x)} ${f(y + 8)} Q${f(x + 1)} ${f(y + 4)} ${f(x)} ${f(y)}" stroke="#3e5530" stroke-width="1" fill="none"/>`
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="2.6" fill="${colour}" stroke="#2a2018" stroke-width="0.6"/><circle cx="${f(x - 0.7)}" cy="${f(y - 0.7)}" r="0.9" fill="#fff6d8" opacity="0.8"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${s}</svg>`
}
