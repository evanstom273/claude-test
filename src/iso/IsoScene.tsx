import { memo, useMemo, type ReactElement } from 'react'
import { createEnemy } from '../game/enemy'
import type { Enemy } from '../game/types'
import { blob, deadTree, rng } from '../render/paper'
import { enemyPose, playerPose } from '../render/pose'
import { PlayerPuppet, ScarecrowPuppet } from '../render/Puppets'
import { MAP_H, MAP_W, TH, toScreen, TW, type IsoMap, type Prop } from './map'
import type { IsoHazard, IsoProjectile, IsoWorld } from './sim'

const PUPPET_SCALE = 0.6
const f1 = (n: number) => n.toFixed(1)

/** Ground-plane point to an SVG "x y" pair. */
const pt = (gx: number, gy: number, z = 0) => {
  const s = toScreen(gx, gy)
  return `${f1(s.x)} ${f1(s.y - z)}`
}

/** An isometric box over one tile (or part of one), drawn as three paper faces. */
function IsoBox({ x0, y0, x1, y1, h, top, left, right, children }: { x0: number; y0: number; x1: number; y1: number; h: number; top: string; left: string; right: string; children?: ReactElement | ReactElement[] }) {
  return (
    <g>
      <path d={`M${pt(x0, y1)} L${pt(x1, y1)} L${pt(x1, y1, h)} L${pt(x0, y1, h)}Z`} fill={left} />
      <path d={`M${pt(x1, y1)} L${pt(x1, y0)} L${pt(x1, y0, h)} L${pt(x1, y1, h)}Z`} fill={right} />
      <path d={`M${pt(x0, y0, h)} L${pt(x1, y0, h)} L${pt(x1, y1, h)} L${pt(x0, y1, h)}Z`} fill={top} />
      {children}
    </g>
  )
}

// ---------------------------------------------------------------- ground

const GROUND_COLORS = {
  grass: ['#2c3420', '#30381f', '#2a3122', '#333a22'],
  path: ['#4a3626', '#4f3a28', '#463224'],
  furrow: ['#3b2a1c'],
  floor: ['#5a4330', '#55402e'],
  water: ['#141c26'],
}

const GroundLayer = memo(function GroundLayer({ map }: { map: IsoMap }) {
  const r = rng(77)
  const tiles: ReactElement[] = []
  const tufts: string[] = []
  const lines: string[] = []
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const g = map.ground[y][x]
      const cols = GROUND_COLORS[g]
      const fill = cols[Math.floor(r() * cols.length)]
      tiles.push(<path key={`${x},${y}`} d={`M${pt(x, y)} L${pt(x + 1, y)} L${pt(x + 1, y + 1)} L${pt(x, y + 1)}Z`} fill={fill} stroke={fill} strokeWidth={0.6} />)
      if (g === 'grass')
        for (let i = 0; i < 3; i++) {
          if (r() < 0.5) continue
          const s = toScreen(x + r(), y + r())
          tufts.push(`M${f1(s.x - 2)} ${f1(s.y)}L${f1(s.x + (r() - 0.5) * 4)} ${f1(s.y - 5 - r() * 6)}L${f1(s.x + 2)} ${f1(s.y)}Z`)
        }
      if (g === 'furrow') for (let i = 1; i < 4; i++) lines.push(`M${pt(x + i / 4, y)} L${pt(x + i / 4, y + 1)}`)
      if (g === 'floor') for (let i = 1; i < 3; i++) lines.push(`M${pt(x, y + i / 3)} L${pt(x + 1, y + i / 3)}`)
    }
  return (
    <g>
      {tiles}
      <path d={tufts.join('')} fill="#43502c" />
      <path d={lines.join('')} stroke="#2a1d14" strokeWidth={1.4} opacity={0.6} />
      {/* the blood moon in the pond */}
      <ellipse cx={toScreen(5, 19).x} cy={toScreen(5, 19).y} rx={34} ry={14} fill="#c9632e" opacity={0.45} />
      <ellipse cx={toScreen(5, 19).x + 6} cy={toScreen(5, 19).y - 2} rx={18} ry={7} fill="#e8873a" opacity={0.4} />
    </g>
  )
})

// ----------------------------------------------------------------- props

