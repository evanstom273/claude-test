import type { ReactNode } from 'react'
import type { Enemy, Player } from '../game/types'
import { currentSeg, MOVE_EYE } from '../game/enemy'
import { attackPhase } from '../game/player'
import { RITES } from '../game/rites'
import type { Pose } from './pose'

/** Brass split-pin, the joint of a paper puppet. */
const Pin = ({ x = 0, y = 0, r = 1.9 }: { x?: number; y?: number; r?: number }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill="#b8902f" />
    <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.35} fill="#f1d58a" />
  </g>
)

/** A limb segment hanging down from its joint, rotated so positive = forward. */
const Seg = ({ x = 0, y = 0, a, children }: { x?: number; y?: number; a: number; children: ReactNode }) => (
  <g transform={`translate(${x} ${y}) rotate(${(-a).toFixed(1)})`}>{children}</g>
)

// --------------------------------------------------------- swing smears

/**
 * A pale paper crescent drawn along the path of a swing, so every strike
 * reads as one clear shape instead of a blur of limbs.
 */
const SWOOSH: Record<string, string> = {
  // player, local to the hip, facing right
  light1: 'M-10 -30 Q60 -40 98 6 Q70 -18 -6 -18Z',
  light2: 'M70 30 Q96 -40 30 -88 Q72 -40 56 22Z',
  light3: 'M-10 -96 Q90 -100 104 40 Q74 -60 -4 -80Z',
  heavy: 'M-24 -110 Q110 -120 120 50 Q84 -66 -16 -92Z',
  air: 'M-6 -80 Q92 -70 80 40 Q62 -40 -2 -64Z',
  // the Tattered Man, local to his feet
  lungeAct: 'M-20 -120 Q90 -140 170 -90 Q90 -110 -10 -100Z',
  swipe1: 'M40 -230 Q150 -170 120 -20 Q120 -150 34 -210Z',
  swipe2: 'M30 -40 Q150 -60 150 -200 Q130 -80 26 -60Z',
  ohStrike: 'M-10 -260 Q150 -250 150 -10 Q120 -200 -6 -236Z',
  leapLand: 'M-150 -6 Q0 -60 150 -6 Q0 -36 -150 -6Z',
}

function PlayerSwoosh({ p, hipY }: { p: Player; hipY: number }) {
  if (p.state !== 'attack' || !p.attack) return null
  const ph = attackPhase(p)
  if (!ph || ph.phase === 'startup') return null
  const k = ph.phase === 'active' ? 0 : ph.k
  if (k > 0.35) return null
  const o = 0.75 * (1 - k / 0.35)
  return <path d={SWOOSH[p.attack]} transform={`translate(0 ${hipY.toFixed(1)})`} fill="#f4ecd6" opacity={o} />
}

function EnemySwoosh({ pose, k }: { pose: string; k: number }) {
  const d = SWOOSH[pose]
  if (!d) return null
  return <path d={d} fill="#e9dcc0" opacity={0.7 * (1 - k * 0.6)} />
}

// ------------------------------------------------------------------ player

const PL = { thigh: 23, shin: 23, torso: 35, upper: 18, fore: 17 }

function PlayerLeg({ thigh, shin, back }: { thigh: number; shin: number; back?: boolean }) {
  const cloth = back ? '#3a2e20' : '#4a3b2a'
  const boot = back ? '#1d140e' : '#2a1d14'
  return (
    <Seg a={thigh}>
      <path d="M-5.5 -2 L5.5 -2 L4.6 24 L-4.6 24Z" fill={cloth} />
      <Seg y={PL.thigh} a={shin}>
        <path d="M-4.6 -1 L4.6 -1 L4 17 L-4 17Z" fill={cloth} />
        <path d="M-4.6 14 L4.5 14 L5 19 L11 20.5 L11 24 L-4.8 24Z" fill={boot} />
        <Pin r={1.6} />
      </Seg>
      <Pin />
    </Seg>
  )
}

