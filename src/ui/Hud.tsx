import { RITES } from '../game/rites'
import type { Enemy, Player } from '../game/types'

function Bar({ value, max, width, color, back, height = 12 }: { value: number; max: number; width: number; color: string; back: string; height?: number }) {
  const k = Math.max(0, Math.min(1, value / max))
  return (
    <svg width={width + 8} height={height + 8} viewBox={`-4 -4 ${width + 8} ${height + 8}`} className="block overflow-visible">
      <path d={`M-2 1 L${width + 1} -1 L${width + 2} ${height + 1} L-1 ${height + 2}Z`} fill="#0b0507" opacity={0.75} transform="translate(2 2)" />
      <path d={`M-2 1 L${width + 1} -1 L${width + 2} ${height + 1} L-1 ${height + 2}Z`} fill={back} />
      <rect x={0} y={1} width={width * k} height={height - 1} fill={color} />
      <rect x={0} y={1} width={width * k} height={(height - 1) * 0.35} fill="#fff" opacity={0.15} />
    </svg>
  )
}

function Jar({ full }: { full: boolean }) {
  return (
    <svg width={18} height={22} viewBox="-9 -12 18 22">
      <path d="M-6 -6 L6 -6 L7 8 L-7 8Z" fill="#0b0507" transform="translate(1.5 1.5)" />
      <path d="M-6 -6 L6 -6 L7 8 L-7 8Z" fill={full ? '#e8a33a' : '#3a2a22'} />
      <rect x={-6.5} y={-10} width={13} height={4} fill={full ? '#e9dcc0' : '#4a3b32'} />
      {full && <circle cx={-2.5} cy={0} r={1.8} fill="#ffe08a" />}
    </svg>
  )
}

function RiteCard({ rite, tallow }: { rite: number; tallow: number }) {
  const r = RITES[rite]
  const ok = tallow >= r.cost
  return (
    <div className="rite-card flex items-center gap-2 px-2 py-1" key={r.id}>
      <svg width={18} height={18} viewBox="-9 -9 18 18">
        <circle r={8} fill={r.color} opacity={ok ? 0.35 : 0.12} />
        <circle r={4} fill={ok ? r.color : '#5a5048'} />
      </svg>
      <div className="leading-none">
        <div className={`font-fell text-[15px] ${ok ? 'text-[#2a1418]' : 'text-[#2a1418]/45'}`}>{r.name}</div>
        <div className="mt-0.5 flex gap-1">
          {RITES.map((x, i) => (
            <span key={x.id} className="h-1 w-3" style={{ background: i === rite ? '#7a1f24' : '#2a141833' }} />
          ))}
          <span className="ml-1 font-fell text-[11px] text-[#2a1418]/60">{r.cost}</span>
        </div>
      </div>
    </div>
  )
}

export function Hud({ p, e }: { p: Player; e: Enemy }) {
  const showBoss = e.state !== 'dormant' && !(e.state === 'dead' && e.t > 3)
  return (
    <>
      <div className="pointer-events-none fixed left-0 top-0 p-3 sm:p-5" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingLeft: 'max(0.75rem, env(safe-area-inset-left))' }}>
        <div className="space-y-1.5">
          <Bar value={p.hp} max={p.maxHp} width={p.maxHp * 2.4} color="#9b2c2c" back="#2a1418" height={13} />
          <Bar value={Math.max(0, p.stamina)} max={p.maxStamina} width={p.maxStamina * 1.9} color="#c9a24a" back="#2a2014" height={8} />
          <Bar value={p.tallow} max={p.maxTallow} width={p.maxTallow * 1.7} color="#7fb8a4" back="#142420" height={8} />
          <div className="flex items-end gap-3 pt-1">
            <div className="flex gap-1">
              {Array.from({ length: p.maxFlasks }, (_, i) => (
                <Jar key={i} full={i < p.flasks} />
              ))}
            </div>
            <RiteCard rite={p.rite} tallow={p.tallow} />
          </div>
        </div>
      </div>

      {showBoss && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 w-[min(640px,70vw)] -translate-x-1/2 fade-in sm:bottom-10">
          <div className="mb-1 font-fell text-lg tracking-wide text-[#e9dcc0] drop-shadow-[2px_2px_0_#0b0507] sm:text-xl">The Tattered Man</div>
          <div className="relative h-3 w-full">
            <div className="absolute inset-0 translate-x-[3px] translate-y-[3px] bg-[#0b0507]/80" />
            <div className="absolute inset-0 bg-[#2a1418]" />
            <div className="absolute inset-y-0 left-0 bg-[#7a1f24] transition-[width] duration-300" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 bg-[#c0392b]" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} />
          </div>
        </div>
      )}
    </>
  )
}