function Tree({ p }: { p: Prop }) {
  const d = useMemo(() => deadTree(0, 0, 150 + (p.seed % 70), rng(p.seed)), [p.seed])
  const s = toScreen(p.tx + 0.5, p.ty + 0.5)
  return (
    <g transform={`translate(${f1(s.x)} ${f1(s.y)})`}>
      <ellipse rx={26} ry={11} fill="#0b0507" opacity={0.45} />
      <path d={d} fill="#0b0507" opacity={0.5} transform="translate(4 4)" />
      <path d={d} fill="#22141a" />
    </g>
  )
}

function Corn({ p }: { p: Prop }) {
  const parts = useMemo(() => {
    const r = rng(p.seed)
    const stalks: { x: number; y: number; h: number; lean: number }[] = []
    for (let i = 0; i < 4; i++) {
      const s = toScreen(p.tx + 0.2 + r() * 0.6, p.ty + 0.2 + r() * 0.6)
      stalks.push({ x: s.x, y: s.y, h: 52 + r() * 26, lean: (r() - 0.5) * 10 })
    }
    stalks.sort((a, b) => a.y - b.y)
    return stalks
  }, [p])
  return (
    <g>
      {parts.map((s, i) => (
        <g key={i}>
          <path d={`M${f1(s.x - 1.8)} ${f1(s.y)} Q${f1(s.x + s.lean * 0.3)} ${f1(s.y - s.h * 0.5)} ${f1(s.x + s.lean)} ${f1(s.y - s.h)} L${f1(s.x + s.lean + 1.5)} ${f1(s.y - s.h)} Q${f1(s.x + s.lean * 0.3 + 2)} ${f1(s.y - s.h * 0.5)} ${f1(s.x + 1.8)} ${f1(s.y)}Z`} fill={i % 2 ? '#7a5c22' : '#8a6a24'} />
          <path d={`M${f1(s.x)} ${f1(s.y - s.h * 0.45)} q-14 -2 -20 8 q10 -6 20 -4Z M${f1(s.x + s.lean * 0.5)} ${f1(s.y - s.h * 0.7)} q14 -4 18 6 q-8 -5 -18 -2Z`} fill="#6b5220" />
          <path d={`M${f1(s.x + s.lean * 0.4)} ${f1(s.y - s.h * 0.62)} q4 -10 1 -16 q-4 6 -1 16Z`} fill="#d6b25a" />
        </g>
      ))}
    </g>
  )
}

function Wall({ p, cut }: { p: Prop; cut: boolean }) {
  const h = cut ? 12 : 86
  const beams = !cut && (
    <g stroke="#3b2a1c" strokeWidth={3}>
      <path d={`M${pt(p.tx + 0.5, p.ty + 1)} L${pt(p.tx + 0.5, p.ty + 1, h)}`} />
      <path d={`M${pt(p.tx + 1, p.ty + 0.5)} L${pt(p.tx + 1, p.ty + 0.5, h)}`} />
      <path d={`M${pt(p.tx, p.ty + 1, h * 0.55)} L${pt(p.tx + 1, p.ty + 1, h * 0.55)}`} />
      <path d={`M${pt(p.tx + 1, p.ty + 1, h * 0.55)} L${pt(p.tx + 1, p.ty, h * 0.55)}`} />
      {p.seed % 3 < 1 && <path d={`M${pt(p.tx, p.ty + 1, 0)} L${pt(p.tx + 0.5, p.ty + 1, h * 0.55)}`} />}
    </g>
  )
  return (
    <IsoBox x0={p.tx} y0={p.ty} x1={p.tx + 1} y1={p.ty + 1} h={h} top="#3b2a1c" left="#d8c7a0" right="#b5a27a">
      {beams || <g />}
    </IsoBox>
  )
}

function Hay({ p }: { p: Prop }) {
  return (
    <IsoBox x0={p.tx + 0.08} y0={p.ty + 0.15} x1={p.tx + 0.92} y1={p.ty + 0.85} h={34} top="#d6a94a" left="#b88a34" right="#9c7228">
      <path d={`M${pt(p.tx + 0.35, p.ty + 0.85)} L${pt(p.tx + 0.35, p.ty + 0.85, 34)} M${pt(p.tx + 0.7, p.ty + 0.85)} L${pt(p.tx + 0.7, p.ty + 0.85, 34)}`} stroke="#6b4a2b" strokeWidth={3} />
    </IsoBox>
  )
}

