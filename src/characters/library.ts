import type { Expression, Pose } from './types'

/**
 * Named poses and expressions the script can call for. Poses are drawn for a
 * character facing right: negative shoulder angles swing the arm forward.
 */

const p = (front: [number, number], back: [number, number], frontHand: Pose['frontHand'] = 'open', backHand: Pose['backHand'] = 'open', lean = 0): Pose => ({
  front: { s: front[0], e: front[1] },
  back: { s: back[0], e: back[1] },
  frontHand,
  backHand,
  lean,
})

export const POSES = {
  rest: p([-6, -6], [8, 6]),
  holdBox: p([-62, -58], [-48, -66], 'fist', 'fist'),
  raiseBox: p([-158, -12], [-148, -18], 'fist', 'fist', 4),
  present: p([-78, -34], [10, 8], 'open'),
  point: p([-96, -10], [10, 6], 'point'),
  pointUp: p([-24, -150], [12, 6], 'point'),
  wag: p([-30, -132], [12, 8], 'point'),
  shrug: p([-34, -96], [34, 96], 'open', 'open'),
  hips: p([-38, 108], [36, -108], 'fist', 'fist'),
  reach: p([-64, -18], [8, 6], 'open', 'open', -6),
  pushLever: p([-48, -40], [8, 6], 'open', 'open', -4),
  slump: p([-74, -24], [-66, -30], 'open', 'open', -18),
  phone: p([-18, -118], [-10, -112], 'fist', 'point'),
  raiseCard: p([-150, -40], [10, 8], 'fist'),
  slam: p([-78, -14], [12, 6], 'open', 'open', -10),
  thumbsUp: p([-40, -124], [10, 8], 'thumb'),
  facepalm: p([-22, -162], [10, 8], 'open'),
  armsOut: p([-110, -20], [-100, -20], 'open', 'open'),
  // Linda's mug
  mug: p([-24, -118], [8, 6], 'fist'),
  sip: p([-42, -138], [8, 6], 'fist'),
  paper: p([-36, -84], [-26, -92], 'fist', 'fist'),
  carry: p([-56, -64], [-48, -70], 'fist', 'fist'),
  tableArms: p([-50, -80], [-44, -86], 'open', 'open'),
} satisfies Record<string, Pose>

export type PoseName = keyof typeof POSES

const e = (o: Partial<Expression>): Expression => ({
  browFront: 0,
  browBack: 0,
  tiltFront: 0,
  tiltBack: 0,
  lids: 0.12,
  lidTilt: 0,
  pupil: 1,
  mouth: 'closed',
  ...o,
})

export const EXPRESSIONS = {
  neutral: e({}),
  happy: e({ mouth: 'smile', browFront: 4, browBack: 4 }),
  proud: e({ mouth: 'grin', browFront: 8, browBack: 8, lids: 0.18 }),
  excited: e({ mouth: 'grin', browFront: 12, browBack: 12, lids: 0, pupil: 0.9 }),
  deadpan: e({ mouth: 'flat', lids: 0.5, browFront: -2, browBack: -2 }),
  skeptical: e({ mouth: 'flat', lids: 0.45, browFront: 14, browBack: -4, tiltFront: -6 }),
  annoyed: e({ mouth: 'frown', lids: 0.35, lidTilt: 10, browFront: -6, browBack: -6, tiltFront: -14, tiltBack: -14 }),
  angry: e({ mouth: 'frown', lids: 0.25, lidTilt: 18, browFront: -10, browBack: -10, tiltFront: -22, tiltBack: -22, pupil: 0.8 }),
  strained: e({ mouth: 'grin', lids: 0.1, browFront: 6, browBack: 6, tiltFront: 14, tiltBack: 14, sweat: true }),
  worried: e({ mouth: 'frown', browFront: 8, browBack: 8, tiltFront: 18, tiltBack: 18, sweat: true }),
  shocked: e({ mouth: 'shock', lids: 0, browFront: 18, browBack: 18, pupil: 0.6 }),
  sad: e({ mouth: 'frown', lids: 0.35, browFront: 6, browBack: 6, tiltFront: 20, tiltBack: 20, tear: true }),
  twitch: e({ mouth: 'grin', lids: 0.05, browFront: 10, browBack: -4, tiltFront: 10, pupil: 0.6, twitch: true }),
  defeated: e({ mouth: 'frown', lids: 0.55, browFront: 2, browBack: 2, tiltFront: 12, tiltBack: 12 }),
  asleep: e({ mouth: 'closed', lids: 1 }),
  stuffed: e({ mouth: 'full', lids: 0.2, browFront: 10, browBack: 10, tiltFront: 14, tiltBack: 14, tear: true }),
  smug: e({ mouth: 'smile', lids: 0.45, browFront: 6, browBack: -2 }),
} satisfies Record<string, Expression>

export type ExpressionName = keyof typeof EXPRESSIONS
