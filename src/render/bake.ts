/** Draws an SVG string once into a canvas, so the game only ever blits bitmaps. */
export async function bake(svg: string, w: number, h: number, scale: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w * scale))
  c.height = Math.max(1, Math.ceil(h * scale))
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  } catch {
    // leave it blank rather than stall the game
  } finally {
    URL.revokeObjectURL(url)
  }
  return c
}

/** Runs async jobs a few at a time instead of all at once. */
export async function inBatches<T>(jobs: (() => Promise<T>)[], size = 6): Promise<T[]> {
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
