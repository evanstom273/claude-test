import { INK } from '../engine/svg'
import { hands, leg, stroke } from './parts'
import type { Design } from './rig'

/** Linda Dorsey: tall, unflappable, has seen every one of Frank's ideas before. */
const skin = '#f2cbb0'
const cardigan = '#3f8a68'
const cardiganDark = '#2f6e52'
const jeans = '#34466f'
const jeansDark = '#29385a'
const hair = '#6e2b20'
const hairDark = '#561f17'

export const linda: Design = {
  id: 'linda',
  skin,
  hips: { back: [-24, -228], front: [22, -224], len: 222 },
  legBack: leg(226, jeansDark, '#2a1f1a', 48, 52),
  legFront: leg(222, jeans, '#3a2a22', 48, 52),
  torso: `
    <path d="M-62 -244 L62 -244 L58 -212 L-58 -212Z" fill="${jeans}" ${stroke}/>
    <path d="M-44 -440 Q-66 -380 -58 -300 Q-62 -260 -66 -222 L66 -220 Q62 -262 60 -300 Q70 -380 48 -442 Q0 -452 -44 -440Z" fill="#f4f1ea" ${stroke}/>
    <path d="M-48 -442 Q-80 -380 -70 -300 Q-74 -250 -76 -210 L-22 -214 Q-18 -300 -14 -400 Q-24 -430 -48 -442Z" fill="${cardigan}" ${stroke}/>
    <path d="M50 -444 Q84 -380 74 -300 Q76 -250 76 -206 L26 -212 Q22 -300 18 -400 Q26 -432 50 -444Z" fill="${cardigan}" ${stroke}/>
    <path d="M-70 -300 Q-74 -250 -76 -212 L-58 -212 Q-56 -260 -52 -300Z" fill="${cardiganDark}"/>
    <circle cx="-22" cy="-330" r="4" fill="#e8d9a0" stroke="${INK}" stroke-width="2"/>
    <circle cx="-20" cy="-290" r="4" fill="#e8d9a0" stroke="${INK}" stroke-width="2"/>
    <path d="M-14 -448 Q4 -420 20 -448" fill="${skin}" ${stroke}/>`,
  shoulders: { back: [-50, -428], front: [48, -426] },
  upper: 104,
  fore: 100,
  upperBack: `<path d="M-20 -12 Q-24 60 -18 112 L18 112 Q22 60 20 -12Z" fill="${cardiganDark}" ${stroke}/>`,
  upperFront: `<path d="M-20 -12 Q-24 60 -18 112 L18 112 Q22 60 20 -12Z" fill="${cardigan}" ${stroke}/>`,
  foreBack: `<path d="M-17 -8 L-15 92 L15 92 L17 -8Z" fill="${cardiganDark}" ${stroke}/><rect x="-17" y="84" width="34" height="12" rx="4" fill="${cardiganDark}" ${stroke}/>`,
  foreFront: `<path d="M-17 -8 L-15 92 L15 92 L17 -8Z" fill="${cardigan}" ${stroke}/><rect x="-17" y="84" width="34" height="12" rx="4" fill="${cardiganDark}" ${stroke}/>`,
  hands: hands(skin),
  neck: [4, -444],
  headBack: `
    <path d="M-76 -96 Q-92 -206 2 -220 Q92 -218 84 -108 Q84 -40 60 -22 L52 -64 Q62 -150 2 -166 Q-52 -164 -56 -60 L-64 -22 Q-80 -46 -76 -96Z" fill="${hair}" ${stroke}/>
    <path d="M-76 -96 Q-80 -50 -64 -22 L-56 -60 Q-60 -80 -66 -100Z" fill="${hairDark}"/>
    <circle cx="-50" cy="-38" r="13" fill="none" stroke="#e0b44a" stroke-width="5"/>`,
  face: `<path d="M-50 -14 Q-64 -66 -56 -126 Q-46 -188 4 -190 Q58 -188 64 -128 Q70 -62 48 -20 Q28 6 2 6 Q-32 6 -50 -14Z" fill="${skin}" ${stroke}/>
    <ellipse cx="54" cy="-60" rx="9" ry="5" fill="#e79c8e" opacity="0.5"/>`,
  eyes: [
    { x: 4, y: -110, rx: 24, ry: 28 },
    { x: 46, y: -108, rx: 26, ry: 30 },
  ],
  headFront: `<path d="M64 -96 Q78 -76 62 -70" fill="none" ${stroke}/>`,
  mouth: { x: 40, y: -40, w: 40, lip: '#b8352c' },
  brows: { width: 36, thick: 5, colour: hairDark, gap: 0 },
  lashes: true,
  hairFront: `<path d="M-56 -146 Q-44 -204 8 -204 Q68 -202 68 -136 Q48 -160 28 -146 Q10 -166 -10 -150 Q-32 -166 -56 -146Z" fill="${hair}" ${stroke}/>`,
}
