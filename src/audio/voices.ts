import type { Vowel } from '../engine/speech'

/**
 * Animal Crossing-style gibberish: each syllable is a short pitched blip
 * pushed through two band-pass filters tuned to the vowel's formants, so the
 * "words" carry a hint of the real vowels without being speech.
 */

export interface VoiceProfile {
  base: number
  wave: OscillatorType
  /** Random pitch wobble per syllable, as a fraction. */
  wobble: number
  /** Snap pitches to semitones, for robots. */
  quantise?: boolean
  /** A second detuned oscillator for gravel. */
  gravel?: number
  gain: number
}

export const PROFILES: Record<string, VoiceProfile> = {
  frank: { base: 118, wave: 'sawtooth', wobble: 0.14, gravel: 7, gain: 0.32 },
  linda: { base: 205, wave: 'triangle', wobble: 0.04, gain: 0.55 },
  cat: { base: 290, wave: 'sine', wobble: 0.22, gain: 0.6 },
  toaster: { base: 520, wave: 'square', wobble: 0.3, quantise: true, gain: 0.14 },
}

const FORMANTS: Record<Vowel, [number, number]> = {
  a: [800, 1200],
  e: [500, 1900],
  i: [320, 2300],
  o: [500, 900],
  u: [350, 800],
}

/** A stable random number for a syllable, so replays sound identical. */
function hash(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export function syllable(ctx: AudioContext, out: AudioNode, when: number, who: string, vowel: Vowel, dur: number, pitch: number, loud: number, seed: number, muffled = false): AudioScheduledSourceNode[] {
  const p = PROFILES[who]
  let freq = p.base * pitch * (1 + (hash(seed) - 0.5) * 2 * p.wobble)
  if (p.quantise) freq = 440 * Math.pow(2, Math.round(12 * Math.log2(freq / 440)) / 12)
  const env = ctx.createGain()
  const peak = p.gain * loud
  env.gain.setValueAtTime(0, when)
  env.gain.linearRampToValueAtTime(peak, when + 0.012)
  env.gain.setValueAtTime(peak, when + dur * 0.55)
  env.gain.exponentialRampToValueAtTime(0.0008, when + dur)

  const mix = ctx.createGain()
  const [f1, f2] = FORMANTS[vowel]
  for (const [fq, q, g] of [[f1, 5, 1], [f2, 8, 0.6]] as const) {
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = fq
    bp.Q.value = q
    const gn = ctx.createGain()
    gn.gain.value = g * 2.2
    mix.connect(bp).connect(gn).connect(env)
  }
  // some of the raw tone too, so it has body
  const dry = ctx.createGain()
  dry.gain.value = 0.35
  mix.connect(dry).connect(env)

  if (muffled) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 500
    env.connect(lp).connect(out)
  } else env.connect(out)

  const nodes: AudioScheduledSourceNode[] = []
  const osc = ctx.createOscillator()
  osc.type = p.wave
  // a little slide into each syllable, like a voice
  osc.frequency.setValueAtTime(freq * 0.92, when)
  osc.frequency.exponentialRampToValueAtTime(freq, when + Math.min(0.05, dur * 0.4))
  osc.connect(mix)
  nodes.push(osc)
  if (p.gravel) {
    const o2 = ctx.createOscillator()
    o2.type = 'square'
    o2.frequency.setValueAtTime(freq / 2 + p.gravel, when)
    const g2 = ctx.createGain()
    g2.gain.value = 0.35
    o2.connect(g2).connect(mix)
    nodes.push(o2)
  }
  if (who === 'cat') {
    // a lazy meow bend downwards
    osc.frequency.exponentialRampToValueAtTime(freq * 0.75, when + dur)
  }
  for (const n of nodes) {
    n.start(when)
    n.stop(when + dur + 0.02)
  }
  return nodes
}
