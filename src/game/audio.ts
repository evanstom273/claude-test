// All sound is synthesised with WebAudio: no audio files.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false

export function initAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return
    }
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.5
    master.connect(ctx.destination)
    ambience()
  }
  void ctx.resume()
}

export function setMuted(m: boolean) {
  muted = m
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05)
}
export const isMuted = () => muted

function noiseBuffer(dur: number) {
  const len = Math.floor(ctx!.sampleRate * dur)
  const buf = ctx!.createBuffer(1, len, ctx!.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function noise(dur: number, vol: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1, delay = 0) {
  if (!ctx || !master) return
  const t = ctx.currentTime + delay
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(dur)
  const f = ctx.createBiquadFilter()
  f.type = type
  f.Q.value = q
  f.frequency.setValueAtTime(f0, t)
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t)
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  if (!ctx || !master) return
  const t = ctx.currentTime + delay
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function ambience() {
  if (!ctx || !master) return
  // wind: looping filtered noise with a slow sweep
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(4)
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 400
  f.Q.value = 0.6
  const lfo = ctx.createOscillator()
  const lg = ctx.createGain()
  lfo.frequency.value = 0.07
  lg.gain.value = 220
  lfo.connect(lg).connect(f.frequency)
  const g = ctx.createGain()
  g.gain.value = 0.05
  src.connect(f).connect(g).connect(master)
  src.start()
  lfo.start()
  // a low, uneasy drone
  const dg = ctx.createGain()
  dg.gain.value = 0.025
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 260
  for (const fr of [49, 49.6, 73.4]) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = fr
    o.connect(lp)
    o.start()
  }
  lp.connect(dg).connect(master)
}

export const sfx = {
  swing(heavy: boolean) {
    noise(heavy ? 0.34 : 0.2, heavy ? 0.35 : 0.22, 'bandpass', heavy ? 600 : 1400, heavy ? 2600 : 4200, 1.4)
  },
  hit(heavy: boolean, crit: boolean) {
    tone(heavy ? 90 : 130, 0.18, 'sine', 0.5, 40)
    noise(0.16, 0.45, 'lowpass', 1800, 300)
    noise(0.1, 0.25, 'highpass', 3000, 6000, 1, 0.01)
    if (crit) tone(520, 0.5, 'triangle', 0.15, 260, 0.02)
  },
  hurt() {
    tone(180, 0.3, 'sawtooth', 0.22, 70)
    noise(0.3, 0.5, 'lowpass', 900, 120)
  },
  roll() {
    noise(0.3, 0.16, 'bandpass', 500, 260, 0.8)
  },
  jump() {
    noise(0.12, 0.08, 'bandpass', 900, 1500)
  },
  land() {
    noise(0.12, 0.18, 'lowpass', 500, 120)
  },
  heal() {
    ;[523, 659, 784].forEach((f, i) => tone(f, 0.6, 'sine', 0.08, undefined, i * 0.07))
  },
  rest() {
    ;[196, 247, 294, 392].forEach((f, i) => tone(f, 1.8, 'triangle', 0.1, undefined, i * 0.18))
  },
  tele() {
    // a rasping intake of breath through burlap
    noise(0.5, 0.18, 'bandpass', 300, 1600, 3)
    tone(70, 0.5, 'sawtooth', 0.08, 110)
  },
  enemyStrike() {
    noise(0.22, 0.3, 'bandpass', 900, 3200, 1.2)
  },
  slam() {
    tone(60, 0.5, 'sine', 0.6, 30)
    noise(0.5, 0.5, 'lowpass', 600, 60)
  },
  stagger() {
    tone(300, 0.4, 'square', 0.08, 120)
    noise(0.4, 0.3, 'bandpass', 2000, 400, 2)
  },
  aggro() {
    tone(110, 1.2, 'sawtooth', 0.09, 98)
    tone(116, 1.2, 'sawtooth', 0.09, 104)
    noise(1.2, 0.12, 'bandpass', 2400, 800, 6)
  },
  harvested() {
    ;[392, 330, 262, 196].forEach((f, i) => tone(f, 2.2, 'triangle', 0.12, undefined, i * 0.22))
    noise(1.5, 0.3, 'lowpass', 1200, 100)
  },
  death() {
    tone(147, 3, 'sine', 0.25, 73)
    tone(220, 3, 'sine', 0.1, 110, 0.15)
  },
  noStamina() {
    tone(160, 0.08, 'square', 0.05)
  },
  click() {
    tone(660, 0.05, 'triangle', 0.08)
  },
}
