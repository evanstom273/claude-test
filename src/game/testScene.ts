import { bake, inBatches } from './art/bake'
import { flowersSvg, grassSvg, GRASS_TILE, stoneSvg } from './art/ground'
import { SORCERER_SIZE, sorcererSvg, type SorcererMode } from './art/sorcererArt.js'
import { PLAYER } from './data/player'
import { Input } from './input'
import { m } from './units'

/**
 * Movement test: the sorcerer walking and sprinting on a patch of grass.
 * World positions are in world pixels on the ground (x east, y south).
 */

/** How much a metre of ground shrinks vertically on screen; matches the sprite's camera. */
const GROUND_Y = 0.42
/** Distance covered by one full animation cycle (two steps), metres. */
const STRIDE = { walk: 2.8, sprint: 3.0 }
const FRAMES = 8

interface Prop {
  x: number
  y: number
  img: HTMLCanvasElement
  ax: number
  ay: number
}

type Frames = { idle: HTMLCanvasElement; walk: HTMLCanvasElement[]; sprint: HTMLCanvasElement[] }

export class TestScene {
  private ctx: CanvasRenderingContext2D
  private input = new Input()
  private detach: () => void = () => {}
  private raf = 0
  private last = 0
  private frames: Frames[] = []
  private grass!: CanvasPattern
  private props: Prop[] = []
  private bakeScale = 1
  private zoom = 1
  private dpr = 1

  x = 0
  y = 0
  vx = 0
  vy = 0
  dir = 0
  mode: SorcererMode = 'idle'
  phase = 0

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  async load(onProgress: (k: number) => void) {
    this.resize()
    const s = this.bakeScale
    const { w, h } = SORCERER_SIZE
    const jobs: (() => Promise<void>)[] = []
    let done = 0
    const total = 8 * (1 + FRAMES * 2)
    const tick = () => onProgress(++done / total)
    for (let d = 0; d < 8; d++) {
      const a = (d * Math.PI) / 4
      const fr: Frames = { idle: null!, walk: [], sprint: [] }
      this.frames.push(fr)
      jobs.push(() => bake(sorcererSvg(a, 'idle', 0), w, h, s).then((c) => void ((fr.idle = c), tick())))
      for (const mode of ['walk', 'sprint'] as const)
        for (let i = 0; i < FRAMES; i++) jobs.push(() => bake(sorcererSvg(a, mode, i / FRAMES), w, h, s).then((c) => void ((fr[mode][i] = c), tick())))
    }
    const tile = await bake(grassSvg(), GRASS_TILE, GRASS_TILE, s)
    this.grass = this.ctx.createPattern(tile, 'repeat')!
    // scattered stones and flowers so movement has something to read against
    let seed = 11
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const stones = await Promise.all([1, 2, 3, 4].map((k) => { const svg = stoneSvg(k * 31); const w = +svg.match(/width="(\d+)"/)![1]; const h = +svg.match(/height="(\d+)"/)![1]; return bake(svg, w, h, s).then((img) => ({ img, w, h })) }))
    const flowers = await Promise.all(['#e3c580', '#c46a6a', '#a9b8e8'].map((c, k) => bake(flowersSvg(k * 7 + 3, c), 32, 32, s).then((img) => ({ img, w: 32, h: 32 }))))
    for (let i = 0; i < 90; i++) {
      const pick = rand() < 0.35 ? stones[Math.floor(rand() * stones.length)] : flowers[Math.floor(rand() * flowers.length)]
      const x = (rand() - 0.5) * m(50)
      const y = (rand() - 0.5) * m(50)
      if (Math.hypot(x, y) < m(2.5)) continue
      this.props.push({ x, y, img: pick.img, ax: pick.w / 2, ay: pick.h - 6 })
    }
    await inBatches(jobs)
  }

