import { memo } from 'react'
import { brazierCost, brazierRadius, lightRadius, SHADE_EYE } from '../game/engine'
import type { Brazier, GameState, Shade, World } from '../game/types'

export const VIEW_MIN = 820

/** Smooth closed blob through `n` wobbling points. */
function blobPath(r: number, t: number, seed: number, n: number, amp: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = r * (1 + amp * Math.sin(t * 4 + i * 2.3 + seed) + amp * 0.5 * Math.sin(t * 7 + i * 1.7 + seed * 2))
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr])
  }
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const m0 = mid(pts[n - 1], pts[0])
  let d = `M${m0[0].toFixed(1)} ${m0[1].toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const m = mid(p, pts[(i + 1) % n])
    d += `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`
  }
  return d + 'Z'
}

const Ground = memo(function Ground({ world }: { world: World }) {
  return (
    <g>
      <rect x={-400} y={-400} width={world.size + 800} height={world.size + 800} fill="#0d1610" />
      <rect x={0} y={0} width={world.size} height={world.size} fill="#1a271d" />
      {world.patches.map((p, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill={p.color} opacity={0.8} />
      ))}
      {world.tufts.map((t, i) => (
        <path
          key={i}
          transform={`translate(${t.x.toFixed(0)} ${t.y.toFixed(0)}) rotate(${t.rot.toFixed(0)}) scale(${t.s.toFixed(2)})`}
          d="M-6 0 Q-5 -8 -8 -13 M0 0 Q0 -10 1 -16 M6 0 Q5 -8 9 -12"
          stroke="#2f4a2c"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      ))}
      {world.mushrooms.map((m, i) => (
        <g key={i} transform={`translate(${m.x.toFixed(0)} ${m.y.toFixed(0)})`}>
          <circle r={m.size * 3.2} fill={`hsl(${m.hue} 90% 60%)`} opacity={0.12} className="mushroom-glow" style={{ animationDelay: `${m.delay}s` }} />
          <rect x={-m.size * 0.25} y={0} width={m.size * 0.5} height={m.size * 1.1} fill="#d6d3d1" opacity={0.6} />
          <ellipse rx={m.size} ry={m.size * 0.7} fill={`hsl(${m.hue} 85% 62%)`} />
          <circle cx={-m.size * 0.3} cy={-m.size * 0.2} r={m.size * 0.22} fill="#ecfeff" opacity={0.8} />
        </g>
      ))}
      {world.rocks.map((k, i) => (
        <g key={i} transform={`translate(${k.x.toFixed(0)} ${k.y.toFixed(0)})`}>
          <polygon points={k.points} transform="translate(5 6)" fill="#000" opacity={0.35} />
          <polygon points={k.points} fill="#4b5262" stroke="#2b2f3a" strokeWidth={3} strokeLinejoin="round" />
          <polygon points={k.points} transform={`translate(${-k.r * 0.15} ${-k.r * 0.2}) scale(0.55)`} fill="#6b7385" opacity={0.6} />
        </g>
      ))}
    </g>
  )
})

const Trees = memo(function Trees({ world }: { world: World }) {
  return (
    <g>
      {world.trees.map((t, i) => {
        const g = 120 + t.hue * 40
        const dark = `hsl(${g} 32% 13%)`
        const mid = `hsl(${g} 30% 19%)`
        const light = `hsl(${g - 10} 30% 27%)`
        return (
          <g key={i} transform={`translate(${t.x.toFixed(0)} ${t.y.toFixed(0)}) rotate(${t.rot.toFixed(0)})`}>
            <circle cx={10} cy={12} r={t.r * 1.02} fill="#000" opacity={0.4} />
            <circle r={t.r} fill={dark} />
            <circle cx={t.r * 0.35} cy={-t.r * 0.2} r={t.r * 0.62} fill={mid} />
            <circle cx={-t.r * 0.3} cy={t.r * 0.3} r={t.r * 0.58} fill={mid} />
            <circle cx={-t.r * 0.25} cy={-t.r * 0.3} r={t.r * 0.42} fill={light} />
            <circle cx={t.r * 0.2} cy={t.r * 0.25} r={t.r * 0.25} fill={light} opacity={0.6} />
          </g>
        )
      })}
    </g>
  )
})

function BrazierView({ b, cost, near, time }: { b: Brazier; cost: number; near: boolean; time: number }) {
  const lit = b.lit > 0
  const flick = Math.sin(time * 13 + b.id) * 2
  return (
    <g transform={`translate(${b.x} ${b.y})`}>
      <circle r={52} fill="none" stroke="#a8a29e" strokeWidth={1.5} strokeDasharray="4 8" opacity={lit ? 0 : 0.25} />
      <ellipse cx={4} cy={6} rx={22} ry={20} fill="#000" opacity={0.4} />
      <circle r={20} fill="#57534e" stroke="#292524" strokeWidth={4} />
      <circle r={12} fill={lit ? '#7c2d12' : '#1c1917'} />
      {lit && (
        <g>
          <circle r={22 + flick} fill="url(#emberGlow)" opacity={0.9} />
          <path d={`M0 ${-20 - flick} C8 -8 12 2 0 9 C-12 2 -8 -8 0 ${-20 - flick}Z`} fill="url(#flameGrad)" />
          <circle cy={2} r={4} fill="#fff7d6" />
        </g>
      )}
      {!lit && b.progress > 0 && (
        <circle
          r={30}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${b.progress * 188.5} 188.5`}
          transform="rotate(-90)"
        />
      )}
      {!lit && near && (
        <text y={-40} textAnchor="middle" fill="#fde68a" fontSize={13} fontFamily="Inter, sans-serif" fontWeight={600}>
          Light brazier · {cost} fuel
        </text>
      )}
      {lit && (
        <circle
          r={27}
          fill="none"
          stroke="#fb923c"
          strokeWidth={2}
          opacity={0.6}
          strokeDasharray={`${(b.lit / 50) * 169.6} 169.6`}
          transform="rotate(-90)"
        />
      )}
    </g>
  )
}

