import { memo } from 'react'
import { GROUND_Y, LEVEL } from '../game/level'
import { blob, deadTree, hills, rng, tornShape } from './paper'

/** Camera y the layers are composed for; parallax shifts relative to this. */
export const REF_CAM_Y = GROUND_Y + 120 - 640

const SPAN = LEVEL.width + 2400

/** Converts "screen y at the reference camera" to layer space for factor f. */
const ly = (screenY: number, f: number) => screenY + REF_CAM_Y * f

export const PARALLAX = { moon: 0.04, clouds: 0.08, far: 0.15, mid: 0.32, near: 0.6, fore: 1.25 }

function WickerMan({ x, y, s }: { x: number; y: number; s: number }) {
  // a great woven figure on the far hill, ribs and all
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#2a1520">
      <path d="M-14 0 L-10 -60 L-24 -60 L-20 -120 L20 -120 L24 -60 L10 -60 L14 0 L6 0 L4 -55 L-4 -55 L-6 0Z" />
      <path d="M-20 -118 L-52 -70 L-46 -66 L-18 -100Z M20 -118 L52 -70 L46 -66 L18 -100Z" />
      <circle cx={0} cy={-136} r={16} />
      <path d="M-16 -110 L16 -110 M-17 -98 L17 -98 M-18 -86 L18 -86 M-19 -74 L19 -74" stroke="#4a2533" strokeWidth={2} />
      <circle cx={0} cy={-136} r={5} fill="#c2562a" opacity={0.7} className="ember-pulse" />
    </g>
  )
}

function Windmill({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="#2e1822">
      <path d="M-16 0 L-10 -70 L10 -70 L16 0Z" />
      <path d="M-14 -70 L0 -84 L14 -70Z" />
      <g transform="translate(0 -72)">
        <g className="windmill-spin">
          {[0, 90, 180, 270].map((a) => (
            <path key={a} transform={`rotate(${a})`} d="M-2 0 L2 0 L3 -62 L14 -60 L12 -20 L2 -18Z" />
          ))}
        </g>
      </g>
    </g>
  )
}

function Church({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="#22121a">
      <path d="M-60 0 L-60 -60 L0 -100 L60 -60 L60 0Z" />
      <path d="M40 -60 L40 -150 L52 -170 L64 -150 L64 -60Z" />
      <path d="M50 -190 L54 -190 L54 -178 L60 -178 L60 -174 L54 -174 L54 -168 L50 -168 L50 -174 L44 -174 L44 -178 L50 -178Z" />
      <rect x={46} y={-128} width={12} height={18} rx={6} fill="#c2562a" opacity={0.55} className="ember-pulse" />
    </g>
  )
}

export const CloudLayer = memo(function CloudLayer() {
  const r = rng(11)
  const crows: [number, number][] = Array.from({ length: 7 }, () => [r() * SPAN * PARALLAX.clouds + 200, 80 + r() * 140])
  return (
      <g>
        {Array.from({ length: 8 }, (_, i) => {
          const x = i * 420 + r() * 200
          const y = 90 + r() * 170
          const w = 260 + r() * 260
          return (
            <g key={i} opacity={0.75}>
              <path d={tornShape(x, x + w, y + 22, (xx) => y + Math.sin((xx - x) / w * Math.PI) * -14, r, 18, 3)} fill="#5a2c3a" transform="translate(3 4)" opacity={0.6} />
              <path d={tornShape(x, x + w, y + 18, (xx) => y + Math.sin((xx - x) / w * Math.PI) * -14, r, 18, 3)} fill="#6e3442" />
            </g>
          )
        })}
        {crows.map(([x, y], i) => (
          <path key={i} d={`M${x - 8} ${y} Q${x - 4} ${y - 5} ${x} ${y} Q${x + 4} ${y - 5} ${x + 8} ${y}`} stroke="#1d1016" strokeWidth={2} fill="none" className="crow" style={{ animationDelay: `${i * 0.7}s` }} />
        ))}
      </g>
  )
})

