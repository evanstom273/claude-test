import * as THREE from 'three'

/**
 * Everything in Quillmarch is drawn as SVG and baked onto canvases with a
 * paper grain, so the world looks like inked and painted paper.
 */

const INK = '#2b2118'
const CREAM = '#f4ecd6'

let grainCanvas: HTMLCanvasElement | null = null
function grain() {
  if (grainCanvas) return grainCanvas
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(256, 256)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + Math.random() * 55
    img.data[i] = v
    img.data[i + 1] = v * 0.97
    img.data[i + 2] = v * 0.9
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  // a few paper fibres
  ctx.strokeStyle = 'rgba(120,100,70,0.12)'
  for (let i = 0; i < 60; i++) {
    ctx.beginPath()
    const x = Math.random() * 256
    const y = Math.random() * 256
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + Math.random() * 20 - 10, y + Math.random() * 20 - 10, x + Math.random() * 30 - 15, y + Math.random() * 30 - 15)
    ctx.stroke()
  }
  grainCanvas = c
  return c
}

const cache = new Map<string, THREE.CanvasTexture>()

export interface TexOpts {
  w?: number
  h?: number
  repeat?: boolean
  /** Strength of the paper grain multiplied over the art. */
  grain?: number
  srgb?: boolean
}

/** Bakes an SVG string to a canvas texture (cached by key). */
export function svgTexture(key: string, svg: string, opts: TexOpts = {}) {
  const hit = cache.get(key)
  if (hit) return hit
  const { w = 256, h = 256, repeat = false, grain: g = 0.35 } = opts
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  const img = new Image()
  img.onload = () => {
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    if (g > 0) {
      ctx.globalCompositeOperation = 'multiply'
      ctx.globalAlpha = g
      const pat = ctx.createPattern(grain(), 'repeat')!
      ctx.fillStyle = pat
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(img, 0, 0, w, h)
      ctx.globalCompositeOperation = 'source-over'
    }
    tex.needsUpdate = true
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  cache.set(key, tex)
  return tex
}

const svg = (w: number, h: number, body: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>`

/** Seeded random so textures are the same every load. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A pale cut-paper edge round a sprite's silhouette. */
const CUT = `<filter id="cut" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="2.2" result="g"/><feFlood flood-color="${CREAM}"/><feComposite in2="g" operator="in" result="edge"/><feMerge><feMergeNode in="edge"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`

// ------------------------------------------------------------- surfaces

export function plasterTex(color: string, seed = 1) {
  const r = rng(seed)
  let blot = ''
  for (let i = 0; i < 14; i++) blot += `<ellipse cx="${r() * 256}" cy="${r() * 256}" rx="${10 + r() * 30}" ry="${6 + r() * 14}" fill="#000" opacity="0.04"/>`
  const beam = '#5a3d26'
  const body = `<rect width="256" height="256" fill="${color}"/>${blot}
  <g fill="${beam}" stroke="${INK}" stroke-width="2">
    <rect x="-8" y="0" width="16" height="256"/><rect x="248" y="0" width="16" height="256"/>
    <rect x="0" y="0" width="256" height="12"/><rect x="0" y="244" width="256" height="14"/>
    <rect x="0" y="128" width="256" height="10"/>
    <path d="M8 138 L120 244 L136 244 L8 124Z"/><path d="M248 12 L136 128 L120 128 L248 0Z"/>
  </g>
  <path d="M20 40 q20 -4 40 2 M180 80 q16 4 30 0 M60 190 q18 -3 30 3" stroke="${INK}" stroke-width="1" opacity="0.25" fill="none"/>`
  return svgTexture(`plaster-${color}-${seed}`, svg(256, 256, body), { repeat: true })
}

export function stoneTex(color: string, dark: string, seed = 2) {
  const r = rng(seed)
  let blocks = ''
  const rows = 6
  const rh = 256 / rows
  for (let y = 0; y < rows; y++) {
    let x = y % 2 ? -32 : 0
    while (x < 256) {
      const bw = 50 + r() * 34
      const shade = r() < 0.3 ? 'opacity="0.85"' : ''
      blocks += `<rect x="${x + 2}" y="${y * rh + 2}" width="${bw - 4}" height="${rh - 4}" rx="4" fill="${r() < 0.5 ? color : dark}" ${shade} stroke="${INK}" stroke-width="1.6"/>`
      if (r() < 0.25) blocks += `<path d="M${x + 10} ${y * rh + 10} l8 6 l-3 8" stroke="${INK}" stroke-width="1" fill="none" opacity="0.6"/>`
      x += bw
    }
  }
  return svgTexture(`stone-${color}-${seed}`, svg(256, 256, `<rect width="256" height="256" fill="#4a4038"/>${blocks}`), { repeat: true })
}

export function roofTex(color: string, dark: string) {
  let tiles = ''
  for (let y = 0; y < 8; y++)
    for (let x = -1; x < 9; x++) {
      const cx = x * 32 + (y % 2 ? 16 : 0)
      tiles += `<path d="M${cx - 16} ${y * 32} L${cx - 16} ${y * 32 + 18} Q${cx} ${y * 32 + 36} ${cx + 16} ${y * 32 + 18} L${cx + 16} ${y * 32}Z" fill="${(x + y) % 3 ? color : dark}" stroke="${INK}" stroke-width="1.6"/>`
    }
  return svgTexture(`roof-${color}`, svg(256, 256, `<rect width="256" height="256" fill="${dark}"/>${tiles}`), { repeat: true })
}

export function thatchTex() {
  const r = rng(9)
  let s = ''
  for (let i = 0; i < 400; i++) {
    const x = r() * 256
    const y = r() * 256
    s += `<path d="M${x} ${y} l${(r() - 0.5) * 6} 22" stroke="${r() < 0.5 ? '#b8903a' : '#8a6a24'}" stroke-width="2"/>`
  }
  let rows = ''
  for (let y = 0; y < 256; y += 32) rows += `<path d="M0 ${y} Q64 ${y + 6} 128 ${y} T256 ${y}" stroke="${INK}" stroke-width="1.5" fill="none" opacity="0.5"/>`
  return svgTexture('thatch', svg(256, 256, `<rect width="256" height="256" fill="#c9a24a"/>${s}${rows}`), { repeat: true })
}

export function plankTex(color: string) {
  let s = `<rect width="256" height="256" fill="${color}"/>`
  for (let x = 0; x < 256; x += 32) {
    s += `<rect x="${x}" y="0" width="32" height="256" fill="none" stroke="${INK}" stroke-width="2"/>`
    s += `<path d="M${x + 10} 20 q4 40 0 80 M${x + 22} 140 q-3 40 0 90" stroke="${INK}" stroke-width="1" opacity="0.35" fill="none"/>`
    s += `<circle cx="${x + 16}" cy="${(x * 7) % 256}" r="3" fill="none" stroke="${INK}" opacity="0.4"/>`
  }
  return svgTexture(`planks-${color}`, svg(256, 256, s), { repeat: true })
}

export function grassTex(variant = '') {
  const r = rng(4)
  let s = `<rect width="256" height="256" fill="#8fae5a"/>`
  for (let i = 0; i < 16; i++) s += `<ellipse cx="${r() * 256}" cy="${r() * 256}" rx="${20 + r() * 40}" ry="${10 + r() * 20}" fill="${r() < 0.5 ? '#7f9f4c' : '#9cbb66'}"/>`
  for (let i = 0; i < 160; i++) {
    const x = r() * 256
    const y = r() * 256
    s += `<path d="M${x} ${y} l-2 -7 M${x + 2} ${y} l1 -8 M${x + 4} ${y} l3 -6" stroke="#5f7d36" stroke-width="1.4"/>`
  }
  for (let i = 0; i < 18; i++) s += `<circle cx="${r() * 256}" cy="${r() * 256}" r="2.4" fill="${['#f4ecd6', '#e8b04a', '#d96a6a'][i % 3]}"/>`
  return svgTexture(`grass${variant}`, svg(256, 256, s), { repeat: true })
}

export function cobbleTex(variant = '') {
  const r = rng(6)
  let s = `<rect width="256" height="256" fill="#6b6258"/>`
  for (let y = 0; y < 256; y += 26)
    for (let x = (y / 26) % 2 ? -13 : 0; x < 256; x += 26) {
      s += `<ellipse cx="${x + 13 + (r() - 0.5) * 4}" cy="${y + 13}" rx="${11 + r() * 2}" ry="${10 + r() * 2}" fill="${['#a49a8a', '#948a7a', '#b4aa98'][Math.floor(r() * 3)]}" stroke="${INK}" stroke-width="1.4"/>`
    }
  return svgTexture(`cobble${variant}`, svg(256, 256, s), { repeat: true })
}

export function dirtTex(variant = '') {
  const r = rng(8)
  let s = `<rect width="256" height="256" fill="#b08a5a"/>`
  for (let i = 0; i < 20; i++) s += `<ellipse cx="${r() * 256}" cy="${r() * 256}" rx="${10 + r() * 30}" ry="${6 + r() * 14}" fill="#a07a4a" opacity="0.7"/>`
  for (let i = 0; i < 60; i++) s += `<circle cx="${r() * 256}" cy="${r() * 256}" r="${1 + r() * 2.5}" fill="#7a5a3a"/>`
  return svgTexture(`dirt${variant}`, svg(256, 256, s), { repeat: true })
}

export function flagstoneTex() {
  const r = rng(12)
  let s = `<rect width="256" height="256" fill="#2e2a28"/>`
  for (let y = 0; y < 256; y += 64)
    for (let x = 0; x < 256; x += 64) s += `<rect x="${x + 3}" y="${y + 3}" width="58" height="58" rx="5" fill="${r() < 0.5 ? '#5a534c' : '#4e4842'}" stroke="${INK}" stroke-width="2"/>`
  for (let i = 0; i < 10; i++) s += `<path d="M${r() * 256} ${r() * 256} l${r() * 14} ${r() * 10} l${r() * 10} -4" stroke="${INK}" stroke-width="1" fill="none"/>`
  return svgTexture('flagstone', svg(256, 256, s), { repeat: true })
}

// ---------------------------------------------------------------- decals

export function doorTex(color = '#6b4a2b') {
  const body = `<path d="M8 256 L8 70 Q8 8 64 8 Q120 8 120 70 L120 256Z" fill="${color}" stroke="${INK}" stroke-width="4"/>
  <path d="M40 30 L40 256 M64 10 L64 256 M88 30 L88 256" stroke="${INK}" stroke-width="2" opacity="0.6"/>
  <rect x="8" y="90" width="112" height="10" fill="#3a3a3a" stroke="${INK}" stroke-width="2"/><rect x="8" y="190" width="112" height="10" fill="#3a3a3a" stroke="${INK}" stroke-width="2"/>
  <circle cx="98" cy="150" r="6" fill="#c9a24a" stroke="${INK}" stroke-width="2"/>`
  return svgTexture(`door-${color}`, svg(128, 256, body), { w: 128, h: 256, grain: 0.3 })
}

export function windowTex(lit: boolean) {
  const glass = lit ? '#ffd27a' : '#3a4a5a'
  const body = `<rect x="6" y="6" width="116" height="116" fill="${glass}" stroke="${INK}" stroke-width="5"/>
  ${lit ? '<rect x="6" y="6" width="116" height="116" fill="#fff4c0" opacity="0.4"/>' : '<path d="M20 30 L50 20 M30 60 L70 40" stroke="#8aa0b0" stroke-width="3" opacity="0.6"/>'}
  <path d="M64 6 L64 122 M6 64 L122 64" stroke="${INK}" stroke-width="5"/>
  <rect x="0" y="118" width="128" height="10" fill="#6b4a2b" stroke="${INK}" stroke-width="2"/>`
  return svgTexture(`window-${lit}`, svg(128, 128, body), { w: 128, h: 128, grain: lit ? 0.1 : 0.3 })
}

export function signTex(text: string, picture: 'goose' | 'scales' | 'anvil' | 'sun') {
  const pics: Record<string, string> = {
    goose: `<g transform="translate(64 70)"><path d="M-30 10 Q-30 -10 0 -6 Q14 -30 22 -26 Q30 -22 26 -14 L36 -12 L26 -8 Q20 0 18 10 Q0 24 -30 10Z" fill="#e0b04a" stroke="${INK}" stroke-width="3"/><circle cx="20" cy="-20" r="2.5" fill="${INK}"/></g>`,
    scales: `<g transform="translate(64 70)" stroke="${INK}" stroke-width="3" fill="#e0b04a"><path d="M0 -26 L0 22 M-28 -18 L28 -18"/><path d="M-36 -2 L-20 -2 L-28 -18Z M20 -2 L36 -2 L28 -18Z"/><rect x="-12" y="20" width="24" height="6"/></g>`,
    anvil: `<g transform="translate(64 74)"><path d="M-34 -16 L26 -16 Q38 -16 40 -8 L14 -4 L10 10 L20 20 L-20 20 L-10 10 L-14 -4 L-34 -6Z" fill="#5a5a60" stroke="${INK}" stroke-width="3"/></g>`,
    sun: `<g transform="translate(64 68)"><circle r="16" fill="#e0b04a" stroke="${INK}" stroke-width="3"/>${Array.from({ length: 10 }, (_, i) => `<path d="M0 -22 L4 -32 L-4 -32Z" transform="rotate(${i * 36})" fill="#e0b04a" stroke="${INK}" stroke-width="2"/>`).join('')}</g>`,
  }
  const body = `<rect x="6" y="6" width="116" height="116" rx="10" fill="#f0e2bc" stroke="${INK}" stroke-width="5"/>${pics[picture]}
  <text x="64" y="112" font-family="Georgia, serif" font-size="13" font-style="italic" text-anchor="middle" fill="${INK}">${text}</text>`
  return svgTexture(`sign-${text}`, svg(128, 128, body), { w: 128, h: 128, grain: 0.25 })
}

// ----------------------------------------------------------------- sky

export function sunTex() {
  let rays = ''
  for (let i = 0; i < 16; i++) rays += `<path d="M0 -70 L10 -100 L-10 -100Z" transform="rotate(${i * 22.5})" fill="#f2c14e" stroke="${INK}" stroke-width="3"/>`
  const body = `<g transform="translate(128 128)" filter="url(#cut)">${rays}<circle r="62" fill="#f2c14e" stroke="${INK}" stroke-width="4"/>
  <circle cx="-20" cy="-8" r="5" fill="${INK}"/><circle cx="20" cy="-8" r="5" fill="${INK}"/><path d="M-18 18 Q0 32 18 18" stroke="${INK}" stroke-width="4" fill="none"/><circle cx="-34" cy="10" r="8" fill="#e8873a" opacity="0.5"/><circle cx="34" cy="10" r="8" fill="#e8873a" opacity="0.5"/></g>`
  return svgTexture('sun', svg(256, 256, body, CUT), { grain: 0.15 })
}

export function moonTex() {
  const body = `<g transform="translate(128 128)" filter="url(#cut)"><path d="M20 -80 A80 80 0 1 0 20 80 A62 62 0 1 1 20 -80Z" fill="#f4ecd6" stroke="${INK}" stroke-width="4"/><circle cx="-30" cy="-10" r="5" fill="${INK}"/><path d="M-50 20 Q-36 30 -24 22" stroke="${INK}" stroke-width="3" fill="none"/></g>`
  return svgTexture('moon', svg(256, 256, body, CUT), { grain: 0.15 })
}

export function cloudTex(seed: number) {
  const r = rng(seed)
  let puffs = ''
  for (let i = 0; i < 6; i++) puffs += `<circle cx="${70 + i * 24 + r() * 10}" cy="${70 - Math.sin((i / 5) * Math.PI) * 26 + r() * 8}" r="${24 + r() * 14}"/>`
  const body = `<g filter="url(#cut)"><g fill="#fffaf0" stroke="${INK}" stroke-width="3">${puffs}</g><rect x="50" y="70" width="160" height="30" fill="#fffaf0"/><path d="M50 100 L210 100" stroke="${INK}" stroke-width="3"/></g>`
  return svgTexture(`cloud-${seed}`, svg(256, 128, body, CUT), { w: 256, h: 128, grain: 0.15 })
}

/** Long strips of paper scenery set round the horizon like a toy theatre. */
export function backdropTex(kind: 'hills' | 'mountains' | 'forest', seed: number) {
  const r = rng(seed)
  const W = 1024
  const H = 256
  let d = `M0 ${H}`
  let extras = ''
  if (kind === 'mountains') {
    let x = 0
    while (x < W) {
      const w = 80 + r() * 120
      const h = 80 + r() * 150
      d += ` L${x} ${H - 30} L${x + w / 2} ${H - h} L${x + w} ${H - 30}`
      extras += `<path d="M${x + w / 2} ${H - h} L${x + w / 2 - w * 0.12} ${H - h + h * 0.25} L${x + w / 2 + 4} ${H - h + h * 0.2} L${x + w / 2 + w * 0.12} ${H - h + h * 0.25}Z" fill="#f4ecd6" stroke="${INK}" stroke-width="2"/>`
      x += w * 0.8
    }
  } else if (kind === 'hills') {
    for (let x = 0; x <= W; x += 16) d += ` L${x} ${H - 70 - Math.sin(x * 0.006 + seed) * 40 - Math.sin(x * 0.017) * 14}`
  } else {
    for (let x = 0; x <= W; x += 14) {
      const tall = 60 + r() * 60
      d += ` L${x} ${H - 40} L${x + 7} ${H - tall} L${x + 14} ${H - 40}`
    }
  }
  d += ` L${W} ${H}Z`
  const fill = kind === 'mountains' ? '#8a96b0' : kind === 'hills' ? '#7a9a5a' : '#4f6e44'
  const body = `<g filter="url(#cut)"><path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>${extras}</g>`
  return svgTexture(`backdrop-${kind}-${seed}`, svg(W, H, body, CUT), { w: W, h: H, grain: 0.3 })
}

// --------------------------------------------------------------- sprites

export interface Outfit {
  skin: string
  hair: string
  top: string
  trim: string
  legs: string
  hat: 'none' | 'cap' | 'hood' | 'wide' | 'kerchief' | 'tall' | 'helm'
  dress?: boolean
  beard?: boolean
  apron?: boolean
  chain?: boolean
  spear?: boolean
  basket?: boolean
}

/** A townsperson as a front-facing paper cut-out. viewBox 100x200, feet at the bottom. */
export function personSvg(o: Outfit, talking = false) {
  const legs = o.dress
    ? ''
    : `<rect x="38" y="140" width="10" height="46" fill="${o.legs}" stroke="${INK}" stroke-width="2"/><rect x="52" y="140" width="10" height="46" fill="${o.legs}" stroke="${INK}" stroke-width="2"/>`
  const shoes = `<path d="M34 186 L48 186 L48 194 L32 194Z M52 186 L66 186 L68 194 L52 194Z" fill="#3b2a1c" stroke="${INK}" stroke-width="2"/>`
  const body = o.dress
    ? `<path d="M36 80 L64 80 L78 188 L22 188Z" fill="${o.top}" stroke="${INK}" stroke-width="2.5"/><path d="M26 160 L74 160" stroke="${o.trim}" stroke-width="5"/>`
    : `<path d="M34 80 L66 80 L70 146 L30 146Z" fill="${o.top}" stroke="${INK}" stroke-width="2.5"/><rect x="30" y="122" width="40" height="6" fill="${o.trim}" stroke="${INK}" stroke-width="1.5"/>`
  const apron = o.apron ? `<path d="M38 100 L62 100 L64 ${o.dress ? 170 : 144} L36 ${o.dress ? 170 : 144}Z" fill="#f4ecd6" stroke="${INK}" stroke-width="2"/>` : ''
  const chain = o.chain ? `<path d="M38 82 Q50 104 62 82" stroke="#e0b04a" stroke-width="4" fill="none"/><circle cx="50" cy="100" r="5" fill="#e0b04a" stroke="${INK}" stroke-width="1.5"/>` : ''
  const arms = `<path d="M34 82 L24 86 L20 128 L28 128 L32 96Z" fill="${o.top}" stroke="${INK}" stroke-width="2"/><path d="M66 82 L76 86 L80 128 L72 128 L68 96Z" fill="${o.top}" stroke="${INK}" stroke-width="2"/>
  <circle cx="24" cy="132" r="5" fill="${o.skin}" stroke="${INK}" stroke-width="1.5"/><circle cx="76" cy="132" r="5" fill="${o.skin}" stroke="${INK}" stroke-width="1.5"/>`
  const spear = o.spear ? `<path d="M84 196 L84 20" stroke="#6b4a2b" stroke-width="4"/><path d="M84 6 L90 22 L78 22Z" fill="#b8bcc0" stroke="${INK}" stroke-width="2"/>` : ''
  const basket = o.basket ? `<path d="M14 126 L36 126 L33 146 L17 146Z" fill="#b8903a" stroke="${INK}" stroke-width="2"/><path d="M16 126 Q25 112 34 126" stroke="${INK}" stroke-width="2" fill="none"/><circle cx="22" cy="124" r="4" fill="#d9584a"/><circle cx="29" cy="123" r="4" fill="#9cbb66"/>` : ''
  const mouth = talking ? `<ellipse cx="50" cy="66" rx="4" ry="3" fill="${INK}"/>` : `<path d="M45 65 Q50 69 55 65" stroke="${INK}" stroke-width="2" fill="none"/>`
  const beard = o.beard ? `<path d="M37 58 Q38 80 50 82 Q62 80 63 58 Q56 66 50 66 Q44 66 37 58Z" fill="${o.hair}" stroke="${INK}" stroke-width="1.5"/>` : ''
  const hair = `<path d="M34 52 Q34 32 50 32 Q66 32 66 52 L64 44 Q50 38 36 44Z" fill="${o.hair}" stroke="${INK}" stroke-width="1.5"/>`
  const hats: Record<Outfit['hat'], string> = {
    none: '',
    cap: `<path d="M34 46 Q36 30 50 30 Q64 30 66 46Z" fill="${o.trim}" stroke="${INK}" stroke-width="2"/><path d="M60 34 L74 28 L66 40Z" fill="#c94a3a" stroke="${INK}" stroke-width="1.5"/>`,
    hood: `<path d="M30 70 Q26 26 50 24 Q74 26 70 70 L64 70 Q64 40 50 38 Q36 40 36 70Z" fill="${o.trim}" stroke="${INK}" stroke-width="2"/>`,
    wide: `<ellipse cx="50" cy="42" rx="28" ry="6" fill="${o.trim}" stroke="${INK}" stroke-width="2"/><path d="M38 42 Q38 24 50 24 Q62 24 62 42Z" fill="${o.trim}" stroke="${INK}" stroke-width="2"/>`,
    kerchief: `<path d="M33 48 Q34 30 50 30 Q66 30 67 48 L58 44 L50 50 L42 44Z" fill="${o.trim}" stroke="${INK}" stroke-width="2"/>`,
    tall: `<path d="M38 44 L40 14 L60 14 L62 44Z" fill="#2b2b33" stroke="${INK}" stroke-width="2"/><ellipse cx="50" cy="44" rx="20" ry="4" fill="#2b2b33" stroke="${INK}" stroke-width="2"/><rect x="40" y="36" width="20" height="4" fill="#e0b04a"/>`,
    helm: `<path d="M34 50 Q34 26 50 26 Q66 26 66 50 L60 50 L60 56 L40 56 L40 50Z" fill="#9aa0a8" stroke="${INK}" stroke-width="2"/><path d="M50 18 L50 28" stroke="#c94a3a" stroke-width="5"/>`,
  }
  const head = `<rect x="45" y="70" width="10" height="12" fill="${o.skin}" stroke="${INK}" stroke-width="1.5"/>
  <ellipse cx="50" cy="54" rx="16" ry="18" fill="${o.skin}" stroke="${INK}" stroke-width="2"/>
  ${hair}<circle cx="44" cy="54" r="2.2" fill="${INK}"/><circle cx="56" cy="54" r="2.2" fill="${INK}"/>
  <circle cx="40" cy="60" r="3.5" fill="#e88a7a" opacity="0.55"/><circle cx="60" cy="60" r="3.5" fill="#e88a7a" opacity="0.55"/>${beard}${mouth}${hats[o.hat]}`
  const body2 = `<g filter="url(#cut)">${spear}${legs}${shoes}${body}${apron}${chain}${arms}${basket}${head}</g>`
  return svg(100, 200, body2, CUT)
}

export function personTex(key: string, o: Outfit, talking = false) {
  return svgTexture(`${key}-${talking}`, personSvg(o, talking), { w: 200, h: 400, grain: 0.25 })
}

export type SkeletonFrame = 'idle' | 'windup' | 'strike' | 'hurt'

export function skeletonTex(frame: SkeletonFrame) {
  const bone = '#ece2c6'
  const eye = frame === 'windup' ? '#ff3a2a' : '#2b2118'
  const glow = frame === 'windup' ? `<circle cx="43" cy="44" r="7" fill="#ff3a2a" opacity="0.35"/><circle cx="57" cy="44" r="7" fill="#ff3a2a" opacity="0.35"/>` : ''
  // sword arm per frame: low guard, raised overhead, swung down across
  const arm =
    frame === 'windup'
      ? `<path d="M66 82 L78 60 L82 30" stroke="${bone}" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M82 30 L70 -2" stroke="#9aa0a8" stroke-width="7"/><path d="M76 34 L90 26" stroke="#6b4a2b" stroke-width="5"/>`
      : frame === 'strike'
        ? `<path d="M66 82 L76 100 L70 118" stroke="${bone}" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M70 118 L28 150" stroke="#9aa0a8" stroke-width="7"/><path d="M66 110 L76 126" stroke="#6b4a2b" stroke-width="5"/>`
        : `<path d="M66 82 L74 108 L72 130" stroke="${bone}" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M72 130 L90 176" stroke="#9aa0a8" stroke-width="7"/><path d="M66 134 L80 128" stroke="#6b4a2b" stroke-width="5"/>`
  let ribs = ''
  for (let i = 0; i < 4; i++) ribs += `<path d="M38 ${90 + i * 9} Q50 ${96 + i * 9} 62 ${90 + i * 9}" stroke="${bone}" stroke-width="4" fill="none"/>`
  const body = `<g filter="url(#cut)" ${frame === 'hurt' ? 'transform="rotate(-6 50 190)"' : ''}>
  <path d="M42 140 L38 188 M58 140 L62 188" stroke="${bone}" stroke-width="6" stroke-linecap="round"/>
  <path d="M30 190 L44 190 M56 190 L70 190" stroke="${bone}" stroke-width="5" stroke-linecap="round"/>
  <path d="M36 132 Q50 146 64 132 L60 128 L40 128Z" fill="${bone}" stroke="${INK}" stroke-width="2"/>
  <path d="M50 76 L50 132" stroke="${bone}" stroke-width="5"/>${ribs}
  <path d="M34 82 L26 108 L28 132" stroke="${bone}" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M32 80 L68 80" stroke="${bone}" stroke-width="6" stroke-linecap="round"/>${arm}
  <path d="M34 46 Q34 22 50 22 Q66 22 66 46 Q66 60 58 62 L58 70 L42 70 L42 62 Q34 60 34 46Z" fill="${bone}" stroke="${INK}" stroke-width="2.5"/>
  ${glow}<ellipse cx="43" cy="44" rx="5" ry="6" fill="${eye}"/><ellipse cx="57" cy="44" rx="5" ry="6" fill="${eye}"/>
  <path d="M48 52 L50 56 L52 52Z" fill="${INK}"/><path d="M42 64 L58 64 M46 62 L46 68 M50 62 L50 68 M54 62 L54 68" stroke="${INK}" stroke-width="1.5"/>
  </g>`
  return svgTexture(`skeleton-${frame}`, svg(100, 200, body, CUT), { w: 200, h: 400, grain: 0.25 })
}

export type RatFrame = 'idle' | 'bite' | 'hurt'

export function ratTex(frame: RatFrame) {
  const fur = '#7a6a62'
  const open = frame === 'bite'
  const body = `<g filter="url(#cut)" ${frame === 'hurt' ? 'transform="rotate(8 50 90)"' : ''}>
  <path d="M84 84 Q100 60 92 40" stroke="#c98a8a" stroke-width="4" fill="none"/>
  <ellipse cx="50" cy="72" rx="34" ry="24" fill="${fur}" stroke="${INK}" stroke-width="2.5"/>
  <circle cx="28" cy="34" r="12" fill="${fur}" stroke="${INK}" stroke-width="2"/><circle cx="72" cy="34" r="12" fill="${fur}" stroke="${INK}" stroke-width="2"/>
  <circle cx="28" cy="34" r="6" fill="#d9a0a0"/><circle cx="72" cy="34" r="6" fill="#d9a0a0"/>
  <path d="M30 40 Q50 30 70 40 Q72 62 50 74 Q28 62 30 40Z" fill="#8a7a72" stroke="${INK}" stroke-width="2"/>
  <circle cx="42" cy="48" r="4" fill="${open ? '#ff3a2a' : INK}"/><circle cx="58" cy="48" r="4" fill="${open ? '#ff3a2a' : INK}"/>
  <circle cx="50" cy="64" r="4" fill="#e88a9a" stroke="${INK}" stroke-width="1.5"/>
  ${open ? `<path d="M42 68 Q50 82 58 68Z" fill="#5a1a1a" stroke="${INK}" stroke-width="1.5"/><path d="M46 68 L47 73 L48 68 M52 68 L53 73 L54 68" fill="#fff" stroke="none"/>` : ''}
  <path d="M38 64 L18 60 M38 66 L18 68 M62 64 L82 60 M62 66 L82 68" stroke="${INK}" stroke-width="1"/>
  <path d="M30 92 L26 98 M70 92 L74 98" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></g>`
  return svgTexture(`rat-${frame}`, svg(100, 100, body, CUT), { w: 200, h: 200, grain: 0.25 })
}

export function treeTex(kind: 'oak' | 'pine' | 'bush' | 'birch', seed: number) {
  const r = rng(seed)
  let body = ''
  if (kind === 'oak') {
    let puffs = ''
    for (let i = 0; i < 9; i++) puffs += `<circle cx="${50 + (r() - 0.5) * 56}" cy="${70 + (r() - 0.5) * 60}" r="${18 + r() * 12}"/>`
    body = `<path d="M44 200 L46 120 Q36 100 30 96 M54 200 L54 112 Q66 100 72 92 M46 120 L54 112" stroke="#5a3d26" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M44 200 L46 118 L54 112 L56 200Z" fill="#6b4a2b" stroke="${INK}" stroke-width="2"/>
    <g fill="${['#5f8a3e', '#6f9a48', '#557d38'][seed % 3]}" stroke="${INK}" stroke-width="2.5">${puffs}</g>
    ${Array.from({ length: 6 }, () => `<circle cx="${50 + (r() - 0.5) * 50}" cy="${70 + (r() - 0.5) * 50}" r="3" fill="${seed % 2 ? '#d9584a' : '#f4ecd6'}" stroke="${INK}" stroke-width="1"/>`).join('')}`
  } else if (kind === 'pine') {
    let tiers = ''
    for (let i = 0; i < 4; i++) {
      const y = 40 + i * 34
      const w = 18 + i * 10
      tiers += `<path d="M50 ${y - 26} L${50 + w} ${y + 22} L${50 - w} ${y + 22}Z" fill="${i % 2 ? '#3f6a44' : '#4a7a4e'}" stroke="${INK}" stroke-width="2.5"/>`
    }
    body = `<rect x="45" y="160" width="10" height="40" fill="#5a3d26" stroke="${INK}" stroke-width="2"/>${tiers}`
  } else if (kind === 'birch') {
    let puffs = ''
    for (let i = 0; i < 6; i++) puffs += `<ellipse cx="${50 + (r() - 0.5) * 40}" cy="${60 + (r() - 0.5) * 50}" rx="${14 + r() * 8}" ry="${18 + r() * 10}"/>`
    body = `<path d="M46 200 L48 70 L52 70 L54 200Z" fill="#f4ecd6" stroke="${INK}" stroke-width="2"/><path d="M47 150 l6 -2 M47 120 l5 2 M48 92 l4 -2" stroke="${INK}" stroke-width="2"/>
    <g fill="#c9b04a" stroke="${INK}" stroke-width="2.5">${puffs}</g>`
  } else {
    let puffs = ''
    for (let i = 0; i < 6; i++) puffs += `<circle cx="${50 + (r() - 0.5) * 60}" cy="${170 + (r() - 0.5) * 30}" r="${14 + r() * 8}"/>`
    body = `<g fill="#5f8a3e" stroke="${INK}" stroke-width="2.5">${puffs}</g>${Array.from({ length: 5 }, () => `<circle cx="${50 + (r() - 0.5) * 50}" cy="${168 + (r() - 0.5) * 24}" r="3" fill="#e0b04a" stroke="${INK}" stroke-width="1"/>`).join('')}`
  }
  return svgTexture(`tree-${kind}-${seed}`, svg(100, 200, `<g filter="url(#cut)">${body}</g>`, CUT), { w: 256, h: 512, grain: 0.25 })
}

export function propTex(kind: 'lamp' | 'torch' | 'stall' | 'flowers' | 'corpse' | 'ring' | 'exit' | 'mushrooms', lit = false) {
  let body = ''
  let W = 100
  let H = 200
  switch (kind) {
    case 'lamp':
      body = `<rect x="47" y="60" width="6" height="140" fill="#2b2b33" stroke="${INK}" stroke-width="1.5"/><path d="M50 60 Q72 56 72 72" stroke="#2b2b33" stroke-width="5" fill="none"/>
      ${lit ? '<circle cx="72" cy="86" r="22" fill="#ffd27a" opacity="0.45"/>' : ''}<path d="M62 74 L82 74 L78 98 L66 98Z" fill="${lit ? '#ffd27a' : '#6a7a8a'}" stroke="${INK}" stroke-width="2.5"/><path d="M60 74 L72 64 L84 74Z" fill="#2b2b33" stroke="${INK}" stroke-width="2"/>`
      break
    case 'torch':
      W = 100
      H = 100
      body = `<circle cx="50" cy="30" r="26" fill="#ffb347" opacity="0.3"/><path d="M50 4 Q64 24 58 38 Q50 46 42 38 Q36 24 50 4Z" fill="#ff8a2a" stroke="${INK}" stroke-width="2"/><path d="M50 18 Q56 28 52 36 Q48 38 46 34 Q44 26 50 18Z" fill="#ffe08a"/><path d="M44 40 L56 40 L54 96 L46 96Z" fill="#6b4a2b" stroke="${INK}" stroke-width="2"/>`
      break
    case 'stall':
      W = 200
      H = 200
      body = `<path d="M20 200 L20 70 M180 200 L180 70" stroke="#6b4a2b" stroke-width="8"/>
      <path d="M8 76 L100 40 L192 76Z" fill="#c94a3a" stroke="${INK}" stroke-width="3"/>${[0, 1, 2, 3, 4].map((i) => `<path d="M${8 + i * 36.8} 76 L${26 + i * 36.8} 92 L${44.8 + i * 36.8} 76Z" fill="${i % 2 ? '#c94a3a' : '#f4ecd6'}" stroke="${INK}" stroke-width="2"/>`).join('')}
      <rect x="14" y="130" width="172" height="70" fill="#8a6a44" stroke="${INK}" stroke-width="3"/>
      ${Array.from({ length: 9 }, (_, i) => `<circle cx="${30 + i * 18}" cy="124" r="9" fill="${['#d9584a', '#e0b04a', '#9cbb66'][i % 3]}" stroke="${INK}" stroke-width="2"/>`).join('')}`
      break
    case 'flowers':
      W = 100
      H = 50
      body = Array.from({ length: 9 }, (_, i) => {
        const x = 10 + i * 10
        return `<path d="M${x} 50 L${x + 2} ${26 + (i % 3) * 5}" stroke="#4a6a2a" stroke-width="2"/><circle cx="${x + 2}" cy="${24 + (i % 3) * 5}" r="5" fill="${['#d9584a', '#f4ecd6', '#e0b04a', '#9a7ad0'][i % 4]}" stroke="${INK}" stroke-width="1.5"/>`
      }).join('')
      break
    case 'corpse':
      W = 200
      H = 60
      body = `<ellipse cx="100" cy="46" rx="90" ry="10" fill="#000" opacity="0.25"/><path d="M20 40 L70 34 L150 36 L186 42 L150 48 L70 48Z" fill="#4a3a52" stroke="${INK}" stroke-width="2.5"/>
      <circle cx="180" cy="38" r="12" fill="#ece2c6" stroke="${INK}" stroke-width="2"/><circle cx="176" cy="36" r="2.5" fill="${INK}"/><circle cx="184" cy="36" r="2.5" fill="${INK}"/>
      <path d="M60 46 L40 56 M120 46 L130 58" stroke="#ece2c6" stroke-width="5" stroke-linecap="round"/>`
      break
    case 'ring':
      W = 100
      H = 100
      body = `<circle cx="50" cy="56" r="40" fill="#ffd27a" opacity="0.25"/><circle cx="50" cy="60" r="20" fill="none" stroke="#e0b04a" stroke-width="8"/><circle cx="50" cy="60" r="20" fill="none" stroke="${INK}" stroke-width="1.5"/>
      <rect x="38" y="26" width="24" height="18" rx="4" fill="#e0b04a" stroke="${INK}" stroke-width="2"/><path d="M44 35 L50 30 L56 35 L50 40Z" fill="#c94a3a"/>`
      break
    case 'exit':
      W = 100
      H = 200
      body = `<path d="M10 200 L10 70 Q10 20 50 20 Q90 20 90 70 L90 200Z" fill="#1a1612" stroke="#6b6258" stroke-width="8"/>${[0, 1, 2, 3].map((i) => `<rect x="${20 + i * 2}" y="${180 - i * 22}" width="${60 - i * 4}" height="10" fill="#5a534c" stroke="${INK}" stroke-width="2"/>`).join('')}<circle cx="50" cy="60" r="30" fill="#bcd8ff" opacity="0.25"/>`
      break
    case 'mushrooms':
      W = 100
      H = 60
      body = [20, 46, 70].map((x, i) => `<rect x="${x - 3}" y="${36 - i * 4}" width="6" height="${24 + i * 4}" fill="#f4ecd6" stroke="${INK}" stroke-width="1.5"/><path d="M${x - 14} ${38 - i * 4} Q${x} ${12 - i * 6} ${x + 14} ${38 - i * 4}Z" fill="#c94a3a" stroke="${INK}" stroke-width="2"/><circle cx="${x - 4}" cy="${28 - i * 5}" r="2.5" fill="#f4ecd6"/>`).join('')
      break
  }
  return svgTexture(`prop-${kind}-${lit}`, svg(W, H, `<g filter="url(#cut)">${body}</g>`, CUT), { w: W * 2, h: H * 2, grain: 0.25 })
}

/** Small portrait-friendly SVG for the dialogue book (reuses the person art). */
export const personDataUri = (o: Outfit) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(personSvg(o))
