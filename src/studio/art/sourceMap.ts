/**
 * Finds where each element sits in the SVG source text, so the canvas, the
 * layers and the inspector can point at exact spots in the code and change
 * only those characters. Elements are numbered in document order, matching
 * the data-art-i numbers the preview gets.
 */

export interface SrcAttr {
  name: string
  value: string
  start: number
  /** Where the quoted value starts and ends (inside the quotes). */
  valueStart: number
  valueEnd: number
  end: number
}

export interface SrcElement {
  i: number
  name: string
  start: number
  /** Just after the opening tag's ">". */
  openEnd: number
  /** Just after the closing tag (or the self-closing tag). */
  end: number
  selfClosing: boolean
  attrs: SrcAttr[]
  children: SrcElement[]
  parent: SrcElement | null
}

const decode = (v: string) =>
  v.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => {
    const k = e.toLowerCase()
    if (k === 'lt') return '<'
    if (k === 'gt') return '>'
    if (k === 'amp') return '&'
    if (k === 'quot') return '"'
    if (k === 'apos') return "'"
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16))
    if (k.startsWith('#')) return String.fromCodePoint(parseInt(k.slice(1), 10))
    return m
  })

/** Scan well-formed SVG source. Returns elements in document order (index = i). */
export function scan(src: string): SrcElement[] {
  const all: SrcElement[] = []
  const stack: SrcElement[] = []
  let p = 0
  const n = src.length
  while (p < n) {
    const lt = src.indexOf('<', p)
    if (lt < 0) break
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4)
      p = e < 0 ? n : e + 3
    } else if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9)
      p = e < 0 ? n : e + 3
    } else if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2)
      p = e < 0 ? n : e + 2
    } else if (src.startsWith('<!', lt)) {
      const e = src.indexOf('>', lt + 2)
      p = e < 0 ? n : e + 1
    } else if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt + 2)
      const el = stack.pop()
      if (el) el.end = e < 0 ? n : e + 1
      p = e < 0 ? n : e + 1
    } else {
      let q = lt + 1
      while (q < n && !/[\s/>]/.test(src[q])) q++
      const el: SrcElement = { i: all.length, name: src.slice(lt + 1, q), start: lt, openEnd: 0, end: 0, selfClosing: false, attrs: [], children: [], parent: stack[stack.length - 1] ?? null }
      // attributes
      while (q < n) {
        while (q < n && /\s/.test(src[q])) q++
        if (src[q] === '>') {
          q++
          break
        }
        if (src[q] === '/' && src[q + 1] === '>') {
          el.selfClosing = true
          q += 2
          break
        }
        const as = q
        while (q < n && !/[\s=/>]/.test(src[q])) q++
        const name = src.slice(as, q)
        while (q < n && /\s/.test(src[q])) q++
        if (src[q] !== '=') {
          if (!name) q++
          continue
        }
        q++
        while (q < n && /\s/.test(src[q])) q++
        const quote = src[q]
        const vs = q + 1
        const ve = src.indexOf(quote, vs)
        q = ve < 0 ? n : ve + 1
        el.attrs.push({ name, value: decode(src.slice(vs, ve)), start: as, valueStart: vs, valueEnd: ve, end: q })
      }
      el.openEnd = q
      if (el.parent) el.parent.children.push(el)
      all.push(el)
      if (el.selfClosing) el.end = q
      else stack.push(el)
      p = q
    }
  }
  return all
}

export const attr = (el: SrcElement, name: string) => el.attrs.find((a) => a.name === name)

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/** The text change that sets (or with null, removes) one attribute. */
export function setAttrChange(el: SrcElement, name: string, value: string | null, src: string) {
  const a = attr(el, name)
  if (a) {
    if (value === null) {
      // remove the attribute and the whitespace before it
      let s = a.start
      while (s > 0 && /\s/.test(src[s - 1])) s--
      return { from: s, to: a.end, insert: '' }
    }
    return { from: a.valueStart, to: a.valueEnd, insert: escapeAttr(value) }
  }
  if (value === null) return null
  // add it after the last attribute (or the tag name), keeping the tag's own closing
  const at = el.attrs.length ? el.attrs[el.attrs.length - 1].end : el.start + 1 + el.name.length
  return { from: at, to: at, insert: ` ${name}="${escapeAttr(value)}"` }
}

/** The innermost element whose text contains a position. */
export function elementAt(els: SrcElement[], pos: number) {
  let best: SrcElement | null = null
  for (const e of els) if (pos >= e.start && pos <= e.end && (!best || e.start >= best.start)) best = e
  return best
}
