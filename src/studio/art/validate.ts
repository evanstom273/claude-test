import { KNOWN } from './svgSchema'

/**
 * Parses SVG source, checks it, and strips anything that could run code or
 * fetch from elsewhere. The source text itself is never changed here; only
 * the parsed copy used for display is cleaned.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg'

export interface Issue {
  message: string
  line?: number
  col?: number
}

export type ParseResult = { ok: true; svg: SVGSVGElement; warnings: Issue[] } | { ok: false; errors: Issue[] }

const BLOCKED = new Set(['script', 'foreignObject', 'iframe', 'embed', 'object', 'audio', 'video', 'canvas'])
const SAFE_DATA = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i
/** url(...) is only allowed to point inside the document or at embedded images. */
const EXTERNAL_URL = /url\(\s*(['"]?)(?!#|data:image\/)[^)]*\1\s*\)/gi

function parserError(doc: Document): Issue | null {
  const err = doc.getElementsByTagName('parsererror')[0]
  if (!err) return null
  const text = err.textContent ?? ''
  // Chromium: "error on line 3 at column 5: Opening and ending tag mismatch"
  let m = /line (\d+) at column (\d+):\s*([^\n]+)/.exec(text)
  if (m) return { line: +m[1], col: +m[2], message: m[3].trim() }
  // Firefox: "XML Parsing Error: mismatched tag ... Line Number 3, Column 5:"
  m = /XML Parsing Error:\s*([^\n]+)[\s\S]*?Line Number (\d+), Column (\d+)/.exec(text)
  if (m) return { line: +m[2], col: +m[3], message: m[1].trim() }
  return { message: text.split('\n').find((l) => l.trim()) ?? 'The SVG is not well-formed' }
}

export function parseSvg(source: string): ParseResult {
  if (!source.trim()) return { ok: false, errors: [{ message: 'The document is empty' }] }
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  const err = parserError(doc)
  if (err) return { ok: false, errors: [err] }
  const root = doc.documentElement
  if (root.localName !== 'svg') return { ok: false, errors: [{ message: `The root element must be <svg>, not <${root.localName}>`, line: 1 }] }
  if (root.namespaceURI !== SVG_NS) return { ok: false, errors: [{ message: `<svg> needs xmlns="${SVG_NS}" or nothing will render`, line: 1 }] }

  // number every element in document order, matching the source map, before anything is removed
  ;[root, ...root.querySelectorAll('*')].forEach((el, i) => el.setAttribute('data-art-i', String(i)))

  const warnings: Issue[] = []
  const counts = new Map<string, number>()
  const note = (msg: string) => counts.set(msg, (counts.get(msg) ?? 0) + 1)

  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      const name = child.localName
      if (BLOCKED.has(name) || child.namespaceURI !== SVG_NS) {
        note(`<${name}> isn't allowed and was left out of the preview`)
        child.remove()
        continue
      }
      if ((name === 'animate' || name === 'set') && /href/i.test(child.getAttribute('attributeName') ?? '')) {
        note(`<${name}> targeting href was left out of the preview`)
        child.remove()
        continue
      }
      if (!KNOWN.has(name)) note(`<${name}> is not an SVG element and won't render`)
      clean(child)
      walk(child)
    }
  }
  const clean = (el: Element) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase()
      if (n.startsWith('on')) {
        note(`Event attributes like ${a.name} aren't allowed and were ignored`)
        el.removeAttribute(a.name)
      } else if (n === 'href' || n === 'xlink:href') {
        const v = a.value.trim()
        if (!v.startsWith('#') && !SAFE_DATA.test(v)) {
          note('Links to outside files were ignored (only #ids and embedded images work)')
          el.removeAttributeNode(a)
        }
      } else if (EXTERNAL_URL.test(a.value)) {
        EXTERNAL_URL.lastIndex = 0
        note('url() references to outside files were ignored')
        el.setAttribute(a.name, a.value.replace(EXTERNAL_URL, 'none'))
      }
      EXTERNAL_URL.lastIndex = 0
    }
    if (el.localName === 'style' && el.textContent) {
      const css = el.textContent
      const safe = css.replace(/@import[^;]*;?/gi, '').replace(EXTERNAL_URL, 'none')
      if (safe !== css) {
        note('External resources in <style> were ignored')
        el.textContent = safe
      }
    }
  }
  clean(root)
  walk(root)
  for (const [message, n] of counts) warnings.push({ message: n > 1 ? `${message} (${n}×)` : message })
  return { ok: true, svg: root as unknown as SVGSVGElement, warnings }
}

/** The artwork's size in its own units, for laying out the artboard. */
export function artSize(svg: SVGSVGElement) {
  const vb = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  const hasVb = vb.length === 4 && vb.every((n) => Number.isFinite(n)) && vb[2] > 0 && vb[3] > 0
  const len = (a: string) => {
    const v = svg.getAttribute(a)
    if (!v || v.endsWith('%')) return null
    const n = parseFloat(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  let w = len('width')
  let h = len('height')
  if (hasVb) {
    if (w === null && h === null) [w, h] = [vb[2], vb[3]]
    else if (w === null) w = (h! * vb[2]) / vb[3]
    else if (h === null) h = (w * vb[3]) / vb[2]
  }
  return { width: w ?? 300, height: h ?? 150, viewBox: hasVb ? vb : null }
}

/** Pretty-prints SVG with two-space indentation, leaving text content alone. */
export function formatSvg(source: string): string | null {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (parserError(doc)) return null
  const ser = new XMLSerializer()
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  const INLINE = new Set(['text', 'tspan', 'textPath', 'style', 'title', 'desc'])
  const out: string[] = []
  const prolog = /^\s*(<\?xml[^>]*\?>)/.exec(source)
  if (prolog) out.push(prolog[1])
  const emit = (node: Node, depth: number) => {
    const pad = '  '.repeat(depth)
    if (node.nodeType === Node.COMMENT_NODE) return out.push(`${pad}<!--${(node as Comment).data}-->`)
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      const t = node.textContent?.trim()
      if (t) out.push(pad + ser.serializeToString(node).trim())
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const attrs = [...el.attributes].map((a) => ` ${a.name}="${esc(a.value)}"`).join('')
    const kids = [...el.childNodes].filter((c) => !(c.nodeType === Node.TEXT_NODE && !c.textContent?.trim()))
    if (INLINE.has(el.localName) && kids.length) {
      // whitespace inside text matters: keep it exactly as written
      const inner = [...el.childNodes].map((c) => ser.serializeToString(c)).join('').replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')
      return out.push(`${pad}<${el.tagName}${attrs}>${inner}</${el.tagName}>`)
    }
    if (!kids.length) return out.push(`${pad}<${el.tagName}${attrs}/>`)
    out.push(`${pad}<${el.tagName}${attrs}>`)
    for (const k of kids) emit(k, depth + 1)
    out.push(`${pad}</${el.tagName}>`)
  }
  for (const n of doc.childNodes) emit(n, 0)
  return out.join('\n') + '\n'
}
