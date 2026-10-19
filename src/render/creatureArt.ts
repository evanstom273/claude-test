import type { Genome } from '../sim/genome'

/**
 * Spore-like creatures seen from directly above, built from the genome:
 * a chain of body segments, legs along the sides, a head with eyes, and
 * optional horns, spikes and a tail. Drawn facing +x (east) in local space,
 * then rotated; lighting always comes from the upper left of the screen, so
 * each rotation is drawn separately rather than spun.
 */

/** World pixels per cell. */
export const CELL = 16
/** How many facings are pre-drawn, and walk frames per facing. */
export const ROTATIONS = 8
export const FRAMES = 4

const INK = '#141412'
const f = (n: number) => +n.toFixed(2)

const hsl = (h: number, s: number, l: number) => `hsl(${f(((h % 360) + 360) % 360)} ${f(Math.max(0, Math.min(100, s)))}% ${f(Math.max(0, Math.min(100, l)))}%)`

/** The light comes from the upper left of the screen; returns it in the creature's local frame. */
function localLight(angle: number) {
  const lx = -0.6
  const ly = -0.8
  const c = Math.cos(-angle)
  const s = Math.sin(-angle)
  return { x: lx * c - ly * s, y: lx * s + ly * c }
}

export interface CreatureLayout {
  /** Body length in cells (nose to tail tip), for sizing the canvas. */
  span: number
}

/** Sprite canvas size in world pixels for a genome (square, enough for any rotation). */
export function spriteSize(g: Genome) {
  const segLen = 0.42 * g.size
  const body = g.segments * segLen + 0.5 * g.size * g.headSize + g.tail * 0.7 * g.size
  const reach = 0.35 * g.size + (g.legs ? g.legLength * 0.6 * g.size : 0)
  return Math.ceil((Math.max(body, reach * 2.2) + 0.6) * CELL * 1.25)
}

