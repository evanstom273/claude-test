/** Art that rendered blank even after retries (WebKit can do this under load). */
export const bakeStats = { done: 0, blank: 0 }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function loadSvg(svg: string) {
  // blob URLs are more reliable than data URLs for SVG on WebKit
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('svg failed to load'))
      img.src = url
    })
    return img
  } finally {
    // revoked after drawing by the caller's microtask; keep it alive until then
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))

/** A cheap fingerprint of the drawn pixels, and whether anything was drawn at all. */
function fingerprint(c: HTMLCanvasElement) {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  let h = 0
  let any = false
  for (let i = 0; i < d.length; i += 8) {
    h = (Math.imul(h, 31) + d[i] + d[i + 3] * 7) | 0
    if (d[i + 3] !== 0) any = true
  }
  return { h, any }
}

/**
 * Draws an SVG string once into a canvas, so the game only ever blits bitmaps.
 * WebKit can hand over an SVG before it has finished rasterising it, which draws
 * part of the picture; so keep redrawing until two draws in a row match.
 */
export async function bake(svg: string, w: number, h: number, scale: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * scale)
  c.height = Math.ceil(h * scale)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const img = await loadSvg(svg)
      await img.decode?.().catch(() => {})
      let prev: number | null = null
      for (let pass = 0; pass < 6; pass++) {
        await frame()
        ctx.clearRect(0, 0, c.width, c.height)
        ctx.drawImage(img, 0, 0, c.width, c.height)
        const fp = fingerprint(c)
        if (fp.any && fp.h === prev) {
          bakeStats.done++
          return c
        }
        prev = fp.h
      }
    } catch {
      // fall through and retry with a fresh image
    }
    await wait(60 * (attempt + 1))
  }
  bakeStats.done++
  bakeStats.blank++
  return c
}

/** Runs async jobs a few at a time instead of all at once. */
export async function inBatches<T>(jobs: (() => Promise<T>)[], size = 4): Promise<T[]> {
  const out: T[] = new Array(jobs.length)
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++
      out[i] = await jobs[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, worker))
  return out
}