export const FarLayer = memo(function FarLayer() {
  const r = rng(12)
  const hFar = hills(3, 40, ly(330, PARALLAX.far))
  return (
      <g>
        <path d={tornShape(-50, SPAN * PARALLAX.far + 2000, 1400, hFar, r, 16, 2.5)} fill="#2a141e" transform="translate(4 5)" />
        <path d={tornShape(-50, SPAN * PARALLAX.far + 2000, 1400, hFar, r, 16, 2.5)} fill="#4a2533" />
        <WickerMan x={520} y={hFar(520) + 8} s={0.9} />
        <Windmill x={980} y={hFar(980) + 6} />
      </g>
  )
})

export const MidLayer = memo(function MidLayer() {
  const r = rng(13)
  const hMid = hills(7, 30, ly(400, PARALLAX.mid))
  const midTrees: string[] = []
  for (let x = 0; x < SPAN; x += 160 + r() * 260) midTrees.push(deadTree(x, hMid(x) + 6, 120 + r() * 80, r))
  return (
      <g>
        <path d={tornShape(-50, SPAN * PARALLAX.mid + 2000, 1400, hMid, r, 14, 3)} fill="#170b11" transform="translate(5 6)" />
        <path d={tornShape(-50, SPAN * PARALLAX.mid + 2000, 1400, hMid, r, 14, 3)} fill="#2f1a24" />
        <Church x={760} y={hMid(760) + 8} />
        <path d={midTrees.join('')} fill="#22121a" />
      </g>
  )
})

export const NearLayer = memo(function NearLayer() {
  const r = rng(23)
  const f = PARALLAX.near
  const base = ly(470, f)
  const trees: { d: string; x: number }[] = []
  for (let x = 40; x < SPAN * f + 1200; x += 240 + r() * 300) trees.push({ d: deadTree(x, base + 160, 200 + r() * 120, r), x })
  const posts: number[] = []
  for (let x = 0; x < SPAN * f + 1200; x += 70 + r() * 20) posts.push(x)
  return (
    <g>
      <path d={trees.map((t) => t.d).join('')} fill="#0f070b" transform="translate(4 5)" opacity={0.6} />
      <path d={trees.map((t) => t.d).join('')} fill="#1a0f14" />
      <path d={tornShape(-50, SPAN * f + 1400, 1400, hills(5, 12, base + 120), r, 12, 3)} fill="#1c1016" />
      {posts.map((x, i) => (
        <path key={i} d={`M${x} ${base + 130} L${x + 2} ${base + 88 + (i % 3) * 3} L${x + 7} ${base + 86 + (i % 3) * 3} L${x + 8} ${base + 130}Z`} fill="#140a0f" />
      ))}
      <path d={`M0 ${base + 100} L${SPAN * f + 1200} ${base + 104}`} stroke="#140a0f" strokeWidth={3} />
      <path d={`M0 ${base + 114} L${SPAN * f + 1200} ${base + 112}`} stroke="#140a0f" strokeWidth={3} />
    </g>
  )
})

