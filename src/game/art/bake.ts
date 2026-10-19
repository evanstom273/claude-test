/** Draws an SVG string once into a canvas, so the game only ever blits bitmaps. */
export async function bake(svg: string, w: number, h: number, scale: number): Promise<HTMLCanvasElement> {
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * scale)
  c.height = Math.ceil(h * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c
}
