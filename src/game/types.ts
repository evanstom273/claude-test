export type Phase = 'night' | 'dawn' | 'over'

export interface Player {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  fuel: number
  maxFuel: number
  invuln: number
  flareCd: number
}

export interface Ember {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  value: number
  phase: number
}

export type ShadeKind = 'shade' | 'wraith' | 'hulk'

export interface Shade {
  id: number
  kind: ShadeKind
  x: number
  y: number
  vx: number
  vy: number
  r: number
  hp: number
  maxHp: number
  speed: number
  seed: number
  age: number
  burning: number
  hurtFlash: number
  lastFlare: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  drag: number
}

export interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

export interface Tree {
  x: number
  y: number
  r: number
  hue: number
  rot: number
}

export interface Rock {
  x: number
  y: number
  r: number
  points: string
}

export interface Mushroom {
  x: number
  y: number
  size: number
  hue: number
  delay: number
}

export interface Tuft {
  x: number
  y: number
  s: number
  rot: number
}

export interface Patch {
  x: number
  y: number
  rx: number
  ry: number
  color: string
}

export interface Brazier {
  id: number
  x: number
  y: number
  /** Seconds of burn remaining; 0 = unlit. */
  lit: number
  progress: number
}

export interface Solid {
  x: number
  y: number
  r: number
}

export interface World {
  size: number
  trees: Tree[]
  rocks: Rock[]
  mushrooms: Mushroom[]
  tufts: Tuft[]
  patches: Patch[]
  solids: Solid[]
}

export interface Flare {
  id: number
  t: number
  r: number
  max: number
}

export interface Stats {
  lightMul: number
  burnMul: number
  speedMul: number
  drainMul: number
  flareCdMul: number
  flareRadiusMul: number
  magnet: number
  emberMul: number
  armor: number
  sparks: number
  brazierCostMul: number
  brazierRadiusMul: number
}

export type GameEvent =
  | { type: 'pickup' }
  | { type: 'hurt' }
  | { type: 'kill'; kind: ShadeKind }
  | { type: 'flare' }
  | { type: 'brazier' }
  | { type: 'dawn' }
  | { type: 'death' }

export interface GameState {
  phase: Phase
  world: World
  player: Player
  embers: Ember[]
  shades: Shade[]
  particles: Particle[]
  sparks: Spark[]
  braziers: Brazier[]
  flare: Flare | null
  stats: Stats
  taken: Record<string, number>
  night: number
  collected: number
  quota: number
  totalEmbers: number
  kills: number
  score: number
  time: number
  nightTime: number
  spawnTimer: number
  shake: number
  nextId: number
  events: GameEvent[]
}

export interface Input {
  /** Movement vector, length <= 1. */
  mx: number
  my: number
  /** Edge-triggered flare request. */
  flare: boolean
}