function Fence({ p }: { p: Prop }) {
  const along = p.variant === 0
  const a = along ? [p.tx, p.ty + 0.5] : [p.tx + 0.5, p.ty]
  const b = along ? [p.tx + 1, p.ty + 0.5] : [p.tx + 0.5, p.ty + 1]
  return (
    <g stroke="#5a4330" strokeLinecap="round">
      <path d={`M${pt(a[0], a[1], 12)} L${pt(b[0], b[1], 12)} M${pt(a[0], a[1], 24)} L${pt(b[0], b[1], 24)}`} strokeWidth={3} />
      <path d={`M${pt(a[0], a[1])} L${pt(a[0], a[1], 30)} M${pt(b[0], b[1])} L${pt(b[0], b[1], 30)}`} strokeWidth={5} stroke="#4a3626" />
    </g>
  )
}

function Well({ p }: { p: Prop }) {
  const s = toScreen(p.tx + 0.5, p.ty + 0.5)
  return (
    <g transform={`translate(${f1(s.x)} ${f1(s.y)})`}>
      <ellipse rx={26} ry={12} fill="#0b0507" opacity={0.4} />
      <path d="M-22 0 L-22 -22 A22 10 0 0 1 22 -22 L22 0 A22 10 0 0 1 -22 0Z" fill="#6b6460" />
      <ellipse cy={-22} rx={22} ry={10} fill="#4a4440" />
      <ellipse cy={-22} rx={16} ry={7} fill="#0b0507" />
      <path d="M-20 -22 L-20 -64 M20 -22 L20 -64" stroke="#4a3626" strokeWidth={4} />
      <path d="M-28 -60 L0 -76 L28 -60 L22 -58 L0 -70 L-22 -58Z" fill="#3b2a1c" />
      <path d="M0 -62 L0 -36" stroke="#8a7550" strokeWidth={1.5} />
      <rect x={-5} y={-38} width={10} height={8} fill="#5a4330" />
    </g>
  )
}

function Shrine({ p }: { p: Prop }) {
  const s = toScreen(p.tx + 0.5, p.ty + 0.5)
  return (
    <g transform={`translate(${f1(s.x)} ${f1(s.y)}) scale(0.7)`}>
      <ellipse rx={30} ry={13} fill="#0b0507" opacity={0.4} />
      <rect x={-5} y={-120} width={10} height={120} fill="#4a3626" />
      <rect x={-34} y={-104} width={68} height={8} fill="#4a3626" />
      <g transform="translate(0 -96)">
        <path d="M0 -50 Q-14 -50 -12 -34 Q-10 -26 -4 -24 L-16 20 Q0 26 16 20 L4 -24 Q10 -26 12 -34 Q14 -50 0 -50Z" fill="#c9a24a" />
        <path d="M-4 -24 L-16 20 Q-8 23 -2 23Z" fill="#a8822e" />
        <path d="M-8 -16 L8 -16 M-10 -6 L10 -6 M-12 4 L12 4 M-14 14 L14 14" stroke="#8a6a24" strokeWidth={1.4} />
        <path d="M-4 -22 L-26 -4 M4 -22 L26 -4" stroke="#c9a24a" strokeWidth={4} strokeLinecap="round" />
        <path d="M-6 -24 L6 -24 L10 -10 L4 -14 L-4 -14 L-10 -10Z" fill="#8e2a2a" />
      </g>
      {[-30, 26, 38].map((cx, i) => (
        <g key={cx} transform={`translate(${cx} ${i * 6 - 4})`}>
          <rect x={-3} y={-14} width={6} height={14} fill="#e9dcc0" />
          <circle cy={-22} r={10} fill="#ffb347" opacity={0.3} className="candle" />
          <path d="M0 -26 Q3 -20 0 -16 Q-3 -20 0 -26Z" fill="#ffd27a" className="candle" />
        </g>
      ))}
    </g>
  )
}

