import { el, f, g, INK, LINE, setTransform, show } from '../engine/svg'
import type { CharacterState, HandShape, Mouth } from './types'

/**
 * Everything specific to how one character looks: markup for each body part,
 * and where the joints are. Coordinates are local, with the origin between the
 * feet and up being negative y, drawn facing right in three-quarter view.
 */
export interface Design {
  id: string
  skin: string
  /** Hip pivots for the legs, and leg length. */
  hips: { back: [number, number]; front: [number, number]; len: number }
  legBack: string
  legFront: string
  torso: string
  shoulders: { back: [number, number]; front: [number, number] }
  upper: number
  fore: number
  /** Arm markup, drawn pointing straight down from the joint. */
  upperBack: string
  upperFront: string
  foreBack: string
  foreFront: string
  /** Hand markup per shape, origin at the wrist. */
  hands: Record<HandShape, string>
  /** Head pivot (base of the head), and markup around it. */
  neck: [number, number]
  headBack: string
  face: string
  /** Eyes in head space: centre and radii. Back eye first. */
  eyes: { x: number; y: number; rx: number; ry: number }[]
  /** Markup drawn over the eyes (nose, ears in front, hair). */
  headFront: string
  mouth: { x: number; y: number; w: number; lip?: string }
  brows: { width: number; thick: number; colour: string; gap: number }
  lashes?: boolean
  /** Extra markup on top of everything in the head, e.g. hair fringe. */
  hairFront?: string
}

let uid = 0

/** Mouth shapes, drawn around (0, 0) with width w. */
function mouthMarkup(m: Mouth, w: number, lip?: string): string {
  const h = w / 2
  const stroke = `stroke="${INK}" stroke-width="${LINE}" stroke-linecap="round" stroke-linejoin="round"`
  const inner = '#5a1a1a'
  const tongue = '#d8646a'
  const lipLine = lip ? `stroke="${lip}"` : ''
  switch (m) {
    case 'closed':
      return `<path d="M${-h} 0 Q0 4 ${h} -1" fill="none" ${stroke} ${lipLine}/>`
    case 'flat':
      return `<path d="M${-h * 0.85} 1 L${h * 0.85} 1" fill="none" ${stroke} ${lipLine}/>`
    case 'smile':
      return `<path d="M${-h} -4 Q0 ${h * 0.7} ${h} -6" fill="none" ${stroke} ${lipLine}/>`
    case 'frown':
      return `<path d="M${-h} 6 Q0 ${-h * 0.5} ${h} 5" fill="none" ${stroke} ${lipLine}/>`
    case 'grin':
      return `<path d="M${-h} -4 Q0 -2 ${h} -6 Q${h * 0.7} ${h} 0 ${h * 1.05} Q${-h * 0.7} ${h} ${-h} -4Z" fill="${inner}" ${stroke}/><path d="M${-h * 0.8} -3 Q0 0 ${h * 0.8} -5 L${h * 0.7} 4 Q0 7 ${-h * 0.7} 5Z" fill="#fff"/>`
    case 'a':
      return `<path d="M${-h * 0.8} -2 Q0 -6 ${h * 0.8} -3 Q${h * 0.7} ${h * 1.1} 0 ${h * 1.15} Q${-h * 0.7} ${h * 1.1} ${-h * 0.8} -2Z" fill="${inner}" ${stroke}/><ellipse cx="2" cy="${h * 0.75}" rx="${h * 0.45}" ry="${h * 0.25}" fill="${tongue}"/>`
    case 'e':
      return `<path d="M${-h} -2 Q0 -6 ${h} -3 Q${h * 0.8} ${h * 0.55} 0 ${h * 0.6} Q${-h * 0.8} ${h * 0.55} ${-h} -2Z" fill="${inner}" ${stroke}/><path d="M${-h * 0.8} -1 Q0 -4 ${h * 0.8} -2 L${h * 0.7} 4 L${-h * 0.7} 4Z" fill="#fff"/>`
    case 'i':
      return `<path d="M${-h * 0.75} 0 Q0 -3 ${h * 0.75} -1 Q${h * 0.6} ${h * 0.35} 0 ${h * 0.38} Q${-h * 0.6} ${h * 0.35} ${-h * 0.75} 0Z" fill="${inner}" ${stroke}/>`
    case 'o':
      return `<ellipse cx="0" cy="${h * 0.35}" rx="${h * 0.45}" ry="${h * 0.6}" fill="${inner}" ${stroke}/><ellipse cx="0" cy="${h * 0.7}" rx="${h * 0.25}" ry="${h * 0.15}" fill="${tongue}"/>`
    case 'u':
      return `<ellipse cx="0" cy="${h * 0.2}" rx="${h * 0.28}" ry="${h * 0.3}" fill="${inner}" ${stroke}/>`
    case 'shock':
      return `<ellipse cx="0" cy="${h * 0.7}" rx="${h * 0.6}" ry="${h * 1.0}" fill="${inner}" ${stroke}/><ellipse cx="0" cy="${h * 1.25}" rx="${h * 0.35}" ry="${h * 0.22}" fill="${tongue}"/>`
    case 'full':
      // cheeks stuffed: lips pressed together, puffed out
      return `<path d="M${-h * 0.9} 0 Q0 5 ${h * 0.9} 0" fill="none" ${stroke}/><path d="M${h * 0.95} -10 Q${h * 1.7} 4 ${h * 1.0} 16" fill="none" ${stroke}/><path d="M${-h * 0.95} -8 Q${-h * 1.5} 4 ${-h * 0.95} 14" fill="none" ${stroke}/>`
    case 'chew':
      return `<path d="M${-h * 0.7} 0 Q0 7 ${h * 0.7} -2" fill="none" ${stroke}/>`
  }
}

