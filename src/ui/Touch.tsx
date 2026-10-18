import { useRef, useState, type ReactNode } from 'react'
import type { Action, Input } from '../engine/core/input'

function Btn({ input, action, children, className = '' }: { input: Input; action: Action; children: ReactNode; className?: string }) {
  return (
    <button
      className={`touch-btn pointer-events-auto grid select-none place-items-center ${className}`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
        input.touch(action, true)
      }}
      onPointerUp={(e) => {
        e.preventDefault()
        input.touch(action, false)
      }}
      onPointerCancel={() => input.touch(action, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

const R = 56

/** Left half: a floating move stick. Right half: drag to look. */
export function TouchControls({ input }: { input: Input }) {
  const stick = useRef<{ id: number; x: number; y: number } | null>(null)
  const look = useRef<{ id: number; x: number; y: number } | null>(null)
  const [view, setView] = useState<{ ox: number; oy: number; dx: number; dy: number } | null>(null)

  return (
    <div className="fixed inset-0 z-10 select-none" style={{ touchAction: 'none' }}>
      <div
        className="absolute bottom-0 left-0 top-0 w-1/2"
        onPointerDown={(e) => {
          if (stick.current) return
          ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
          stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
          setView({ ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 })
        }}
        onPointerMove={(e) => {
          const s = stick.current
          if (!s || s.id !== e.pointerId) return
          let dx = e.clientX - s.x
          let dy = e.clientY - s.y
          const l = Math.hypot(dx, dy)
          if (l > R) {
            dx = (dx / l) * R
            dy = (dy / l) * R
          }
          input.setTouchMove({ x: dx / R, y: -dy / R })
          setView({ ox: s.x, oy: s.y, dx, dy })
        }}
        onPointerUp={(e) => {
          if (stick.current?.id !== e.pointerId) return
          stick.current = null
          input.setTouchMove(null)
          setView(null)
        }}
        onPointerCancel={() => {
          stick.current = null
          input.setTouchMove(null)
          setView(null)
        }}
      />
      <div
        className="absolute bottom-0 right-0 top-0 w-1/2"
        onPointerDown={(e) => {
          if (look.current) return
          ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
          look.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        }}
        onPointerMove={(e) => {
          const l = look.current
          if (!l || l.id !== e.pointerId) return
          input.addLook((e.clientX - l.x) * 0.006, (e.clientY - l.y) * 0.005)
          l.x = e.clientX
          l.y = e.clientY
        }}
        onPointerUp={(e) => {
          if (look.current?.id === e.pointerId) look.current = null
        }}
        onPointerCancel={() => (look.current = null)}
      />
      {view ? (
        <div className="pointer-events-none fixed" style={{ left: view.ox - R - 12, top: view.oy - R - 12 }}>
          <div className="stick-base" style={{ width: (R + 12) * 2, height: (R + 12) * 2 }} />
          <div className="stick-knob absolute" style={{ left: R + 12 - 24 + view.dx, top: R + 12 - 24 + view.dy }} />
        </div>
      ) : (
        <div className="pointer-events-none fixed bottom-8 left-10 opacity-50">
          <div className="stick-base" style={{ width: 116, height: 116 }} />
          <div className="stick-knob absolute left-[34px] top-[34px]" />
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 right-4 grid grid-cols-3 items-end gap-2" style={{ right: 'max(1rem, env(safe-area-inset-right))', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <Btn input={input} action="potion" className="h-12 w-12 text-xs">
          Draught
        </Btn>
        <Btn input={input} action="use" className="h-14 w-14 text-sm">
          Use
        </Btn>
        <Btn input={input} action="sheet" className="h-12 w-12 text-xs">
          Book
        </Btn>
        <Btn input={input} action="block" className="h-16 w-16 text-sm">
          Block
        </Btn>
        <Btn input={input} action="attack" className="h-20 w-20 text-base">
          Strike
        </Btn>
        <Btn input={input} action="jump" className="h-14 w-14 text-sm">
          Jump
        </Btn>
      </div>
    </div>
  )
}