function Pumpkin({ p }: { p: Prop }) {
  const s = toScreen(p.tx + 0.3 + (p.seed % 40) / 100, p.ty + 0.3 + (p.seed % 37) / 100)
  const carved = p.seed % 5 < 1
  return (
    <g transform={`translate(${f1(s.x)} ${f1(s.y)})`}>
      <ellipse cy={2} rx={13} ry={5} fill="#0b0507" opacity={0.4} />
      <ellipse cy={-8} rx={13} ry={10} fill="#c2561a" />
      <ellipse cy={-8} rx={6} ry={10} fill="#d86a22" />
      <path d="M0 -17 q2 -6 5 -7" stroke="#4a5a2a" strokeWidth={2.5} fill="none" />
      {carved && (
        <g>
          <circle cy={-8} r={18} fill="#ffb347" opacity={0.18} className="candle" />
          <path d="M-7 -11 l3 -3 l3 3Z M1 -11 l3 -3 l3 3Z M-7 -5 l2 2 l2 -2 l2 2 l2 -2 l2 2 l2 -2 l-2 3 l-8 0Z" fill="#ffd27a" />
        </g>
      )}
    </g>
  )
}

function Reeds({ p }: { p: Prop }) {
  const s = toScreen(p.tx + 0.5, p.ty + 0.5)
  const r = rng(p.seed)
  let d = ''
  for (let i = 0; i < 6; i++) {
    const x = s.x + (r() - 0.5) * 30
    const y = s.y + (r() - 0.5) * 12
    d += `M${f1(x)} ${f1(y)} q${f1((r() - 0.5) * 6)} -14 ${f1((r() - 0.5) * 8)} ${f1(-24 - r() * 14)}`
  }
  return <path d={d} stroke="#4a5a2a" strokeWidth={2} fill="none" />
}

function Furniture({ p }: { p: Prop }) {
  if (p.kind === 'bed')
    return (
      <IsoBox x0={p.tx + 0.1} y0={p.ty + 0.05} x1={p.tx + 0.9} y1={p.ty + 0.95} h={18} top="#8e2a2a" left="#5a4330" right="#4a3626">
        <path d={`M${pt(p.tx + 0.15, p.ty + 0.1, 19)} L${pt(p.tx + 0.85, p.ty + 0.1, 19)} L${pt(p.tx + 0.85, p.ty + 0.35, 19)} L${pt(p.tx + 0.15, p.ty + 0.35, 19)}Z`} fill="#e9dcc0" />
      </IsoBox>
    )
  if (p.kind === 'table')
    return (
      <g>
        <path d={`M${pt(p.tx + 0.25, p.ty + 0.75)} L${pt(p.tx + 0.25, p.ty + 0.75, 24)} M${pt(p.tx + 0.75, p.ty + 0.75)} L${pt(p.tx + 0.75, p.ty + 0.75, 24)} M${pt(p.tx + 0.75, p.ty + 0.25)} L${pt(p.tx + 0.75, p.ty + 0.25, 24)}`} stroke="#3b2a1c" strokeWidth={3} />
        <IsoBox x0={p.tx + 0.15} y0={p.ty + 0.15} x1={p.tx + 0.85} y1={p.ty + 0.85} h={4} top="#6b4a2b" left="#4a3626" right="#3b2a1c" />
        <g transform={`translate(0 -28)`}>
          <ellipse cx={toScreen(p.tx + 0.5, p.ty + 0.5).x} cy={toScreen(p.tx + 0.5, p.ty + 0.5).y} rx={4} ry={2} fill="#e9dcc0" />
          <circle cx={toScreen(p.tx + 0.5, p.ty + 0.5).x} cy={toScreen(p.tx + 0.5, p.ty + 0.5).y - 8} r={8} fill="#ffb347" opacity={0.3} className="candle" />
          <rect x={toScreen(p.tx + 0.5, p.ty + 0.5).x - 2} y={toScreen(p.tx + 0.5, p.ty + 0.5).y - 8} width={4} height={8} fill="#e9dcc0" />
        </g>
      </g>
    )
  return (
    <IsoBox x0={p.tx + 0.3} y0={p.ty + 0.3} x1={p.tx + 0.7} y1={p.ty + 0.7} h={14} top="#6b4a2b" left="#4a3626" right="#3b2a1c">
      <path d={`M${pt(p.tx + 0.3, p.ty + 0.3, 14)} L${pt(p.tx + 0.3, p.ty + 0.3, 40)} M${pt(p.tx + 0.7, p.ty + 0.3, 14)} L${pt(p.tx + 0.7, p.ty + 0.3, 40)}`} stroke="#4a3626" strokeWidth={3} />
    </IsoBox>
  )
}

