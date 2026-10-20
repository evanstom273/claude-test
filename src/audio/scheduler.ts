import type { Director } from '../engine/director'
import { playSfx } from './sfx'
import { syllable } from './voices'

interface AudioEvent {
  t: number
  play: (ctx: AudioContext, out: AudioNode, when: number) => AudioScheduledSourceNode[]
}

/**
 * Schedules the episode's sound a little ahead of the playhead. Every voice
 * syllable and effect is an event on the same clock as the pictures; pausing
 * or seeking silences everything and starts scheduling again from there.
 */
export class Sound {
  ctx: AudioContext | null = null
  private out: GainNode | null = null
  private events: AudioEvent[]
  private live = new Set<AudioScheduledSourceNode>()
  private next = 0
  /** ctx.currentTime when the episode was at t = 0. */
  private origin = 0

  constructor(d: Director) {
    const ev: AudioEvent[] = []
    let seed = 1
    for (const s of d.speech) {
      for (const syl of s.timing.syllables) {
        const n = seed++
        ev.push({ t: s.t + syl.t, play: (c, o, w) => syllable(c, o, w, s.who, syl.vowel, syl.dur, syl.pitch, syl.loud, n, s.muffled) })
      }
    }
    for (const e of d.sfxEvents) ev.push({ t: e.t, play: (c, o, w) => playSfx(c, o, e.name, w) })
    this.events = ev.sort((a, b) => a.t - b.t)
  }

  /** Must be called from a click: browsers only allow audio after one. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      const comp = this.ctx.createDynamicsCompressor()
      this.out = this.ctx.createGain()
      this.out.gain.value = 0.9
      this.out.connect(comp).connect(this.ctx.destination)
    }
    void this.ctx.resume()
  }

  start(t: number) {
    if (!this.ctx) return
    this.stop()
    this.origin = this.ctx.currentTime + 0.05 - t
    this.next = this.events.findIndex((e) => e.t >= t - 0.01)
    if (this.next < 0) this.next = this.events.length
  }

  /** The episode time by the audio clock, which the pictures follow so lips stay in sync. */
  clock() {
    return this.ctx && this.ctx.state === 'running' ? this.ctx.currentTime - this.origin : null
  }

  /** Call every frame while playing. */
  pump() {
    if (!this.ctx || !this.out) return
    const horizon = this.ctx.currentTime + 0.3
    while (this.next < this.events.length && this.origin + this.events[this.next].t < horizon) {
      const e = this.events[this.next++]
      const when = Math.max(this.ctx.currentTime, this.origin + e.t)
      for (const n of e.play(this.ctx, this.out, when)) {
        this.live.add(n)
        n.onended = () => this.live.delete(n)
      }
    }
  }

  stop() {
    for (const n of this.live) {
      try {
        n.stop()
      } catch {
        // already stopped
      }
    }
    this.live.clear()
  }
}
