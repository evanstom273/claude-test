import { useEffect, useState } from 'react'
import { initAudio, sfx } from './game/audio'
import { IsoGame } from './iso/IsoGame'
import { Game } from './ui/Game'

function Title({ onStart, onIso }: { onStart: () => void; onIso: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        onStart()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onStart])

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[#170f1d] p-4">
      <div className="paper-grain pointer-events-none fixed inset-0" />
      <div className="cover relative flex w-full max-w-xl flex-col items-center px-6 py-10 text-center sm:px-12 sm:py-14">
        <svg viewBox="-120 -110 240 160" className="w-56 sm:w-72" aria-hidden>
          <circle r={70} cy={-30} fill="#c9632e" transform="translate(3 4)" />
          <circle r={70} cy={-30} fill="#e8873a" />
          <path d="M-120 50 Q-60 0 0 18 Q60 34 120 4 L120 50Z" fill="#2f1a24" />
          <g transform="translate(0 22)" fill="#140c0e">
            <rect x={-3} y={-100} width={6} height={110} />
            <rect x={-40} y={-80} width={80} height={6} />
            <path d="M-16 -82 L16 -82 L20 -30 L14 -14 L8 -26 L2 -12 L-4 -26 L-10 -12 L-16 -28 L-20 -30Z" />
            <path d="M-12 -86 Q-14 -110 0 -112 Q14 -110 12 -86Z" />
            <path d="M-22 -104 Q0 -112 24 -106 Q0 -100 -22 -104Z" />
            <path d="M-14 -120 Q-10 -134 0 -140 Q2 -128 10 -132 Q8 -120 12 -106Z" />
            <path d="M-40 -78 L-46 -50 M40 -78 L46 -50" stroke="#140c0e" strokeWidth={4} />
            <path d="M-46 -52 Q-56 -36 -40 -30 M46 -52 Q56 -36 40 -30" stroke="#140c0e" strokeWidth={3} fill="none" />
          </g>
          <circle cx={-4} cy={-74} r={2} fill="#ff6a1a" className="ember-pulse" />
          <circle cx={5} cy={-74} r={2} fill="#ff6a1a" className="ember-pulse" />
        </svg>
        <div className="mt-2 font-fell-sc text-sm tracking-[0.5em] text-[#7a1f24]">A Tale of the Long Harvest</div>
        <h1 className="mt-1 font-fell text-6xl text-[#2a1418] sm:text-7xl">Hollow Orchard</h1>
        <p className="mt-4 max-w-sm font-fell text-lg italic text-[#4a3326]">
          The harvest never ended. The scarecrows remember being people. And someone has to bring in the last of the corn.
        </p>
        <button onClick={onStart} className="ink-btn mt-8 text-xl">
          Open the book
        </button>
        <button onClick={onIso} className="ink-btn ink-btn-ghost mt-3 text-base">
          Or look down on the farmstead
        </button>
        <p className="mt-1 font-fell text-xs italic text-[#4a3326]/70">an isometric experiment</p>
        <p className="mt-6 font-fell text-sm text-[#4a3326]/80">
          Feel prototype · keyboard, mouse, gamepad or touch
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState<'title' | 'side' | 'iso'>('title')
  const start = (m: 'side' | 'iso') => {
    initAudio()
    sfx.click()
    setMode(m)
  }
  if (mode === 'side') return <Game onQuit={() => setMode('title')} />
  if (mode === 'iso') return <IsoGame onQuit={() => setMode('title')} />
  return <Title onStart={() => start('side')} onIso={() => start('iso')} />
}