function ShadeBody({ sh, time }: { sh: Shade; time: number }) {
  const fade = Math.min(1, sh.age / 0.6)
  const fill = sh.kind === 'hulk' ? 'url(#hulkGrad)' : sh.kind === 'wraith' ? 'url(#wraithGrad)' : 'url(#shadeGrad)'
  const amp = sh.kind === 'hulk' ? 0.14 : 0.1
  const hp = sh.hp / sh.maxHp
  return (
    <g transform={`translate(${sh.x.toFixed(1)} ${sh.y.toFixed(1)})`} opacity={fade}>
      {sh.kind === 'wraith' && (
        <line
          x1={0}
          y1={0}
          x2={(-sh.vx * 0.18).toFixed(1)}
          y2={(-sh.vy * 0.18).toFixed(1)}
          stroke="#0e7490"
          strokeWidth={sh.r * 1.2}
          strokeLinecap="round"
          opacity={0.35}
        />
      )}
      <path d={blobPath(sh.r * 1.15, time, sh.seed, sh.kind === 'hulk' ? 11 : 8, amp)} fill="#000" opacity={0.5} />
      <path d={blobPath(sh.r, time * 1.2, sh.seed + 3, sh.kind === 'hulk' ? 11 : 8, amp)} fill={fill} />
      {sh.burning > 0 && <circle r={sh.r * 0.9} fill="#fb923c" opacity={0.12 + 0.18 * sh.burning * (0.6 + 0.4 * Math.sin(time * 30 + sh.seed))} />}
      {sh.hurtFlash > 0 && <circle r={sh.r} fill="#fff" opacity={0.5} />}
      {hp < 1 && (
        <g transform={`translate(0 ${-sh.r - 9})`}>
          <rect x={-sh.r} y={0} width={sh.r * 2} height={3} rx={1.5} fill="#000" opacity={0.6} />
          <rect x={-sh.r} y={0} width={sh.r * 2 * Math.max(0, hp)} height={3} rx={1.5} fill={SHADE_EYE[sh.kind]} />
        </g>
      )}
    </g>
  )
}

function ShadeEyes({ sh, px, py, time }: { sh: Shade; px: number; py: number; time: number }) {
  const dx = px - sh.x
  const dy = py - sh.y
  const d = Math.hypot(dx, dy) || 1
  const fx = (dx / d) * sh.r * 0.35
  const fy = (dy / d) * sh.r * 0.35
  const ox = (-dy / d) * sh.r * 0.32
  const oy = (dx / d) * sh.r * 0.32
  const blink = Math.sin(time * 0.9 + sh.seed * 7) > 0.97 ? 0.2 : 1
  const er = sh.kind === 'hulk' ? 3.6 : 2.4
  const col = SHADE_EYE[sh.kind]
  const fade = Math.min(1, sh.age / 0.6)
  return (
    <g transform={`translate(${(sh.x + fx).toFixed(1)} ${(sh.y + fy).toFixed(1)})`} opacity={fade}>
      <circle cx={ox} cy={oy} r={er * 2.6} fill={col} opacity={0.18} />
      <circle cx={-ox} cy={-oy} r={er * 2.6} fill={col} opacity={0.18} />
      <ellipse cx={ox} cy={oy} rx={er} ry={er * blink} fill={col} />
      <ellipse cx={-ox} cy={-oy} rx={er} ry={er * blink} fill={col} />
    </g>
  )
}

