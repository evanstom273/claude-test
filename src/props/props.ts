import { el, f, g, INK, setTransform, show } from '../engine/svg'
import { stroke } from '../characters/parts'

/** Props are plain SVG groups; a few have their own moving parts. */

export const toastSlice = (done = true) =>
  `<rect x="-30" y="-36" width="60" height="58" rx="12" fill="${done ? '#b9782e' : '#e9d9a8'}" ${stroke}/><rect x="-21" y="-26" width="42" height="40" rx="7" fill="${done ? '#dda252' : '#f8efd2'}"/>`

export function bread() {
  return g({}, `<g transform="rotate(-8)">${toastSlice(false)}</g>`)
}

export function toast() {
  return g({}, `<g transform="rotate(10)">${toastSlice(true)}<path d="M-12 -12 l10 6 M4 2 l10 -4" stroke="#8a5420" stroke-width="3" stroke-linecap="round"/></g>`)
}

export function box() {
  return g(
    {},
    `<path d="M-110 -150 L110 -150 L110 0 L-110 0Z" fill="#d4a86a" ${stroke}/>
     <path d="M-110 -150 L-80 -176 L140 -176 L110 -150Z" fill="#e4bf86" ${stroke}/>
     <path d="M110 -150 L140 -176 L140 -26 L110 0Z" fill="#b88a50" ${stroke}/>
     <rect x="-90" y="-132" width="180" height="40" rx="6" fill="#e24b3a" ${stroke}/>
     <text x="0" y="-104" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="25" fill="#fff">SMART TOAST</text>
     <rect x="-50" y="-80" width="100" height="64" rx="16" fill="#cfd6dd" ${stroke}/>
     <rect x="-24" y="-64" width="48" height="20" rx="4" fill="#2a3a46"/>
     <text x="0" y="-8" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="#7a5530">NOW WITH APP!</text>`,
  )
}

export function phone() {
  return g({}, `<g transform="rotate(180)"><rect x="-16" y="-30" width="32" height="56" rx="6" fill="#2a2d35" ${stroke}/><rect x="-11" y="-23" width="22" height="40" rx="3" fill="#7fd0f2"/></g>`)
}

export function card() {
  return g({}, `<g transform="rotate(90)"><rect x="-30" y="-19" width="60" height="38" rx="5" fill="#e6c34a" ${stroke}/><rect x="-30" y="-10" width="60" height="7" fill="#3a3a3a"/><rect x="-22" y="6" width="22" height="5" fill="#fff8" /></g>`)
}

export function mug() {
  return g({}, `<g transform="translate(0 -10)"><path d="M18 -14 Q40 -14 40 6 Q40 24 18 22" fill="none" stroke="${INK}" stroke-width="12"/><path d="M18 -14 Q40 -14 40 6 Q40 24 18 22" fill="none" stroke="#f4f1ea" stroke-width="6"/><path d="M-22 -26 L22 -26 L18 34 Q0 40 -18 34Z" fill="#f4f1ea" ${stroke}/><path d="M-20 -6 L20 -6" stroke="#e05a4a" stroke-width="7"/><ellipse cx="0" cy="-26" rx="22" ry="5" fill="#5a3a22" ${stroke}/></g>`)
}

