import type { Director } from '../engine/director'
import { visemeAt } from '../engine/speech'
import { el, f, g, INK, setTransform, show } from '../engine/svg'
import { CatRig } from '../characters/cat'
import { frank } from '../characters/frank'
import { linda } from '../characters/linda'
import { EXPRESSIONS, type ExpressionName } from '../characters/library'
import { Rig } from '../characters/rig'
import type { CharacterState, HandShape, Mouth } from '../characters/types'
import { box, card, mug, newspaper, OldToaster, phone, SmartToaster, toast } from '../props/props'
import { backSet, Clock, table, textCard, titleCard } from './kitchen'
import { stroke } from '../characters/parts'

/**
 * Builds the SVG for the set, cast and props once, then poses everything for
 * any moment of the episode. Rendering is a pure function of time.
 */
export class Stage {
  svg: SVGSVGElement
  private camera: SVGGElement
  private layers: Record<string, SVGGElement>
  private rigs: Record<string, Rig>
  private cat = new CatRig()
  private catHolder = g()
  private props: Record<string, { holder: SVGGElement; parent: string }> = {}
  private smart = new SmartToaster()
  private old = new OldToaster()
  private clock = new Clock()
  private cards: Record<string, SVGGElement>

  constructor(private d: Director) {
    this.svg = el('svg', { viewBox: '0 0 1920 1080', preserveAspectRatio: 'xMidYMid slice' })
    this.camera = g()
    this.svg.appendChild(this.camera)
    const layer = (name: string) => {
      const l = g({ class: name })
      this.camera.appendChild(l)
      return l
    }
    this.layers = {} as Record<string, SVGGElement>
    this.camera.appendChild(backSet())
    this.camera.appendChild(this.clock.root)
    this.layers.counter = layer('counter')
    this.catHolder.appendChild(this.cat.root)
    this.camera.appendChild(this.catHolder)
    this.layers.chars = layer('chars')
    this.camera.appendChild(table())
    this.layers.tabletop = layer('tabletop')
    this.layers.fx = layer('fx')

    this.rigs = { linda: new Rig(linda), frank: new Rig(frank) }
    for (const r of Object.values(this.rigs)) this.layers.chars.appendChild(r.root)

    const art: Record<string, SVGGElement> = {
      box: box(),
      mug: mug(),
      paper: newspaper(),
      phone: phone(),
      card: card(),
      smart: this.smart.root,
      old: this.old.root,
      puff: g({}, `<g fill="#fff" ${stroke}>${[[-70, 10, 50], [60, 0, 56], [0, -40, 70], [-20, 30, 54], [40, 40, 44]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g><g fill="#fff">${[[-70, 10, 46], [60, 0, 52], [0, -40, 66], [-20, 30, 50], [40, 40, 40]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`),
      flyToast: toast(),
      catToast: toast(),
    }
    for (const [id, a] of Object.entries(art)) {
      const holder = g({ class: `prop ${id}` })
      holder.appendChild(a)
      this.props[id] = { holder, parent: '' }
    }

    this.cards = { title: titleCard(), later: textCard('FORTY MINUTES LATER'), end: textCard('THE END', '#3a6fd8') }
    for (const c of Object.values(this.cards)) this.svg.appendChild(c)
    // a thin border so the frame reads as a TV picture
    this.svg.appendChild(el('rect', { x: 0, y: 0, width: 1920, height: 1080, fill: 'none', stroke: INK, 'stroke-width': 6 }))
  }

  /** Who is talking at t, and the line, for the subtitles. */
  speechAt(t: number) {
    let cur = null
    for (const s of this.d.speech) {
      if (t >= s.t && t < s.t + s.timing.duration + 0.7) cur = s
    }
    return cur
  }

  private visemeFor(who: string, t: number) {
    for (const s of this.d.speech) {
      if (s.who !== who) continue
      const v = visemeAt(s.timing, t - s.t)
      if (v) return { v, muffled: !!s.muffled }
    }
    return null
  }

