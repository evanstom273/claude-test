import { useRef, useState, type ReactNode } from 'react'
import type { Action, InputState } from '../game/input'

function Btn({ input, action, className, children, label, active }: { input: InputState; action: Action; className: string; children: ReactNode; label: string; active?: boolean }) {
  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    input.touch(action, true)
  }
  const up = (e: React.PointerEvent) => {
    e.preventDefault()
    input.touch(action, false)
  }
  return (
    <button
      aria-label={label}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
      className={`touch-btn pointer-events-auto grid select-none place-items-center ${active ? 'touch-btn-on' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

const RADIUS = 56

/**
 * Floating analog stick: put a thumb down anywhere in the left zone and the
 * stick appears under it.
 */
function Joystick({ input }: { input: InputState }) {
  const origin = useRef<{ id: number; x: number; y: number } | null>(null)
  const [view, setView] = useState<{ ox: number; oy: number; dx: number; dy: number } | null>(null)

  const update = (cx: number, cy: number) => {
    const o = origin.current!
    let dx = cx - o.x
    let dy = cy - o.y
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS
      dy = (dy / len) * RADIUS
    }
    input.stick(dx / RADIUS, dy / RADIUS)
    setView({ ox: o.x, oy: o.y, dx, dy })
  }

  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 h-[70%] w-[45%] touch-none"
      onPointerDown={(e) => {
        if (origin.current) return
        e.preventDefault()
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
        origin.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        update(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (origin.current?.id === e.pointerId) update(e.clientX, e.clientY)
      }}
      onPointerUp={(e) => {
        if (origin.current?.id !== e.pointerId) return
        origin.current = null
        input.stick(null)
        setView(null)
      }}
      onPointerCancel={() => {
        origin.current = null
        input.stick(null)
        setView(null)
      }}
    >
      {view ? (
        <div className="pointer-events-none fixed" style={{ left: view.ox - RADIUS - 14, top: view.oy - RADIUS - 14 }}>
          <div className="stick-base" style={{ width: (RADIUS + 14) * 2, height: (RADIUS + 14) * 2 }} />
          <div className="stick-knob absolute" style={{ left: RADIUS + 14 - 26 + view.dx, top: RADIUS + 14 - 26 + view.dy }} />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-8 left-10 opacity-50" style={{ left: 'max(2.5rem, env(safe-area-inset-left))' }}>
          <div className="stick-base" style={{ width: 120, height: 120 }} />
          <div className="stick-knob absolute left-[34px] top-[34px]" />
        </div>
      )}
    </div>
  )
}

export function TouchControls({ input, canRest, locked, iso = false }: { input: InputState; canRest: boolean; locked: boolean; iso?: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <Joystick input={input} />

      <div className="absolute bottom-4 right-4 grid grid-cols-3 items-center gap-2" style={{ right: 'max(1rem, env(safe-area-inset-right))' }}>
        <Btn input={input} action="heal" label="Drink honey" className="h-12 w-12 text-xs">
          Heal
        </Btn>
        <Btn input={input} action="lock" label="Lock on" className="h-12 w-full text-xs" active={locked}>
          Lock
        </Btn>
        <Btn input={input} action="rite" label="Change rite" className="h-12 w-full text-xs">
          Rite
        </Btn>
        <Btn input={input} action="roll" label="Roll" className="h-16 w-16 text-sm">
          Roll
        </Btn>
        <Btn input={input} action="heavy" label="Heavy attack" className="h-16 w-16 text-sm">
          Heavy
        </Btn>
        {iso ? (
          <div />
        ) : (
          <Btn input={input} action="jump" label="Jump" className="h-16 w-16 text-sm">
            Jump
          </Btn>
        )}
        <Btn input={input} action="cast" label="Cast rite" className="h-16 w-full text-sm">
          Cast
        </Btn>
        <Btn input={input} action="light" label="Light attack" className="col-span-2 h-16 w-full text-base">
          Strike
        </Btn>
      </div>

      {canRest && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2">
          <Btn input={input} action="interact" label="Rest" className="h-12 w-28 text-base">
            Rest
          </Btn>
        </div>
      )}
    </div>
  )
}