const decoyEnemy: Enemy = createEnemy()

function Decoy({ p }: { p: Prop }) {
  const s = toScreen(p.tx + 0.5, p.ty + 0.5)
  return (
    <g transform={`translate(${f1(s.x)} ${f1(s.y)}) scale(${PUPPET_SCALE})`}>
      <ScarecrowPuppet e={{ ...decoyEnemy, facing: p.seed % 2 < 1 ? 1 : -1 }} pose={enemyPose(decoyEnemy, 0)} time={0} />
    </g>
  )
}

/** Props only re-render when their fade/cut state changes. */
const PropView = memo(function PropView({ p, fade }: { p: Prop; fade: number }) {
  let el: ReactElement
  switch (p.kind) {
    case 'tree':
      el = <Tree p={p} />
      break
    case 'corn':
      el = <Corn p={p} />
      break
    case 'wall':
      el = <Wall p={p} cut={fade > 0} />
      break
    case 'hay':
      el = <Hay p={p} />
      break
    case 'fence':
      el = <Fence p={p} />
      break
    case 'well':
      el = <Well p={p} />
      break
    case 'shrine':
      el = <Shrine p={p} />
      break
    case 'decoy':
      el = <Decoy p={p} />
      break
    case 'pumpkin':
      el = <Pumpkin p={p} />
      break
    case 'reeds':
      el = <Reeds p={p} />
      break
    default:
      el = <Furniture p={p} />
  }
  return p.kind === 'wall' ? el : <g opacity={fade > 0 ? 0.28 : 1}>{el}</g>
})

// ----------------------------------------------------------- dynamic bits

function ProjectileView({ q, t }: { q: IsoProjectile; t: number }) {
  const s = toScreen(q.gx, q.gy)
  const sv = toScreen(q.vx, q.vy)
  const dir = sv.x >= 0 ? 1 : -1
  if (q.kind === 'wisp') {
    const flick = 1 + Math.sin(t * 40 + q.gx * 10) * 0.12
    return (
      <g transform={`translate(${f1(s.x)} ${f1(s.y - 45)})`}>
        <ellipse cy={45} rx={10} ry={4} fill="#b8f0d8" opacity={0.25} />
        <circle r={15 * flick} fill="#b8f0d8" opacity={0.22} />
        <circle r={7 * flick} fill="#d9fff0" />
        <circle r={3} fill="#fff" />
      </g>
    )
  }
  if (q.kind === 'moon') {
    const rot = (Math.atan2(sv.y, sv.x) * 180) / Math.PI
    const o = Math.min(1, (q.life - q.age) / 0.25)
    return (
      <g transform={`translate(${f1(s.x)} ${f1(s.y - 40)}) rotate(${f1(rot)})`} opacity={o}>
        <path d="M-6 -46 Q40 0 -6 46 Q20 0 -6 -46Z" fill="#f8e7b0" />
        <path d="M-6 -46 Q40 0 -6 46 Q30 0 -6 -46Z" fill="#fffaf0" />
      </g>
    )
  }
  const flap = Math.sin(q.age * 26) * 10
  return (
    <g transform={`translate(${f1(s.x)} ${f1(s.y - 40)}) scale(${dir * 1.6} 1.6)`} filter="url(#paperShadow)">
      <path d={`M-4 0 L-14 ${f1(-12 - flap)} L-2 -4 L8 ${f1(-14 - flap)} L6 -2Z`} fill="#1a1016" />
      <path d="M-16 -2 Q0 -8 14 -2 L20 0 L14 2 Q0 6 -16 2 L-22 -3 L-22 3Z" fill="#241820" />
      <circle cx={10} cy={-1.5} r={1.6} fill="#b07cff" />
    </g>
  )
}

