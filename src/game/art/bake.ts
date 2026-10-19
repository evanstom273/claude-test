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

const isBlank = (c: HTMLCanvasElement) => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  for (let i = 3; i < d.length; i += 16) if (d[i] !== 0) return false
  return true
}

/** Draws an SVG string once into a canvas, so the game only ever blits bitmaps. */
export async function bake(svg: string, w: number, h: number, scale: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * scale)
  c.height = Math.ceil(h * scale)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const img = await loadSvg(svg)
      // give WebKit a frame to rasterise the SVG before drawing it
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      if (!isBlank(c)) {
        bakeStats.done++
        return c
      }
    } catch {
      // fall through and retry
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
