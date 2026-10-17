import type { ReactNode } from 'react'
import type { Action, InputState } from '../game/input'

function Btn({ input, action, className, children, label }: { input: InputState; action: Action; className: string; children: ReactNode; label: string }) {
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
      className={`touch-btn pointer-events-auto grid select-none place-items-center ${className}`}
    >
      {children}
    </button>
  )
}

export function TouchControls({ input, canRest }: { input: InputState; canRest: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="absolute bottom-4 left-4 flex items-end gap-3" style={{ left: 'max(1rem, env(safe-area-inset-left))' }}>
        <Btn input={input} action="left" label="Left" className="h-20 w-20 text-3xl">
          ◀
        </Btn>
        <div className="flex flex-col gap-2">
          <Btn input={input} action="down" label="Down" className="h-12 w-16 text-xl">
            ▼
          </Btn>
        </div>
        <Btn input={input} action="right" label="Right" className="h-20 w-20 text-3xl">
          ▶
        </Btn>
      </div>

      <div className="absolute bottom-4 right-4 grid grid-cols-3 grid-rows-2 items-center gap-2" style={{ right: 'max(1rem, env(safe-area-inset-right))' }}>
        <Btn input={input} action="heal" label="Drink honey" className="h-12 w-12 text-xs">
          Heal
        </Btn>
        <Btn input={input} action="heavy" label="Heavy attack" className="h-16 w-16 text-sm">
          Heavy
        </Btn>
        <Btn input={input} action="jump" label="Jump" className="h-16 w-16 text-sm">
          Jump
        </Btn>
        <Btn input={input} action="roll" label="Roll" className="h-16 w-16 text-sm">
          Roll
        </Btn>
        <Btn input={input} action="light" label="Light attack" className="col-span-2 h-20 w-full text-base">
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