function ThornView({ h }: { h: IsoHazard }) {
  const s = toScreen(h.gx, h.gy)
  const k = Math.min(1, (h.t - h.delay) / 0.08)
  const out = h.t - h.delay - h.dur
  const o = out > 0 ? Math.max(0, 1 - out / 0.5) : 1
  const spikes: [number, number][] = [[-26, -6], [-10, 4], [8, -8], [22, 2], [0, -14], [-18, 10], [16, 12]]
  return (
    <g transform={`translate(${f1(s.x)} ${f1(s.y)}) scale(1 ${k.toFixed(2)})`} opacity={o} filter="url(#paperShadow)">
      {spikes.map(([sx, sy], i) => {
        const tall = 50 + ((i * 37) % 5) * 10
        return <path key={i} d={`M${sx - 7} ${sy} Q${sx - 3} ${sy - tall * 0.5} ${sx + (i % 2 ? 5 : -5)} ${sy - tall} Q${sx + 3} ${sy - tall * 0.5} ${sx + 7} ${sy}Z`} fill={i % 2 ? '#3d5a2a' : '#2f4a22'} />
      })}
    </g>
  )
}

function FlameView({ h }: { h: IsoHazard }) {
  if (h.t > h.dur + 0.2) return null
  const s = toScreen(h.gx, h.gy)
  const tip = toScreen(h.gx + Math.cos(h.ang) * 2.2, h.gy + Math.sin(h.ang) * 2.2)
  const rot = (Math.atan2(tip.y - s.y, tip.x - s.x) * 180) / Math.PI
  const len = Math.hypot(tip.x - s.x, tip.y - s.y) / 150
  const k = Math.min(1, h.t / 0.06)
  const o = h.t > h.dur ? Math.max(0, 1 - (h.t - h.dur) / 0.2) : 1
  return (
    <g transform={`translate(${f1(s.x)} ${f1(s.y - 36)}) rotate(${f1(rot)}) scale(${f1(len * k)} ${f1(0.7 * k)})`} opacity={o}>
      <path d="M10 0 Q60 -50 120 -24 Q90 -10 170 0 Q110 14 150 34 Q80 30 20 14Z" fill="#ff7a1a" opacity={0.85} />
      <path d="M16 2 Q60 -32 104 -16 Q84 -4 140 2 Q96 10 120 24 Q70 22 24 10Z" fill="#ffb347" />
      <path d="M22 4 Q58 -14 84 -8 Q72 2 104 6 Q70 12 30 8Z" fill="#ffe08a" />
    </g>
  )
}

function LockMark({ x, y, t }: { x: number; y: number; t: number }) {
  return (
    <g transform={`translate(${f1(x)} ${f1(y)}) scale(${(0.8 + Math.sin(t * 5) * 0.05).toFixed(3)})`}>
      <g transform={`rotate(${((t * 40) % 360).toFixed(1)})`}>
        <circle r={22} fill="none" stroke="#0b0507" strokeWidth={4} strokeDasharray="10 7" transform="translate(1.5 2)" opacity={0.6} />
        <circle r={22} fill="none" stroke="#b3262c" strokeWidth={3} strokeDasharray="10 7" />
      </g>
      {[0, 90, 180, 270].map((a) => (
        <path key={a} transform={`rotate(${a})`} d="M0 -34 L5 -26 L-5 -26Z" fill="#e9dcc0" stroke="#0b0507" strokeWidth={1} />
      ))}
    </g>
  )
}

const splatShapes = (() => {
  const r = rng(5)
  return Array.from({ length: 8 }, () => blob(0, 0, 1, 0.5, r, 12, 0.45))
})()

// ------------------------------------------------------------------ scene

