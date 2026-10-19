import './style.css'
import { Sound } from './audio/scheduler'
import { smartToast, VOICES } from './episode/smartToast'
import { Stage } from './scene/stage'

const { director, length } = smartToast()
const stage = new Stage(director)
const sound = new Sound(director)
document.getElementById('screen')!.appendChild(stage.svg)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const subs = $('subs')
const who = $('who')
const line = $('line')
const playBtn = $<HTMLButtonElement>('play')
const scrub = $<HTMLInputElement>('scrub')
const time = $('time')
const start = $<HTMLButtonElement>('start')

let t = 0
let playing = false
/** performance.now() at t = 0, used when there's no audio clock. */
let wallOrigin = 0

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function draw() {
  stage.render(t)
  const s = stage.speechAt(t)
  if (s) {
    subs.hidden = false
    const name = VOICES[s.who as keyof typeof VOICES].name
    if (who.textContent !== name) who.textContent = name
    const text = s.text.slice(0, revealed(s, t))
    if (line.textContent !== text) line.textContent = text
  } else subs.hidden = true
  scrub.value = String(Math.round((t / length) * 1000))
  time.textContent = `${fmt(t)} / ${fmt(length)}`
}

function revealed(s: NonNullable<ReturnType<Stage['speechAt']>>, at: number) {
  const k = at - s.t
  if (k >= s.timing.duration) return s.text.length
  let r = 0
  for (const syl of s.timing.syllables) if (k >= syl.t) r = syl.reveal
  return r
}

function play() {
  if (t >= length) t = 0
  playing = true
  sound.unlock()
  sound.start(t)
  wallOrigin = performance.now() / 1000 - t
  playBtn.textContent = '❚❚'
  playBtn.setAttribute('aria-label', 'Pause')
}

function pause() {
  playing = false
  sound.stop()
  playBtn.textContent = '▶'
  playBtn.setAttribute('aria-label', 'Play')
}

function seek(to: number) {
  t = Math.max(0, Math.min(length, to))
  if (playing) play()
  draw()
}

function frame() {
  if (playing) {
    t = sound.clock() ?? performance.now() / 1000 - wallOrigin
    sound.pump()
    if (t >= length) {
      t = length
      pause()
    }
    draw()
  }
  requestAnimationFrame(frame)
}

start.addEventListener('click', () => {
  start.hidden = true
  play()
})
playBtn.addEventListener('click', () => {
  start.hidden = true
  if (playing) pause()
  else play()
})
$('restart').addEventListener('click', () => {
  start.hidden = true
  t = 0
  play()
  draw()
})
scrub.addEventListener('input', () => {
  start.hidden = true
  seek((+scrub.value / 1000) * length)
})
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault()
    playBtn.click()
  }
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) pause()
})

// #t=12.5 opens paused at that moment, handy for checking a shot
const at = /t=([\d.]+)/.exec(location.hash)
if (at) {
  t = +at[1]
  start.hidden = true
}
draw()
requestAnimationFrame(frame)
