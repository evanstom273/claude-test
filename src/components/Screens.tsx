import { useEffect, useMemo } from 'react'
import type { Upgrade } from '../game/upgrades'
import type { GameState } from '../game/types'

function Spirit({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="-60 -70 120 120" className={className}>
      <defs>
        <radialGradient id="tGlow">
          <stop offset="0" stopColor="#fde68a" stopOpacity={0.6} />
          <stop offset="0.5" stopColor="#fb923c" stopOpacity={0.15} />
          <stop offset="1" stopColor="#f97316" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="tFlame" cx="0.5" cy="0.75" r="0.75">
          <stop offset="0" stopColor="#fff7d6" />
          <stop offset="0.35" stopColor="#fcd34d" />
          <stop offset="0.75" stopColor="#f97316" />
          <stop offset="1" stopColor="#c2410c" />
        </radialGradient>
      </defs>
      <circle r="58" fill="url(#tGlow)" className="title-pulse" />
      <g className="title-flicker">
        <path d="M0 -52 C18 -22 34 4 0 34 C-34 4 -18 -22 0 -52Z" fill="url(#tFlame)" />
        <path d="M0 -24 C10 -8 18 10 0 28 C-18 10 -10 -8 0 -24Z" fill="#fef3c7" opacity={0.85} />
        <ellipse cx="-8" cy="10" rx="3.4" ry="4.4" fill="#431407" />
        <ellipse cx="8" cy="10" rx="3.4" ry="4.4" fill="#431407" />
      </g>
    </svg>
  )
}

function Motes() {
  const motes = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 10,
        dur: 7 + Math.random() * 8,
        size: 2 + Math.random() * 4,
        key: i,
      })),
    [],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {motes.map((m) => (
        <span
          key={m.key}
          className="mote"
          style={{ left: `${m.left}%`, width: m.size, height: m.size, animationDelay: `${m.delay}s`, animationDuration: `${m.dur}s` }}
        />
      ))}
    </div>
  )
}

function useKey(codes: string[], fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (codes.includes(e.code)) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
}

export function TitleScreen({ best, onStart }: { best: number; onStart: () => void }) {
  useKey(['Enter', 'Space'], onStart)
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,#1a1408_0%,#07080f_55%,#020205_100%)] px-4 text-center">
      <Motes />
      <Spirit className="relative h-40 w-40 sm:h-52 sm:w-52" />
      <h1 className="relative mt-2 font-display text-5xl font-black tracking-[0.18em] text-amber-100 drop-shadow-[0_0_25px_rgba(251,191,36,0.45)] sm:text-7xl">
        EMBERWAKE
      </h1>
      <p className="relative mt-3 max-w-md text-amber-100/70">
        The forest has gone dark. You are the last little flame. Keep yourself burning until dawn — then do it again.
      </p>
      <button onClick={onStart} className="menu-btn relative mt-8">
        Kindle
      </button>
      <div className="relative mt-8 grid max-w-lg grid-cols-1 gap-x-8 gap-y-1 text-sm text-amber-100/55 sm:grid-cols-2 sm:text-left">
        <span>
          <b className="text-amber-100/80">Move</b> — WASD / arrows / drag
        </span>
        <span>
          <b className="text-amber-100/80">Flare</b> — Space / ✺ button
        </span>
        <span>
          <b className="text-amber-100/80">Pause</b> — P / Esc
        </span>
        <span>
          <b className="text-amber-100/80">Mute</b> — M
        </span>
      </div>
      {best > 0 && <p className="relative mt-6 font-display tracking-widest text-amber-300/70">Best: {best}</p>}
    </div>
  )
}

export function UpgradeScreen({ night, choices, onPick }: { night: number; choices: Upgrade[]; onPick: (u: Upgrade) => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code)
      if (i >= 0 && choices[i]) onPick(choices[i])
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [choices, onPick])

  return (
    <div className="fixed inset-0 z-10 flex flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-amber-900/40 via-rose-950/60 to-[#07080f]/90 px-4 py-8 backdrop-blur-[2px] fade-in">
      <p className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Night {night} survived</p>
      <h2 className="mt-2 font-display text-4xl font-bold tracking-wider text-amber-50 sm:text-5xl">Dawn breaks</h2>
      <p className="mt-2 text-amber-100/70">Choose a blessing before night returns.</p>
      <div className="mt-8 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {choices.map((u, i) => (
          <button key={u.id} onClick={() => onPick(u)} className="upgrade-card group" style={{ ['--c' as string]: u.color }}>
            <span className="absolute left-3 top-2 text-xs font-semibold text-white/30">{i + 1}</span>
            <span className="text-5xl transition-transform duration-200 group-hover:scale-110" style={{ color: u.color, textShadow: `0 0 18px ${u.color}` }}>
              {u.glyph}
            </span>
            <span className="mt-3 font-display text-lg font-bold tracking-wide text-amber-50">{u.name}</span>
            <span className="mt-1 text-sm text-amber-100/70">{u.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function PauseScreen({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  return (
    <div className="fixed inset-0 z-10 flex flex-col items-center justify-center bg-black/65 backdrop-blur-sm fade-in">
      <h2 className="font-display text-5xl font-bold tracking-widest text-amber-100">Paused</h2>
      <div className="mt-8 flex flex-col gap-3">
        <button onClick={onResume} className="menu-btn">
          Resume
        </button>
        <button onClick={onQuit} className="menu-btn menu-btn-ghost">
          Give up
        </button>
      </div>
    </div>
  )
}

export function GameOverScreen({ s, best, isNewBest, onRestart, onMenu }: { s: GameState; best: number; isNewBest: boolean; onRestart: () => void; onMenu: () => void }) {
  useKey(['Enter'], onRestart)
  const stats: [string, number][] = [
    ['Nights survived', s.night - 1],
    ['Embers gathered', s.totalEmbers],
    ['Shades burned', s.kills],
  ]
  return (
    <div className="fixed inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-b from-black/50 to-black/90 px-4 fade-in-slow">
      <p className="text-xs uppercase tracking-[0.35em] text-stone-400">Night {s.night}</p>
      <h2 className="mt-2 font-display text-4xl font-bold tracking-wider text-stone-200 sm:text-5xl">Your flame went out</h2>
      <div className="mt-8 w-full max-w-xs space-y-2">
        {stats.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-white/10 pb-1 text-stone-300">
            <span>{k}</span>
            <span className="font-semibold tabular-nums text-amber-100">{v}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 text-lg">
          <span className="font-display text-stone-200">Score</span>
          <span className="font-display font-bold tabular-nums text-amber-200">{s.score}</span>
        </div>
        <p className={`text-center text-sm ${isNewBest ? 'text-amber-300' : 'text-stone-500'}`}>{isNewBest ? '✦ New best! ✦' : `Best: ${best}`}</p>
      </div>
      <div className="mt-8 flex flex-col gap-3">
        <button onClick={onRestart} className="menu-btn">
          Rekindle
        </button>
        <button onClick={onMenu} className="menu-btn menu-btn-ghost">
          Title
        </button>
      </div>
    </div>
  )
}