export function IsoScene({ w }: { w: IsoWorld }) {
  const { view, map } = w
  const t = w.time
  const shakeX = w.shake > 0 ? (Math.random() - 0.5) * w.shake : 0
  const shakeY = w.shake > 0 ? (Math.random() - 0.5) * w.shake : 0
  const tx = view.w / 2 - w.cam.x + shakeX
  const ty = view.h / 2 - w.cam.y + shakeY

  const pa = w.pa
  const ps = toScreen(pa.gx, pa.gy)
  const pDepth = pa.gx + pa.gy
  const inside = pa.gx > map.house.x0 && pa.gx < map.house.x1 + 1 && pa.gy > map.house.y0 && pa.gy < map.house.y1 + 1

  // Zomboid-style: anything tall standing between you and the camera fades or drops
  const fadeOf = (p: Prop) => {
    if (!p.tall) return 0
    if (p.depth <= pDepth - 0.2) return 0
    if (p.kind === 'wall' && inside) return 1
    const s = toScreen(p.tx + 0.5, p.ty + 0.5)
    const reach = p.kind === 'tree' ? 70 : p.kind === 'wall' ? 60 : 40
    if (Math.abs(s.x - ps.x) > reach) return 0
    if (p.depth - pDepth > (p.kind === 'tree' ? 6 : 3.5)) return 0
    return 1
  }

  type Item = { depth: number; el: ReactElement }
  const dyn: Item[] = []
  const pl = w.player
  dyn.push({
    depth: pDepth + 0.02,
    el: (
      <g key="player" transform={`translate(${f1(ps.x)} ${f1(ps.y)}) scale(${PUPPET_SCALE})`}>
        <PlayerPuppet p={{ ...pl, body: { ...pl.body, x: 0, y: 0 } }} pose={playerPose(pl, t)} time={t} />
      </g>
    ),
  })
  const e = w.enemy
  const es = toScreen(w.ea.gx, w.ea.gy)
  dyn.push({
    depth: w.ea.gx + w.ea.gy + 0.01,
    el: (
      <g key="enemy">
        {w.ea.z > 0 && <ellipse cx={es.x} cy={es.y} rx={22} ry={9} fill="#0b0507" opacity={0.4} />}
        <g transform={`translate(${f1(es.x)} ${f1(es.y - w.ea.z)}) scale(${PUPPET_SCALE})`}>
          <ScarecrowPuppet e={{ ...e, body: { ...e.body, x: 0, y: 0 } }} pose={enemyPose(e, t)} time={t} />
        </g>
      </g>
    ),
  })
  w.projectiles.forEach((q, i) => dyn.push({ depth: q.gx + q.gy, el: <ProjectileView key={'q' + i} q={q} t={t} /> }))
  w.hazards.forEach((h, i) => {
    if (h.kind === 'briar' && h.t >= h.delay) dyn.push({ depth: h.gx + h.gy, el: <ThornView key={'h' + i} h={h} /> })
    if (h.kind === 'flame') dyn.push({ depth: pDepth + 0.5, el: <FlameView key={'h' + i} h={h} /> })
  })
  dyn.sort((a, b) => a.depth - b.depth)

  // merge the pre-sorted props with the moving things
  const items: ReactElement[] = []
  let di = 0
  const halfW = view.w / 2 + 120
  for (const p of map.props) {
    while (di < dyn.length && dyn[di].depth < p.depth) items.push(dyn[di++].el)
    // skip anything off screen; trees reach a long way up so allow for that below
    const s = toScreen(p.tx + 0.5, p.ty + 0.5)
    if (Math.abs(s.x - w.cam.x) > halfW || s.y < w.cam.y - view.h / 2 - 40 || s.y > w.cam.y + view.h / 2 + 260) continue
    items.push(<PropView key={p.id} p={p} fade={fadeOf(p)} />)
  }
  while (di < dyn.length) items.push(dyn[di++].el)

  // same scale the main svg's "slice" fit uses, so the ground layer lines up exactly
  const winW = window.innerWidth
  const winH = window.innerHeight
  const scale = Math.max(winW / view.w, winH / view.h)
  const gx0 = (GROUND_BOUNDS.x + tx - view.w / 2) * scale + winW / 2
  const gy0 = (GROUND_BOUNDS.y + ty - view.h / 2) * scale + winH / 2

  return (
    <>
    <div className="absolute inset-0 bg-[#160c12]" />
    <svg
      className="absolute left-0 top-0 will-change-transform"
      width={GROUND_BOUNDS.w * scale}
      height={GROUND_BOUNDS.h * scale}
      viewBox={`${GROUND_BOUNDS.x} ${GROUND_BOUNDS.y} ${GROUND_BOUNDS.w} ${GROUND_BOUNDS.h}`}
      style={{ transform: `translate3d(${gx0.toFixed(1)}px, ${gy0.toFixed(1)}px, 0)` }}
    >
      <GroundLayer map={map} />
    </svg>
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${view.w.toFixed(1)} ${view.h.toFixed(1)}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        {/* lighter than the side view's filter: the puppets are small here, so a hard shadow carries the cut-out look */}
        <filter id="paperShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx={2.5} dy={3} stdDeviation={0} floodColor="#0b0507" floodOpacity={0.6} />
        </filter>
        <radialGradient id="isoNight" gradientUnits="userSpaceOnUse" cx={f1(ps.x)} cy={f1(ps.y - 30)} r={Math.max(view.w, view.h) * 0.62}>
          <stop offset="0" stopColor="#0b0507" stopOpacity={0} />
          <stop offset="0.42" stopColor="#0b0507" stopOpacity={0.08} />
          <stop offset="1" stopColor="#0b0507" stopOpacity={0.88} />
        </radialGradient>
      </defs>
      <g transform={`translate(${f1(tx)} ${f1(ty)})`}>
        {w.splats.map((s, i) => {
          const sp = toScreen(s.gx, s.gy)
          return <path key={i} d={splatShapes[Math.floor(s.seed) % splatShapes.length]} transform={`translate(${f1(sp.x)} ${f1(sp.y)}) scale(${f1(s.r * 1.4)})`} fill="#1a0d10" opacity={Math.min(0.85, (40 - s.age) / 10)} />
        })}
        {w.landing && <Landing gx={w.landing.gx} gy={w.landing.gy} t={t} />}
        {w.hazards.map((h, i) => (h.kind === 'briar' && h.t < h.delay ? <BriarTell key={i} h={h} /> : null))}
        {items}
        {w.particles.map((q, i) => {
          const s = toScreen(q.gx, q.gy)
          const k = q.life / q.max
          return q.kind === 'straw' ? (
            <rect key={i} x={s.x - q.size / 2} y={s.y - q.z - 0.9} width={q.size} height={1.8} fill={q.color} opacity={Math.min(1, k * 2)} transform={`rotate(${((q.gx + q.gy) * 400) % 360} ${f1(s.x)} ${f1(s.y - q.z)})`} />
          ) : (
            <circle key={i} cx={s.x} cy={s.y - q.z} r={q.size * (q.kind === 'dust' ? 1.4 - k * 0.6 : 0.5 + k * 0.5)} fill={q.color} opacity={q.kind === 'dust' ? k * 0.5 : Math.min(1, k * 2)} />
          )
        })}
        {pl.lockOn && e.state !== 'dead' && <LockMark x={es.x} y={es.y - w.ea.z - 62} t={t} />}
        {w.debug && (
          <g fill="none" strokeWidth={1.5}>
            <ellipse cx={ps.x} cy={ps.y} rx={pa.r * TW * 0.7} ry={pa.r * TH * 0.7} stroke="#4ade80" />
            <ellipse cx={es.x} cy={es.y} rx={w.ea.r * TW * 0.7} ry={w.ea.r * TH * 0.7} stroke="#facc15" />
          </g>
        )}
        <rect x={w.cam.x - view.w} y={w.cam.y - view.h} width={view.w * 2} height={view.h * 2} fill="url(#isoNight)" pointerEvents="none" />
      </g>
    </svg>
    </>
  )
}

