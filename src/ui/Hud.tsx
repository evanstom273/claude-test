import { useEffect, useState } from 'react'
import type { HudState } from '../engine/game'

function Bar({ value, max, color, width }: { value: number; max: number; color: string; width: number }) {
  return (
    <div className="paper-bar" style={{ width }}>
      <div className="h-full transition-[width] duration-150" style={{ width: `${Math.max(0, (value / max) * 100)}%`, background: color }} />
    </div>
  )
}

const LETTERS: [string, number][] = [
  ['N', 0],
  ['NE', 45],
  ['E', 90],
  ['SE', 135],
  ['S', 180],
  ['SW', 225],
  ['W', 270],
  ['NW', 315],
]

/** A strip compass like Daggerfall's, marked every 45 degrees. */
function Compass({ yaw }: { yaw: number }) {
  // yaw 0 looks north (-z); turning right decreases yaw
  const heading = (((-yaw * 180) / Math.PI) % 360 + 360) % 360
  const W = 260
  const span = 120
  return (
    <div className="compass relative h-7 overflow-hidden" style={{ width: W }}>
      {LETTERS.flatMap(([l, deg]) =>
        [-360, 0, 360].map((o) => {
          let d = deg + o - heading
          if (d < -span || d > span) return null
          const x = W / 2 + (d / span) * (W / 2)
          return (
            <span key={l + o} className={`absolute top-1 -translate-x-1/2 font-fell-sc ${l.length === 1 ? 'text-[15px] text-[#7a1f24]' : 'text-[11px] text-[#2b2118]/70'}`} style={{ left: x }}>
              {l}
            </span>
          )
        }),
      )}
      <div className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-[#2b2118]" />
    </div>
  )
}

export function Hud({ s }: { s: HudState }) {
  const [flash, setFlash] = useState(0)
  useEffect(() => {
    if (s.hurt === 0) return
    setFlash(1)
    const t = setTimeout(() => setFlash(0), 180)
    return () => clearTimeout(t)
  }, [s.hurt])
  return (
    <>
      <div className="pointer-events-none fixed inset-0 bg-[#9b1c1c] transition-opacity duration-300" style={{ opacity: flash ? 0.28 : 0 }} />
      {s.hp / s.maxHp < 0.3 && !s.dead && <div className="low-hp pointer-events-none fixed inset-0" />}

      <div className="pointer-events-none fixed left-1/2 top-2 -translate-x-1/2 sm:top-3" style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <Compass yaw={s.yaw} />
        <div className="mt-2 flex flex-col items-center gap-1">
          {s.notes.map((n) => (
            <div key={n.id} className={`note fade-in ${n.kind}`}>
              {n.text}
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none fixed left-3 top-3 space-y-1.5 sm:left-5 sm:top-5" style={{ top: 'max(0.75rem, env(safe-area-inset-top))', left: 'max(0.75rem, env(safe-area-inset-left))' }}>
        <Bar value={s.hp} max={s.maxHp} color="#a8322c" width={Math.min(220, s.maxHp * 3)} />
        <Bar value={s.stamina} max={s.maxStamina} color="#c9a24a" width={Math.min(200, s.maxStamina * 2.2)} />
        <div className="ledger mt-2 inline-flex gap-3 px-2 py-0.5 font-fell text-sm">
          <span>
            <b className="text-[#a8822e]">●</b> {s.gold}
          </span>
          <span>
            <b className="text-[#a8322c]">⚱</b> {s.potions}
          </span>
          <span className="text-[#2b2118]/70">Lvl {s.level}</span>
        </div>
      </div>

      <div className="pointer-events-none fixed right-3 top-3 text-right sm:right-5 sm:top-5" style={{ top: 'max(0.75rem, env(safe-area-inset-top))', right: 'max(3.5rem, env(safe-area-inset-right))' }}>
        <div className="ledger px-2 py-0.5 font-fell">
          <div className="text-lg leading-tight">{s.clock}</div>
          <div className="text-[11px] italic leading-tight text-[#2b2118]/70">{s.date}</div>
          <div className="font-fell-sc text-[11px] leading-tight text-[#7a1f24]">{s.location}</div>
        </div>
      </div>

      {!s.dialogue && !s.sheet && !s.dead && (
        <>
          <div className="pointer-events-none fixed left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f4ecd6] shadow-[0_0_0_1.5px_#2b2118]" />
          {s.prompt && (
            <div className="pointer-events-none fixed left-1/2 top-[58%] -translate-x-1/2 fade-in">
              <div className="ledger px-3 py-1 font-fell text-lg">
                <span className="key">E</span> {s.prompt}
              </div>
            </div>
          )}
        </>
      )}

      <div className="pointer-events-none fixed inset-0 bg-[#0e0b09]" style={{ opacity: s.fade }} />
    </>
  )
}