/** One drawing of the creature at a facing and walk frame, as an SVG string. */
export function creatureSvg(g: Genome, angle: number, frame: number): string {
  const S = spriteSize(g)
  const c = S / 2
  const L = localLight(angle)
  const deg = (angle * 180) / Math.PI
  const u = CELL * g.size
  const hue = g.hue
  const sat = 38 + (g.diet > 0.45 ? 10 : 0)
  const base = hsl(hue, sat, 46)
  const dark = hsl(hue, sat + 5, 31)
  const lite = hsl(hue, sat - 5, 62)
  const acc = hsl(g.accent, 45, 52)
  const accDark = hsl(g.accent, 50, 36)
  const phase = (frame / FRAMES) * Math.PI * 2

  // the spine runs along local x; segments from the tail end towards the head
  const segLen = 0.42 * u
  const segR = (i: number) => (0.24 + 0.06 * Math.sin(((i + 0.5) / g.segments) * Math.PI)) * u
  const total = g.segments * segLen
  const x0 = -total / 2 + segLen / 2
  // legless creatures wriggle side to side as they move
  const wiggle = (i: number) => (g.legs === 0 ? Math.sin(phase + i * 1.3) * 0.08 * u : 0)
  const segs = Array.from({ length: g.segments }, (_, i) => ({ x: x0 + i * segLen, y: wiggle(i), r: segR(i) }))
  const front = segs[segs.length - 1]
  const headR = 0.24 * u * g.headSize
  const head = { x: front.x + front.r * 0.75 + headR * 0.7, y: wiggle(g.segments) * 1.2, r: headR }
  const back = segs[0]

  /** A cel-shaded round shape: shadow side, base, and a lit crescent towards the light. */
  const blob = (x: number, y: number, rx: number, ry: number, fill = base, shade = dark, hi = lite, id = '') => {
    const cid = `b${id}${f(x)}_${f(y)}`.replace(/[.-]/g, 'p')
    return `<clipPath id="${cid}"><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}"/></clipPath>
      <ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${shade}"/>
      <g clip-path="url(#${cid})">
        <ellipse cx="${f(x + L.x * rx * 0.18)}" cy="${f(y + L.y * ry * 0.18)}" rx="${f(rx * 0.92)}" ry="${f(ry * 0.92)}" fill="${fill}"/>
        <ellipse cx="${f(x + L.x * rx * 0.5)}" cy="${f(y + L.y * ry * 0.5)}" rx="${f(rx * 0.5)}" ry="${f(ry * 0.45)}" fill="${hi}"/>
      </g>
      <ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="none" stroke="${INK}" stroke-width="1.3"/>`
  }

  let under = ''
  let body = ''
  let over = ''

  // legs: pairs spread along the body; alternate pairs swing opposite ways (a tripod-ish gait)
  if (g.legs > 0) {
    const legLen = (0.25 + g.legLength * 0.5) * u
    for (let p = 0; p < g.legs; p++) {
      const k = g.legs === 1 ? 0.5 : p / (g.legs - 1)
      const sx = back.x + (front.x - back.x) * (0.15 + k * 0.7)
      const sr = segR(Math.min(g.segments - 1, Math.round(k * (g.segments - 1))))
      for (const side of [-1, 1]) {
        const swing = Math.sin(phase + p * Math.PI + (side > 0 ? Math.PI : 0)) * 0.45
        const a = side * (Math.PI / 2) + swing * side * -1 + (k - 0.5) * -0.5 * side
        const hipX = sx
        const hipY = side * sr * 0.6
        const knee = { x: hipX + Math.cos(a - side * 0.25) * legLen * 0.55, y: hipY + Math.sin(a - side * 0.25) * legLen * 0.55 }
        const foot = { x: knee.x + Math.cos(a + side * 0.35) * legLen * 0.5, y: knee.y + Math.sin(a + side * 0.35) * legLen * 0.5 }
        const w = Math.max(2.2, 0.07 * u)
        under += `<path d="M${f(hipX)} ${f(hipY)} L${f(knee.x)} ${f(knee.y)} L${f(foot.x)} ${f(foot.y)}" stroke="${INK}" stroke-width="${f(w + 2.4)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
        under += `<path d="M${f(hipX)} ${f(hipY)} L${f(knee.x)} ${f(knee.y)} L${f(foot.x)} ${f(foot.y)}" stroke="${dark}" stroke-width="${f(w)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
        under += `<path d="M${f(hipX)} ${f(hipY)} L${f(knee.x)} ${f(knee.y)}" stroke="${base}" stroke-width="${f(w * 0.45)}" fill="none" stroke-linecap="round" transform="translate(${f(L.x * 0.6)} ${f(L.y * 0.6)})"/>`
        under += `<circle cx="${f(foot.x)}" cy="${f(foot.y)}" r="${f(w * 0.75)}" fill="${accDark}" stroke="${INK}" stroke-width="1"/>`
      }
    }
  }

  // tail: a tapering curve behind the last segment
  if (g.tail > 0.2) {
    const tl = g.tail * 0.8 * u
    const sway = Math.sin(phase) * 0.15 * tl
    const tx = back.x - back.r * 0.7
    const tip = { x: tx - tl, y: sway }
    const tw = back.r * 0.45
    under += `<path d="M${f(tx)} ${f(-tw)} Q${f(tx - tl * 0.5)} ${f(-tw * 0.6 + sway * 0.5)} ${f(tip.x)} ${f(tip.y)} Q${f(tx - tl * 0.5)} ${f(tw * 0.6 + sway * 0.5)} ${f(tx)} ${f(tw)}Z" fill="${dark}" stroke="${INK}" stroke-width="1.3"/>`
    under += `<path d="M${f(tx)} ${f(-tw * 0.4)} Q${f(tx - tl * 0.5)} ${f(-tw * 0.3 + sway * 0.5)} ${f(tip.x + tl * 0.15)} ${f(tip.y)}" stroke="${base}" stroke-width="${f(tw * 0.5)}" fill="none" stroke-linecap="round"/>`
  }

  // body segments, back to front, each overlapping the one behind
  segs.forEach((s, i) => {
    body += blob(s.x, s.y, s.r * 1.08, s.r, base, dark, lite, `s${i}`)
    if (g.pattern === 1) {
      // a stripe across each segment
      body += `<path d="M${f(s.x - s.r * 0.15)} ${f(s.y - s.r * 0.92)} Q${f(s.x + s.r * 0.12)} ${f(s.y)} ${f(s.x - s.r * 0.15)} ${f(s.y + s.r * 0.92)}" stroke="${acc}" stroke-width="${f(s.r * 0.28)}" fill="none" opacity="0.9"/>`
    } else if (g.pattern === 2) {
      for (const [ox, oy, rr] of [
        [-0.3, -0.35, 0.16],
        [0.25, 0.3, 0.13],
        [0.1, -0.05, 0.1],
      ])
        body += `<circle cx="${f(s.x + ox * s.r)}" cy="${f(s.y + oy * s.r)}" r="${f(rr * s.r)}" fill="${acc}" stroke="${accDark}" stroke-width="0.6"/>`
    }
  })

  // spiked plates down the spine, pointing back, lit on the side facing the light
  if (g.spikes > 0.25) {
    const sl = (0.12 + g.spikes * 0.18) * u
    const bone = hsl(g.accent, 22, 78)
    const boneDark = hsl(g.accent, 22, 55)
    segs.forEach((s) => {
      const w = s.r * 0.32
      const tipX = s.x - sl
      const litSide = L.y < 0 ? -1 : 1
      over += `<path d="M${f(s.x + w)} ${f(s.y)} L${f(s.x)} ${f(s.y - w)} L${f(tipX)} ${f(s.y)} L${f(s.x)} ${f(s.y + w)} Z" fill="${boneDark}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`
      over += `<path d="M${f(s.x + w)} ${f(s.y)} L${f(s.x)} ${f(s.y + litSide * w)} L${f(tipX)} ${f(s.y)} Z" fill="${bone}"/>`
    })
  }

  // head: snout for plant eaters, jaws for hunters
  const jaw = g.diet > 0.45
  if (jaw) {
    const jl = head.r * 0.9
    for (const side of [-1, 1]) {
      const open = Math.sin(phase * 2) * 0.12
      const a = side * (0.45 + open)
      const bx = head.x + head.r * 0.6
      const by = head.y + side * head.r * 0.35
      over += `<path d="M${f(bx)} ${f(by - side * head.r * 0.15)} Q${f(bx + Math.cos(a) * jl)} ${f(by + Math.sin(a) * jl * 0.6)} ${f(bx + Math.cos(a * 0.3) * jl * 1.1)} ${f(by - side * jl * 0.1)} L${f(bx)} ${f(by + side * head.r * 0.12)}Z" fill="${hsl(40, 20, 82)}" stroke="${INK}" stroke-width="1.1"/>`
    }
  } else {
    over += blob(head.x + head.r * 0.65, head.y, head.r * 0.55, head.r * 0.45, lite, base, hsl(hue, sat - 10, 72), 'sn')
    over += `<circle cx="${f(head.x + head.r * 1.05)}" cy="${f(head.y - head.r * 0.15)}" r="${f(head.r * 0.07)}" fill="${INK}"/><circle cx="${f(head.x + head.r * 1.05)}" cy="${f(head.y + head.r * 0.15)}" r="${f(head.r * 0.07)}" fill="${INK}"/>`
  }
  over += blob(head.x, head.y, head.r, head.r * 0.92, base, dark, lite, 'hd')

  // horns curve back from the crown
  if (g.horns > 0.25) {
    const hl = g.horns * 0.55 * u
    for (const side of [-1, 1]) {
      const hx = head.x - head.r * 0.1
      const hy = head.y + side * head.r * 0.6
      over += `<path d="M${f(hx - head.r * 0.15)} ${f(hy - side * head.r * 0.1)} Q${f(hx - hl * 0.3)} ${f(hy + side * hl * 0.6)} ${f(hx - hl)} ${f(hy + side * hl * 0.45)} Q${f(hx - hl * 0.35)} ${f(hy + side * hl * 0.3)} ${f(hx + head.r * 0.15)} ${f(hy + side * head.r * 0.05)}Z" fill="${hsl(40, 25, 78)}" stroke="${INK}" stroke-width="1.1"/>`
    }
  }

  // eyes, spread across the front of the head
  const n = g.eyes
  for (let e = 0; e < n; e++) {
    const k = n === 1 ? 0 : (e / (n - 1) - 0.5) * 1.6
    const ex = head.x + head.r * (0.45 - Math.abs(k) * 0.2)
    const ey = head.y + k * head.r * 0.65
    const er = head.r * (n > 2 ? 0.2 : 0.26)
    over += `<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(er)}" fill="#f4f1e6" stroke="${INK}" stroke-width="1"/><circle cx="${f(ex + er * 0.3)}" cy="${f(ey)}" r="${f(er * 0.5)}" fill="${INK}"/><circle cx="${f(ex + er * 0.1 + L.x * er * 0.3)}" cy="${f(ey + L.y * er * 0.3)}" r="${f(er * 0.18)}" fill="#fff"/>`
  }

  const figure = `${under}${body}${over}`
  // soft contact shadow, offset away from the light in screen space
  const shadow = `<g transform="translate(${f(c + 3)} ${f(c + 4)}) rotate(${f(deg)})" opacity="0.28"><g fill="#000" stroke="#000" stroke-width="3">${figure.replace(/<clipPath[\s\S]*?<\/clipPath>/g, '').replace(/fill="[^"]*"/g, 'fill="#000"').replace(/stroke="(?!#000)[^"]*"/g, 'stroke="#000"').replace(/clip-path="[^"]*"/g, '')}</g></g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${shadow}<g transform="translate(${f(c)} ${f(c)}) rotate(${f(deg)})">${figure}</g></svg>`
}

/** A small portrait for the UI: facing right, mid-stride. */
export const portraitSvg = (g: Genome) => creatureSvg(g, -Math.PI / 4, 1)
