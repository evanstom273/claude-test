import { currentSeg } from '../game/enemy'
import { attackPhase } from '../game/player'
import { bodyRect, worldBox } from '../game/physics'
import type { Hazard, Particle, Projectile, Rect, World } from '../game/types'
import { GROUND_Y } from '../game/level'
import { CloudLayer, FarLayer, Foreground, MidLayer, NearLayer, PARALLAX, WorldStatic } from './Backdrop'
import { blob, rng } from './paper'
import { enemyPose, playerPose } from './pose'
import { PlayerPuppet, ScarecrowPuppet } from './Puppets'

const layer = (w: World, f: number) => `translate(${(-w.cam.x * f + w.view.w / 2).toFixed(1)} ${(-w.cam.y * f).toFixed(1)})`

const splatShapes = (() => {
  const r = rng(5)
  return Array.from({ length: 8 }, () => blob(0, 0, 1, 0.35, r, 12, 0.45))
})()

function ParticleView({ p }: { p: Particle }) {
  const k = p.life / p.max
  const o = Math.min(1, k * 2)
  switch (p.kind) {
    case 'straw':
      return <rect x={p.x - p.size / 2} y={p.y - 0.9} width={p.size} height={1.8} fill={p.color} opacity={o} transform={`rotate(${p.rot.toFixed(0)} ${p.x.toFixed(1)} ${p.y.toFixed(1)})`} />
    case 'scrap':
      return <path d={`M${p.x - p.size / 2} ${p.y - p.size / 3}L${p.x + p.size / 2} ${p.y - p.size / 2}L${p.x + p.size / 3} ${p.y + p.size / 2}Z`} fill={p.color} opacity={o} transform={`rotate(${p.rot.toFixed(0)} ${p.x.toFixed(1)} ${p.y.toFixed(1)})`} />
    case 'dust':
      return <circle cx={p.x} cy={p.y} r={p.size * (1.4 - k * 0.6)} fill={p.color} opacity={k * 0.5} />
    case 'spark':
      return <circle cx={p.x} cy={p.y} r={p.size * k} fill={p.color} opacity={o} />
    case 'ink':
      return <circle cx={p.x} cy={p.y} r={p.size * (0.6 + k * 0.4)} fill={p.color} />
  }
}