  render(t: number) {
    const d = this.d
    const tr = <T,>(id: string) => d.tracks[id].at(t) as T

    // camera
    const c = { ...d.camera.at(t) }
    // never show past the edges of the set
    c.cx = Math.max(960 / c.zoom, Math.min(1920 - 960 / c.zoom, c.cx))
    c.cy = Math.max(540 / c.zoom, Math.min(1080 - 540 / c.zoom, c.cy))
    setTransform(this.camera, `translate(960 540) scale(${f(c.zoom)}) translate(${f(-c.cx)} ${f(-c.cy)})`)
    for (const [id, card] of Object.entries(this.cards)) {
      const o = d.cards[id]?.at(t) ?? 0
      show(card, o > 0.001)
      card.setAttribute('opacity', String(f(o)))
    }

    // people
    const arms: Record<string, { front: number; back: number; facing: number }> = {}
    for (const [id, rig] of Object.entries(this.rigs)) {
      const a = d.actors[id]
      const armRec = a.arms.at(t)
      const [frontHand, backHand] = a.hands.at(t).split('/') as HandShape[]
      const exprName = a.expr.at(t) as ExpressionName
      const expression = { ...EXPRESSIONS[exprName], ...a.face.at(t) }
      const vis = this.visemeFor(id, t)
      let viseme: Mouth | null = null
      if (vis) viseme = vis.muffled ? (vis.v === 'closed' ? 'full' : 'chew') : (vis.v as Mouth)
      let blink = 0
      for (const b of a.blinks) if (t >= b && t < b + 0.16) blink = 1 - Math.abs((t - b) / 0.08 - 1)
      const x = a.x.at(t)
      const walking = a.walking.at(t)
      const look = a.look.at(t)
      const state: CharacterState = {
        x,
        y: a.y.at(t),
        facing: a.facing.at(t),
        pose: {
          front: { s: armRec.fs, e: armRec.fe },
          back: { s: armRec.bs, e: armRec.be },
          frontHand,
          backHand,
          lean: armRec.lean,
        },
        expression,
        lookX: look.x,
        lookY: look.y,
        headTilt: a.tilt.at(t),
        viseme,
        walk: Math.abs(x) / 230,
        walking,
        blink,
        squash: a.squash.at(t),
        shake: a.shake.at(t),
        time: t,
      }
      rig.update(state)
      // how far each hand has turned, so props held in it can stay upright
      const swing = walking ? Math.sin(state.walk * Math.PI * 2) * 14 : 0
      arms[id] = { front: armRec.lean + armRec.fs + armRec.fe - swing, back: armRec.lean + armRec.bs + armRec.be + swing, facing: state.facing }
    }

    // the cat
    const catV = this.visemeFor('cat', t)
    const catMouth = catV && catV.v !== 'closed' ? 'open' : tr<'closed' | 'open' | 'chew' | 'yawn'>('cat.mouth')
    setTransform(this.catHolder, `translate(${tr<number>('cat.x')} 646) scale(0.8)`)
    this.cat.update({ x: 0, y: 0, facing: tr('cat.facing'), lids: tr('cat.lids'), lookX: tr('cat.look'), mouth: catMouth, paw: tr('cat.paw'), headTilt: tr('cat.tilt'), time: t, holding: tr('cat.holding') })

    // toasters
    const toasterV = this.visemeFor('toaster', t)
    this.smart.update({
      x: 0,
      y: 0,
      text: tr('screen.text'),
      progress: tr<boolean>('screen.bar') ? tr<number>('screen.progress') : null,
      lever: tr('smart.lever'),
      shake: tr('smart.shake'),
      led: toasterV && toasterV.v !== 'closed' ? '#ffffff' : tr('smart.led'),
      bread: tr('smart.bread'),
      pop: tr('smart.pop'),
      time: t,
    })
    this.old.update({ x: 0, y: 0, lever: tr('old.lever'), bread: tr('old.bread'), toasted: tr('old.toasted'), pop: tr('old.pop'), visible: true })
    this.clock.update(tr('clock'))

    // props: move into the right layer or hand, then place
    for (const [id, p] of Object.entries(this.props)) {
      const pt = d.props[id]
      const parent = pt.parent.at(t)
      if (parent !== p.parent) {
        const [who, side] = parent.split('.')
        const target = side ? this.rigs[who].slot(side as 'front' | 'back') : this.layers[parent]
        target.appendChild(p.holder)
        p.parent = parent
      }
      show(p.holder, pt.visible.at(t))
      const pos = d.propPos(id, t)
      const [who, side] = parent.split('.')
      if (side) {
        const a = arms[who]
        const turn = side === 'front' ? a.front : a.back
        setTransform(p.holder, `rotate(${f(-turn)}) translate(${f(pos.x)} ${f(pos.y)}) scale(${a.facing} 1) rotate(${f(pos.r)})`)
      } else {
        setTransform(p.holder, `translate(${f(pos.x)} ${f(pos.y)}) rotate(${f(pos.r)})`)
      }
    }
  }
}
