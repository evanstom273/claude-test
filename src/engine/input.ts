export type Action = 'forward' | 'back' | 'left' | 'right' | 'run' | 'jump' | 'attack' | 'block' | 'use' | 'potion' | 'sheet' | 'pause'

const KEYS: Record<string, Action> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  Space: 'jump',
  KeyE: 'use',
  KeyF: 'use',
  KeyQ: 'potion',
  KeyC: 'sheet',
  Tab: 'sheet',
  Escape: 'pause',
  KeyP: 'pause',
}

// Xbox layout: A jump, B use, X potion, Y sheet, RT attack, LT block, LB run, Start pause
const PAD: [number, Action][] = [
  [0, 'jump'],
  [1, 'use'],
  [2, 'potion'],
  [3, 'sheet'],
  [7, 'attack'],
  [5, 'attack'],
  [6, 'block'],
  [4, 'block'],
  [10, 'run'],
  [9, 'pause'],
]

/** Keyboard, mouse, gamepad and touch merged into one state. */
export class Input {
  private sources = new Map<string, Set<Action>>()
  private presses = new Map<Action, number>()
  private padPrev = new Set<Action>()
  /** Accumulated look delta in radians since last read. */
  lookX = 0
  lookY = 0
  moveX = 0
  moveY = 0
  private padMove = { x: 0, y: 0 }
  private touchMove: { x: number; y: number } | null = null
  sensitivity = 0.0024
  enabled = true
  onAction: ((a: Action) => void) | null = null

  private set(src: string, a: Action, down: boolean) {
    let s = this.sources.get(src)
    if (!s) this.sources.set(src, (s = new Set()))
    if (down && !s.has(a)) this.press(a)
    if (down) s.add(a)
    else s.delete(a)
  }

  press(a: Action) {
    this.presses.set(a, performance.now())
    this.onAction?.(a)
  }

  held(a: Action) {
    for (const s of this.sources.values()) if (s.has(a)) return true
    return false
  }

  take(a: Action, windowMs = 150) {
    const t = this.presses.get(a)
    this.presses.delete(a)
    return t !== undefined && performance.now() - t <= windowMs
  }

  clear() {
    this.sources.clear()
    this.presses.clear()
    this.touchMove = null
  }

  touch(a: Action, down: boolean) {
    this.set('touch', a, down)
  }

  setTouchMove(v: { x: number; y: number } | null) {
    this.touchMove = v
  }

  addLook(dx: number, dy: number) {
    this.lookX += dx
    this.lookY += dy
  }

  /** Movement on a unit circle: x strafes right, y walks forward. */
  readMove() {
    let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0)
    let y = (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0)
    if (this.touchMove) {
      x = this.touchMove.x
      y = this.touchMove.y
    } else if (Math.hypot(this.padMove.x, this.padMove.y) > 0.2) {
      x = this.padMove.x
      y = -this.padMove.y
    }
    const l = Math.hypot(x, y)
    if (l > 1) {
      x /= l
      y /= l
    }
    this.moveX = x
    this.moveY = y
    return { x, y }
  }

  attach(canvas: HTMLElement) {
    const kd = (e: KeyboardEvent) => {
      const a = KEYS[e.code]
      if (!a) return
      e.preventDefault()
      if (!e.repeat) this.set('kb', a, true)
    }
    const ku = (e: KeyboardEvent) => {
      const a = KEYS[e.code]
      if (a) this.set('kb', a, false)
    }
    const md = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      if (e.button === 0) this.set('mouse', 'attack', true)
      if (e.button === 2) this.set('mouse', 'block', true)
    }
    const mu = (e: MouseEvent) => {
      if (e.button === 0) this.set('mouse', 'attack', false)
      if (e.button === 2) this.set('mouse', 'block', false)
    }
    const mm = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas && this.enabled) this.addLook(e.movementX * this.sensitivity, e.movementY * this.sensitivity)
    }
    const cm = (e: Event) => e.preventDefault()
    const blur = () => this.sources.clear()
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('mousedown', md)
    window.addEventListener('mouseup', mu)
    window.addEventListener('mousemove', mm)
    window.addEventListener('contextmenu', cm)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('mousedown', md)
      window.removeEventListener('mouseup', mu)
      window.removeEventListener('mousemove', mm)
      window.removeEventListener('contextmenu', cm)
      window.removeEventListener('blur', blur)
    }
  }

  pollGamepad(dt: number) {
    const pads = navigator.getGamepads?.() ?? []
    const now = new Set<Action>()
    this.padMove = { x: 0, y: 0 }
    for (const gp of pads) {
      if (!gp) continue
      for (const [i, a] of PAD) if (gp.buttons[i]?.pressed) now.add(a)
      this.padMove = { x: gp.axes[0] ?? 0, y: gp.axes[1] ?? 0 }
      const rx = gp.axes[2] ?? 0
      const ry = gp.axes[3] ?? 0
      if (Math.abs(rx) > 0.15) this.addLook(rx * 2.6 * dt, 0)
      if (Math.abs(ry) > 0.15) this.addLook(0, ry * 1.8 * dt)
    }
    for (const a of now) if (!this.padPrev.has(a)) this.set('pad', a, true)
    for (const a of this.padPrev) if (!now.has(a)) this.set('pad', a, false)
    this.padPrev = now
  }
}
