import type { Ease } from './ease'
import { timeSpeech, type SpeechTiming } from './speech'
import { Track } from './track'
import { EXPRESSIONS, POSES, type ExpressionName, type PoseName } from '../characters/library'

/**
 * The director turns a script (a list of calls like say, walk, pose, cam)
 * into tracks that can be sampled at any time. Scripts read top to bottom:
 * a cursor moves forward with each line of dialogue and each wait, and every
 * other call happens "now" unless given an explicit time.
 */

export interface Voice {
  name: string
  /** Syllables per second. */
  rate: number
}

export interface SpeechEvent {
  who: string
  text: string
  t: number
  timing: SpeechTiming
  /** Voice variant, e.g. muffled with a mouthful of toast. */
  muffled?: boolean
}

export interface SfxEvent {
  t: number
  name: string
}

/** Per-character tracks. */
export class Actor {
  x: Track<number>
  y: Track<number>
  facing: Track<1 | -1>
  walking = new Track<boolean>(false)
  arms: Track<Record<string, number>>
  hands: Track<string>
  face: Track<Record<string, number>>
  expr: Track<ExpressionName>
  look = new Track<Record<string, number>>({ x: 0.3, y: 0 })
  tilt = new Track(0)
  squash = new Track(1)
  shake = new Track(0)
  blinks: number[] = []

  constructor(x: number, y: number, facing: 1 | -1, pose: PoseName, expr: ExpressionName) {
    this.x = new Track(x)
    this.y = new Track(y)
    this.facing = new Track<1 | -1>(facing)
    this.arms = new Track(armsOf(pose))
    this.hands = new Track(handsOf(pose))
    this.face = new Track(faceOf(expr))
    this.expr = new Track<ExpressionName>(expr)
  }
}

const armsOf = (n: PoseName) => {
  const p = POSES[n]
  return { fs: p.front.s, fe: p.front.e, bs: p.back.s, be: p.back.e, lean: p.lean }
}
const handsOf = (n: PoseName) => `${POSES[n].frontHand}/${POSES[n].backHand}`
const faceOf = (n: ExpressionName) => {
  const x = EXPRESSIONS[n]
  return { browFront: x.browFront, browBack: x.browBack, tiltFront: x.tiltFront, tiltBack: x.tiltBack, lids: x.lids, lidTilt: x.lidTilt, pupil: x.pupil }
}

/** A prop: where it lives (a layer or someone's hand) and where it sits there. */
export interface Flight {
  t: number
  dur: number
  from: Record<string, number>
  to: Record<string, number>
  height: number
}

export class PropTracks {
  parent: Track<string>
  pos: Track<Record<string, number>>
  visible = new Track(true)
  flights: Flight[] = []

  constructor(parent: string, x: number, y: number, r = 0) {
    this.parent = new Track(parent)
    this.pos = new Track({ x, y, r })
  }
}

export interface Shot {
  cx: number
  cy: number
  zoom: number
}

export class Director {
  /** The script cursor, in seconds. */
  t = 0
  actors: Record<string, Actor> = {}
  props: Record<string, PropTracks> = {}
  /** Free-form tracks for anything else with moving parts (toasters, the cat, the clock). */
  tracks: Record<string, Track<unknown>> = {}
  speech: SpeechEvent[] = []
  sfxEvents: SfxEvent[] = []
  camera = new Track<Record<string, number>>({ cx: 960, cy: 540, zoom: 1 })
  cards: Record<string, Track<number>> = {}

  constructor(public voices: Record<string, Voice>) {}

  // ---- setup ----

  actor(id: string, x: number, y: number, facing: 1 | -1, pose: PoseName, expr: ExpressionName) {
    this.actors[id] = new Actor(x, y, facing, pose, expr)
    return this.actors[id]
  }

  prop(id: string, parent: string, x = 0, y = 0, r = 0) {
    this.props[id] = new PropTracks(parent, x, y, r)
    return this.props[id]
  }

  track<T>(id: string, initial: T): Track<T> {
    this.tracks[id] = new Track<unknown>(initial)
    return this.tracks[id] as Track<T>
  }

  // ---- time ----

  wait(s: number) {
    this.t += s
    return this
  }

  // ---- characters ----

  pose(who: string, name: PoseName, dur = 0.3, e: Ease = 'inOut', at = this.t) {
    const a = this.actors[who]
    a.arms.add(at, armsOf(name), dur, e)
    // hands change shape halfway through the move
    a.hands.add(at + dur * 0.5, handsOf(name))
    return this
  }

