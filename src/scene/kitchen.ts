import { f, g, INK, setTransform } from '../engine/svg'
import { stroke } from '../characters/parts'

/**
 * The Dorseys' kitchen, in layers: the back set (wall, window, fridge,
 * counter, door), and a foreground table that people stand behind.
 * World space is 1920x1080; the floor line is y=840 and people stand at y=990.
 */

export const FLOOR = 990
export const COUNTER_TOP = 652

const wall = '#f1d98e'
const wallStripe = '#e8cc7a'
const wood = '#b9763f'
const woodDark = '#94582a'
const tile = '#f4efe2'
const tileDark = '#c9d3cf'

export function backSet() {
  const stripes = Array.from({ length: 33 }, (_, i) => `<rect x="${i * 60}" y="0" width="26" height="840" fill="${wallStripe}"/>`).join('')
  // a perspective chequered floor: horizontal bands and lines fanning out from a point above the set
  const rows = [840, 880, 930, 990, 1060, 1140]
  const bands = rows.slice(0, -1).map((y, r) => {
    const cells: string[] = []
    const y2 = rows[r + 1]
    for (let c = -14; c < 16; c++) {
      const fx = (x: number, yy: number) => 960 + (x - 960) * (1 + (yy - 840) / 500)
      const x0 = c * 128
      const pts = [fx(x0, y), fx(x0 + 128, y), fx(x0 + 128, y2), fx(x0, y2)]
      cells.push(`<path d="M${f(pts[0])} ${y} L${f(pts[1])} ${y} L${f(pts[2])} ${y2} L${f(pts[3])} ${y2}Z" fill="${(c + r) % 2 ? tile : tileDark}"/>`)
    }
    return cells.join('')
  })
  return g(
    { class: 'set' },
    `
    <rect x="0" y="0" width="1920" height="840" fill="${wall}"/>
    ${stripes}
    <rect x="0" y="0" width="1920" height="40" fill="#e3c070"/>
    <rect x="0" y="40" width="1920" height="10" fill="#c9a55a"/>
    ${bands.join('')}
    <rect x="0" y="826" width="1920" height="18" fill="${woodDark}" ${stroke}/>

    <!-- window over the sink, with the neighbours' house outside -->
    <g transform="translate(1100 130)">
      <rect x="-14" y="-14" width="348" height="364" rx="6" fill="#f7f4ec" ${stroke}/>
      <rect x="0" y="0" width="320" height="336" fill="#9fd4ef"/>
      <circle cx="250" cy="70" r="34" fill="#fff6c8"/>
      <path d="M0 190 Q80 160 160 186 Q240 160 320 184 L320 336 L0 336Z" fill="#7fc06a"/>
      <path d="M40 200 L40 130 L110 90 L180 130 L180 200Z" fill="#d97a5a" ${stroke}/>
      <path d="M30 136 L110 82 L190 136" fill="none" stroke="#7a3a2a" stroke-width="10" stroke-linejoin="round"/>
      <rect x="70" y="150" width="30" height="30" fill="#ffe38a" ${stroke}/>
      <rect x="126" y="156" width="26" height="44" fill="#6a4a3a" ${stroke}/>
      <path d="M0 250 Q60 220 120 250 Q180 224 240 252 Q290 230 320 246 L320 336 L0 336Z" fill="#5aa04e" ${stroke}/>
      <rect x="0" y="0" width="320" height="336" fill="none" ${stroke}/>
      <path d="M160 0 L160 336 M0 168 L320 168" stroke="#f7f4ec" stroke-width="14"/>
      <path d="M160 0 L160 336 M0 168 L320 168" stroke="${INK}" stroke-width="2" opacity="0.3"/>
      <path d="M-30 -20 Q60 30 30 230 L-30 230Z" fill="#e05a4a" ${stroke}/>
      <path d="M350 -20 Q260 30 290 230 L350 230Z" fill="#e05a4a" ${stroke}/>
      <path d="M-20 40 Q10 50 20 30 M-24 120 Q12 130 28 110 M340 40 Q310 50 300 30 M344 120 Q310 130 292 110" fill="none" stroke="#fff3" stroke-width="6" stroke-linecap="round"/>
      <rect x="-40" y="-34" width="400" height="16" rx="8" fill="${woodDark}" ${stroke}/>
    </g>

    <!-- upper cupboards -->
    ${[820, 1500].map((x) => `
    <g transform="translate(${x} 70)">
      <rect x="0" y="0" width="230" height="270" fill="${wood}" ${stroke}/>
      <rect x="14" y="14" width="94" height="242" rx="4" fill="#c98a52" ${stroke}/>
      <rect x="122" y="14" width="94" height="242" rx="4" fill="#c98a52" ${stroke}/>
      <circle cx="96" cy="150" r="7" fill="#e8d6a0" ${stroke}/>
      <circle cx="134" cy="150" r="7" fill="#e8d6a0" ${stroke}/>
    </g>`).join('')}

    <!-- counter and lower cupboards -->
    <g>
      <rect x="800" y="670" width="920" height="170" fill="${wood}" ${stroke}/>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="${816 + i * 180}" y="690" width="166" height="136" rx="4" fill="#c98a52" ${stroke}/><rect x="${884 + i * 180}" y="704" width="30" height="8" rx="4" fill="#e8d6a0" ${stroke}/>`).join('')}
      <path d="M786 ${COUNTER_TOP} L1734 ${COUNTER_TOP} L1734 672 L786 672Z" fill="#e8e2d2" ${stroke}/>
      <path d="M800 ${COUNTER_TOP - 22} L1720 ${COUNTER_TOP - 22} L1734 ${COUNTER_TOP} L786 ${COUNTER_TOP}Z" fill="#f6f1e4" ${stroke}/>
      <path d="M1180 ${COUNTER_TOP - 18} L1340 ${COUNTER_TOP - 18} L1330 ${COUNTER_TOP - 4} L1190 ${COUNTER_TOP - 4}Z" fill="#aab4bb" ${stroke}/>
      <path d="M1256 ${COUNTER_TOP - 20} L1256 ${COUNTER_TOP - 84} Q1256 ${COUNTER_TOP - 104} 1236 ${COUNTER_TOP - 104} L1222 ${COUNTER_TOP - 104}" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>
      <path d="M1256 ${COUNTER_TOP - 20} L1256 ${COUNTER_TOP - 84} Q1256 ${COUNTER_TOP - 104} 1236 ${COUNTER_TOP - 104} L1222 ${COUNTER_TOP - 104}" fill="none" stroke="#cfd6dd" stroke-width="8" stroke-linecap="round"/>
    </g>

    <!-- fridge, covered in magnets and a drawing -->
    <g transform="translate(30 250)">
      <rect x="0" y="0" width="250" height="590" rx="22" fill="#eef1ea" ${stroke}/>
      <path d="M0 210 L250 210" stroke="${INK}" stroke-width="${4}"/>
      <rect x="214" y="70" width="14" height="110" rx="7" fill="#c7cdc7" ${stroke}/>
      <rect x="214" y="240" width="14" height="150" rx="7" fill="#c7cdc7" ${stroke}/>
      <path d="M8 20 Q4 120 8 200" stroke="#fff" stroke-width="8" stroke-linecap="round" fill="none"/>
      <g transform="translate(46 260) rotate(-6)">
        <rect x="0" y="0" width="110" height="130" fill="#fff" ${stroke}/>
        <circle cx="34" cy="44" r="16" fill="none" stroke="#e05a4a" stroke-width="4"/>
        <circle cx="76" cy="40" r="20" fill="none" stroke="#3f8a68" stroke-width="4"/>
        <path d="M34 60 L34 104 M76 60 L76 108 M16 80 L52 80 M58 80 L96 80" stroke="#3a6fd8" stroke-width="4" stroke-linecap="round"/>
        <circle cx="55" cy="-2" r="8" fill="#e05a4a" ${stroke}/>
      </g>
      <circle cx="60" cy="70" r="12" fill="#f0c43a" ${stroke}/>
      <rect x="120" y="110" width="40" height="26" rx="4" fill="#4aa0d8" ${stroke}/>
      <circle cx="170" cy="460" r="12" fill="#3f8a68" ${stroke}/>
      <rect x="30" y="582" width="30" height="16" fill="#2a2a2a"/><rect x="190" y="582" width="30" height="16" fill="#2a2a2a"/>
    </g>

    <!-- framed photo of a fish Frank caught -->
    <g transform="translate(330 170) rotate(-3)">
      <rect x="0" y="0" width="120" height="90" fill="${woodDark}" ${stroke}/>
      <rect x="12" y="12" width="96" height="66" fill="#bfe3ef"/>
      <path d="M32 46 Q56 26 82 46 Q56 64 32 46Z M82 46 L96 34 L96 58Z" fill="#e8a33a" ${stroke}/>
      <circle cx="44" cy="44" r="3" fill="${INK}"/>
    </g>

    <!-- doorway to the hall -->
    <g transform="translate(1756 210)">
      <rect x="0" y="0" width="200" height="630" fill="#5a4636"/>
      <rect x="0" y="0" width="200" height="630" fill="#2c2018" opacity="0.5"/>
      <path d="M0 0 L0 630" stroke="${INK}" stroke-width="4"/>
      <rect x="-22" y="-22" width="22" height="652" fill="#f7f4ec" ${stroke}/>
      <rect x="-22" y="-22" width="220" height="22" fill="#f7f4ec" ${stroke}/>
      <path d="M0 0 L58 22 L58 652 L0 630Z" fill="#c98a52" ${stroke}/>
      <circle cx="44" cy="330" r="7" fill="#e8d6a0" ${stroke}/>
    </g>

    <!-- skirting -->
    <rect x="280" y="812" width="520" height="22" fill="#f7f4ec" ${stroke}/>
    `,
  )
}

/** The wall clock: its hands are driven by the timeline so time can visibly pass. */
export class Clock {
  root: SVGGElement
  private hour: SVGGElement
  private minute: SVGGElement

  constructor() {
    this.root = g({ transform: 'translate(600 210)' })
    this.root.innerHTML = `<circle r="74" fill="#e05a4a" ${stroke}/><circle r="60" fill="#fffaf0" ${stroke}/>
      ${Array.from({ length: 12 }, (_, i) => `<path d="M0 -50 L0 ${i % 3 ? -44 : -40}" stroke="${INK}" stroke-width="${i % 3 ? 3 : 5}" transform="rotate(${i * 30})"/>`).join('')}`
    this.hour = g({}, `<path d="M0 6 L0 -30" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`)
    this.minute = g({}, `<path d="M0 8 L0 -46" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`)
    this.root.appendChild(this.hour)
    this.root.appendChild(this.minute)
    this.root.appendChild(g({}, `<circle r="6" fill="${INK}"/>`))
  }

  /** Minutes past midnight. */
  update(minutes: number) {
    setTransform(this.minute, `rotate(${f((minutes % 60) * 6)})`)
    setTransform(this.hour, `rotate(${f(((minutes / 60) % 12) * 30)})`)
  }
}

/** The breakfast table in the foreground: anyone behind it is cut off at the waist. */
export function table() {
  return g(
    { class: 'table' },
    `
    <path d="M130 800 Q130 776 170 774 L660 774 Q700 776 700 800 L712 1090 L118 1090Z" fill="#e05a4a" ${stroke}/>
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<path d="M${150 + i * 64} 776 L${140 + i * 66} 1090" stroke="#fff" stroke-width="18" opacity="0.85"/>`).join('')}
    ${[0, 1, 2, 3, 4].map((i) => `<path d="M128 ${818 + i * 60} L712 ${818 + i * 60}" stroke="#fff" stroke-width="18" opacity="0.6"/>`).join('')}
    <path d="M130 800 Q130 776 170 774 L660 774 Q700 776 700 800 L712 1090 L118 1090Z" fill="none" ${stroke}/>
    <path d="M150 790 Q160 778 180 778 L650 778 Q676 778 682 792Z" fill="#fff" opacity="0.25"/>
    <ellipse cx="560" cy="784" rx="54" ry="11" fill="#f4f1ea" ${stroke}/>
    <ellipse cx="560" cy="781" rx="34" ry="5" fill="#e0d8c4"/>
    `,
  )
}

