/** Keyboard, gamepad and a touch joystick merged into a move vector and a sprint flag. */
export class Input {
  private keys = new Set<string>()
  /** Touch joystick, in CSS pixels. */
  stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null
  static readonly STICK_RADIUS = 60
  /** Pushing the stick past this distance sprints. */
  static readonly STICK_SPRINT = 85

  attach(el: HTMLElement) {
    const down = (e: KeyboardEvent) => {
      this.keys.add(e.code)
      if (e.code === 'Space') e.preventDefault()
    }
    const up = (e: KeyboardEvent) => this.keys.delete(e.code)
    const blur = () => this.keys.clear()
    const ts = (e: TouchEvent) => {
      e.preventDefault()
      const t = e.changedTouches[0]
      if (!this.stick) this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY }
    }
    const tm = (e: TouchEvent) => {
      e.preventDefault()
      for (const t of Array.from(e.changedTouches)) if (this.stick && t.identifier === this.stick.id) Object.assign(this.stick, { x: t.clientX, y: t.clientY })
    }
    const te = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (this.stick && t.identifier === this.stick.id) this.stick = null
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    el.addEventListener('touchstart', ts, { passive: false })
    el.addEventListener('touchmove', tm, { passive: false })
    el.addEventListener('touchend', te)
    el.addEventListener('touchcancel', te)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      el.removeEventListener('touchstart', ts)
      el.removeEventListener('touchmove', tm)
      el.removeEventListener('touchend', te)
      el.removeEventListener('touchcancel', te)
    }
  }

  /** Move direction (length ≤ 1, screen axes: +y is south) and whether sprint is held. */
  read(): { x: number; y: number; sprint: boolean } {
    const k = (...codes: string[]) => codes.some((c) => this.keys.has(c))
    let x = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0)
    let y = (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0)
    let sprint = k('ShiftLeft', 'ShiftRight', 'Space')
    if (this.stick) {
      const dx = this.stick.x - this.stick.ox
      const dy = this.stick.y - this.stick.oy
      const d = Math.hypot(dx, dy)
      if (d > 8) {
        const m = Math.min(1, d / Input.STICK_RADIUS)
        x = (dx / d) * m
        y = (dy / d) * m
        sprint = d > Input.STICK_SPRINT
      }
    }
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue
      const ax = pad.axes[0] ?? 0
      const ay = pad.axes[1] ?? 0
      if (Math.hypot(ax, ay) > 0.2) {
        x = ax
        y = ay
      }
      if (pad.buttons[1]?.pressed || pad.buttons[4]?.pressed || pad.buttons[10]?.pressed) sprint = true
    }
    const l = Math.hypot(x, y)
    if (l > 1) {
      x /= l
      y /= l
    }
    return { x, y, sprint }
  }
}
