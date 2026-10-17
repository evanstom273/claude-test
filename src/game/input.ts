export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'light' | 'heavy' | 'roll' | 'heal' | 'interact' | 'lock' | 'cast' | 'rite' | 'pause'

const KEYS: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyJ: 'light',
  KeyK: 'heavy',
  ShiftLeft: 'roll',
  ShiftRight: 'roll',
  KeyL: 'roll',
  KeyF: 'heal',
  KeyI: 'cast',
  KeyC: 'cast',
  KeyQ: 'rite',
  KeyR: 'rite',
  KeyE: 'interact',
  Tab: 'lock',
  Escape: 'pause',
  KeyP: 'pause',
}

// Standard gamepad mapping (Xbox labels): A jump, B roll, X light, Y heavy, LB heal, RB light, RT heavy.
const PAD: [number, Action][] = [
  [0, 'jump'],
  [1, 'roll'],
  [2, 'light'],
  [3, 'heavy'],
  [4, 'heal'],
  [5, 'light'],
  [7, 'heavy'],
  [9, 'pause'],
  [11, 'lock'],
  [6, 'cast'],
  [12, 'rite'],
  [14, 'left'],
  [15, 'right'],
  [13, 'interact'],
]

/**
 * Collects keyboard, mouse, gamepad and touch input into one held-set plus
 * timestamped presses, so the game can buffer inputs (press slightly early and
 * it still comes out).
 */
export class InputState {
  private sources = new Map<string, Set<Action>>()
  private pressed = new Map<Action, number>()
  private padPrev = new Set<Action>()
  private padX = 0
  private padY = 0
  /** Analog x from the touch joystick, or null when it isn't held. */
  stickX: number | null = null
  stickY = 0
  /** Top-down modes use the stick's vertical axis for movement, not for menus. */
  isoMode = false
  onPause: (() => void) | null = null

  private set(source: string, a: Action, down: boolean) {
    let s = this.sources.get(source)
    if (!s) this.sources.set(source, (s = new Set()))
    if (down) {
      if (!s.has(a)) this.press(a)
      s.add(a)
    } else s.delete(a)
  }

  press(a: Action) {
    if (a === 'pause') {
      this.onPause?.()
      return
    }
    this.pressed.set(a, performance.now())
  }

  /** Horizontal movement in [-1, 1]: touch stick or left stick if active, else keys. */
  dir() {
    const dz = (v: number, d: number) => (Math.abs(v) < d ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - d) / (1 - d)))
    if (this.stickX !== null && Math.abs(this.stickX) > 0.15) return dz(this.stickX, 0.15)
    if (Math.abs(this.padX) > 0.25) return dz(this.padX, 0.25)
    return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0)
  }

  /** Vertical movement in [-1, 1], down positive: used by the isometric mode. */
  dirY() {
    const dz = (v: number, d: number) => (Math.abs(v) < d ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - d) / (1 - d)))
    if (this.stickX !== null) return dz(this.stickY, 0.15)
    if (Math.abs(this.padY) > 0.25) return dz(this.padY, 0.25)
    return (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0)
  }

  /** Touch joystick position, each axis in [-1, 1]; pass null on release. */
  stick(x: number | null, y = 0) {
    this.stickX = x
    this.stickY = x === null ? 0 : y
    this.set('stick', 'down', !this.isoMode && x !== null && y > 0.6)
  }

  held(a: Action) {
    for (const s of this.sources.values()) if (s.has(a)) return true
    return false
  }

  /** Consume a press that happened within `windowMs`. */
  take(a: Action, windowMs = 150) {
    const t = this.pressed.get(a)
    if (t === undefined) return false
    if (performance.now() - t > windowMs) {
      this.pressed.delete(a)
      return false
    }
    this.pressed.delete(a)
    return true
  }

  peek(a: Action, windowMs = 150) {
    const t = this.pressed.get(a)
    return t !== undefined && performance.now() - t <= windowMs
  }

  clear() {
    this.sources.clear()
    this.pressed.clear()
  }

  touch(a: Action, down: boolean) {
    this.set('touch', a, down)
  }

  attach() {
    const kd = (e: KeyboardEvent) => {
      const a = KEYS[e.code]
      if (!a) return
      e.preventDefault()
      if (e.repeat) return
      this.set('kb', a, true)
    }
    const ku = (e: KeyboardEvent) => {
      const a = KEYS[e.code]
      if (a) this.set('kb', a, false)
    }
    const md = (e: MouseEvent) => {
      if ((e.target as Element)?.closest?.('button')) return
      if (e.button === 0) this.set('mouse', 'light', true)
      if (e.button === 1) this.set('mouse', 'lock', true)
      if (e.button === 2) this.set('mouse', 'heavy', true)
    }
    const mu = (e: MouseEvent) => {
      if (e.button === 0) this.set('mouse', 'light', false)
      if (e.button === 1) this.set('mouse', 'lock', false)
      if (e.button === 2) this.set('mouse', 'heavy', false)
    }
    const cm = (e: Event) => e.preventDefault()
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > 4) this.press('rite')
    }
    window.addEventListener('wheel', wheel, { passive: true })
    const blur = () => this.sources.clear()
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('mousedown', md)
    window.addEventListener('mouseup', mu)
    window.addEventListener('contextmenu', cm)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('mousedown', md)
      window.removeEventListener('mouseup', mu)
      window.removeEventListener('contextmenu', cm)
      window.removeEventListener('blur', blur)
      window.removeEventListener('wheel', wheel)
    }
  }

  pollGamepad() {
    const pads = navigator.getGamepads?.() ?? []
    const now = new Set<Action>()
    this.padX = 0
    this.padY = 0
    for (const gp of pads) {
      if (!gp) continue
      for (const [i, a] of PAD) if (gp.buttons[i]?.pressed) now.add(a)
      const ax = gp.axes[0] ?? 0
      const ay = gp.axes[1] ?? 0
      if (Math.abs(ax) > Math.abs(this.padX)) this.padX = ax
      if (Math.abs(ay) > Math.abs(this.padY)) this.padY = ay
      if (!this.isoMode && ay < -0.6) now.add('interact')
      if (!this.isoMode && ay > 0.6) now.add('down')
    }
    for (const a of now) if (!this.padPrev.has(a)) this.set('pad', a, true)
    for (const a of this.padPrev) if (!now.has(a)) this.set('pad', a, false)
    this.padPrev = now
  }
}
