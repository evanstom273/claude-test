import { el, f, g, INK, LINE, setTransform, show } from '../engine/svg'
import { stroke } from './parts'

/** Professor: a fat grey cat who has never been impressed by anything. Not a humanoid, so it has its own small rig. */

export interface CatState {
  x: number
  y: number
  facing: 1 | -1
  /** 0 open, 1 shut. */
  lids: number
  lookX: number
  mouth: 'closed' | 'open' | 'chew' | 'yawn'
  /** 0..1: the front paw swipes out. */
  paw: number
  headTilt: number
  time: number
  /** Toast in its mouth. */
  holding: boolean
}

const fur = '#8d8f98'
const furDark = '#6f717b'
const belly = '#c9cad0'

export class CatRig {
  root: SVGGElement
  private tail: SVGGElement
  private head: SVGGElement
  private lids: SVGGElement[] = []
  private pupils: SVGEllipseElement[] = []
  private mouths: Record<CatState['mouth'], SVGGElement>
  private paw: SVGGElement
  private toast: SVGGElement

  constructor() {
    this.root = g({ class: 'cat' })
    // tail, curling up behind
    this.tail = g({}, `<path d="M-46 -20 Q-110 -30 -112 -90 Q-114 -120 -96 -126" fill="none" stroke="${INK}" stroke-width="${22 + LINE * 2}" stroke-linecap="round"/><path d="M-46 -20 Q-110 -30 -112 -90 Q-114 -120 -96 -126" fill="none" stroke="${fur}" stroke-width="22" stroke-linecap="round"/><path d="M-108 -100 Q-110 -116 -98 -124" fill="none" stroke="${furDark}" stroke-width="14" stroke-linecap="round"/>`)
    this.root.appendChild(this.tail)
    // body: a loaf with a pale belly
    this.root.appendChild(
      g(
        {},
        `<path d="M-70 0 Q-92 -70 -46 -118 Q0 -140 40 -116 Q78 -84 66 0Z" fill="${fur}" ${stroke}/>
         <path d="M-16 -2 Q-26 -70 10 -100 Q44 -80 40 -2Z" fill="${belly}"/>
         <path d="M-60 -60 q12 -6 18 4 M-64 -36 q12 -6 18 4" stroke="${furDark}" stroke-width="5" stroke-linecap="round" fill="none"/>
         <ellipse cx="-34" cy="-6" rx="26" ry="12" fill="${fur}" ${stroke}/>`,
      ),
    )
    // front paw: rests, or swipes out towards whatever it faces
    this.paw = g({}, `<path d="M18 -60 Q10 -20 16 -4 L44 -4 Q48 -30 42 -60Z" fill="${fur}" ${stroke}/><ellipse cx="34" cy="-6" rx="18" ry="10" fill="${belly}" ${stroke}/>`)
    this.root.appendChild(this.paw)
    // head
    this.head = g()
    this.head.appendChild(
      g(
        {},
        `<path d="M-34 -176 L-30 -228 L2 -194Z M30 -186 L58 -224 L64 -170Z" fill="${fur}" ${stroke}/>
         <path d="M-26 -186 L-26 -214 L-6 -194Z M38 -186 L54 -212 L56 -180Z" fill="#e8a3ae"/>
         <path d="M-54 -150 Q-58 -196 6 -200 Q72 -198 72 -146 Q74 -104 10 -100 Q-52 -102 -54 -150Z" fill="${fur}" ${stroke}/>
         <path d="M-10 -116 Q10 -104 30 -116 Q40 -128 26 -136 L-6 -136 Q-20 -128 -10 -116Z" fill="${belly}"/>`,
      ),
    )
    for (const [i, x] of [-14, 36].entries()) {
      const clip = `catEye${i}${Math.random().toString(36).slice(2, 7)}`
      const eye = g()
      eye.appendChild(el('clipPath', { id: clip }, [el('ellipse', { cx: x, cy: -158, rx: 15, ry: 13 })]))
      eye.appendChild(el('ellipse', { cx: x, cy: -158, rx: 15, ry: 13, fill: '#e8d34a' }))
      const pupil = el('ellipse', { cx: x, cy: -158, rx: 3.5, ry: 11, fill: INK })
      eye.appendChild(pupil)
      const lid = g({ 'clip-path': `url(#${clip})` }, `<rect x="${x - 18}" y="${-158 - 40}" width="36" height="27" fill="${furDark}"/><line x1="${x - 18}" y1="${-158 - 13}" x2="${x + 18}" y2="${-158 - 13}" stroke="${INK}" stroke-width="3"/>`)
      eye.appendChild(lid)
      eye.appendChild(el('ellipse', { cx: x, cy: -158, rx: 15, ry: 13, fill: 'none', stroke: INK, 'stroke-width': LINE }))
      this.head.appendChild(eye)
      this.lids.push(lid)
      this.pupils.push(pupil)
    }
    this.head.appendChild(g({}, `<path d="M6 -138 L18 -138 L12 -130Z" fill="#d8737f" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M-30 -128 L-68 -134 M-30 -122 L-66 -116 M52 -128 L92 -136 M52 -122 L90 -116" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`))
    this.mouths = {
      closed: g({}, `<path d="M0 -124 Q6 -118 12 -124 Q18 -118 24 -124" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`),
      open: g({}, `<path d="M2 -126 Q12 -106 22 -126Z" fill="#5a1a1a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`),
      chew: g({}, `<path d="M2 -122 Q12 -116 22 -122" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`),
      yawn: g({}, `<path d="M-6 -126 Q12 -84 30 -126Z" fill="#5a1a1a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M0 -120 Q12 -100 24 -120" fill="#d8646a"/>`),
    }
    for (const m of Object.values(this.mouths)) this.head.appendChild(m)
    // a slice of toast, for when it steals one
    this.toast = g({}, `<g transform="translate(20 -112) rotate(-12)"><rect x="-26" y="-6" width="52" height="40" rx="10" fill="#c98a3a" ${stroke}/><rect x="-18" y="2" width="36" height="26" rx="6" fill="#e0aa5c"/></g>`)
    this.head.appendChild(this.toast)
    this.root.appendChild(this.head)
  }

  update(s: CatState) {
    setTransform(this.root, `translate(${f(s.x)} ${f(s.y)}) scale(${s.facing} 1)`)
    // a lazy tail flick every few seconds
    const flick = Math.max(0, Math.sin(s.time * 1.3)) ** 6
    setTransform(this.tail, `rotate(${f(flick * 18 + Math.sin(s.time * 0.7) * 3)} -46 -20)`)
    setTransform(this.head, `rotate(${f(s.headTilt + Math.sin(s.time * 0.9) * 1.2)} 8 -110)`)
    setTransform(this.paw, `rotate(${f(-s.paw * 70)} 30 -60) translate(${f(s.paw * 6)} 0)`)
    for (const l of this.lids) setTransform(l, `translate(0 ${f(s.lids * 26)})`)
    this.pupils.forEach((p, i) => p.setAttribute('cx', String(f((i === 0 ? -14 : 36) + s.lookX * 8))))
    for (const [k, m] of Object.entries(this.mouths)) show(m, k === s.mouth)
    show(this.toast, s.holding)
  }
}