function Bale({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const lines: string[] = []
  for (let i = 6; i < w; i += 7) lines.push(`M${x + i} ${y + 4} L${x + i - 3} ${y + h - 4}`)
  return (
    <g>
      <rect x={x + 4} y={y + 5} width={w} height={h} rx={10} fill="#1a0f0a" opacity={0.6} />
      <rect x={x} y={y} width={w} height={h} rx={10} fill="#b88a34" />
      <rect x={x} y={y} width={w} height={h * 0.3} rx={8} fill="#cfa24a" />
      <path d={lines.join('')} stroke="#94702a" strokeWidth={1.4} />
      <rect x={x + w * 0.28} y={y} width={5} height={h} fill="#6b4a2b" />
      <rect x={x + w * 0.68} y={y} width={5} height={h} fill="#6b4a2b" />
    </g>
  )
}

function Cart({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <path d={`M${x - 30} ${y + 30} L${x - 70} ${y + 70}`} stroke="#3b2a1c" strokeWidth={7} strokeLinecap="round" />
      <rect x={x + 4} y={y + 5} width={w} height={42} fill="#140a08" opacity={0.6} />
      <rect x={x} y={y} width={w} height={14} fill="#6b4a2b" />
      <path d={`M${x} ${y + 14} L${x + w} ${y + 14} L${x + w - 10} ${y + 44} L${x + 10} ${y + 44}Z`} fill="#4a321c" />
      <path d={`M${x + 50} ${y + 14} L${x + 46} ${y + 44} M${x + 110} ${y + 14} L${x + 110} ${y + 44} M${x + 165} ${y + 14} L${x + 170} ${y + 44}`} stroke="#3b2a1c" strokeWidth={2} />
      <g transform={`translate(${x + 60} ${y + 62}) rotate(14)`}>
        <circle r={38} fill="none" stroke="#3b2a1c" strokeWidth={6} />
        {[0, 45, 90, 135].map((a) => (
          <rect key={a} x={-2} y={-36} width={4} height={72} fill="#3b2a1c" transform={`rotate(${a})`} />
        ))}
        <circle r={7} fill="#2a1d14" />
      </g>
      <g transform={`translate(${x + w - 40} ${y + 92}) scale(1 0.35)`}>
        <circle r={38} fill="none" stroke="#2a1d14" strokeWidth={6} />
      </g>
    </g>
  )
}

function Shrine({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-5} y={-120} width={10} height={120} fill="#4a3626" />
      <rect x={-34} y={-104} width={68} height={8} fill="#4a3626" />
      {/* the Corn Mother: a woven dolly lashed to the post */}
      <g transform="translate(0 -96)">
        <path d="M0 -50 Q-14 -50 -12 -34 Q-10 -26 -4 -24 L-16 20 Q0 26 16 20 L4 -24 Q10 -26 12 -34 Q14 -50 0 -50Z" fill="#c9a24a" />
        <path d="M-4 -24 L-16 20 Q-8 23 -2 23Z" fill="#a8822e" />
        <path d="M-8 -16 L8 -16 M-10 -6 L10 -6 M-12 4 L12 4 M-14 14 L14 14" stroke="#8a6a24" strokeWidth={1.4} />
        <path d="M-4 -22 L-26 -4 M4 -22 L26 -4" stroke="#c9a24a" strokeWidth={4} strokeLinecap="round" />
        <path d="M-6 -24 L6 -24 L10 -10 L4 -14 L-4 -14 L-10 -10Z" fill="#8e2a2a" />
        <path d="M-8 -12 L-14 6 M8 -12 L14 6" stroke="#8e2a2a" strokeWidth={2} />
      </g>
      {[-26, 22, 34].map((cx, i) => (
        <g key={cx} transform={`translate(${cx} 0)`}>
          <rect x={-3} y={-14 - i * 4} width={6} height={14 + i * 4} fill="#e9dcc0" />
          <circle cy={-22 - i * 4} r={9} fill="#ffb347" opacity={0.25} className="candle" style={{ animationDelay: `${i * 0.3}s` }} />
          <path d={`M0 ${-26 - i * 4} Q3 ${-20 - i * 4} 0 ${-16 - i * 4} Q-3 ${-20 - i * 4} 0 ${-26 - i * 4}Z`} fill="#ffd27a" className="candle" style={{ animationDelay: `${i * 0.3}s` }} />
        </g>
      ))}
    </g>
  )
}

function Branch({ x, y, w }: { x: number; y: number; w: number }) {
  const r = rng(77)
  const trunkX = x + w + 60
  return (
    <g>
      <path d={deadTree(trunkX + 30, GROUND_Y + 4, 520, r)} fill="#1a0f14" opacity={0.85} />
      <path d={`M${trunkX - 24} ${GROUND_Y + 4} Q${trunkX - 10} ${y + 60} ${trunkX - 30} ${y - 120} L${trunkX + 6} ${y - 130} Q${trunkX + 24} ${y + 80} ${trunkX + 40} ${GROUND_Y + 4}Z`} fill="#2b1d16" />
      <path d={`M${trunkX - 16} ${y + 26} Q${x + w * 0.5} ${y + 22} ${x - 10} ${y + 6} L${x - 12} ${y - 2} Q${x + w * 0.5} ${y - 4} ${trunkX - 12} ${y + 6}Z`} fill="#3b2a20" />
      <path d={`M${x + 30} ${y + 12} q-4 30 6 46 M${x + 34} ${y + 58} l-6 22`} stroke="#6b5a3e" strokeWidth={1.2} fill="none" />
      <path d={`M${x + 26} ${y + 80} l8 0 l-1 -4 l-6 0z`} fill="#8e2a2a" />
    </g>
  )
}

