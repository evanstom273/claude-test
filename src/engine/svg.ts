/** Tiny helpers for building SVG by hand. */
export const NS = 'http://www.w3.org/2000/svg'

export function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, children: (SVGElement | string)[] = []): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  for (const c of children) {
    if (typeof c === 'string') e.insertAdjacentHTML('beforeend', c)
    else e.appendChild(c)
  }
  return e
}

/** A group whose inner markup is written as an SVG string. */
export function g(attrs: Record<string, string | number> = {}, markup = ''): SVGGElement {
  const e = el('g', attrs)
  if (markup) e.innerHTML = markup
  return e
}

export const INK = '#1a1410'
/** Outline width used for everything, so all the art reads as one show. */
export const LINE = 4

export const f = (n: number) => +n.toFixed(2)

export function setTransform(e: SVGElement, t: string) {
  // skip DOM writes when nothing changed: most parts are still most of the time
  if ((e as unknown as { _t?: string })._t === t) return
  ;(e as unknown as { _t?: string })._t = t
  e.setAttribute('transform', t)
}

export function show(e: SVGElement, on: boolean) {
  const v = on ? 'visible' : 'hidden'
  if ((e as unknown as { _v?: string })._v === v) return
  ;(e as unknown as { _v?: string })._v = v
  e.setAttribute('visibility', v)
}
