export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type PlatformKind = 'ground' | 'bale' | 'cart' | 'branch'

export interface Platform extends Rect {
  kind: PlatformKind
  oneWay?: boolean
}

/** Physics body. `x` is the horizontal centre, `y` is the feet. */
export interface Body {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  onGround: boolean
}

export type PlayerState = 'move' | 'roll' | 'attack' | 'hurt' | 'heal' | 'rest' | 'dead'
export type AttackId = 'light1' | 'light2' | 'light3' | 'heavy' | 'air'

export interface Player {
  body: Body
  facing: 1 | -1
  state: PlayerState
  /** Time spent in the current state. */
  t: number
  hp: number
  maxHp: number
  stamina: number
  maxStamina: number
  stamDelay: number
  flasks: number
  maxFlasks: number
  invuln: number
  attack: AttackId | null
  hitDone: boolean
  healed: boolean
  coyote: number
  jumping: boolean
  runPhase: number
  landT: number
  airT: number
  wasOnGround: boolean
  dropT: number
  lockOn: boolean
  rollDir: 1 | -1
}

export type EnemyMoveId = 'lunge' | 'swipes' | 'leap' | 'overhead' | 'backstep'
export type EnemyState = 'dormant' | 'stalk' | 'move' | 'stagger' | 'dead'

export interface Enemy {
  body: Body
  facing: 1 | -1
  state: EnemyState
  t: number
  hp: number
  maxHp: number
  poise: number
  maxPoise: number
  poiseRegen: number
  move: EnemyMoveId | null
  seg: number
  segT: number
  /** Duration of the current segment (some are randomised per use). */
  segDur: number
  hitDone: boolean
  cooldown: number
  flash: number
  wobble: number
  headTwitch: number
  headTwitchT: number
  walkPhase: number
  spawnX: number
  spawnY: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  life: number
  max: number
  size: number
  color: string
  kind: 'straw' | 'ink' | 'scrap' | 'dust' | 'spark'
  gravity: number
}

export interface Splat {
  x: number
  y: number
  r: number
  rot: number
  seed: number
  age: number
}

export type GameEvent =
  | { type: 'swing'; heavy: boolean }
  | { type: 'hit'; heavy: boolean; crit: boolean }
  | { type: 'hurt' }
  | { type: 'roll' }
  | { type: 'jump' }
  | { type: 'land' }
  | { type: 'heal' }
  | { type: 'rest' }
  | { type: 'tele'; move: EnemyMoveId }
  | { type: 'enemyStrike' }
  | { type: 'slam' }
  | { type: 'stagger' }
  | { type: 'aggro' }
  | { type: 'harvested' }
  | { type: 'death' }
  | { type: 'noStamina' }
  | { type: 'lock'; on: boolean }

export interface World {
  time: number
  freeze: number
  shake: number
  player: Player
  enemy: Enemy
  particles: Particle[]
  splats: Splat[]
  cam: { x: number; y: number }
  view: { w: number; h: number }
  events: GameEvent[]
  debug: boolean
  deaths: number
  kills: number
}

export interface Level {
  width: number
  height: number
  platforms: Platform[]
  shrine: { x: number; y: number }
  playerSpawn: { x: number; y: number }
  enemySpawn: { x: number; y: number }
}