const MOUTHS: Mouth[] = ['closed', 'smile', 'grin', 'frown', 'flat', 'a', 'e', 'i', 'o', 'u', 'shock', 'full', 'chew']

/**
 * A rigged character: the SVG is built once, then posed every frame by
 * changing transforms and which mouth, hand and lid shapes show.
 */
export class Rig {
  root: SVGGElement
  private body: SVGGElement
  private legs: { back: SVGGElement; front: SVGGElement }
  private arms: Record<'back' | 'front', { upper: SVGGElement; fore: SVGGElement; hand: SVGGElement; shapes: Record<HandShape, SVGGElement>; slot: SVGGElement }>
  private head: SVGGElement
  private eyes: { pupil: SVGCircleElement; lid: SVGGElement; lowerLid: SVGPathElement }[] = []
  private brows: SVGGElement[] = []
  private mouths = {} as Record<Mouth, SVGGElement>
  private extras: { sweat: SVGGElement; tear: SVGGElement; twitch: SVGGElement }
  private torso: SVGGElement

  constructor(public d: Design) {
    const id = `${d.id}${uid++}`
    this.root = g({ class: `char ${d.id}` })
    this.body = g()
    this.root.appendChild(this.body)

    const legGroup = (markup: string, at: [number, number]) => {
      const holder = g({ transform: `translate(${at[0]} ${at[1]})` })
      const leg = g({}, markup)
      holder.appendChild(leg)
      return { holder, leg }
    }
    const lb = legGroup(d.legBack, d.hips.back)
    const lf = legGroup(d.legFront, d.hips.front)
    this.legs = { back: lb.leg, front: lf.leg }

    const arm = (side: 'back' | 'front') => {
      const at = d.shoulders[side]
      const upper = g({ transform: `translate(${at[0]} ${at[1]})` })
      upper.appendChild(g({}, side === 'back' ? d.upperBack : d.upperFront))
      const fore = g({ transform: `translate(0 ${d.upper})` })
      fore.appendChild(g({}, side === 'back' ? d.foreBack : d.foreFront))
      const hand = g({ transform: `translate(0 ${d.fore})` })
      const shapes = {} as Record<HandShape, SVGGElement>
      // the prop slot sits under the fingers so held things look gripped
      const slot = g({ class: 'slot' })
      hand.appendChild(slot)
      for (const k of Object.keys(d.hands) as HandShape[]) {
        shapes[k] = g({}, d.hands[k])
        hand.appendChild(shapes[k])
      }
      fore.appendChild(hand)
      upper.appendChild(fore)
      return { upper, fore, hand, shapes, slot }
    }
    this.arms = { back: arm('back'), front: arm('front') }

    this.torso = g({}, d.torso)
    // head
    this.head = g()
    const headInner = g({ transform: `translate(${d.neck[0]} ${d.neck[1]})` })
    headInner.appendChild(g({}, d.headBack))
    headInner.appendChild(g({}, d.face))
    d.eyes.forEach((e, i) => {
      const clip = `${id}eye${i}`
      const eye = g()
      eye.appendChild(el('clipPath', { id: clip }, [el('ellipse', { cx: e.x, cy: e.y, rx: e.rx, ry: e.ry })]))
      eye.appendChild(el('ellipse', { cx: e.x, cy: e.y, rx: e.rx, ry: e.ry, fill: '#fff' }))
      const pupil = el('circle', { cx: e.x, cy: e.y, r: Math.max(4, e.rx * 0.22), fill: INK })
      eye.appendChild(pupil)
      // lids are skin-coloured shutters clipped to the eye, with a line along the edge
      const lid = g({ 'clip-path': `url(#${clip})` })
      lid.appendChild(el('rect', { x: e.x - e.rx - 4, y: e.y - e.ry * 3, width: e.rx * 2 + 8, height: e.ry * 2, fill: d.skin }))
      lid.appendChild(el('line', { x1: e.x - e.rx - 4, y1: e.y - e.ry, x2: e.x + e.rx + 4, y2: e.y - e.ry, stroke: INK, 'stroke-width': LINE - 1 }))
      if (d.lashes) lid.appendChild(el('path', { d: `M${e.x + e.rx * 0.5} ${e.y - e.ry} l${e.rx * 0.45} -8 M${e.x + e.rx * 0.85} ${e.y - e.ry + 3} l${e.rx * 0.45} -6`, stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' }))
      eye.appendChild(lid)
      const lowerLid = el('path', { d: '', fill: d.skin, stroke: INK, 'stroke-width': LINE - 1, 'clip-path': `url(#${clip})` })
      eye.appendChild(lowerLid)
      eye.appendChild(el('ellipse', { cx: e.x, cy: e.y, rx: e.rx, ry: e.ry, fill: 'none', stroke: INK, 'stroke-width': LINE }))
      headInner.appendChild(eye)
      this.eyes.push({ pupil, lid, lowerLid })
    })
    d.eyes.forEach((e, i) => {
      const b = g({ transform: `translate(${e.x} ${e.y - e.ry - 10})` })
      const w = d.brows.width * (i === 0 ? 0.85 : 1)
      b.appendChild(g({}, `<path d="M${-w / 2} 2 Q0 ${-d.brows.thick * 0.9} ${w / 2} 2" fill="none" stroke="${d.brows.colour}" stroke-width="${d.brows.thick}" stroke-linecap="round"/>`))
      headInner.appendChild(b)
      this.brows.push(b)
    })
    headInner.appendChild(g({}, d.headFront))
    const mouth = g({ transform: `translate(${d.mouth.x} ${d.mouth.y})` })
    for (const m of MOUTHS) {
      this.mouths[m] = g({}, mouthMarkup(m, d.mouth.w, d.mouth.lip))
      mouth.appendChild(this.mouths[m])
    }
    headInner.appendChild(mouth)
    if (d.hairFront) headInner.appendChild(g({}, d.hairFront))
    // face extras
    const e0 = d.eyes[d.eyes.length - 1]
    this.extras = {
      sweat: g({}, `<path d="M${e0.x + e0.rx + 14} ${e0.y - e0.ry} q8 14 0 20 q-8 -6 0 -20Z" fill="#9fd8f5" stroke="${INK}" stroke-width="2.5"/>`),
      tear: g({}, `<path d="M${e0.x} ${e0.y + e0.ry} q-6 18 0 26 q6 -8 0 -26Z" fill="#9fd8f5" stroke="${INK}" stroke-width="2.5"/>`),
      twitch: g({}, `<path d="M${e0.x + e0.rx + 8} ${e0.y - e0.ry - 6} l10 -6 M${e0.x + e0.rx + 10} ${e0.y - 2} l13 -1 M${e0.x + e0.rx + 8} ${e0.y + e0.ry * 0.6} l10 6" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`),
    }
    for (const x of Object.values(this.extras)) headInner.appendChild(x)
    this.head.appendChild(headInner)

    // stacking: back arm, back leg, front leg, torso, head, front arm
    this.body.appendChild(this.arms.back.upper)
    this.body.appendChild(lb.holder)
    this.body.appendChild(lf.holder)
    this.body.appendChild(this.torso)
    this.body.appendChild(this.head)
    this.body.appendChild(this.arms.front.upper)
  }

  /** Where a hand's prop slot is, for putting things in it. */
  slot(side: 'back' | 'front') {
    return this.arms[side].slot
  }

  update(s: CharacterState) {
    const d = this.d
    const shake = s.shake ? Math.sin(s.time * 70) * s.shake : 0
    setTransform(this.root, `translate(${f(s.x + shake)} ${f(s.y)}) scale(${s.facing} 1)`)
    // walking: legs swing, the body bobs, arms swing a little
    const stride = s.walking ? Math.sin(s.walk * Math.PI * 2) : 0
    const bob = s.walking ? -Math.abs(Math.cos(s.walk * Math.PI * 2)) * 8 : 0
    const breathe = Math.sin(s.time * 2.2) * 1.5
    const sq = s.squash
    setTransform(this.body, `translate(0 ${f(bob)}) scale(${f(2 - sq)} ${f(sq)})`)
    setTransform(this.legs.back, `rotate(${f(-stride * 24)})`)
    setTransform(this.legs.front, `rotate(${f(stride * 24)})`)
    // the upper body leans from the hips
    const hipY = d.hips.front[1]
    const lean = `rotate(${f(s.pose.lean)} 0 ${hipY})`
    setTransform(this.torso, `${lean} translate(0 ${f(breathe * 0.4)})`)
    const swing = s.walking ? stride * 14 : 0
    for (const side of ['back', 'front'] as const) {
      const a = this.arms[side]
      const p = s.pose[side]
      const at = d.shoulders[side]
      setTransform(a.upper, `${lean} translate(${at[0]} ${f(at[1] + breathe * 0.4)}) rotate(${f(p.s + (side === 'back' ? swing : -swing))})`)
      setTransform(a.fore, `translate(0 ${d.upper}) rotate(${f(p.e)})`)
      const shape = side === 'back' ? s.pose.backHand : s.pose.frontHand
      for (const k of Object.keys(a.shapes) as HandShape[]) show(a.shapes[k], k === shape)
    }
    // head: follows the lean, tilts, and bobs a touch with breathing
    const [nx, ny] = d.neck
    setTransform(this.head, `${lean} translate(0 ${f(breathe)}) rotate(${f(s.headTilt)} ${nx} ${ny})`)
    // eyes
    const ex = s.expression
    const lids = Math.max(ex.lids, s.blink)
    d.eyes.forEach((e, i) => {
      const eye = this.eyes[i]
      const range = e.rx - e.rx * 0.22 - 3
      eye.pupil.setAttribute('cx', String(f(e.x + s.lookX * range)))
      eye.pupil.setAttribute('cy', String(f(e.y + s.lookY * (e.ry - e.rx * 0.22 - 3))))
      eye.pupil.setAttribute('r', String(f(Math.max(4, e.rx * 0.22) * ex.pupil)))
      // the lid shutter slides down; tilt slants it (angry towards the nose, sad away)
      const tilt = ex.lidTilt * (i === 0 ? 1 : -1)
      setTransform(eye.lid, `rotate(${f(tilt)} ${e.x} ${e.y}) translate(0 ${f(lids * e.ry * 2)})`)
      // a raised lower lid for smug squints
      const low = ex.mouth === 'grin' || ex.mouth === 'smile' ? 0.25 : 0
      eye.lowerLid.setAttribute('d', low ? `M${e.x - e.rx - 4} ${e.y + e.ry + 2} L${e.x - e.rx - 4} ${f(e.y + e.ry * (1 - low * 2))} Q${e.x} ${f(e.y + e.ry * (1 - low * 3))} ${e.x + e.rx + 4} ${f(e.y + e.ry * (1 - low * 2))} L${e.x + e.rx + 4} ${e.y + e.ry + 2}Z` : '')
    })
    // brows: raise and tilt
    d.eyes.forEach((e, i) => {
      const raise = i === 0 ? ex.browBack : ex.browFront
      // positive tilt lifts the inner end of each brow (towards the nose)
      const tilt = i === 0 ? -ex.tiltBack : ex.tiltFront
      setTransform(this.brows[i], `translate(${e.x} ${f(e.y - e.ry - 10 - raise)}) rotate(${f(tilt)})`)
    })
    const m = s.viseme ?? ex.mouth
    for (const k of MOUTHS) show(this.mouths[k], k === m)
    show(this.extras.sweat, !!ex.sweat)
    show(this.extras.tear, !!ex.tear)
    show(this.extras.twitch, !!ex.twitch && Math.sin(s.time * 30) > 0)
  }
}
