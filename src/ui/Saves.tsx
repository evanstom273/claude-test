import { useState } from 'react'
import { readMeta, SLOTS, type Slot } from '../engine/core/save'

/** The list of save slots, for saving into or loading from. */
export function SaveSlots({ mode, onPick, onBack }: { mode: 'save' | 'load'; onPick: (slot: Slot) => void; onBack: () => void }) {
  const [, refresh] = useState(0)
  const slots: Slot[] = mode === 'load' ? ['auto', ...SLOTS] : SLOTS
  return (
    <div>
      <h3 className="text-center font-fell-sc text-xl text-[#7a1f24]">{mode === 'save' ? 'Save to which page?' : 'Open which page?'}</h3>
      <div className="mt-3 flex flex-col gap-1.5">
        {slots.map((slot) => {
          const m = readMeta(slot)
          const name = slot === 'auto' ? 'Autosave' : `Slot ${slot}`
          return (
            <button
              key={slot}
              disabled={mode === 'load' && !m}
              onClick={() => {
                onPick(slot)
                refresh((n) => n + 1)
              }}
              className="topic text-left font-fell text-[#2b2118] disabled:opacity-40"
            >
              <span className="mr-2 font-fell-sc text-[#7a1f24]">{name}</span>
              {m ? (
                <span>
                  {m.location} · {m.date} · Lvl {m.level}
                </span>
              ) : (
                <span className="italic text-[#2b2118]/60">empty</span>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex justify-center">
        <button onClick={onBack} className="ink-btn ink-btn-ghost">
          Back
        </button>
      </div>
    </div>
  )
}
