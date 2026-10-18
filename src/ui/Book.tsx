import { useEffect } from 'react'
import { personDataUri } from '../engine/art'
import type { DialogueView, HudState } from '../engine/game'

/** Conversations happen on an open book: portrait on the left page, words on the right. */
export function DialogueBook({ d, onChoose, onClose }: { d: DialogueView; onChoose: (id: string) => void; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= d.topics.length) onChoose(d.topics[n - 1].id)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [d, onChoose])
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center p-2 sm:p-4 fade-in" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
      <div className="book grid w-full max-w-3xl grid-cols-[minmax(90px,30%)_1fr]">
        <div className="page-left flex flex-col items-center justify-end p-2 sm:p-4">
          <img src={personDataUri(d.outfit)} alt="" className="h-28 sm:h-48" />
          <div className="mt-1 text-center font-fell-sc text-base leading-tight text-[#7a1f24] sm:text-lg">{d.name}</div>
          <div className="text-center font-fell text-xs italic leading-tight text-[#2b2118]/70 sm:text-sm">{d.title}</div>
        </div>
        <div className="page-right flex max-h-[52vh] flex-col overflow-y-auto p-3 sm:p-5">
          <p key={d.text} className="font-fell text-base leading-snug text-[#2b2118] sm:text-lg fade-in">“{d.text}”</p>
          <div className="mt-3 flex flex-col gap-1">
            {d.topics.map((t, i) => (
              <button key={t.id} onClick={() => onChoose(t.id)} className="topic text-left font-fell text-[15px] sm:text-base">
                <span className="mr-2 font-fell-sc text-[#7a1f24]">{i + 1}.</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button onClick={onClose} className="sr-only">
        Close
      </button>
    </div>
  )
}

export function CharacterSheet({ s, onClose }: { s: HudState; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[#0e0b09]/60 p-3 fade-in" onClick={onClose}>
      <div className="book grid max-h-[92vh] w-full max-w-4xl grid-cols-1 overflow-y-auto sm:grid-cols-2" onClick={(e) => e.stopPropagation()}>
        <div className="page-left p-4 sm:p-6">
          <h2 className="font-fell-sc text-2xl tracking-wider text-[#7a1f24]">The Traveller</h2>
          <p className="font-fell italic text-[#2b2118]/70">Level {s.level} · of no fixed abode</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 font-fell text-[#2b2118]">
            <dt className="font-fell-sc">Health</dt>
            <dd>
              {Math.ceil(s.hp)} / {s.maxHp}
            </dd>
            <dt className="font-fell-sc">Stamina</dt>
            <dd>
              {Math.ceil(s.stamina)} / {s.maxStamina}
            </dd>
            <dt className="font-fell-sc">Gold</dt>
            <dd>{s.gold}</dd>
            <dt className="font-fell-sc">Draughts</dt>
            <dd>{s.potions}</dd>
          </dl>
          <h3 className="mt-4 font-fell-sc text-lg text-[#7a1f24]">Skills</h3>
          <p className="font-fell text-xs italic text-[#2b2118]/60">Skills improve as you use them.</p>
          <div className="mt-1 space-y-1">
            {s.skills.map((k) => (
              <div key={k.name} className="grid grid-cols-[90px_32px_1fr] items-center gap-2 font-fell text-[#2b2118]">
                <span>{k.name}</span>
                <span className="text-right">{k.value}</span>
                <div className="h-1.5 bg-[#2b2118]/15">
                  <div className="h-full bg-[#7a1f24]" style={{ width: `${(k.progress / (2 + Math.floor(k.value / 10))) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <h3 className="mt-4 font-fell-sc text-lg text-[#7a1f24]">Belongings</h3>
          <ul className="list-inside list-disc font-fell text-[#2b2118]">
            <li>A sword that has seen better days</li>
            {s.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
        <div className="page-right p-4 sm:p-6">
          <h2 className="font-fell-sc text-2xl tracking-wider text-[#7a1f24]">Journal</h2>
          <div className="mt-2 space-y-3 font-fell text-[#2b2118]">
            {s.journal.map((j, i) => (
              <p key={i} className="leading-snug">
                <span className="mr-1 text-[#7a1f24]">❦</span>
                {j}
              </p>
            ))}
          </div>
          <button onClick={onClose} className="ink-btn mt-6">
            Close the book
          </button>
        </div>
      </div>
    </div>
  )
}
