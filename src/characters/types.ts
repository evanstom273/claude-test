/** Arm angles in degrees. 0 hangs straight down; negative swings forward (towards the way the character faces). */
export interface ArmPose {
  s: number
  e: number
}

export type HandShape = 'open' | 'fist' | 'point' | 'thumb'

export interface Pose {
  front: ArmPose
  back: ArmPose
  frontHand: HandShape
  backHand: HandShape
  /** Lean of the upper body, degrees (negative leans forward). */
  lean: number
}

export type Mouth = 'closed' | 'smile' | 'grin' | 'frown' | 'flat' | 'a' | 'e' | 'i' | 'o' | 'u' | 'shock' | 'full' | 'chew'

export interface Expression {
  /** Brow raise in px (positive up) and tilt in degrees (positive = inner end up, worried). */
  browFront: number
  browBack: number
  tiltFront: number
  tiltBack: number
  /** Top lid: 0 wide open, 1 shut. */
  lids: number
  /** Lid angle: positive = angry slant towards the nose. */
  lidTilt: number
  pupil: number
  mouth: Mouth
  /** Extras drawn on the face. */
  sweat?: boolean
  tear?: boolean
  twitch?: boolean
}

/** Everything about a character at one instant, sampled from the timeline. */
export interface CharacterState {
  x: number
  y: number
  facing: 1 | -1
  pose: Pose
  expression: Expression
  /** Where the pupils point, -1..1 on each axis. */
  lookX: number
  lookY: number
  headTilt: number
  /** Mouth shape while speaking, or null to use the expression's. */
  viseme: Mouth | null
  /** Walking: how far into the stride, and whether to animate legs at all. */
  walk: number
  walking: boolean
  /** 0..1 how shut the eyes are from blinking. */
  blink: number
  /** Squash and stretch, 1 = normal. */
  squash: number
  /** Body shake amplitude, for trembling and twitches. */
  shake: number
  /** Time, for small idle motions. */
  time: number
}
