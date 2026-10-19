import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Game, SPEEDS } from './game'
import type { Tool } from './sim/sim'
import { TOOL_INFO, ToolIcon } from './ui/icons'
import { Inspector, PopulationGraph, SpeciesList } from './ui/Panels'

const TOOLS: Tool[] = ['inspect', 'raise', 'lower', 'plants', 'rain', 'spawn', 'meteor']

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const g = new Game(canvas.current!)
    let alive = true
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = g
    g.load((k) => alive && setProgress(k)).then(() => {
      if (!alive) return
      g.start()
      setGame(g)
    })
    return () => {
      alive = false
      g.dispose()
    }
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1d3f58] select-none">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" />
      {!game && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0e1512]">
          <div className="w-64 text-center">
            <div className="text-2xl tracking-[0.25em] text-[#e3c580]">PRIMORDIA</div>
            <div className="mt-1 text-xs text-[#9aa29a]">working title · shaping a world</div>
            <div className="mt-4 h-1 bg-white/10">
              <div className="h-full bg-[#e3c580]" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>
      )}
      {game && <Hud game={game} />}
    </div>
  )
}

function Hud({ game }: { game: Game }) {
  const s = useSyncExternalStore(game.subscribe, game.getSnapshot)
  const [panel, setPanel] = useState(() => window.innerWidth > 720)
  const [graph, setGraph] = useState(false)
  const day = Math.floor(s.time / 10) + 1
  const events = s.events.slice(-3)
  return (
    <>
      {/* top left: title and the state of the world */}
      <div className="pointer-events-none absolute left-3 top-3 text-[#ece6d6]" style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="text-sm tracking-[0.2em] text-[#e3c580] drop-shadow">PRIMORDIA</div>
        <div className="text-xs text-[#d8d2c2] drop-shadow">
          Day {day} · {s.population} creatures · {s.species.length} species
          {s.extinctCount > 0 && ` · ${s.extinctCount} extinct`}
        </div>
      </div>

      {/* news from the world */}
      <div className="pointer-events-none absolute left-1/2 top-12 flex w-[min(92vw,30rem)] -translate-x-1/2 flex-col items-center gap-1 sm:top-3">
        {events.map((e) => (
          <div key={e.id} className={`event ${e.kind}`} style={{ opacity: Math.max(0, 1 - (s.time - e.time) / 40) }}>
            {e.text}
          </div>
        ))}
      </div>

      {/* species panel */}
      <div className="absolute right-3 top-3 flex max-h-[calc(100%-7.5rem)] flex-col items-end gap-2" style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex gap-2">
          <button className={`btn ${graph ? 'btn-on' : ''}`} onClick={() => setGraph(!graph)}>
            Graph
          </button>
          <button className={`btn ${panel ? 'btn-on' : ''}`} onClick={() => setPanel(!panel)}>
            Species
          </button>
        </div>
        {graph && (
          <div className="panel w-[min(20rem,calc(100vw-1.5rem))] p-2">
            <PopulationGraph species={s.species} />
          </div>
        )}
        {panel && (
          <div className="panel w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto p-2">
            <div className="mb-1 px-1 text-[11px] text-[#9aa29a]">Tap to select · double-tap to find</div>
            <SpeciesList species={s.species} selected={s.selectedSpecies} onSelect={(id) => game.selectSpecies(id)} onFind={(id) => game.findSpecies(id)} />
          </div>
        )}
      </div>

      {/* the selected creature */}
      {s.selected && (
        <div className="absolute bottom-24 left-3 sm:bottom-20">
          <Inspector c={s.selected} follow={s.follow} onFollow={() => game.toggleFollow()} onClose={() => game.deselect()} />
        </div>
      )}

      {/* tools and time */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 p-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="pointer-events-none text-[11px] text-[#ece6d6] drop-shadow">{TOOL_INFO[s.tool].hint}</div>
        <div className="panel flex flex-wrap items-center justify-center gap-1 p-1">
          {TOOLS.map((t) => (
            <button key={t} onClick={() => game.setTool(t)} className={`tool ${s.tool === t ? 'tool-on' : ''}`} title={TOOL_INFO[t].hint}>
              <ToolIcon tool={t} />
              <span>{TOOL_INFO[t].label}</span>
            </button>
          ))}
          <div className="mx-1 h-8 w-px bg-white/15" />
          {SPEEDS.map((v) => (
            <button key={v} onClick={() => game.setSpeed(v)} className={`tool w-10 ${s.speed === v ? 'tool-on' : ''}`}>
              <span className="text-sm">{v === 0 ? '❚❚' : `${v}×`}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
