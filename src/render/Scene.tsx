import { currentSeg } from '../game/enemy'
import { attackPhase } from '../game/player'
import { bodyRect, worldBox } from '../game/physics'
import type { Particle, Rect, World } from '../game/types'
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
          <ScarecrowPuppet e={e} pose={enemyPose(e, t)} time={t} />
          <PlayerPuppet p={p} pose={playerPose(p, t)} time={t} />
          {p.lockOn && e.state !== 'dead' && <LockMark x={e.body.x} y={e.body.y - e.body.h * 0.62} t={t} />}
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