function PlayerArm({ upper, fore, back, children }: { upper: number; fore: number; back?: boolean; children?: ReactNode }) {
  const sleeve = back ? '#b9aa86' : '#e9dcc0'
  const skin = back ? '#b38e6a' : '#d9b48f'
  return (
    <Seg a={upper}>
      <path d="M-4.6 -3 L4.6 -3 L4 19 L-4 19Z" fill={sleeve} />
      <Seg y={PL.upper} a={fore}>
        <path d="M-3.6 -1 L3.6 -1 L3 16 L-3 16Z" fill={skin} />
        <circle cy={17} r={4} fill={skin} />
        {children && <g transform="translate(0 17)">{children}</g>}
        <Pin r={1.5} />
      </Seg>
      <Pin />
    </Seg>
  )
}

function Scythe({ a }: { a: number }) {
  return (
    <g transform={`rotate(${(-a).toFixed(1)})`}>
      <path d="M-1.9 -30 L1.9 -30 L2.2 68 L-2.2 68Z" fill="#6b4a2b" />
      <rect x={-3.4} y={22} width={6.8} height={6} rx={1.5} fill="#4a321c" />
      <path d="M2.5 62 Q-26 56 -58 84 Q-30 66 2.5 72Z" fill="#cfd3d6" />
      <path d="M-58 84 Q-30 66 2.5 72 L2.5 70 Q-28 64 -56 81Z" fill="#7a8288" />
      <rect x={-3} y={60} width={7} height={12} rx={1.5} fill="#3b2f2a" />
    </g>
  )
}

function HoneyJar() {
  return (
    <g transform="translate(0 -2)">
      <path d="M-5 -6 L5 -6 L6 6 L-6 6Z" fill="#e8a33a" />
      <rect x={-5.5} y={-9} width={11} height={4} fill="#e9dcc0" />
      <circle cx={-2} cy={0} r={1.5} fill="#ffe08a" />
    </g>
  )
}