  start() {
    this.detach = this.input.attach(this.canvas)
    const onResize = () => this.resize()
    window.addEventListener('resize', onResize)
    const prevDetach = this.detach
    this.detach = () => {
      prevDetach()
      window.removeEventListener('resize', onResize)
    }
    this.last = performance.now()
    const loop = (now: number) => {
      // rAF timestamps can be slightly older than performance.now(), so clamp at zero
      const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000))
      this.last = now
      this.update(dt)
      this.render()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.detach()
  }

  private resize() {
    const cw = this.canvas.clientWidth
    const ch = this.canvas.clientHeight
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(cw * this.dpr)
    this.canvas.height = Math.round(ch * this.dpr)
    // show roughly 11 m of height, at least 7 m of width; never blow the art up past native
    this.zoom = Math.min(1, ch / 1056, cw / 672)
    this.zoom = Math.max(this.zoom, 0.45)
    // bake once at the sharpest scale the screen needs (re-baking on resize isn't worth it for a test)
    if (!this.frames.length) this.bakeScale = Math.min(2, Math.max(1, this.dpr * this.zoom))
  }

  private update(dt: number) {
    const inp = this.input.read()
    const moving = Math.hypot(inp.x, inp.y) > 0.05
    const speed = m(PLAYER.walk) * (inp.sprint && moving ? PLAYER.sprintMultiplier : 1)
    const tx = inp.x * speed
    const ty = inp.y * speed
    // accelerate towards the wanted velocity; brake harder than you speed up
    const rate = m(moving ? PLAYER.acceleration : PLAYER.deceleration) * dt
    const dx = tx - this.vx
    const dy = ty - this.vy
    const d = Math.hypot(dx, dy)
    if (d <= rate || d === 0) {
      this.vx = tx
      this.vy = ty
    } else {
      this.vx += (dx / d) * rate
      this.vy += (dy / d) * rate
    }
    this.x += this.vx * dt
    this.y += this.vy * dt

    const v = Math.hypot(this.vx, this.vy)
    if (moving) this.dir = ((Math.round(Math.atan2(inp.x, inp.y) / (Math.PI / 4)) % 8) + 8) % 8
    // the animation follows distance travelled, so feet don't skate
    const vm = v / m(1)
    const mode: SorcererMode = vm < 0.3 ? 'idle' : vm > PLAYER.walk + 0.5 ? 'sprint' : 'walk'
    if (mode !== 'idle') this.phase = (this.phase + (vm * dt) / STRIDE[mode]) % 1
    else this.phase = 0
    this.mode = mode
  }

  private render() {
    const { ctx, canvas } = this
    const k = this.dpr * this.zoom
    const cw = canvas.width / k
    const ch = canvas.height / k
    // camera centres on the player; screen = (world x, world y × ground squash)
    const camX = this.x - cw / 2
    const camY = this.y * GROUND_Y - ch * 0.55
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.save()
    ctx.translate(-camX, -camY)
    ctx.fillStyle = this.grass
    // the pattern is in bake pixels, so scale it back to world pixels
    const s = this.bakeScale
    ctx.save()
    ctx.scale(1 / s, 1 / s)
    ctx.fillRect(camX * s, camY * s, cw * s, ch * s)
    ctx.restore()

    // everything stands on the ground: draw back to front
    const sprites: { sy: number; draw: () => void }[] = []
    for (const p of this.props) {
      const sx = p.x
      const sy = p.y * GROUND_Y
      if (sx < camX - 100 || sx > camX + cw + 100 || sy < camY - 100 || sy > camY + ch + 100) continue
      sprites.push({ sy, draw: () => ctx.drawImage(p.img, sx - p.ax, sy - p.ay, p.img.width / s, p.img.height / s) })
    }
    const fr = this.frames[this.dir]
    const img = this.mode === 'idle' ? fr.idle : fr[this.mode][Math.floor(this.phase * FRAMES) % FRAMES]
    const px = this.x
    const py = this.y * GROUND_Y
    sprites.push({ sy: py, draw: () => ctx.drawImage(img, px - SORCERER_SIZE.footX, py - SORCERER_SIZE.footY, img.width / s, img.height / s) })
    sprites.sort((a, b) => a.sy - b.sy)
    for (const sp of sprites) sp.draw()
    ctx.restore()

    // touch joystick
    const st = this.input.stick
    if (st) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(231,223,201,0.45)'
      ctx.beginPath()
      ctx.arc(st.ox, st.oy, Input.STICK_RADIUS, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(227,197,128,0.35)'
      ctx.beginPath()
      ctx.arc(st.ox, st.oy, Input.STICK_SPRINT, 0, Math.PI * 2)
      ctx.stroke()
      const dx = st.x - st.ox
      const dy = st.y - st.oy
      const d = Math.min(Input.STICK_SPRINT, Math.hypot(dx, dy)) / (Math.hypot(dx, dy) || 1)
      ctx.fillStyle = 'rgba(231,223,201,0.6)'
      ctx.beginPath()
      ctx.arc(st.ox + dx * d, st.oy + dy * d, 22, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
