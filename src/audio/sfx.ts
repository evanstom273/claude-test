/** Sound effects, all synthesised: tones, filtered noise and envelopes. */

type Nodes = AudioScheduledSourceNode[]

let noiseBuf: AudioBuffer | null = null
function noiseBuffer(ctx: AudioContext) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    let s = 1
    for (let i = 0; i < d.length; i++) {
      s = (s * 16807) % 2147483647
      d[i] = (s / 2147483647) * 2 - 1
    }
  }
  return noiseBuf
}

function tone(ctx: AudioContext, out: AudioNode, when: number, freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.3, slideTo?: number): Nodes {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, when)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, when + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(gain, when + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0008, when + dur)
  o.connect(g).connect(out)
  o.start(when)
  o.stop(when + dur + 0.02)
  return [o]
}

function noise(ctx: AudioContext, out: AudioNode, when: number, dur: number, filter: BiquadFilterType, freq: number, gain = 0.3, freqTo?: number, q = 1, attack = 0.005): Nodes {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  const f = ctx.createBiquadFilter()
  f.type = filter
  f.frequency.setValueAtTime(freq, when)
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, when + dur)
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(gain, when + attack)
  g.gain.exponentialRampToValueAtTime(0.0008, when + dur)
  src.connect(f).connect(g).connect(out)
  src.start(when, Math.random() * 0.5)
  src.stop(when + dur + 0.02)
  return [src]
}

const SFX: Record<string, (ctx: AudioContext, out: AudioNode, t: number) => Nodes> = {
  // a bouncy sitcom theme: brass-ish stabs over a walking bass
  theme: (c, o, t) => {
    const n: Nodes = []
    const mel = [392, 523, 659, 784, 659, 784, 1047]
    const beats = [0, 0.25, 0.5, 0.75, 1.25, 1.5, 2]
    mel.forEach((fq, i) => {
      n.push(...tone(c, o, t + beats[i], fq, i === mel.length - 1 ? 1.2 : 0.3, 'square', 0.09))
      n.push(...tone(c, o, t + beats[i], fq * 1.5, i === mel.length - 1 ? 1.2 : 0.28, 'triangle', 0.06))
    })
    ;[131, 165, 196, 220, 196, 165, 131, 98].forEach((fq, i) => n.push(...tone(c, o, t + i * 0.25, fq, 0.24, 'triangle', 0.3)))
    for (let i = 0; i < 8; i++) n.push(...noise(c, o, t + i * 0.25, 0.06, 'highpass', 7000, i % 2 ? 0.05 : 0.09))
    n.push(...tone(c, o, t + 2, 131, 1.3, 'triangle', 0.3))
    n.push(...noise(c, o, t + 2, 1, 'highpass', 5000, 0.12))
    return n
  },
  slurp: (c, o, t) => [...noise(c, o, t, 0.45, 'bandpass', 900, 0.5, 2600, 6, 0.08), ...noise(c, o, t + 0.35, 0.3, 'bandpass', 1400, 0.4, 3200, 8, 0.05)],
  puff: (c, o, t) => noise(c, o, t, 0.45, 'lowpass', 2500, 0.5, 300),
  boot: (c, o, t) => [...tone(c, o, t, 660, 0.15, 'square', 0.08), ...tone(c, o, t + 0.15, 880, 0.15, 'square', 0.08), ...tone(c, o, t + 0.3, 1320, 0.4, 'square', 0.08)],
  clunk: (c, o, t) => [...noise(c, o, t, 0.12, 'lowpass', 900, 0.6), ...tone(c, o, t, 160, 0.12, 'square', 0.12, 80)],
  error: (c, o, t) => [...tone(c, o, t, 440, 0.18, 'square', 0.1), ...tone(c, o, t + 0.22, 330, 0.3, 'square', 0.1)],
  beep: (c, o, t) => tone(c, o, t, 1200, 0.12, 'square', 0.07),
  buzz: (c, o, t) => tone(c, o, t, 110, 0.5, 'sawtooth', 0.16),
  ding: (c, o, t) => [...tone(c, o, t, 1568, 1.2, 'sine', 0.3), ...tone(c, o, t, 3136, 0.6, 'sine', 0.08)],
  chime: (c, o, t) => [...tone(c, o, t, 1047, 0.2, 'triangle', 0.18), ...tone(c, o, t + 0.12, 1319, 0.2, 'triangle', 0.18), ...tone(c, o, t + 0.24, 1568, 0.5, 'triangle', 0.18)],
  whoosh: (c, o, t) => noise(c, o, t, 0.35, 'bandpass', 400, 0.5, 3000, 2, 0.1),
  tick: (c, o, t) => [...noise(c, o, t, 0.04, 'highpass', 4000, 0.25), ...noise(c, o, t + 0.5, 0.04, 'highpass', 3000, 0.2)],
  typing: (c, o, t) => [0, 0.09, 0.21, 0.3].flatMap((k) => noise(c, o, t + k, 0.03, 'bandpass', 3500, 0.25, undefined, 3)),
  thwack: (c, o, t) => [...noise(c, o, t, 0.18, 'lowpass', 1800, 0.8), ...tone(c, o, t, 220, 0.15, 'triangle', 0.4, 60)],
  crunch: (c, o, t) => [0, 0.12, 0.22, 0.4, 0.5].flatMap((k) => noise(c, o, t + k, 0.07, 'bandpass', 2400, 0.4, undefined, 1.5)),
  rumble: (c, o, t) => {
    const n = noise(c, o, t, 1.2, 'lowpass', 180, 0.8, 400, 1, 0.2)
    for (let k = 0; k < 1.1; k += 0.08) n.push(...noise(c, o, t + k, 0.05, 'bandpass', 1800, 0.12, undefined, 4))
    return n
  },
  sting: (c, o, t) => {
    const n: Nodes = []
    ;[523, 659, 784].forEach((fq, i) => n.push(...tone(c, o, t + i * 0.12, fq, 0.2, 'square', 0.09)))
    ;[523, 659, 784, 1047].forEach((fq) => n.push(...tone(c, o, t + 0.45, fq, 1.4, 'triangle', 0.12)))
    n.push(...tone(c, o, t + 0.45, 131, 1.4, 'triangle', 0.3))
    n.push(...noise(c, o, t + 0.45, 1.2, 'highpass', 5000, 0.12))
    return n
  },
}

export function playSfx(ctx: AudioContext, out: AudioNode, name: string, when: number): Nodes {
  return SFX[name]?.(ctx, out, when) ?? []
}