export function newspaper() {
  return g(
    {},
    `<g transform="rotate(90)"><path d="M-70 -46 L70 -46 L70 46 L-70 46Z" fill="#f2efe4" ${stroke}/><path d="M-60 -34 L60 -34" stroke="${INK}" stroke-width="6"/><path d="M-60 -18 L-6 -18 M-60 -6 L-6 -6 M-60 6 L-6 6 M-60 18 L-6 18 M6 -18 L60 -18 M6 -6 L60 -6" stroke="#9a978c" stroke-width="3"/>
     <g transform="translate(30 20)">${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${c * 9 - 14}" y="${r * 9 - 10}" width="9" height="9" fill="${(r + c) % 2 ? '#fff' : '#333'}" stroke="#555" stroke-width="1"/>`).join('')).join('')}</g></g>`,
  )
}

/** The smart toaster: chrome, a little screen, a lever, and opinions. */
export class SmartToaster {
  root: SVGGElement
  private body: SVGGElement
  private lines: SVGTextElement[]
  private barBack: SVGRectElement
  private bar: SVGRectElement
  private lever: SVGGElement
  private led: SVGCircleElement
  private slots: SVGGElement
  private screenGlow: SVGRectElement

  constructor() {
    this.root = g({ class: 'smart-toaster' })
    this.body = g()
    this.slots = g({}, `<g transform="translate(-30 -138)">${toastSlice(false)}</g><g transform="translate(34 -138)">${toastSlice(false)}</g>`)
    this.body.appendChild(this.slots)
    this.body.appendChild(
      g(
        {},
        `<path d="M-92 -120 Q-96 -136 -78 -138 L80 -138 Q98 -136 94 -120 L92 -6 Q90 6 76 6 L-76 6 Q-90 6 -92 -6Z" fill="#c7d0d8" ${stroke}/>
         <path d="M-84 -112 Q-80 -126 -64 -126 L-40 -126 Q-70 -60 -62 -4 L-76 -4 Q-86 -4 -86 -16Z" fill="#eef3f7"/>
         <rect x="-62" y="-136" width="52" height="10" rx="5" fill="#2a3138"/><rect x="2" y="-136" width="52" height="10" rx="5" fill="#2a3138"/>
         <rect x="-58" y="-96" width="116" height="60" rx="8" fill="#1d2b33" ${stroke}/>`,
      ),
    )
    this.screenGlow = el('rect', { x: -52, y: -90, width: 104, height: 48, rx: 5, fill: '#2c4a52' })
    this.body.appendChild(this.screenGlow)
    this.lines = [0, 1].map((i) => {
      const t = el('text', { x: 0, y: -74 + i * 16, 'text-anchor': 'middle', 'font-family': 'Courier New, monospace', 'font-weight': 700, 'font-size': 14, fill: '#7ff0c8' })
      this.body.appendChild(t)
      return t
    })
    this.barBack = el('rect', { x: -44, y: -53, width: 88, height: 7, rx: 3, fill: '#0e1a1f', stroke: '#7ff0c8', 'stroke-width': 1.5 })
    this.bar = el('rect', { x: -44, y: -53, width: 0, height: 7, rx: 3, fill: '#7ff0c8' })
    this.body.appendChild(this.barBack)
    this.body.appendChild(this.bar)
    this.led = el('circle', { cx: 74, cy: -22, r: 6, fill: '#3ad06a', stroke: INK, 'stroke-width': 2 })
    this.body.appendChild(this.led)
    this.lever = g({}, `<rect x="92" y="-112" width="14" height="70" rx="4" fill="#3a434b" ${stroke}/><rect x="96" y="-20" width="30" height="16" rx="6" fill="#2a3138" ${stroke}/>`)
    this.body.appendChild(this.lever)
    this.body.appendChild(g({}, `<rect x="-80" y="0" width="22" height="10" rx="3" fill="#2a3138"/><rect x="58" y="0" width="22" height="10" rx="3" fill="#2a3138"/>`))
    this.root.appendChild(this.body)
  }

  update(s: { x: number; y: number; text: string; progress: number | null; lever: number; shake: number; led: string; bread: boolean; pop: number; time: number }) {
    const jitter = s.shake ? Math.sin(s.time * 60) * s.shake : 0
    const jump = s.shake ? Math.abs(Math.sin(s.time * 38)) * s.shake * 0.6 : 0
    setTransform(this.root, `translate(${f(s.x + jitter)} ${f(s.y - jump)})`)
    const [a, b] = s.text.split('\n')
    if (this.lines[0].textContent !== (a ?? '')) this.lines[0].textContent = a ?? ''
    if (this.lines[1].textContent !== (b ?? '')) this.lines[1].textContent = b ?? ''
    show(this.barBack, s.progress !== null)
    show(this.bar, s.progress !== null)
    this.bar.setAttribute('width', String(f(88 * Math.max(0, Math.min(1, s.progress ?? 0)))))
    this.led.setAttribute('fill', s.led)
    this.screenGlow.setAttribute('fill', s.text ? '#2c4a52' : '#1d2b33')
    // the lever slides down the side; the bread sinks with it and rises again when it pops
    setTransform(this.lever, `translate(0 ${f(s.lever * 34)})`)
    show(this.slots, s.bread)
    setTransform(this.slots, `translate(0 ${f(28 - s.lever * 26 - s.pop * 40)})`)
  }
}

/** The old toaster: beige, dented, scorched, and it just works. */
export class OldToaster {
  root: SVGGElement
  private lever: SVGGElement
  private slices: SVGGElement
  private done: SVGGElement

  constructor() {
    this.root = g({ class: 'old-toaster' })
    this.slices = g({}, `<g transform="translate(-24 -116)">${toastSlice(false)}</g>`)
    this.done = g({}, `<g transform="translate(-24 -116)">${toastSlice(true)}</g>`)
    this.root.appendChild(this.slices)
    this.root.appendChild(this.done)
    this.root.appendChild(
      g(
        {},
        `<path d="M-74 -104 Q-76 -118 -60 -118 L62 -116 Q78 -114 76 -100 L72 -4 Q70 6 58 6 L-62 6 Q-74 6 -74 -6Z" fill="#d8c7a0" ${stroke}/>
         <path d="M-40 -116 L-6 -116 L-10 -110 L-38 -110Z" fill="#2a2420"/>
         <path d="M-60 -60 Q-40 -76 -30 -50 Q-44 -40 -60 -60Z" fill="#b8a27c"/>
         <path d="M30 -20 Q50 -30 60 -8 L30 -6Z" fill="#6a4a2a" opacity="0.5"/>
         <path d="M20 -90 l12 4 l-6 10" fill="none" stroke="#a8946c" stroke-width="3"/>
         <rect x="-8" y="-48" width="22" height="22" rx="11" fill="#7a6a50" ${stroke}/>
         <path d="M-74 -90 L-80 -90" stroke="${INK}" stroke-width="3"/>`,
      ),
    )
    this.lever = g({}, `<rect x="74" y="-96" width="12" height="60" rx="3" fill="#6a5a40" ${stroke}/><rect x="78" y="-24" width="24" height="12" rx="4" fill="#4a3a2a" ${stroke} transform="rotate(-10 90 -18)"/>`)
    this.root.appendChild(this.lever)
  }

  update(s: { x: number; y: number; lever: number; bread: boolean; toasted: boolean; pop: number; visible: boolean }) {
    show(this.root, s.visible)
    setTransform(this.root, `translate(${f(s.x)} ${f(s.y)})`)
    setTransform(this.lever, `translate(0 ${f(s.lever * 28)})`)
    show(this.slices, s.bread && !s.toasted)
    show(this.done, s.bread && s.toasted)
    const y = `translate(0 ${f(22 - s.lever * 22 - s.pop * 46)})`
    setTransform(this.slices, y)
    setTransform(this.done, y)
  }
}
