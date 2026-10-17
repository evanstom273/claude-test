import type { Level } from './types'

export const GROUND_Y = 620

/** The prototype's single room: a moonlit field between the shrine and the orchard. */
export const LEVEL: Level = {
  width: 2600,
  height: 760,
  platforms: [
    { kind: 'ground', x: -200, y: GROUND_Y, w: 3000, h: 300 },
    // stacked hay bales
    { kind: 'bale', x: 640, y: 545, w: 160, h: 75 },
    { kind: 'bale', x: 675, y: 470, w: 90, h: 75 },
    // abandoned cart
    { kind: 'cart', x: 1720, y: 520, w: 210, h: 18, oneWay: true },
    // low branch of the dead apple tree
    { kind: 'branch', x: 2160, y: 440, w: 190, h: 16, oneWay: true },
  ],
  shrine: { x: 260, y: GROUND_Y },
  playerSpawn: { x: 340, y: GROUND_Y },
  enemySpawn: { x: 1350, y: GROUND_Y },
}
