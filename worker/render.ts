import { initWasm, Resvg } from '@resvg/resvg-wasm'
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm'
import robotoBold from './fonts/Roboto-Bold.ttf'
import robotoRegular from './fonts/Roboto-Regular.ttf'

/**
 * SVG to PNG on the server with resvg, so Claude can see what it drew
 * without the studio being open. Roboto is bundled because Workers have no
 * fonts; every family falls back to it.
 */

let ready: Promise<void> | null = null
const fonts = [new Uint8Array(robotoRegular), new Uint8Array(robotoBold)]

function init() {
  ready ??= initWasm(resvgWasm)
  return ready
}

export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface RenderOptions {
  width?: number
  background?: string
  /** Zoom into part of the artwork, in its own coordinates. */
  region?: Region
}

/** Point the root <svg> at a region of the artwork instead of the whole thing. */
function zoomTo(svg: string, r: Region) {
  return svg.replace(/<svg\b([^>]*)>/, (_, attrs: string) => {
    const kept = attrs.replace(/\s(viewBox|width|height|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*')/g, '')
    return `<svg${kept} viewBox="${r.x} ${r.y} ${r.width} ${r.height}" width="${r.width}" height="${r.height}">`
  })
}

/** Check that resvg can read the SVG. Returns an error message, or null. */
export async function parseError(svg: string): Promise<string | null> {
  await init()
  try {
    new Resvg(svg, { font: { fontBuffers: fonts, defaultFontFamily: 'Roboto' } }).free()
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export async function renderPng(svg: string, opts: RenderOptions = {}) {
  await init()
  const source = opts.region ? zoomTo(svg, opts.region) : svg
  const width = Math.max(64, Math.min(2048, Math.round(opts.width ?? 1024)))
  const r = new Resvg(source, {
    fitTo: { mode: 'width', value: width },
    background: opts.background ?? '#ffffff',
    font: { fontBuffers: fonts, defaultFontFamily: 'Roboto', sansSerifFamily: 'Roboto', serifFamily: 'Roboto', cursiveFamily: 'Roboto', fantasyFamily: 'Roboto', monospaceFamily: 'Roboto' },
  })
  try {
    const img = r.render()
    const png = img.asPng()
    const out = { base64: toBase64(png), width: img.width, height: img.height }
    img.free()
    return out
  } finally {
    r.free()
  }
}

function toBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Things worth flagging that resvg would happily accept. */
export function safetyWarnings(svg: string) {
  const w: string[] = []
  if (/<script\b/i.test(svg)) w.push('contains <script>, which the studio strips')
  if (/<foreignObject\b/i.test(svg)) w.push('contains <foreignObject>, which the studio strips')
  if (/\son[a-z]+\s*=/i.test(svg)) w.push('has event attributes (onclick and so on), which the studio strips')
  if (/(?:href|xlink:href)\s*=\s*["'](?:https?:|\/\/)/i.test(svg)) w.push('links to outside files, which the studio blocks')
  if (!/^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b/i.test(svg)) w.push('does not start with an <svg> root')
  if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(svg)) w.push('the <svg> root has no xmlns="http://www.w3.org/2000/svg", so browsers will not render it')
  return w
}
