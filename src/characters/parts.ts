import { INK, LINE } from '../engine/svg'
import type { HandShape } from './types'

/** Shared bits of body markup, so everyone in the show is drawn the same way. */

export const stroke = `stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round" stroke-linecap="round"`

/** Cartoon mitten hands in four shapes, hanging from the wrist at (0, 0). */
export function hands(skin: string): Record<HandShape, string> {
  const palm = `<path d="M-15 -2 Q-19 18 -12 32 Q0 42 13 32 Q19 16 15 -2Z" fill="${skin}" ${stroke}/>`
  const fist = `<path d="M-16 0 Q-20 22 -6 30 Q8 34 16 22 Q20 8 15 -2Z" fill="${skin}" ${stroke}/><path d="M-12 14 Q-4 18 4 14 M-10 22 Q-2 26 6 22" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`
  return {
    open: `${palm}<path d="M12 2 Q30 2 28 16 Q24 24 13 18" fill="${skin}" ${stroke}/><path d="M-6 20 L-6 34 M2 22 L2 36" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
    fist,
    point: `${fist}<path d="M-6 26 Q-8 52 -2 56 Q6 58 7 50 Q8 36 6 26Z" fill="${skin}" ${stroke}/>`,
    thumb: `${fist}<path d="M10 22 Q12 46 18 50 Q26 50 24 40 Q22 28 18 18Z" fill="${skin}" ${stroke}/>`,
  }
}

/** A trouser leg with a shoe, hanging from the hip at (0, 0). */
export function leg(len: number, cloth: string, shoe: string, width = 60, shoeLen = 62) {
  const w = width / 2
  return `<path d="M${-w} -14 L${w} -14 L${w - 4} ${len - 18} L${-w + 4} ${len - 18}Z" fill="${cloth}" ${stroke}/>
    <path d="M${-w + 2} ${len - 26} Q${-w - 2} ${len + 2} ${-w + 10} ${len + 4} L${shoeLen - 8} ${len + 4} Q${shoeLen + 4} ${len + 2} ${shoeLen} ${len - 12} Q${shoeLen - 8} ${len - 28} ${w - 6} ${len - 28}Z" fill="${shoe}" ${stroke}/>`
}
