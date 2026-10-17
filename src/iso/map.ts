import { rng } from '../render/paper'

/** Tile footprint on screen: a 2:1 diamond. */
export const TW = 64
export const TH = 32

export const toScreen = (gx: number, gy: number) => ({ x: (gx - gy) * (TW / 2), y: (gx + gy) * (TH / 2) })

export type Ground = 'grass' | 'path' | 'furrow' | 'floor' | 'water'

export type PropKind = 'tree' | 'wall' | 'corn' | 'hay' | 'fence' | 'well' | 'shrine' | 'decoy' | 'pumpkin' | 'table' | 'bed' | 'chair' | 'reeds'

export interface Prop {
  id: number
  kind: PropKind
  tx: number
  ty: number
  /** Draw order: larger is nearer the viewer. */
  depth: number
  solid: boolean
  /** Tall things that hide the player fade or cut away when you're behind them. */
  tall: boolean
  seed: number
  /** Fence orientation, wall face, etc. */
  variant: number
}

export interface IsoMap {
  w: number
  h: number
  ground: Ground[][]
  props: Prop[]
  /** Solid tiles for collision. */
  solid: boolean[][]
  /** Corn slows you down but can be walked through. */
  slow: boolean[][]
  house: { x0: number; y0: number; x1: number; y1: number }
  shrine: { x: number; y: number }
  playerSpawn: { x: number; y: number }
  enemySpawn: { x: number; y: number }
}

export const MAP_W = 30
export const MAP_H = 26

export function buildMap(): IsoMap {
  const r = rng(1312)
  const w = MAP_W
  const h = MAP_H
  const ground: Ground[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 'grass' as Ground))
  const occupied: (Prop | null)[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => null))
  const props: Prop[] = []
  let id = 0
  const SOLID: Record<PropKind, boolean> = { tree: true, wall: true, corn: false, hay: true, fence: true, well: true, shrine: true, decoy: true, pumpkin: false, table: true, bed: true, chair: true, reeds: false }
  const TALL: Partial<Record<PropKind, boolean>> = { tree: true, wall: true, corn: true, decoy: true }
  const put = (kind: PropKind, tx: number, ty: number, variant = 0) => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h || occupied[ty][tx]) return
    const p: Prop = { id: id++, kind, tx, ty, depth: tx + ty + 1, solid: SOLID[kind], tall: !!TALL[kind], seed: r() * 1000, variant }
    occupied[ty][tx] = p
    props.push(p)
  }
  const fill = (g: Ground, x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ground[y][x] = g
  }

  // the cottage: walls round a plank floor, door on the south side
  const house = { x0: 2, y0: 2, x1: 8, y1: 7 }
  fill('floor', house.x0 + 1, house.y0 + 1, house.x1 - 1, house.y1 - 1)
  ground[house.y1][5] = 'floor'
  for (let x = house.x0; x <= house.x1; x++) {
    put('wall', x, house.y0, 0)
    if (x !== 5) put('wall', x, house.y1, 0)
  }
  for (let y = house.y0 + 1; y < house.y1; y++) {
    put('wall', house.x0, y, 1)
    put('wall', house.x1, y, 1)
  }
  put('bed', 7, 3)
  put('table', 4, 4)
  put('chair', 4, 5)

  // the lane from the door down to the field, then east
  fill('path', 5, 8, 6, 12)
  fill('path', 5, 12, 27, 13)

  // vegetable patch with the last pumpkins
  fill('furrow', 11, 2, 15, 7)
  for (let y = 2; y <= 7; y++) for (let x = 11; x <= 15; x++) if (r() < 0.3) put('pumpkin', x, y)

  // the shrine by the lane
  const shrine = { x: 9, y: 10 }
  put('shrine', shrine.x, shrine.y)
  put('well', 13, 9)

  // pond with reeds
  for (let y = 16; y <= 22; y++)
    for (let x = 2; x <= 8; x++) {
      const dx = (x - 5) / 3.4
      const dy = (y - 19) / 3.2
      const d = dx * dx + dy * dy
      if (d < 1) ground[y][x] = 'water'
      else if (d < 1.5 && r() < 0.5) put('reeds', x, y)
    }

  // the real one stands in the clearing, dressed exactly like the decoys
  const enemySpawn = { x: 14.5, y: 18.5 }
  const decoys: [number, number][] = [[20, 4], [25, 8], [21, 19], [26, 22], [10, 18]]
  for (const [x, y] of decoys) put('decoy', x, y)

  // two cornfields, a lane through the north one
  for (let y = 2; y <= 10; y++)
    for (let x = 18; x <= 27; x++) {
      if (y === 6) continue
      if (r() < 0.93) put('corn', x, y)
    }
  for (let y = 15; y <= 23; y++)
    for (let x = 19; x <= 27; x++) {
      if (x === 23 && y < 21) continue
      if (r() < 0.93) put('corn', x, y)
    }

  // fences
  for (let x = 10; x <= 16; x++) put('fence', x, 8, 0)
  for (let y = 15; y <= 23; y++) if (y !== 18) put('fence', 17, y, 1)

  // hay in the clearing
  for (const [x, y] of [[11, 15], [12, 15], [16, 21], [16, 22], [11, 22]] as [number, number][]) put('hay', x, y)

  // the wood all round
  for (let x = 0; x < w; x++) {
    put('tree', x, 0)
    put('tree', x, h - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    put('tree', 0, y)
    put('tree', w - 1, y)
  }
  for (const [x, y] of [[1, 9], [2, 13], [8, 15], [9, 23], [24, 14], [28, 13], [13, 23], [1, 23], [10, 1], [16, 1], [17, 14]] as [number, number][]) put('tree', x, y)

  const solid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => ground[y][x] === 'water' || !!occupied[y][x]?.solid))
  const slow = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => occupied[y][x]?.kind === 'corn'))

  props.sort((a, b) => a.depth - b.depth || a.tx - b.tx)
  return { w, h, ground, props, solid, slow, house, shrine, playerSpawn: { x: 8.5, y: 11.5 }, enemySpawn }
}