const GROUND_BOUNDS = { x: -MAP_H * (TW / 2) - 4, y: -4, w: (MAP_W + MAP_H) * (TW / 2) + 8, h: (MAP_W + MAP_H) * (TH / 2) + 8 }

function Landing({ gx, gy, t }: { gx: number; gy: number; t: number }) {
  const s = toScreen(gx, gy)
  return (
    <g transform={`translate(${f1(s.x)} ${f1(s.y)})`}>
      <ellipse rx={1.4 * TW * 0.5} ry={1.4 * TH * 0.5} fill="#0b0507" opacity={0.45} />
      <ellipse rx={1.4 * TW * 0.5} ry={1.4 * TH * 0.5} fill="none" stroke="#f4f0e6" strokeWidth={2} strokeDasharray="8 8" opacity={0.5 + 0.3 * Math.sin(t * 20)} />
    </g>
  )
}

function BriarTell({ h }: { h: IsoHazard }) {
  const s = toScreen(h.gx, h.gy)
  const k = h.t / h.delay
  return (
    <g transform={`translate(${f1(s.x)} ${f1(s.y)})`}>
      <ellipse rx={32} ry={14} fill="#9ccf6a" opacity={0.15 + 0.35 * k} />
      <path d="M-26 0 L-12 -3 L-2 2 L8 -2 L20 1" stroke="#9ccf6a" strokeWidth={2} fill="none" opacity={0.4 + 0.6 * k} />
    </g>
  )
}
