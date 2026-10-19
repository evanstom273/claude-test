import { hash2 } from '../sim/rng'
import { valueNoise } from '../sim/noise'
import { Biome, CHUNK, classify, SEA_LEVEL, type World } from '../sim/world'
import { CELL } from './creatureArt'

/** Base colours per biome: [r, g, b]. Cel bands are made by lightening and darkening these. */
const COLOURS: Record<number, [number, number, number]> = {
  [Biome.Deep]: [32, 74, 104],
  [Biome.Shallow]: [52, 118, 138],
  [Biome.Sand]: [214, 196, 140],
  [Biome.Grass]: [104, 142, 70],
  [Biome.Forest]: [64, 106, 56],
  [Biome.Hills]: [128, 140, 84],
  [Biome.Rock]: [126, 120, 110],
  [Biome.Snow]: [232, 236, 240],
}

/** Height of the world at a pixel, blended smoothly between cell centres. */
function sample(w: World, px: number, py: number) {
  const u = px / CELL - 0.5
  const v = py / CELL - 0.5
  const x0 = Math.max(0, Math.min(w.size - 1, Math.floor(u)))
  const y0 = Math.max(0, Math.min(w.size - 1, Math.floor(v)))
  const x1 = Math.min(w.size - 1, x0 + 1)
  const y1 = Math.min(w.size - 1, y0 + 1)
  const fx = Math.max(0, Math.min(1, u - x0))
  const fy = Math.max(0, Math.min(1, v - y0))
  const H = w.height
  const M = w.moisture
  const i00 = y0 * w.size + x0
  const i10 = y0 * w.size + x1
  const i01 = y1 * w.size + x0
  const i11 = y1 * w.size + x1
  const blend = (a: number, b: number, c: number, d: number) => a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
  const h = blend(H[i00], H[i10], H[i01], H[i11])
  const m = blend(M[i00], M[i10], M[i01], M[i11])
  // slope at each surrounding cell centre, then blended, so shading has no seams at cell edges
  const gxAt = (x: number, y: number) => (H[y * w.size + Math.min(w.size - 1, x + 1)] - H[y * w.size + Math.max(0, x - 1)]) / 2
  const gyAt = (x: number, y: number) => (H[Math.min(w.size - 1, y + 1) * w.size + x] - H[Math.max(0, y - 1) * w.size + x]) / 2
  const gx = blend(gxAt(x0, y0), gxAt(x1, y0), gxAt(x0, y1), gxAt(x1, y1))
  const gy = blend(gyAt(x0, y0), gyAt(x1, y0), gyAt(x0, y1), gyAt(x1, y1))
  return { h, m, gx, gy }
}

/**
 * Paints one chunk of terrain pixel by pixel: biome colour, three cel bands of
 * hill shading lit from the upper left, contour lines, inked biome borders,
 * water shaded by depth, and surf along the shore.
 */
export function paintTerrain(w: World, cx: number, cy: number, canvas: HTMLCanvasElement, scale = 1) {
  const span = CHUNK * CELL
  const size = Math.round(span * scale)
  const px = 1 / scale
  if (canvas.width !== size) {
    canvas.width = size
    canvas.height = size
  }
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const d = img.data
  const ox = cx * span
  const oy = cy * span
  // sample one pixel beyond the edges so slopes and borders match the next chunk
  const W = size + 2
  const hs = new Float32Array(W * W)
  const ms = new Float32Array(W * W)
  const bs = new Uint8Array(W * W)
  const lits = new Float32Array(W * W)
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const s = sample(w, ox + (x - 1) * px, oy + (y - 1) * px)
      hs[y * W + x] = s.h
      ms[y * W + x] = s.m
      bs[y * W + x] = classify(s.h, s.m)
      lits[y * W + x] = -(s.gx * 0.6 + s.gy * 0.8) * 14
    }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const k = (y + 1) * W + (x + 1)
      const h = hs[k]
      const b = bs[k]
      const base = COLOURS[b]
      let r = base[0]
      let g = base[1]
      let bl = base[2]
      const wx = Math.floor(ox + x * px)
      const wy = Math.floor(oy + y * px)
      // material mottling: broad patches and fine grain
      const mott = (valueNoise(wx * 0.045, wy * 0.045, 11) - 0.5) * 0.16 + (hash2(wx, wy, 5) - 0.5) * 0.05
      let shade = 1 + mott
      if (b <= Biome.Shallow) {
        // water: bands by depth, lighter towards the shore
        const depth = (SEA_LEVEL - h) / SEA_LEVEL
        const band = depth < 0.03 ? 1.25 : depth < 0.09 ? 1.1 : depth < 0.2 ? 1 : 0.88
        shade = band + mott * 0.3
        if (SEA_LEVEL - h < 0.006) {
          // surf
          r = 214
          g = 230
          bl = 228
          shade = 1
        }
      } else {
        // slope lit from the upper left, in three hard bands
        const lit = lits[k]
        shade *= lit > 0.22 ? 1.13 : lit < -0.22 ? 0.82 : 1
        // contour lines every few height steps
        const step = 0.035
        const c0 = Math.floor(h / step)
        // (contours and borders are a pixel wide whatever the scale, so they thin out when zoomed out)
        if (Math.floor(hs[k + 1] / step) !== c0 || Math.floor(hs[k + W] / step) !== c0) shade *= 0.9
        // wet sand at the waterline
        if (b === Biome.Sand && h - SEA_LEVEL < 0.008) shade *= 0.82
      }
      // ink where one biome meets another (but not between the two kinds of water)
      const edge = (o: number) => bs[o] !== b && !(bs[o] <= Biome.Shallow && b <= Biome.Shallow)
      if (edge(k + 1) || edge(k + W) || edge(k - 1) || edge(k - W)) shade *= b <= Biome.Shallow ? 0.95 : 0.72
      const p = (y * size + x) * 4
      d[p] = Math.min(255, r * shade)
      d[p + 1] = Math.min(255, g * shade)
      d[p + 2] = Math.min(255, bl * shade)
      d[p + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  if (scale < 0.5) return
  ctx.save()
  ctx.scale(scale, scale)
  // small vector details: pebbles on rock and hills, ripples on sand
  for (let y = 0; y < CHUNK; y++)
    for (let x = 0; x < CHUNK; x++) {
      const gx = cx * CHUNK + x
      const gy = cy * CHUNK + y
      if (!w.inBounds(gx, gy)) continue
      const b = w.biome[w.idx(gx, gy)]
      const rnd = hash2(gx, gy, 77)
      const px = x * CELL + hash2(gx, gy, 1) * CELL
      const py = y * CELL + hash2(gx, gy, 2) * CELL
      if ((b === Biome.Rock || b === Biome.Hills) && rnd < (b === Biome.Rock ? 0.35 : 0.12)) {
        const rr = 1.5 + hash2(gx, gy, 3) * 3
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.beginPath()
        ctx.ellipse(px + 1, py + 1.2, rr, rr * 0.8, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#9a958a'
        ctx.strokeStyle = '#2a2824'
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.ellipse(px, py, rr, rr * 0.8, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#b8b3a6'
        ctx.beginPath()
        ctx.ellipse(px - rr * 0.3, py - rr * 0.3, rr * 0.45, rr * 0.35, 0, 0, Math.PI * 2)
        ctx.fill()
      } else if (b === Biome.Sand && rnd < 0.25) {
        ctx.strokeStyle = 'rgba(150,128,80,0.55)'
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.arc(px, py + 3, 4, Math.PI * 1.15, Math.PI * 1.85)
        ctx.stroke()
      }
    }
  ctx.restore()
}
