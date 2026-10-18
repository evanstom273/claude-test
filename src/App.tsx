import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { initAudio, isMuted, setMuted } from './engine/audio'
import { Game } from './engine/game'
import { CharacterSheet, DialogueBook } from './ui/Book'
import { Hud } from './ui/Hud'
import { TouchControls } from './ui/Touch'
import { Weapon } from './ui/Weapon'

const isTouch = () => window.matchMedia?.('(pointer: coarse)').matches

function Title({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.code === 'Enter' && onStart()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onStart])
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#2b2118] p-4">
      <div className="paper-grain pointer-events-none fixed inset-0" />
      <div className="cover relative w-full max-w-xl px-6 py-10 text-center sm:px-12">
        <svg viewBox="-120 -80 240 120" className="mx-auto w-60" aria-hidden>
          <path d="M-120 40 L-90 -6 L-70 10 L-40 -40 L-10 0 L20 -30 L60 6 L90 -16 L120 40Z" fill="#8a96b0" stroke="#2b2118" strokeWidth="2.5" />
          <path d="M-40 -40 L-48 -26 L-40 -30 L-32 -26Z M20 -30 L14 -20 L20 -23 L26 -20Z" fill="#f4ecd6" />
          <path d="M-120 40 Q-60 10 0 24 Q60 36 120 16 L120 40Z" fill="#7a9a5a" stroke="#2b2118" strokeWidth="2.5" />
          <g transform="translate(0 4)" stroke="#2b2118" strokeWidth="2">
            <rect x="-22" y="-8" width="44" height="28" fill="#efe2c0" />
            <path d="M-26 -8 L0 -30 L26 -8Z" fill="#c2563a" />
            <rect x="-5" y="6" width="10" height="14" fill="#6b4a2b" />
            <rect x="-17" y="0" width="8" height="8" fill="#ffd27a" />
            <rect x="9" y="0" width="8" height="8" fill="#ffd27a" />
          </g>
          <g transform="translate(70 -50)" stroke="#2b2118" strokeWidth="2">
            <circle r="13" fill="#f2c14e" />
            {Array.from({ length: 10 }, (_, i) => (
              <path key={i} d="M0 -16 L3 -23 L-3 -23Z" transform={`rotate(${i * 36})`} fill="#f2c14e" />
            ))}
          </g>
        </svg>
        <div className="mt-3 font-fell-sc text-sm tracking-[0.5em] text-[#7a1f24]">A Tale of the Quillmarch</div>
        <h1 className="mt-1 font-fell text-6xl text-[#2b2118] sm:text-7xl">Quillmarch</h1>
        <p className="mx-auto mt-4 max-w-sm font-fell text-lg italic text-[#4a3326]">A pop-up kingdom of ink and paper. A small town with a small problem. A traveller with a sword that has seen better days.</p>
        <button onClick={onStart} className="ink-btn mt-8 text-xl">
          Turn the page
        </button>
        <p className="mt-6 font-fell text-sm text-[#4a3326]/80">First playable slice · keyboard & mouse, gamepad or touch</p>
      </div>
    </div>
  )
}

function Play({ onQuit }: { onQuit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [touch] = useState(isTouch)
  const [muted, setM] = useState(isMuted())

  useEffect(() => {
    const g = new Game(canvas.current!)
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = g
    const fit = () => g.resize(window.innerWidth, window.innerHeight)
    fit()
    window.addEventListener('resize', fit)
    g.start()
    setGame(g)
    return () => {
      window.removeEventListener('resize', fit)
      g.dispose()
    }
  }, [])

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#0e0b09]">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" onClick={() => game?.lockPointer()} />
      <div className="paper-grain pointer-events-none fixed inset-0" />
      <div className="vignette pointer-events-none fixed inset-0" />
      {game && <Overlay game={game} touch={touch} muted={muted} onMute={() => (setMuted(!isMuted()), setM(isMuted()))} onQuit={onQuit} />}
    </div>
  )
}

function Overlay({ game, touch, muted, onMute, onQuit }: { game: Game; touch: boolean; muted: boolean; onMute: () => void; onQuit: () => void }) {
  const s = useSyncExternalStore(game.subscribe, game.getSnapshot)
  const playing = !s.dialogue && !s.sheet && !s.paused && !s.dead
  return (
    <>
      {!s.dead && <Weapon swing={s.swing} blocking={s.blocking} moving={s.moving} running={s.running} />}
      <Hud s={s} />
      {playing && !touch && !s.locked && (
        <div className="pointer-events-none fixed left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 fade-in">
          <div className="ledger px-4 py-2 text-center font-fell text-lg">Click to look around</div>
        </div>
      )}
      {touch && playing && <TouchControls input={game.input} />}
      <button
        onClick={() => game.setPaused(true)}
        className="fixed right-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-full bg-[#2b2118]/60 font-fell text-[#f4ecd6] ring-1 ring-[#f4ecd6]/30"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))', right: 'max(0.75rem, env(safe-area-inset-right))' }}
        aria-label="Pause"
      >
        ❚❚
      </button>
      {s.dialogue && <DialogueBook d={s.dialogue} onChoose={(id) => game.choose(id)} onClose={() => game.endDialogue()} />}
      {s.sheet && <CharacterSheet s={s} onClose={() => game.toggleSheet()} />}
      {s.dead && (
        <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center bg-[#2b0a0a]/50 fade-in-slow">
          <h2 className="font-fell-sc text-5xl tracking-[0.12em] text-[#f4ecd6] drop-shadow-[3px_3px_0_#2b2118] sm:text-7xl">You have perished</h2>
        </div>
      )}
      {s.paused && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0e0b09]/70 p-4 fade-in">
          <div className="page w-full max-w-lg p-6 sm:p-8">
            <h2 className="text-center font-fell-sc text-3xl tracking-[0.2em] text-[#7a1f24]">Paused</h2>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-fell text-[#2b2118]">
              {[
                ['Move', 'WASD · arrows'],
                ['Look', 'Mouse (click the world to capture it)'],
                ['Run', 'Shift'],
                ['Jump', 'Space'],
                ['Strike', 'Left click'],
                ['Block', 'Hold right click'],
                ['Talk / use', 'E'],
                ['Healing draught', 'Q'],
                ['Character & journal', 'C · Tab'],
                ['Gamepad', 'Sticks move/look · RT strike · LT block · A jump · B use · X draught · Y book'],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-fell-sc text-[#7a1f24]">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button onClick={() => game.setPaused(false)} className="ink-btn">
                Resume
              </button>
              <button onClick={onMute} className="ink-btn ink-btn-ghost">
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button onClick={onQuit} className="ink-btn ink-btn-ghost">
                Close the book
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function App() {
  const [playing, setPlaying] = useState(false)
  if (!playing)
    return (
      <Title
        onStart={() => {
          initAudio()
          setPlaying(true)
        }}
      />
    )
  return <Play onQuit={() => setPlaying(false)} />
}