function PlayerView({ s }: { s: GameState }) {
  const p = s.player
  const t = s.time
  const flick = Math.sin(t * 17) * 1.5 + Math.sin(t * 29) * 1
  const tx = Math.max(-12, Math.min(12, -p.vx * 0.05)) + Math.sin(t * 6) * 1.5
  const ty = -22 - flick + Math.max(-6, Math.min(6, -p.vy * 0.03))
  const scale = 0.85 + 0.25 * Math.min(1, p.fuel / 100)
  const blink = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0 ? 0.35 : 1
  const eyeBlink = Math.sin(t * 1.3) > 0.985 ? 0.2 : 1
  return (
    <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${scale.toFixed(3)})`} opacity={blink}>
      <ellipse cx={0} cy={15} rx={12} ry={4} fill="#000" opacity={0.3} />
      <circle r={34 + flick} fill="url(#emberGlow)" />
      <path d={`M${tx.toFixed(1)} ${ty.toFixed(1)} C9 -9 16 3 0 15 C-16 3 -9 -9 ${tx.toFixed(1)} ${ty.toFixed(1)}Z`} fill="url(#flameGrad)" />
      <path d={`M${(tx * 0.6).toFixed(1)} ${(ty * 0.55).toFixed(1)} C5 -3 9 5 0 12 C-9 5 -5 -3 ${(tx * 0.6).toFixed(1)} ${(ty * 0.55).toFixed(1)}Z`} fill="#fef3c7" opacity={0.85} />
      <ellipse cx={-3.6} cy={4} rx={1.7} ry={2.2 * eyeBlink} fill="#431407" />
      <ellipse cx={3.6} cy={4} rx={1.7} ry={2.2 * eyeBlink} fill="#431407" />
    </g>
  )
}

export function Scene({ s, vw, vh }: { s: GameState; vw: number; vh: number }) {
  const scale = VIEW_MIN / Math.max(1, Math.min(vw, vh))
  const w = vw * scale
  const h = vh * scale
  const p = s.player
  const size = s.world.size
  let cx = Math.max(w / 2 - 200, Math.min(size - w / 2 + 200, p.x))
  let cy = Math.max(h / 2 - 200, Math.min(size - h / 2 + 200, p.y))
  if (s.shake > 0) {
    cx += (Math.random() - 0.5) * s.shake
    cy += (Math.random() - 0.5) * s.shake
  }
  const x0 = cx - w / 2
  const y0 = cy - h / 2
  const margin = 80
  const inView = (x: number, y: number, r = 0) =>
    x > x0 - margin - r && x < x0 + w + margin + r && y > y0 - margin - r && y < y0 + h + margin + r

  const R = lightRadius(s) * (1 + 0.025 * Math.sin(s.time * 11) + 0.015 * Math.sin(s.time * 23))
  const t = s.time
  const shades = s.shades.filter((sh) => inView(sh.x, sh.y, sh.r))
  const embers = s.embers.filter((e) => inView(e.x, e.y))
  const mushrooms = s.world.mushrooms.filter((m) => inView(m.x, m.y))
  const cost = brazierCost(s)
  const dead = s.phase === 'over'

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`${x0} ${y0} ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="lightGrad">
          <stop offset="0" stopColor="#000" stopOpacity={1} />
          <stop offset="0.5" stopColor="#000" stopOpacity={0.92} />
          <stop offset="0.8" stopColor="#000" stopOpacity={0.45} />
          <stop offset="1" stopColor="#000" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="softGrad">
          <stop offset="0" stopColor="#000" stopOpacity={0.75} />
          <stop offset="1" stopColor="#000" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="warmGrad">
          <stop offset="0" stopColor="#ffb14a" stopOpacity={0.28} />
          <stop offset="0.6" stopColor="#ff7a1a" stopOpacity={0.1} />
          <stop offset="1" stopColor="#ff7a1a" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="emberGlow">
          <stop offset="0" stopColor="#fde68a" stopOpacity={0.7} />
          <stop offset="0.4" stopColor="#fb923c" stopOpacity={0.25} />
          <stop offset="1" stopColor="#f97316" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="flameGrad" cx="0.5" cy="0.75" r="0.75">
          <stop offset="0" stopColor="#fff7d6" />
          <stop offset="0.35" stopColor="#fcd34d" />
          <stop offset="0.75" stopColor="#f97316" />
          <stop offset="1" stopColor="#c2410c" />
        </radialGradient>
        <radialGradient id="shadeGrad" cx="0.4" cy="0.35">
          <stop offset="0" stopColor="#3b2a5a" />
          <stop offset="0.7" stopColor="#1a1030" />
          <stop offset="1" stopColor="#07040f" />
        </radialGradient>
        <radialGradient id="wraithGrad" cx="0.4" cy="0.35">
          <stop offset="0" stopColor="#1f4f5c" />
          <stop offset="1" stopColor="#041318" />
        </radialGradient>
        <radialGradient id="hulkGrad" cx="0.4" cy="0.35">
          <stop offset="0" stopColor="#5a1f2a" />
          <stop offset="0.7" stopColor="#2a0a12" />
          <stop offset="1" stopColor="#0c0205" />
        </radialGradient>
        <mask id="darkMask" maskUnits="userSpaceOnUse" x={x0} y={y0} width={w} height={h}>
          <rect x={x0} y={y0} width={w} height={h} fill="#fff" />
          {!dead && <circle cx={p.x} cy={p.y} r={R} fill="url(#lightGrad)" />}
          {s.braziers.map((b) =>
            b.lit > 0 ? <circle key={b.id} cx={b.x} cy={b.y} r={brazierRadius(s, b.lit) * (1 + 0.03 * Math.sin(t * 9 + b.id))} fill="url(#lightGrad)" /> : null,
          )}
          {embers.map((e) => (
            <circle key={e.id} cx={e.x} cy={e.y} r={48} fill="url(#softGrad)" />
          ))}
          {mushrooms.map((m, i) => (
            <circle key={i} cx={m.x} cy={m.y} r={m.size * 11} fill="url(#softGrad)" opacity={0.7} />
          ))}
          {s.flare && <circle cx={p.x} cy={p.y} r={s.flare.r} fill="url(#lightGrad)" opacity={1 - s.flare.t / 0.75} />}
        </mask>
      </defs>

      <Ground world={s.world} />

      {!dead && <circle cx={p.x} cy={p.y} r={R} fill="url(#warmGrad)" />}
      {s.braziers.map((b) =>
        b.lit > 0 ? <circle key={b.id} cx={b.x} cy={b.y} r={brazierRadius(s, b.lit)} fill="url(#warmGrad)" /> : null,
      )}

      {s.braziers.map((b) =>
        inView(b.x, b.y, 60) ? (
          <BrazierView key={b.id} b={b} cost={cost} time={t} near={s.phase === 'night' && Math.hypot(p.x - b.x, p.y - b.y) < 110} />
        ) : null,
      )}

      {embers.map((e) => {
        const bob = Math.sin(e.phase * 3) * 2.5
        const rot = (e.phase * 60) % 360
        return (
          <g key={e.id} transform={`translate(${e.x.toFixed(1)} ${(e.y + bob).toFixed(1)})`}>
            <circle r={16 + Math.sin(e.phase * 5) * 2} fill="url(#emberGlow)" />
            <path d="M0 -8 L6 0 L0 8 L-6 0Z" fill="#fbbf24" stroke="#fff7ed" strokeWidth={1.2} transform={`rotate(${rot.toFixed(0)}) scale(${e.value < 10 ? 0.8 : 1})`} />
            <circle r={2} fill="#fff" />
          </g>
        )
      })}

      {shades.map((sh) => (
        <ShadeBody key={sh.id} sh={sh} time={t} />
      ))}

      {!dead && <PlayerView s={s} />}

      <Trees world={s.world} />

      <rect x={x0} y={y0} width={w} height={h} fill="#03040a" opacity={0.95} mask="url(#darkMask)" pointerEvents="none" />

      {shades.map((sh) => (
        <ShadeEyes key={sh.id} sh={sh} px={p.x} py={p.y} time={t} />
      ))}

      {s.sparks.map((sp, i) => (
        <g key={i}>
          <line x1={sp.x} y1={sp.y} x2={sp.x - sp.vx * 0.05} y2={sp.y - sp.vy * 0.05} stroke="#fde68a" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
          <circle cx={sp.x} cy={sp.y} r={3.5} fill="#fff7d6" />
        </g>
      ))}

      {s.particles.map((q, i) =>
        inView(q.x, q.y) ? <circle key={i} cx={q.x} cy={q.y} r={q.size * (0.4 + 0.6 * (q.life / q.max))} fill={q.color} opacity={Math.min(1, (q.life / q.max) * 1.4)} /> : null,
      )}

      {s.flare && (
        <circle cx={p.x} cy={p.y} r={s.flare.r} fill="none" stroke="#fde68a" strokeWidth={14 * (1 - s.flare.t / 0.75) + 1} opacity={0.8 * (1 - s.flare.t / 0.75)} />
      )}
    </svg>
  )
}
