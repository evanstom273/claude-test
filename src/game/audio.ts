// Tiny synthesised sound kit: no audio files, everything is generated with WebAudio.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false
const lastPlayed: Record<string, number> = {}

export function initAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return
    }
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.4
    master.connect(ctx.destination)
    startDrone()
  }
  void ctx.resume()
}

export function setMuted(m: boolean) {
  muted = m
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.4, ctx.currentTime, 0.05)
}

export const isMuted = () => muted

function throttle(key: string, ms: number) {
  const now = performance.now()
  if (now - (lastPlayed[key] ?? 0) < ms) return true
  lastPlayed[key] = now
  return false
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

function noise(dur: number, vol: number, freq: number, q = 1) {
  if (!ctx || !master) return
  const t = ctx.currentTime
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(master)
  src.start(t)
}

function startDrone() {
  if (!ctx || !master) return
  const g = ctx.createGain()
  g.gain.value = 0.05
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  lfo.frequency.value = 0.08
  lfoGain.gain.value = 0.025
  lfo.connect(lfoGain).connect(g.gain)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 320
  for (const f of [55, 55.4, 82.4]) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = f
    o.connect(filter)
    o.start()
  }
  filter.connect(g).connect(master)
  lfo.start()
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]
let pickupStep = 0

export const sfx = {
  pickup() {
    if (throttle('pickup', 40)) return
    const f = PENTA[pickupStep++ % PENTA.length]
    tone(f, 0.18, 'triangle', 0.22)
    tone(f * 2, 0.12, 'sine', 0.06, undefined, 0.03)
  },
  hurt() {
    noise(0.3, 0.6, 300, 0.8)
    tone(140, 0.35, 'sawtooth', 0.15, 50)
  },
  kill() {
    if (throttle('kill', 60)) return
    tone(420 + Math.random() * 120, 0.16, 'sine', 0.12, 90)
    noise(0.12, 0.15, 2400, 2)
  },
  flare() {
    noise(0.7, 0.4, 1200, 0.6)
    tone(180, 0.6, 'sine', 0.25, 720)
  },
  brazier() {
    noise(0.9, 0.35, 700, 0.5)
    tone(196, 0.8, 'triangle', 0.18)
    tone(293.66, 0.8, 'triangle', 0.12, undefined, 0.08)
  },
  dawn() {
    ;[392, 493.88, 587.33, 783.99].forEach((f, i) => tone(f, 1.4, 'triangle', 0.14, undefined, i * 0.12))
  },
  death() {
    tone(330, 1.6, 'sine', 0.2, 55)
    noise(1.4, 0.3, 200, 0.5)
  },
  click() {
    tone(880, 0.06, 'square', 0.05)
  },
}