  face(who: string, name: ExpressionName, dur = 0.15, at = this.t) {
    const a = this.actors[who]
    a.face.add(at, faceOf(name), dur)
    a.expr.add(at, name)
    return this
  }

  /** Point the pupils: x and y from -1 to 1, positive x towards the way they face. */
  look(who: string, x: number, y = 0, dur = 0.1, at = this.t) {
    this.actors[who].look.add(at, { x, y }, dur, 'out')
    return this
  }

  tilt(who: string, deg: number, dur = 0.3, at = this.t) {
    this.actors[who].tilt.add(at, deg, dur)
    return this
  }

  turn(who: string, facing: 1 | -1, at = this.t) {
    this.actors[who].facing.add(at, facing)
    return this
  }

  squash(who: string, v: number, dur = 0.12, at = this.t) {
    this.actors[who].squash.add(at, v, dur, 'out')
    return this
  }

  shake(who: string, v: number, at = this.t) {
    this.actors[who].shake.add(at, v)
    return this
  }

  /** Walk to x at a steady pace, facing the way they go. Returns how long it takes. */
  walk(who: string, to: number, speed = 300, at = this.t) {
    const a = this.actors[who]
    const from = a.x.at(at)
    const dur = Math.abs(to - from) / speed
    if (to !== from) a.facing.add(at, to > from ? 1 : -1)
    a.x.add(at, from, 0)
    a.x.add(at, to, dur, 'linear')
    a.walking.add(at, true)
    a.walking.add(at + dur, false)
    return dur
  }

  // ---- dialogue and sound ----

  /** A line of dialogue; the cursor moves on once it's said, plus a beat. */
  say(who: string, text: string, opts: { hold?: number; muffled?: boolean; rate?: number } = {}) {
    const timing = timeSpeech(text, opts.rate ?? this.voices[who].rate)
    this.speech.push({ who, text, t: this.t, timing, muffled: opts.muffled })
    this.t += timing.duration + (opts.hold ?? 0.3)
    return timing.duration
  }

  sfx(name: string, at = this.t) {
    this.sfxEvents.push({ t: at, name })
    return this
  }

  // ---- props ----

  /** Put a prop in a layer at a position, or in someone's hand (parent "frank.front"). */
  place(id: string, parent: string, x = 0, y = 0, r = 0, at = this.t) {
    const p = this.props[id]
    p.parent.add(at, parent)
    p.pos.add(at, { x, y, r })
    return this
  }

  /** Throw a prop along an arc to a point in its layer. */
  fly(id: string, x: number, y: number, r: number, dur: number, height = 200, at = this.t) {
    const p = this.props[id]
    const from = p.pos.at(at)
    p.flights.push({ t: at, dur, from, to: { x, y, r }, height })
    p.pos.add(at + dur, { x, y, r })
    return this
  }

  showProp(id: string, on: boolean, at = this.t) {
    this.props[id].visible.add(at, on)
    return this
  }

  // ---- camera and cards ----

  cam(cx: number, cy: number, zoom: number, dur = 0, e: Ease = 'inOut', at = this.t) {
    this.camera.add(at, { cx, cy, zoom }, dur, e)
    return this
  }

  card(id: string, on: boolean, dur = 0.25, at = this.t) {
    this.cards[id] ??= new Track(0)
    this.cards[id].add(at, on ? 1 : 0, dur, 'linear')
    return this
  }

  // ---- wrapping up ----

  /** Natural blinks every 2-5 seconds, the same on every playthrough. */
  finish(length: number) {
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (const a of Object.values(this.actors)) {
      let t = 0.5 + rnd() * 2
      while (t < length) {
        a.blinks.push(t)
        t += 2 + rnd() * 3
      }
    }
    return length
  }

  /** The prop's position at t, following any arc it's flying along. */
  propPos(id: string, t: number) {
    const p = this.props[id]
    for (const fl of p.flights) {
      if (t >= fl.t && t < fl.t + fl.dur) {
        const k = (t - fl.t) / fl.dur
        return {
          x: fl.from.x + (fl.to.x - fl.from.x) * k,
          y: fl.from.y + (fl.to.y - fl.from.y) * k - fl.height * 4 * k * (1 - k),
          r: fl.from.r + (fl.to.r - fl.from.r) * k,
        }
      }
    }
    return p.pos.at(t)
  }
}
