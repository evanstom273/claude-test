import { flareCooldownTotal, flareReady } from '../game/engine'
import type { GameState } from '../game/types'

interface Props {
  s: GameState
  muted: boolean
  onFlare: () => void
  onTogglePause: () => void
  onToggleMute: () => void
}

export function Hud({ s, muted, onFlare, onTogglePause, onToggleMute }: Props) {
  const p = s.player
  const fuelPct = Math.max(0, p.fuel / p.maxFuel)
  const low = p.fuel < 25 && s.phase === 'night'
  const quotaPct = Math.min(1, s.collected / s.quota)
  const cdTotal = flareCooldownTotal(s)
  const cdPct = p.flareCd > 0 ? 1 - p.flareCd / cdTotal : 1
  const ready = flareReady(s)
  const showHint = s.night === 1 && s.nightTime < 9 && s.phase === 'night'

  return (
    <>
      {low && <div className="low-fuel pointer-events-none fixed inset-0" />}

      <div className="pointer-events-none fixed left-0 right-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-5">
        <div className="w-[min(320px,58vw)] space-y-2">
          <div className="flex items-center gap-2">
            <svg viewBox="-12 -14 24 28" className="h-6 w-5 shrink-0">
              <path d="M0 -12 C5 -5 9 1 0 12 C-9 1 -5 -5 0 -12Z" fill={low ? '#f87171' : '#fbbf24'} />
            </svg>
            <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-black/60 ring-1 ring-amber-200/20">
              <div
                className={`h-full rounded-full transition-[width] duration-150 ${low ? 'bg-gradient-to-r from-red-600 to-orange-500' : 'bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-200'}`}
                style={{ width: `${fuelPct * 100}%` }}
              />
            </div>
            <span className="w-14 text-right font-semibold tabular-nums text-amber-100/90 text-sm">
              {Math.ceil(p.fuel)}/{p.maxFuel}
            </span>
          </div>
          <div className="rounded-xl bg-black/45 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-lg font-bold tracking-wider text-amber-100">Night {s.night}</span>
              <span className="text-xs font-semibold tabular-nums text-amber-200/80">
                {s.collected} / {s.quota} embers
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-amber-300 transition-[width] duration-200" style={{ width: `${quotaPct * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <button onClick={onToggleMute} className="hud-btn" aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? '🔇' : '🔊'}
            </button>
            <button onClick={onTogglePause} className="hud-btn" aria-label="Pause">
              ❚❚
            </button>
          </div>
          <div className="rounded-xl bg-black/45 px-3 py-1.5 text-right ring-1 ring-white/10 backdrop-blur-sm">
            <div className="font-display text-xl font-bold tabular-nums text-amber-100">{s.score}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-200/60">score</div>
          </div>
        </div>
      </div>

      {showHint && (
        <div className="pointer-events-none fixed bottom-28 left-1/2 w-[min(92vw,560px)] -translate-x-1/2 text-center text-sm text-amber-100/80 fade-in">
          <p>Gather embers to feed your flame. Your light burns the shades.</p>
          <p className="mt-1 text-amber-100/55">
            <span className="hidden sm:inline">WASD / arrows to move · Space to flare · stand by a brazier to light it</span>
            <span className="sm:hidden">Drag to move · tap ✺ to flare · stand by a brazier to light it</span>
          </p>
        </div>
      )}

      <button
        onPointerDown={(e) => {
          e.stopPropagation()
          onFlare()
        }}
        className={`fixed bottom-5 right-5 grid h-20 w-20 place-items-center rounded-full ring-2 transition sm:bottom-8 sm:right-8 ${
          ready ? 'bg-amber-400/25 ring-amber-200/70 shadow-[0_0_30px_rgba(251,191,36,0.45)]' : 'bg-black/40 ring-white/15'
        }`}
        aria-label="Flare"
      >
        <svg viewBox="-40 -40 80 80" className="absolute inset-0 h-full w-full -rotate-90">
          <circle r="36" fill="none" stroke="#fde68a" strokeOpacity={0.8} strokeWidth="4" strokeDasharray={`${cdPct * 226} 226`} strokeLinecap="round" />
        </svg>
        <span className={`text-3xl ${ready ? 'text-amber-100' : 'text-white/35'}`}>✺</span>
        <span className="absolute -bottom-5 hidden text-[10px] uppercase tracking-[0.2em] text-amber-100/50 sm:block">space</span>
      </button>
    </>
  )
}
