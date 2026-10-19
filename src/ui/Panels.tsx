import { useMemo } from 'react'
import type { CreatureView, SpeciesView } from '../game'
import { portraitSvg } from '../render/creatureArt'
import type { Genome } from '../sim/genome'

const portraits = new Map<string, string>()

/** The species' current look as a little picture. */
export function Portrait({ look, size = 40 }: { look: Genome; size?: number }) {
  const key = JSON.stringify(look)
  const src = useMemo(() => {
    let s = portraits.get(key)
    if (!s) {
      s = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(portraitSvg(look))
      portraits.set(key, s)
    }
    return s
  }, [key, look])
  return <img src={src} alt="" style={{ width: size, height: size }} className="shrink-0 object-contain" />
}

export function Sparkline({ data, hue, w = 64, h = 18 }: { data: number[]; hue: number; w?: number; h?: number }) {
  const pts = data.slice(-60)
  const max = Math.max(1, ...pts)
  const d = pts.map((v, i) => `${((i / Math.max(1, pts.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={d} fill="none" stroke={`hsl(${hue} 55% 62%)`} strokeWidth="1.5" />
    </svg>
  )
}

const DietTag = ({ diet }: { diet: number }) => (
  <span className={`rounded px-1 text-[10px] uppercase tracking-wide ${diet > 0.45 ? 'bg-[#6b2a2a] text-[#f2c9c0]' : diet > 0.25 ? 'bg-[#5a4a24] text-[#efe0b0]' : 'bg-[#2c4a2a] text-[#c8e6b8]'}`}>
    {diet > 0.45 ? 'Hunter' : diet > 0.25 ? 'Omnivore' : 'Grazer'}
  </span>
)

export function SpeciesList({ species, selected, onSelect, onFind }: { species: SpeciesView[]; selected: number | null; onSelect: (id: number) => void; onFind: (id: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      {species.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          onDoubleClick={() => onFind(s.id)}
          className={`flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors ${selected === s.id ? 'bg-[#e3c580]/20 ring-1 ring-[#e3c580]/60' : 'hover:bg-white/5'}`}
        >
          <Portrait look={s.look} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] italic text-[#ece6d6]">{s.name}</div>
            <div className="flex items-center gap-2 text-[11px] text-[#9aa29a]">
              <DietTag diet={s.diet} />
              <span>{s.population}</span>
            </div>
          </div>
          <Sparkline data={s.history} hue={s.hue} />
        </button>
      ))}
    </div>
  )
}

const GENES: [keyof Genome, string, (v: number) => string][] = [
  ['size', 'Size', (v) => v.toFixed(2)],
  ['speed', 'Speed', (v) => v.toFixed(2)],
  ['diet', 'Diet', (v) => (v > 0.45 ? 'meat' : v > 0.25 ? 'both' : 'plants') + ` (${v.toFixed(2)})`],
  ['sense', 'Senses', (v) => v.toFixed(1)],
  ['segments', 'Segments', (v) => String(v)],
  ['legs', 'Legs', (v) => String(v * 2)],
  ['eyes', 'Eyes', (v) => String(v)],
  ['fertility', 'Fertility', (v) => v.toFixed(2)],
  ['lifespan', 'Lifespan', (v) => `${Math.round(v)}s`],
]

export function Inspector({ c, follow, onFollow, onClose }: { c: CreatureView; follow: boolean; onFollow: () => void; onClose: () => void }) {
  return (
    <div className="panel w-72 max-w-[calc(100vw-1.5rem)] p-3">
      <div className="flex items-start gap-3">
        <Portrait look={c.genome} size={56} />
        <div className="min-w-0 flex-1">
          <div className="truncate italic text-[#ece6d6]">{c.species.name}</div>
          <div className="text-[11px] text-[#9aa29a]">
            Generation {c.generation} · {Math.floor(c.age)}s old · {c.state}
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-black/40">
            <div className="h-full bg-[#9ccc65]" style={{ width: `${Math.max(0, (c.energy / c.maxEnergy) * 100)}%` }} />
          </div>
        </div>
        <button onClick={onClose} className="text-[#9aa29a] hover:text-white" aria-label="Close">
          ✕
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-[12px]">
        {GENES.map(([k, label, fmt]) => (
          <div key={k} className="contents">
            <dt className="text-[#9aa29a]">{label}</dt>
            <dd className="text-[#ece6d6]">{fmt(c.genome[k])}</dd>
          </div>
        ))}
        <dt className="text-[#9aa29a]">Offspring</dt>
        <dd className="text-[#ece6d6]">{c.children}</dd>
        {c.kills > 0 && (
          <>
            <dt className="text-[#9aa29a]">Kills</dt>
            <dd className="text-[#ece6d6]">{c.kills}</dd>
          </>
        )}
      </dl>
      {c.lineage.length > 0 && (
        <div className="mt-2 text-[11px] text-[#9aa29a]">
          Descended from <span className="italic text-[#c9c2b0]">{c.lineage.join(' ← ')}</span>
        </div>
      )}
      <button onClick={onFollow} className={`btn mt-2 w-full ${follow ? 'btn-on' : ''}`}>
        {follow ? 'Following' : 'Follow'}
      </button>
    </div>
  )
}

/** Stacked population over time for the biggest species. */
export function PopulationGraph({ species }: { species: SpeciesView[] }) {
  const W = 300
  const H = 110
  const top = species.slice(0, 8)
  const len = Math.max(2, ...top.map((s) => s.history.length))
  const totals = Array.from({ length: len }, (_, i) => top.reduce((sum, s) => sum + (s.history[s.history.length - len + i] ?? 0), 0))
  const max = Math.max(1, ...totals)
  let below = new Array(len).fill(0)
  const layers = top.map((s) => {
    const vals = Array.from({ length: len }, (_, i) => s.history[s.history.length - len + i] ?? 0)
    const upper = vals.map((v, i) => below[i] + v)
    const x = (i: number) => ((i / (len - 1)) * W).toFixed(1)
    const y = (v: number) => (H - (v / max) * H).toFixed(1)
    const d = `M${upper.map((v, i) => `${x(i)},${y(v)}`).join(' L')} L${below.map((_, i) => `${x(len - 1 - i)},${y(below[len - 1 - i])}`).join(' L')}Z`
    below = upper
    return <path key={s.id} d={d} fill={`hsl(${s.hue} 45% 50%)`} stroke="#0e1512" strokeWidth="0.6" />
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full">
      {layers}
    </svg>
  )
}