export const WorldStatic = memo(function WorldStatic() {
  const r = rng(41)
  const ground = (x: number) => GROUND_Y + Math.sin(x * 0.01) * 1.5
  const tufts: string[] = []
  for (let x = -100; x < LEVEL.width + 200; x += 8 + r() * 18) {
    const h = 6 + r() * 16
    const lean = (r() - 0.5) * 8
    tufts.push(`M${(x - 2).toFixed(0)} ${GROUND_Y + 2}L${(x + lean).toFixed(1)} ${(GROUND_Y - h).toFixed(1)}L${(x + 2).toFixed(0)} ${GROUND_Y + 2}Z`)
  }
  const furrows: string[] = []
  for (let y = GROUND_Y + 26; y < GROUND_Y + 160; y += 18 + r() * 10) furrows.push(`M-100 ${y.toFixed(0)} L${LEVEL.width + 200} ${(y + (r() - 0.5) * 6).toFixed(0)}`)
  const bales = LEVEL.platforms.filter((p) => p.kind === 'bale')
  const cart = LEVEL.platforms.find((p) => p.kind === 'cart')!
  const branch = LEVEL.platforms.find((p) => p.kind === 'branch')!
  return (
    <g>
      <Branch x={branch.x} y={branch.y} w={branch.w} />
      <Shrine x={LEVEL.shrine.x} y={LEVEL.shrine.y} />
      <Cart x={cart.x} y={cart.y} w={cart.w} />
      {bales.map((b, i) => (
        <Bale key={i} {...b} />
      ))}
      <path d={tornShape(-200, LEVEL.width + 200, GROUND_Y + 400, ground, r, 12, 2)} fill="#140b08" transform="translate(0 -4)" />
      <path d={tornShape(-200, LEVEL.width + 200, GROUND_Y + 400, ground, r, 12, 2)} fill="#2b1d14" />
      <path d={furrows.join('')} stroke="#21160f" strokeWidth={3} />
      <path d={tufts.join('')} fill="#4a3b1c" />
      {Array.from({ length: 12 }, (_, i) => {
        const x = 120 + i * 230 + r() * 80
        return <path key={i} d={blob(x, GROUND_Y + 40 + r() * 70, 10 + r() * 8, 5 + r() * 3, r, 9, 0.2)} fill="#3a2a1c" />
      })}
    </g>
  )
})

export const Foreground = memo(function Foreground() {
  const r = rng(91)
  const f = PARALLAX.fore
  const base = ly(650, f)
  const stalks: string[] = []
  const heads: string[] = []
  for (let x = -100; x < SPAN * f; x += 60 + r() * 160) {
    if (r() < 0.55) continue
    const cluster = 2 + Math.floor(r() * 4)
    for (let i = 0; i < cluster; i++) {
      const sx = x + i * (5 + r() * 6)
      const h = 40 + r() * 70
      const lean = (r() - 0.5) * 24
      stalks.push(`M${sx.toFixed(0)} ${base + 80}Q${(sx + lean * 0.4).toFixed(1)} ${(base - h * 0.5).toFixed(1)} ${(sx + lean).toFixed(1)} ${(base - h).toFixed(1)}`)
      heads.push(blob(sx + lean, base - h - 6, 3.2, 9, r, 8, 0.15))
    }
  }
  return (
    <g className="wheat-sway">
      <path d={stalks.join('')} stroke="#0d0608" strokeWidth={2.4} fill="none" />
      <path d={heads.join('')} fill="#0d0608" />
    </g>
  )
})