export function PlayerPuppet({ p, pose, time }: { p: Player; pose: Pose; time: number }) {
  const b = p.body
  const hipY = -46 + pose.crouch + pose.bob
  const blink = p.invuln > 0 && p.state === 'hurt' ? Math.floor(time * 30) % 2 === 0 : false
  const castColor = p.state === 'cast' && p.cast !== 'moon' ? RITES.find((r) => r.id === p.cast)?.color : undefined
  const scarf = Math.sin(time * 9) * 6 - Math.min(18, Math.abs(b.vx) * 0.05)
  const torso = (children: ReactNode) => (
    <g transform={`translate(0 ${hipY.toFixed(1)}) rotate(${pose.lean.toFixed(1)})`}>{children}</g>
  )
  return (
    <g transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`} opacity={blink ? 0.45 : 1}>
      <ellipse cx={0} cy={1} rx={20} ry={4} fill="#000" opacity={p.state === 'dead' ? 0 : 0.35} />
      <g transform={`scale(${p.facing} 1)`} filter="url(#paperShadow)">
        <g transform={pose.spin ? `rotate(${pose.spin.toFixed(1)} 0 ${p.state === 'dead' ? 0 : -26})` : undefined}>
          <g transform={`translate(-3 ${hipY.toFixed(1)})`}>
            <PlayerLeg thigh={pose.legB} shin={pose.shinB} back />
          </g>
          {torso(
            <g transform={`translate(-1 ${-PL.torso + 4})`}>
              <PlayerArm upper={pose.armB} fore={pose.foreB} back>
                {p.state === 'heal' && <HoneyJar />}
                {castColor && (
                  <g>
                    <circle r={13} fill={castColor} opacity={0.25} />
                    <circle r={6} fill={castColor} opacity={0.8} />
                    <circle r={2.5} fill="#fff" />
                  </g>
                )}
              </PlayerArm>
            </g>,
          )}
          <g transform={`translate(3 ${hipY.toFixed(1)})`}>
            <PlayerLeg thigh={pose.legF} shin={pose.shinF} />
          </g>
          <PlayerSwoosh p={p} hipY={hipY} />
          {torso(
            <>
              {/* smock */}
              <path d="M-12 4 L12 4 L11 -30 L7 -37 L-8 -37 L-12 -30Z" fill="#e9dcc0" />
              <path d="M-12 4 L-3 4 L-4 -36 L-8 -37 L-12 -30Z" fill="#cdbf9c" />
              <rect x={1} y={-22} width={7} height={8} fill="#c9a24a" transform="rotate(8 4 -18)" />
              <path d="M-12.5 0 L12.5 0 L12.5 3.5 L-12.5 3.5Z" fill="#8a6a24" />
              {/* scarf */}
              <path d={`M-7 -37 L8 -37 L7 -31 L-7 -31Z M-6 -34 Q-16 ${(-30 + scarf * 0.3).toFixed(1)} ${(-24 - Math.abs(scarf)).toFixed(1)} ${(-24 + scarf).toFixed(1)} L${(-22 - Math.abs(scarf)).toFixed(1)} ${(-19 + scarf).toFixed(1)} Q-14 -26 -4 -31Z`} fill="#8e2a2a" />
              {/* head */}
              <g transform={`translate(1 -38) rotate(${pose.head.toFixed(1)})`}>
                <path d="M-4 0 L4 0 L3.5 -5 L-3.5 -5Z" fill="#c39d79" />
                <circle cx={1} cy={-13} r={10} fill="#d9b48f" />
                <path d="M-9 -16 Q-12 -6 -7 -2 Q-12 2 -14 8 L-10 9 Q-6 2 -4 -6 Z" fill="#3b2418" />
                <circle cx={6.5} cy={-13} r={1.3} fill="#1a0d10" />
                <path d="M6 -8.5 L9 -8.5" stroke="#9a6a52" strokeWidth={1} />
                {/* straw hat */}
                <path d="M-20 -19 Q1 -25 22 -19 Q1 -15 -20 -19Z" fill="#c9a24a" />
                <path d="M-9 -20 Q-8 -33 1 -33 Q10 -33 11 -20Z" fill="#b88f3a" />
                <path d="M-9.3 -22 L10.8 -22 L11 -20 L-9 -20Z" fill="#8e2a2a" />
                <path d="M-18 -19 L-21 -16 M16 -19.5 L20 -16.5 M-2 -18 L-3 -14.5" stroke="#a8822e" strokeWidth={1} />
                <Pin x={0} y={-2} r={1.6} />
              </g>
              <g transform={`translate(4 ${-PL.torso + 4})`}>
                <PlayerArm upper={pose.armF} fore={pose.foreF}>
                  <Scythe a={pose.tool} />
                </PlayerArm>
              </g>
            </>,
          )}
        </g>
      </g>
    </g>
  )
}

// --------------------------------------------------------------- scarecrow

const SC = { thigh: 40, shin: 42, torso: 62, upper: 40, fore: 38 }

function Straw({ x, y, n = 5, len = 12, spread = 60, seed = 0, color = '#d6b25a' }: { x: number; y: number; n?: number; len?: number; spread?: number; seed?: number; color?: string }) {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = ((i / Math.max(1, n - 1) - 0.5) * spread + Math.sin(seed + i * 2.1) * 12) * (Math.PI / 180)
    const l = len * (0.7 + 0.3 * Math.sin(seed * 3 + i))
    d += `M${x} ${y}L${(x + Math.sin(a) * l).toFixed(1)} ${(y + Math.cos(a) * l).toFixed(1)}`
  }
  return <path d={d} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
}

function PoleLeg({ thigh, shin, back }: { thigh: number; shin: number; back?: boolean }) {
  const wood = back ? '#3e2e21' : '#5a4330'
  return (
    <Seg a={thigh}>
      <path d="M-3.5 -4 L3.5 -4 L3 41 L-3 41Z" fill={wood} />
      <Seg y={SC.thigh} a={shin}>
        <path d="M-3 -1 L3 -1 L2.2 44 L-2.2 44Z" fill={wood} />
        <Straw x={0} y={40} n={6} len={9} spread={90} seed={back ? 2 : 5} color={back ? '#a8822e' : '#d6b25a'} />
        <path d="M-4.5 -3 L4.5 -3 L4.5 3 L-4.5 3Z" fill="#8a6a3a" />
        <Pin r={2.2} />
      </Seg>
      <Pin r={2.4} />
    </Seg>
  )
}

function Sickle({ back }: { back?: boolean }) {
  return (
    <g>
      <rect x={-3} y={-2} width={6} height={14} rx={2} fill={back ? '#3a2a1c' : '#4a321c'} />
      <path d="M-2 10 Q-6 40 22 52 Q40 56 50 44 Q34 50 20 44 Q4 36 3 10Z" fill={back ? '#8a8e92' : '#b8bcc0'} />
      <path d="M50 44 Q34 50 20 44 Q4 36 3 10 L1 10 Q3 38 20 47 Q36 53 50 44Z" fill="#5a5f64" />
    </g>
  )
}

function RagArm({ upper, fore, back }: { upper: number; fore: number; back?: boolean }) {
  const coat = back ? '#3a2c40' : '#54405a'
  return (
    <Seg a={upper}>
      <path d="M-7 -5 L7 -5 L6.5 38 L3 43 L0 39 L-3 44 L-6.5 38Z" fill={coat} />
      <Seg y={SC.upper} a={fore}>
        <path d="M-5.5 -2 L5.5 -2 L5 32 L2 36 L-1 32 L-5 35Z" fill={coat} />
        <Straw x={0} y={33} n={5} len={8} spread={80} seed={back ? 7 : 3} color={back ? '#a8822e' : '#d6b25a'} />
        <g transform="translate(0 36)">
          <Sickle back={back} />
        </g>
        <Pin r={2.2} />
      </Seg>
      <Pin r={2.4} />
    </Seg>
  )
}

export function ScarecrowPuppet({ e, pose, time }: { e: Enemy; pose: Pose; time: number }) {
  const b = e.body
  const hipY = -82 + pose.crouch + pose.bob
  const seg = currentSeg(e)
  const tele = e.state === 'move' && (seg?.kind === 'tele' || (e.move === 'crows' && seg?.kind === 'act'))
  const glow = tele ? 1 : e.state === 'dormant' ? 0.15 : 0.45
  const eye = e.move && tele ? MOVE_EYE[e.move] : '#ff6a1a'
  // the delayed overhead trembles as a whole body; limbs stay locked
  const tremble = seg?.pose === 'ohHold' ? Math.sin(time * 55) * 1.6 : 0
  const fade = e.state === 'dead' ? Math.max(0, 1 - Math.max(0, e.t - 1.4) / 1.2) : 1
  const wob = e.wobble > 0 ? Math.sin(time * 90) * e.wobble * 4 : 0
  const coatFlap = Math.sin(time * 3.1) * 3
  const torso = (children: ReactNode) => (
    <g transform={`translate(0 ${hipY.toFixed(1)}) rotate(${pose.lean.toFixed(1)})`}>{children}</g>
  )
  if (fade <= 0) return null
  return (
    <g transform={`translate(${(b.x + wob + tremble).toFixed(1)} ${b.y.toFixed(1)})`} opacity={fade}>
      <ellipse cx={0} cy={1} rx={34} ry={5} fill="#000" opacity={0.35} />
      <g transform={`scale(${e.facing} 1)`} filter="url(#paperShadow)" style={e.flash > 0 ? { filter: 'url(#paperShadow) brightness(2.4)' } : undefined}>
        <g transform={`translate(-5 ${hipY.toFixed(1)})`}>
          <PoleLeg thigh={pose.legB} shin={pose.shinB} back />
        </g>
        {seg?.kind === 'act' && <EnemySwoosh pose={seg.pose} k={e.segT / Math.max(0.001, e.segDur)} />}
        {torso(
          <g transform={`translate(-6 ${-SC.torso + 6})`}>
            <RagArm upper={pose.armB} fore={pose.foreB} back />
          </g>,
        )}
        <g transform={`translate(5 ${hipY.toFixed(1)})`}>
          <PoleLeg thigh={pose.legF} shin={pose.shinF} />
        </g>
        {torso(
          <>
            {/* the stake he hangs from */}
            <rect x={-4} y={-SC.torso - 6} width={8} height={SC.torso + 30} fill="#4a3626" />
            {/* tattered coat */}
            <path
              d={`M-22 -${SC.torso} L22 -${SC.torso} L24 -20 L20 ${(26 + coatFlap).toFixed(1)} L13 ${(18 + coatFlap).toFixed(1)} L8 ${(30 - coatFlap).toFixed(1)} L1 20 L-6 ${(32 + coatFlap).toFixed(1)} L-12 18 L-18 ${(28 - coatFlap).toFixed(1)} L-22 14Z`}
              fill="#54405a"
            />
            <path d={`M-22 -${SC.torso} L-6 -${SC.torso} L-8 18 L-12 18 L-18 ${(28 - coatFlap).toFixed(1)} L-22 14Z`} fill="#443349" />
            <path d="M6 -40 L16 -38 L15 -28 L5 -30Z" fill="#6b3a3a" />
            <path d="M-14 -20 L-6 -22 L-5 -12 L-13 -11Z" fill="#5a4a3a" />
            <path d="M-18 -4 L18 -4 L18 1 L-18 1Z" fill="#6b5a3a" />
            <Straw x={-2} y={-SC.torso + 2} n={7} len={12} spread={160} seed={1} />
            <Straw x={0} y={-2} n={5} len={10} spread={70} seed={4} color="#c79a3a" />
            {/* head: a stuffed sack */}
            <g transform={`translate(0 ${-SC.torso - 4}) rotate(${pose.head.toFixed(1)})`}>
              <path d="M-7 4 L7 4 L5 -4 L-5 -4Z" fill="#8a6a3a" />
              <path d="M-19 -18 Q-22 -38 -4 -44 Q16 -46 20 -28 Q23 -10 12 -4 Q0 2 -12 -4 Q-20 -8 -19 -18Z" fill="#a68a5b" />
              <path d="M-19 -18 Q-22 -38 -4 -44 L-6 -3 Q-12 -4 -16 -8Z" fill="#8f7449" />
              <path d="M-10 -6 L-6 -2 L-2 -6 L2 -2 L6 -6 L10 -2 L13 -6" stroke="#1a0d10" strokeWidth={1.5} fill="none" strokeLinecap="round" />
              <path d="M-10 -8 L13 -8" stroke="#1a0d10" strokeWidth={1} strokeDasharray="2 2" />
              {/* eyes: stitched crosses that kindle when he winds up */}
              <circle cx={1} cy={-24} r={tele ? 13 : 9} fill={eye} opacity={glow * 0.3} />
              <circle cx={14} cy={-25} r={tele ? 12 : 8} fill={eye} opacity={glow * 0.3} />
              <path d="M-3 -28 L5 -20 M5 -28 L-3 -20 M10 -29 L18 -21 M18 -29 L10 -21" stroke="#1a0d10" strokeWidth={2.4} strokeLinecap="round" />
              <circle cx={1} cy={-24} r={tele ? 3.4 : 2.4} fill={tele ? eye : '#ffb347'} opacity={glow} />
              <circle cx={14} cy={-25} r={tele ? 3.2 : 2.2} fill={tele ? eye : '#ffb347'} opacity={glow} />
              {/* crooked hat */}
              <path d="M-30 -36 Q-2 -48 30 -40 Q4 -34 -30 -36Z" fill="#241b26" />
              <path d="M-14 -40 Q-16 -60 -2 -72 Q2 -62 12 -66 Q10 -54 16 -42Z" fill="#2e2432" />
              <path d="M-14 -44 L15 -45 L16 -41 L-14 -40Z" fill="#6b3a3a" />
              <Straw x={-22} y={-38} n={4} len={10} spread={60} seed={9} />
              <Straw x={20} y={-38} n={4} len={9} spread={60} seed={6} />
              <Pin y={2} r={2.4} />
            </g>
            {/* crossbeam shoulders */}
            <rect x={-30} y={-SC.torso + 2} width={60} height={7} rx={2} fill="#5a4330" />
            <g transform={`translate(6 ${-SC.torso + 6})`}>
              <RagArm upper={pose.armF} fore={pose.foreF} />
            </g>
          </>,
        )}
      </g>
    </g>
  )
}
