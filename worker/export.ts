import { store, type Env } from './env'
import { renderPng } from './render'

/**
 * Download links made by export_artwork: /export/<token>/<name>.<ext>.
 * The token is the only key, and it expires after a day.
 */
export async function serveExport(req: Request, env: Env) {
  const token = new URL(req.url).pathname.split('/')[2] ?? ''
  const db = store(env)
  const e = await db.export(token)
  const svg = e && (await db.version(e.artwork_id, e.version))
  if (!e || !svg) return new Response('This download link has expired or does not exist.', { status: 404 })
  const name = `${e.artwork_id}.${e.format}`
  const headers = { 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' }
  if (e.format === 'svg') return new Response(svg, { headers: { ...headers, 'Content-Type': 'image/svg+xml' } })
  const png = await renderPng(svg, { width: e.width ?? 1024, background: e.background === 'transparent' ? undefined : (e.background ?? '#ffffff') })
  return new Response(Uint8Array.from(atob(png.base64), (c) => c.charCodeAt(0)), { headers: { ...headers, 'Content-Type': 'image/png' } })
}
