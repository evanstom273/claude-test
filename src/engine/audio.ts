// Synthesised sound: no audio files.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false
let ambience: GainNode | null = null

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
    startAmbience()
  }
  void ctx.resume()
}

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05)
}

function noiseBuf(dur: number) {
  const len = Math.floor(ctx!.sampleRate * dur)
  const b = ctx!.createBuffer(1, len, ctx!.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return b
}

function noise(dur: number, vol: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1, delay = 0) {
  if (!ctx || !master) return
  const t = ctx.currentTime + delay
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf(dur)
  const f = ctx.createBiquadFilter()
  f.type = type
  f.Q.value = q
  f.frequency.setValueAtTime(f0, t)
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(master)
  s.start(t)
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide?: number, delay = 0) {
  if (!ctx || !master) return
  const t = ctx.currentTime + delay
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function startAmbience() {
  if (!ctx || !master) return
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf(4)
  s.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 500
  ambience = ctx.createGain()
  ambience.gain.value = 0.03
  s.connect(f).connect(ambience).connect(master)
  s.start()
}

/** Outdoors a soft breeze; underground a low hollow hum. */
export function setAmbience(outdoors: boolean) {
  if (!ctx || !ambience) return
  ambience.gain.setTargetAtTime(outdoors ? 0.035 : 0.06, ctx.currentTime, 0.5)
}

export const sfx = {
  step(stone: boolean) {
    noise(0.08, stone ? 0.08 : 0.05, 'lowpass', stone ? 900 : 500, 200)
  },
  swing() {
    noise(0.18, 0.2, 'bandpass', 1200, 3800, 1.4)
  },
  hit(kill: boolean) {
    tone(140, 0.16, 'sine', 0.4, 50)
    noise(0.14, 0.35, 'lowpass', 2200, 300)
    if (kill) noise(0.5, 0.25, 'bandpass', 900, 200, 2, 0.05)
  },
  bones() {
    for (let i = 0; i < 4; i++) noise(0.05, 0.18, 'bandpass', 2400 + Math.random() * 800, 1800, 6, i * 0.06)
  },
  squeak() {
    tone(1800, 0.12, 'square', 0.04, 2600)
    tone(2200, 0.1, 'square', 0.03, 1600, 0.12)
  },
  hurt() {
    tone(220, 0.25, 'sawtooth', 0.15, 90)
    noise(0.25, 0.4, 'lowpass', 900, 150)
  },
  block() {
    tone(1400, 0.25, 'triangle', 0.12, 1100)
    noise(0.12, 0.3, 'highpass', 3000, 5000)
  },
  coin() {
    tone(1320, 0.12, 'triangle', 0.1)
    tone(1760, 0.18, 'triangle', 0.08, undefined, 0.07)
  },
  potion() {
    for (let i = 0; i < 5; i++) tone(500 + i * 90, 0.08, 'sine', 0.08, undefined, i * 0.06)
  },
  levelUp() {
    ;[523, 659, 784, 1046].forEach((f, i) => tone(f, 0.6, 'triangle', 0.12, undefined, i * 0.12))
  },
  skill() {
    tone(880, 0.3, 'triangle', 0.07, 1320)
  },
  door() {
    noise(0.6, 0.3, 'lowpass', 400, 80, 1)
    tone(90, 0.5, 'sawtooth', 0.05, 60)
  },
  talk() {
    tone(660, 0.05, 'triangle', 0.05)
  },
  quest() {
    ;[392, 523, 659].forEach((f, i) => tone(f, 0.8, 'triangle', 0.1, undefined, i * 0.15))
  },
  death() {
    tone(220, 1.6, 'sine', 0.2, 55)
  },
  jump() {
    noise(0.1, 0.06, 'bandpass', 700, 1400)
  },
}