/** Title and end cards. */
export function titleCard() {
  return g(
    { class: 'card' },
    `
    <rect x="0" y="0" width="1920" height="1080" fill="#3a6fd8"/>
    ${Array.from({ length: 24 }, (_, i) => `<path d="M960 540 L${960 + Math.cos((i / 24) * Math.PI * 2) * 2000} ${540 + Math.sin((i / 24) * Math.PI * 2) * 2000} L${960 + Math.cos(((i + 0.5) / 24) * Math.PI * 2) * 2000} ${540 + Math.sin(((i + 0.5) / 24) * Math.PI * 2) * 2000}Z" fill="#4a80e8"/>`).join('')}
    <g transform="translate(960 470) rotate(-4)">
      <text x="8" y="12" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="200" fill="${INK}">THE DORSEYS</text>
      <text x="0" y="0" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="200" fill="#ffd23a" stroke="${INK}" stroke-width="10" paint-order="stroke">THE DORSEYS</text>
    </g>
    <text x="960" y="660" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-weight="700" font-size="64" fill="#fff" stroke="${INK}" stroke-width="6" paint-order="stroke">in “Smart Toast”</text>
    `,
  )
}

export function textCard(text: string, colour = '#e05a4a') {
  return g(
    { class: 'card' },
    `
    <rect x="0" y="0" width="1920" height="1080" fill="${colour}"/>
    ${Array.from({ length: 16 }, (_, i) => `<rect x="${i * 130 - 40}" y="-100" width="60" height="1300" fill="#fff" opacity="0.08" transform="rotate(18 ${i * 130} 540)"/>`).join('')}
    <text x="960" y="580" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="120" fill="#fff" stroke="${INK}" stroke-width="10" paint-order="stroke">${text}</text>
    `,
  )
}