/** A red-ink sigil that circles the locked-on target. */
function LockMark({ x, y, t }: { x: number; y: number; t: number }) {
  const pulse = 1 + Math.sin(t * 5) * 0.06
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${pulse.toFixed(3)})`} pointerEvents="none">
      <g transform={`rotate(${((t * 40) % 360).toFixed(1)})`}>
        <circle r={22} fill="none" stroke="#0b0507" strokeWidth={4} strokeDasharray="10 7" transform="translate(1.5 2)" opacity={0.6} />
        <circle r={22} fill="none" stroke="#b3262c" strokeWidth={3} strokeDasharray="10 7" />
      </g>
      {[0, 90, 180, 270].map((a) => (
        <path key={a} transform={`rotate(${a})`} d="M0 -34 L5 -26 L-5 -26Z" fill="#e9dcc0" stroke="#0b0507" strokeWidth={1} />
      ))}
      <circle r={3} fill="#e9dcc0" />
    </g>
  )
}

/** Where the leap will land: a shadow that darkens as he commits. */
function LandingMark({ x, k, t }: { x: number; k: number; t: number }) {
  const s = 0.5 + 0.5 * Math.min(1, k)
  return (
    <g transform={`translate(${x.toFixed(1)} ${GROUND_Y + 2})`}>
      <ellipse rx={130 * s} ry={12 * s} fill="#0b0507" opacity={0.25 + 0.35 * Math.min(1, k)} />
      <ellipse rx={130 * s} ry={12 * s} fill="none" stroke="#f4f0e6" strokeWidth={2} strokeDasharray="8 8" opacity={0.5 + 0.3 * Math.sin(t * 20)} />
    </g>
  )
}

function ProjectileView({ q, t }: { q: Projectile; t: number }) {
  const dir = q.vx >= 0 ? 1 : -1
  if (q.kind === 'wisp') {
    const flick = 1 + Math.sin(t * 40 + q.x) * 0.12
    return (
      <g transform={`translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})`}>
        <path d={`M0 -7 Q${-dir * 30} -2 ${-dir * 42} 0 Q${-dir * 30} 2 0 7Z`} fill="#b8f0d8" opacity={0.4} />
        <circle r={16 * flick} fill="#b8f0d8" opacity={0.22} />
        <circle r={8 * flick} fill="#d9fff0" />
        <circle r={3.5} fill="#fff" />
      </g>
    )
  }
  if (q.kind === 'moon') {
    const o = Math.min(1, (q.life - q.age) / 0.25)
    return (
      <g transform={`translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) scale(${dir} 1)`} opacity={o}>
        <path d="M-6 -58 Q46 0 -6 58 Q22 0 -6 -58Z" fill="#f1d58a" opacity={0.35} transform="translate(-14 0)" />
        <path d="M-6 -58 Q46 0 -6 58 Q22 0 -6 -58Z" fill="#f8e7b0" />
        <path d="M-6 -58 Q46 0 -6 58 Q34 0 -6 -58Z" fill="#fffaf0" />
      </g>
    )
  }
  // crow: a ragged black paper bird
  const flap = Math.sin(q.age * 26) * 10
  return (
    <g transform={`translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) scale(${dir * 1.9} 1.9)`} filter="url(#paperShadow)">
      <path d={`M-4 0 L-14 ${(-12 - flap).toFixed(1)} L-2 -4 L8 ${(-14 - flap).toFixed(1)} L6 -2Z`} fill="#1a1016" />
      <path d="M-16 -2 Q0 -8 14 -2 L20 0 L14 2 Q0 6 -16 2 L-22 -3 L-22 3Z" fill="#241820" />
      <circle cx={10} cy={-1.5} r={1.6} fill="#b07cff" />
    </g>
  )
}

function HazardView({ h, px, py }: { h: Hazard; px: number; py: number }) {
  if (h.kind === 'briar') {
    if (h.t < h.delay) {
      // the tell: the ground splits and glows before the thorns come
      const k = h.t / h.delay
      return (
        <g transform={`translate(${h.x.toFixed(1)} ${h.y})`}>
          <ellipse rx={50} ry={6} fill="#9ccf6a" opacity={0.15 + 0.35 * k} />
          <path d="M-40 0 L-20 -3 L-6 1 L10 -2 L26 1 L42 -1" stroke="#9ccf6a" strokeWidth={2} fill="none" opacity={0.4 + 0.6 * k} />
        </g>
      )
    }
    const k = Math.min(1, (h.t - h.delay) / 0.08)
    const out = h.t - h.delay - h.dur
    const o = out > 0 ? Math.max(0, 1 - out / 0.5) : 1
    const spikes = [-36, -18, 0, 18, 36]
    return (
      <g transform={`translate(${h.x.toFixed(1)} ${h.y}) scale(1 ${k.toFixed(2)})`} opacity={o} filter="url(#paperShadow)">
        {spikes.map((sx, i) => {
          const tall = 70 + ((i * 37) % 5) * 14
          return <path key={i} d={`M${sx - 9} 0 Q${sx - 4} ${-tall * 0.5} ${sx + (i % 2 ? 6 : -6)} ${-tall} Q${sx + 4} ${-tall * 0.5} ${sx + 9} 0Z`} fill={i % 2 ? '#3d5a2a' : '#2f4a22'} />
        })}
        {spikes.map((sx, i) => (
          <path key={'t' + i} d={`M${sx} -30 l8 -6 l-6 8Z M${sx - 2} -54 l-8 -4 l6 8Z`} fill="#9ccf6a" />
        ))}
      </g>
    )
  }
  // husk flame: tongues of burning paper in front of the caster
  if (h.t > h.dur + 0.2) return null
  const k = Math.min(1, h.t / 0.06)
  const o = h.t > h.dur ? Math.max(0, 1 - (h.t - h.dur) / 0.2) : 1
  return (
    <g transform={`translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${h.dir * k} ${k})`} opacity={o}>
      <path d="M10 -60 Q60 -110 120 -84 Q90 -70 170 -50 Q110 -40 150 -18 Q80 -20 20 -30Z" fill="#ff7a1a" opacity={0.85} />
      <path d="M16 -56 Q60 -92 104 -76 Q84 -62 140 -48 Q96 -42 120 -26 Q70 -28 24 -36Z" fill="#ffb347" />
      <path d="M22 -52 Q58 -74 84 -66 Q72 -56 104 -46 Q70 -40 30 -42Z" fill="#ffe08a" />
    </g>
  )
}

const DebugBox = ({ r, color }: { r: Rect; color: string }) => <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} />

export function Scene({ w }: { w: World }) {
  const { view } = w
  const shakeX = w.shake > 0 ? (Math.random() - 0.5) * w.shake : 0
  const shakeY = w.shake > 0 ? (Math.random() - 0.5) * w.shake : 0
  const p = w.player
  const e = w.enemy
  const ph = attackPhase(p)
  const seg = currentSeg(e)
  const t = w.time
  const moonX = view.w * 0.68 - w.cam.x * PARALLAX.moon
  const moonY = 190 - w.cam.y * PARALLAX.moon

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${view.w.toFixed(1)} ${view.h.toFixed(1)}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#170f1d" />
          <stop offset="0.45" stopColor="#3a1c2c" />
          <stop offset="0.8" stopColor="#8a3527" />
          <stop offset="1" stopColor="#c2562a" />
        </linearGradient>
        <radialGradient id="moonGlow">
          <stop offset="0" stopColor="#f2a65a" stopOpacity={0.45} />
          <stop offset="1" stopColor="#f2a65a" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9a0a0" stopOpacity={0} />
          <stop offset="0.6" stopColor="#b9a0a0" stopOpacity={0.14} />
          <stop offset="1" stopColor="#b9a0a0" stopOpacity={0} />
        </linearGradient>
        {/* cut-out look: a pale paper edge around the figure plus a hard drop shadow */}
        <filter id="paperShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feMorphology in="SourceAlpha" operator="dilate" radius={1.6} result="grown" />
          <feFlood floodColor="#e9dcc0" floodOpacity={0.85} />
          <feComposite in2="grown" operator="in" result="edge" />
          <feOffset in="grown" dx={3.5} dy={4} result="off" />
          <feFlood floodColor="#0b0507" floodOpacity={0.65} />
          <feComposite in2="off" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="edge" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={`translate(${shakeX.toFixed(1)} ${shakeY.toFixed(1)})`}>
        <rect x={-50} y={-200} width={view.w + 100} height={view.h + 400} fill="url(#sky)" />
        <g transform={`translate(${moonX.toFixed(1)} ${moonY.toFixed(1)})`}>
          <circle r={230} fill="url(#moonGlow)" />
          <circle r={104} fill="#c9632e" transform="translate(4 5)" />
          <circle r={104} fill="#e8873a" />
          <path d={blob(-22, -18, 28, 22, rng(2), 12, 0.15)} fill="#d47432" />
          <path d={blob(36, 30, 18, 14, rng(3), 10, 0.2)} fill="#d47432" />
          <path d={blob(-40, 44, 12, 9, rng(4), 9, 0.2)} fill="#d47432" />
          <path d={blob(30, -50, 10, 8, rng(6), 9, 0.2)} fill="#f2a65a" />
        </g>
        <g transform={layer(w, PARALLAX.clouds)}>
          <CloudLayer />
        </g>
        <g transform={layer(w, PARALLAX.far)}>
          <FarLayer />
        </g>
        <g transform={layer(w, PARALLAX.mid)}>
          <MidLayer />
        </g>
        <rect x={-50} y={view.h * 0.45} width={view.w + 100} height={view.h * 0.4} fill="url(#fog)" />
        <g transform={layer(w, PARALLAX.near)}>
          <NearLayer />
        </g>

        <g transform={layer(w, 1)}>
          <WorldStatic />
          {w.splats.map((s, i) => (
            <path
              key={i}
              d={splatShapes[Math.floor(s.seed) % splatShapes.length]}
              transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) scale(${(s.r * 1.6).toFixed(1)} ${(s.r * 1.6).toFixed(1)})`}
              fill="#1a0d10"
              opacity={Math.min(0.85, (40 - s.age) / 10)}
            />
          ))}
          {e.landX !== null && e.state === 'move' && <LandingMark x={e.landX} k={e.move === 'leap' && e.seg === 0 ? e.segT / e.segDur : 1} t={t} />}
          {w.hazards.map((h, i) => (
            <HazardView key={i} h={h} px={p.body.x} py={p.body.y} />
          ))}
          <ScarecrowPuppet e={e} pose={enemyPose(e, t)} time={t} />
          <PlayerPuppet p={p} pose={playerPose(p, t)} time={t} />
          {p.lockOn && e.state !== 'dead' && <LockMark x={e.body.x} y={e.body.y - e.body.h * 0.62} t={t} />}
          {w.projectiles.map((q, i) => (
            <ProjectileView key={i} q={q} t={t} />
          ))}
          {w.particles.map((q, i) => (
            <ParticleView key={i} p={q} />
          ))}
          {w.debug && (
            <g>
              <DebugBox r={bodyRect(p.body)} color={p.invuln > 0 ? '#60a5fa' : '#4ade80'} />
              <DebugBox r={bodyRect(e.body)} color="#facc15" />
              {ph?.phase === 'active' && <DebugBox r={worldBox(p.body, p.facing, ph.a.box)} color="#f97316" />}
              {seg?.kind === 'act' && seg.box && <DebugBox r={worldBox(e.body, e.facing, seg.box)} color="#ef4444" />}
            </g>
          )}
        </g>

        <rect x={-50} y={view.h * 0.7} width={view.w + 100} height={view.h * 0.4} fill="url(#fog)" className="fog-drift" />
        <g transform={layer(w, PARALLAX.fore)}>
          <Foreground />
        </g>
      </g>
    </svg>
  )
}
