import { INK } from '../engine/svg'
import { hands, leg, stroke } from './parts'
import type { Design } from './rig'

/** Frank Dorsey: a big, optimistic dad with a comb-over and a polo shirt one size too small. */
const skin = '#f3c39a'
const shirt = '#3fa3b8'
const shirtDark = '#2f8496'
const khaki = '#cdb37c'
const khakiDark = '#b49a63'
const shoe = '#5b3a22'
const hair = '#4a2f1d'

export const frank: Design = {
  id: 'frank',
  skin,
  hips: { back: [-34, -190], front: [30, -186], len: 182 },
  legBack: leg(184, khakiDark, '#4a2e1a'),
  legFront: leg(180, khaki, shoe),
  torso: `
    <path d="M-112 -205 L112 -205 L106 -168 L-106 -168Z" fill="${khaki}" ${stroke}/>
    <path d="M-104 -186 L104 -186" stroke="#6b4426" stroke-width="12"/>
    <rect x="22" y="-194" width="22" height="16" rx="3" fill="#d8b04a" ${stroke}/>
    <path d="M-62 -404 Q-104 -380 -118 -300 Q-134 -230 -110 -188 Q0 -172 112 -192 Q150 -240 140 -300 Q126 -380 66 -406 Q0 -420 -62 -404Z" fill="${shirt}" ${stroke}/>
    <path d="M-118 -300 Q-130 -240 -110 -192 Q-90 -230 -98 -300Z" fill="${shirtDark}"/>
    <path d="M40 -230 Q90 -236 120 -262" fill="none" stroke="${shirtDark}" stroke-width="4" stroke-linecap="round"/>
    <path d="M-30 -408 L-6 -360 L22 -410 Z" fill="${skin}" ${stroke}/>
    <path d="M-42 -410 L-8 -388 L-16 -362 L-50 -392Z M24 -412 L50 -396 L36 -366 L10 -386Z" fill="#f4f1e8" ${stroke}/>
    <path d="M-6 -360 L-6 -318" stroke="${shirtDark}" stroke-width="4"/>
    <circle cx="2" cy="-344" r="4" fill="#f4f1e8" stroke="${INK}" stroke-width="2"/>
    <circle cx="2" cy="-326" r="4" fill="#f4f1e8" stroke="${INK}" stroke-width="2"/>`,
  shoulders: { back: [-72, -388], front: [64, -384] },
  upper: 100,
  fore: 92,
  upperBack: `<rect x="-13" y="40" width="26" height="70" rx="13" fill="#e2ad85" ${stroke}/><path d="M-26 -14 Q-32 48 -22 64 L22 64 Q30 48 24 -14Z" fill="${shirtDark}" ${stroke}/>`,
  upperFront: `<rect x="-13" y="40" width="26" height="70" rx="13" fill="${skin}" ${stroke}/><path d="M-26 -14 Q-32 48 -22 64 L22 64 Q30 48 24 -14Z" fill="${shirt}" ${stroke}/>`,
  foreBack: `<rect x="-12" y="-10" width="24" height="104" rx="12" fill="#e2ad85" ${stroke}/>`,
  foreFront: `<rect x="-12" y="-10" width="24" height="104" rx="12" fill="${skin}" ${stroke}/><path d="M-4 30 l3 6 M4 48 l3 6 M-3 64 l3 6" stroke="${hair}" stroke-width="2" stroke-linecap="round"/>`,
  hands: hands(skin),
  neck: [10, -398],
  headBack: `
    <path d="M-72 -150 Q-86 -110 -74 -78 L-60 -84 Q-66 -120 -58 -150Z" fill="${hair}" ${stroke}/>
    <ellipse cx="-62" cy="-104" rx="17" ry="25" fill="${skin}" ${stroke}/>
    <path d="M-64 -116 Q-52 -104 -62 -92" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  face: `
    <path d="M-56 -8 Q-78 -54 -70 -128 Q-58 -206 6 -210 Q72 -210 84 -140 Q94 -82 80 -34 Q64 10 12 8 Q-38 10 -56 -8Z" fill="${skin}" ${stroke}/>
    <path d="M-52 -44 Q-44 2 12 4 Q62 2 78 -40 Q66 -10 12 -14 Q-28 -14 -52 -44Z" fill="#9f8a78" opacity="0.45"/>
    <path d="M-40 -26 Q-20 -4 16 -2" fill="none" stroke="#c99a76" stroke-width="3" stroke-linecap="round"/>`,
  eyes: [
    { x: 10, y: -126, rx: 26, ry: 30 },
    { x: 56, y: -124, rx: 28, ry: 32 },
  ],
  headFront: `
    <path d="M62 -106 Q100 -110 98 -84 Q96 -64 70 -70" fill="${skin}" ${stroke}/>
    <path d="M-52 -188 Q0 -228 66 -190" fill="none" stroke="${hair}" stroke-width="6" stroke-linecap="round"/>
    <path d="M-50 -176 Q4 -218 72 -178" fill="none" stroke="${hair}" stroke-width="5" stroke-linecap="round"/>
    <path d="M-46 -164 Q10 -206 70 -166" fill="none" stroke="${hair}" stroke-width="4" stroke-linecap="round"/>`,
  mouth: { x: 40, y: -42, w: 50 },
  brows: { width: 42, thick: 9, colour: hair, gap: 0 },
}
