import { Director } from '../engine/director'
import { COUNTER_TOP, FLOOR } from '../scene/kitchen'

/**
 * Episode 1: "Smart Toast". Frank buys a smart toaster. It does not go well.
 * Only direction lives here: who stands where, who says what, and when.
 */

export const VOICES = {
  frank: { name: 'FRANK', rate: 9 },
  linda: { name: 'LINDA', rate: 7.5 },
  cat: { name: 'PROFESSOR', rate: 4.5 },
  toaster: { name: 'TOAST-O-MATIC', rate: 10 },
}

// set positions
const SMART_X = 1400
const OLD_X = 960
const CAT_X = 1150
const ON_COUNTER = COUNTER_TOP - 6
const FRANK_AT = 1740
const LINDA_SEAT = 400
const LINDA_AT = 810

// camera shots
const WIDE = [960, 540, 1] as const
const FRANK_CU = [FRANK_AT - 60, 470, 2] as const
const LINDA_CU = [LINDA_SEAT + 30, 420, 2] as const
const TOASTER_CU = [SMART_X + 20, 560, 2.6] as const
const TWO_SHOT = [1490, 520, 1.45] as const
const COUNTER = [1250, 520, 1.5] as const

export function smartToast() {
  const d = new Director(VOICES)
  const cam = (s: readonly [number, number, number], dur = 0) => d.cam(s[0], s[1], s[2], dur)

  // ---- cast and props ----
  d.actor('frank', 2200, FLOOR, -1, 'holdBox', 'excited')
  d.actor('linda', LINDA_SEAT, FLOOR, 1, 'mug', 'deadpan')
  d.prop('box', 'frank.front', -70, 80)
  d.prop('mug', 'linda.front', 0, 30)
  d.prop('paper', 'tabletop', 380, 772, -90)
  d.showProp('paper', false)
  d.prop('phone', 'frank.front', 0, 36)
  d.showProp('phone', false)
  d.prop('card', 'frank.front', 0, 40)
  d.showProp('card', false)
  d.prop('smart', 'counter', SMART_X, ON_COUNTER)
  d.showProp('smart', false)
  d.prop('old', 'counter', OLD_X, ON_COUNTER)
  d.prop('puff', 'fx', SMART_X, ON_COUNTER - 80)
  d.showProp('puff', false)
  d.prop('flyToast', 'fx', SMART_X, ON_COUNTER - 140)
  d.showProp('flyToast', false)
  d.prop('catToast', 'fx', OLD_X - 24, ON_COUNTER - 120)
  d.showProp('catToast', false)

  const screen = d.track('screen.text', '')
  const progress = d.track('screen.progress', 0)
  const bar = d.track('screen.bar', false)
  const lever = d.track('smart.lever', 0)
  const shake = d.track('smart.shake', 0)
  const led = d.track('smart.led', '#3ad06a')
  const sBread = d.track('smart.bread', false)
  const sPop = d.track('smart.pop', 0)
  const oLever = d.track('old.lever', 0)
  const oBread = d.track('old.bread', false)
  const oToasted = d.track('old.toasted', false)
  const oPop = d.track('old.pop', 0)
  const catLids = d.track('cat.lids', 0.55)
  const catLook = d.track('cat.look', 0)
  const catMouth = d.track<'closed' | 'open' | 'chew' | 'yawn'>('cat.mouth', 'closed')
  const catPaw = d.track('cat.paw', 0)
  const catTilt = d.track('cat.tilt', 0)
  const catHolding = d.track('cat.holding', false)
  const clock = d.track('clock', 7 * 60 + 5)
  d.track('cat.x', CAT_X)
  d.track('cat.facing', -1)

  // ---- cold open: title ----
  d.card('title', true, 0)
  d.sfx('theme', 0.1)
  d.wait(3.6)
  d.card('title', false, 0.4)
  cam(WIDE)
  d.wait(0.5)

  // ---- setup ----
  // Linda at the table with her coffee. Slurp.
  d.pose('linda', 'sip', 0.4).wait(0.4)
  d.sfx('slurp').wait(0.8)
  d.pose('linda', 'mug', 0.4).wait(0.2)
  // Frank barges in with a box
  d.look('linda', 0.8)
  const walkIn = d.walk('frank', FRANK_AT, 340)
  d.wait(walkIn)
  d.squash('frank', 0.94, 0.08).squash('frank', 1, 0.15, d.t + 0.08)
  d.pose('frank', 'raiseBox', 0.35, 'back').face('frank', 'proud').look('frank', 0.7, -0.3).tilt('frank', -6)
  d.place('box', 'frank.front', -50, -6, 0, d.t + 0.15)
  d.wait(0.3)
  d.say('frank', 'Linda! Behold... the future of breakfast!', { hold: 0.5 })
  d.tilt('frank', 0)

  cam(LINDA_CU)
  d.wait(0.5)
  d.say('linda', "It's a toaster, Frank.", { hold: 0.4 })

  cam(FRANK_CU)
  d.pose('frank', 'holdBox', 0.3).face('frank', 'excited')
  d.place('box', 'frank.front', -70, 80, 0, d.t + 0.15)
  d.wait(0.2)
  d.say('frank', "It's a SMART toaster.", { hold: 0.1 })
  d.pose('frank', 'raiseBox', 0.25, 'back').tilt('frank', 5, 0.2)
  d.place('box', 'frank.front', -50, -6, 0, d.t + 0.1)
  d.say('frank', 'It has an app!', { hold: 0.5 })
  d.tilt('frank', 0)

  cam(LINDA_CU)
  d.face('linda', 'skeptical').wait(0.4)
  d.say('linda', "Toast doesn't need an app.", { hold: 0.4 })

  cam(FRANK_CU)
  d.face('frank', 'annoyed').pose('frank', 'holdBox', 0.25)
  d.place('box', 'frank.front', -70, 80, 0, d.t + 0.1)
  d.wait(0.2)
  d.say('frank', "That's what they said about doorbells!", { hold: 0.6 })

  // Linda's reply is a slurp
  cam(LINDA_CU)
  d.face('linda', 'deadpan').pose('linda', 'sip', 0.4).wait(0.4)
  d.sfx('slurp').wait(0.9)
  d.pose('linda', 'mug', 0.35).look('linda', -0.25, 0.1).wait(0.9)

  // ---- unboxing ----
  cam(TWO_SHOT)
  d.face('frank', 'excited').look('frank', 0.6, 0.2)
  d.pose('frank', 'reach', 0.35)
  d.place('box', 'counter', SMART_X, ON_COUNTER, 0, d.t + 0.3)
  d.wait(0.4)
  d.sfx('puff')
  d.showProp('puff', true).showProp('box', false).showProp('smart', true)
  d.showProp('puff', false, d.t + 0.4)
  d.pose('frank', 'present', 0.3, 'back').face('frank', 'proud')
  d.wait(0.5)
  screen.add(d.t, 'HELLO!')
  led.add(d.t, '#3ad06a')
  d.sfx('boot').wait(1.1)
  // push the lever
  d.pose('frank', 'pushLever', 0.3).look('frank', 0.7, 0.5)
  sBread.add(d.t, true)
  lever.add(d.t + 0.25, 1, 0.12, 'in')
  d.sfx('clunk', d.t + 0.3).wait(0.7)
  lever.add(d.t, 0, 0.1, 'out')
  d.sfx('error')
  screen.add(d.t, 'UPDATE\nREQUIRED')
  led.add(d.t, '#e8a33a')
  d.pose('frank', 'rest', 0.3).face('frank', 'neutral')
  d.wait(0.4)
  cam(TOASTER_CU)
  d.say('toaster', 'Update required.', { hold: 0.4 })
  screen.add(d.t, 'UPDATING...\n1%')
  bar.add(d.t, true)
  progress.add(d.t, 0.01)
  d.sfx('beep').wait(1.2)

  cam(FRANK_CU)
  d.face('frank', 'strained').look('frank', 0.7, 0.4)
  d.wait(0.4)
  d.say('frank', "One percent. That's... that's a start.", { hold: 0.6 })

  cam(LINDA_CU)
  d.pose('linda', 'sip', 0.4).wait(0.4)
  d.sfx('slurp').wait(1.1)

  // ---- forty minutes later ----
  d.card('later', true, 0.15)
  d.sfx('whoosh')
  d.wait(0.15)
  // during the card: time passes, everyone settles in
  clock.add(d.t, 7 * 60 + 45)
  d.pose('frank', 'slump', 0).face('frank', 'defeated', 0).look('frank', 0.6, 0.6, 0)
  d.place('mug', 'tabletop', 560, 776, 0)
  d.place('paper', 'linda.front', 0, 60, 0)
  d.showProp('paper', true)
  d.pose('linda', 'paper', 0).face('linda', 'neutral', 0).look('linda', 0.6, 0.2, 0)
  catLids.add(d.t, 1)
  screen.add(d.t, 'UPDATING...\n1%')
  d.wait(2)
  d.card('later', false, 0.15)
  cam(WIDE)
  d.wait(0.2)
  d.sfx('tick').sfx('tick', d.t + 1).sfx('tick', d.t + 2)
  d.wait(2.2)
  // the bar creeps
  d.sfx('beep')
  screen.add(d.t, 'UPDATING...\n2%')
  progress.add(d.t, 0.02, 0.2)
  d.wait(0.15)
  cam(FRANK_CU)
  d.pose('frank', 'armsOut', 0.25, 'back').face('frank', 'excited').look('frank', 0.7, 0.3).squash('frank', 1.05, 0.1).squash('frank', 1, 0.2, d.t + 0.1)
  d.wait(0.2)
  d.say('frank', 'Two percent!!', { hold: 0.5 })
  d.pose('frank', 'rest', 0.3)

  // ---- the account ----
  cam(TOASTER_CU)
  d.sfx('beep')
  screen.add(d.t, 'CREATE\nACCOUNT')
  bar.add(d.t, false)
  led.add(d.t, '#3ad06a')
  d.wait(0.3)
  d.say('toaster', 'Please create an account to continue toasting.', { hold: 0.4 })

  cam(FRANK_CU)
  d.face('frank', 'annoyed').showProp('phone', true).pose('frank', 'phone', 0.3).look('frank', 0.4, 0.8)
  d.wait(0.35)
  const typing = d.t
  const fine = d.say('frank', 'Fine! Username: Frank. Password: ...Toast.', { hold: 0.4 })
  for (let k = 0; k < fine; k += 0.45) d.sfx('typing', typing + k)
  screen.add(typing + 1, 'USER:\nFRANK')
  screen.add(typing + fine - 0.6, 'PASS:\n*****')

  cam(TOASTER_CU)
  d.sfx('buzz')
  screen.add(d.t, 'PASSWORD\nTOO WEAK')
  led.add(d.t, '#e24b3a')
  d.wait(0.4)
  d.say('toaster', 'Password too weak. Must contain a number, a symbol, and a childhood trauma.', { hold: 0.3 })

  // the pause
  cam(FRANK_CU)
  d.face('frank', 'deadpan').look('frank', 0.7, 0.2)
  d.wait(1.3)
  cam(LINDA_CU)
  d.pose('linda', 'mug', 0.3).look('linda', 0.9, -0.1).face('linda', 'skeptical')
  d.wait(1)
  cam(FRANK_CU)
  d.face('frank', 'sad', 0.4).look('frank', 0.3, 0.8).tilt('frank', 8, 0.5)
  d.wait(0.6)
  const confess = d.t
  const sad = d.say('frank', '...My dad never came to my recitals.', { hold: 0.9, rate: 6.5 })
  for (let k = 0.4; k < sad; k += 0.5) d.sfx('typing', confess + k)
  d.tilt('frank', 0)

  cam(TOASTER_CU)
  d.sfx('ding')
  screen.add(d.t, 'ACCEPTED\n:)')
  led.add(d.t, '#3ad06a')
  d.wait(0.3)
  d.say('toaster', 'Accepted.', { hold: 0.5 })
  screen.add(d.t, 'LIGHT: FREE\nGOLDEN: $9.99')
  d.sfx('beep')
  d.say('toaster', 'Light toast is free. Golden brown is nine ninety-nine a month.', { hold: 0.4 })

  // ---- payment ----
  cam(FRANK_CU)
  d.showProp('phone', false, d.t + 0.15)
  d.face('frank', 'angry').pose('frank', 'rest', 0.25)
  d.wait(0.3)
  d.showProp('card', true)
  d.pose('frank', 'raiseCard', 0.3, 'back').look('frank', 0.7, -0.5)
  d.wait(0.3)
  d.say('frank', 'Fine! Golden brown!', { hold: 0.05 })
  cam(TWO_SHOT)
  d.say('frank', 'Take my money!', { hold: 0 })
  d.pose('frank', 'slam', 0.12, 'in').look('frank', 0.7, 0.5)
  d.wait(0.12)
  d.sfx('thwack').squash('frank', 0.92, 0.06).squash('frank', 1, 0.2, d.t + 0.06)
  shake.add(d.t, 2).add(d.t + 0.3, 0)
  d.wait(0.7)
  d.showProp('card', false)
  d.pose('frank', 'rest', 0.3).face('frank', 'proud')

  cam(TOASTER_CU)
  d.sfx('chime')
  screen.add(d.t, 'THANK YOU!')
  d.wait(0.3)
  d.say('toaster', 'Thank you!', { hold: 0.2 })
  screen.add(d.t, 'TOAST ETA:\n5-7 DAYS')
  d.say('toaster', 'Your toast will arrive in five to seven business days.', { hold: 0.3 })

  // the twitch, in silence
  cam(FRANK_CU)
  d.face('frank', 'twitch', 0.1).look('frank', 0.75, 0.1).shake('frank', 1.5)
  d.wait(1.8)
  d.shake('frank', 0)

  // ---- Linda takes over ----
  cam(LINDA_CU)
  d.face('linda', 'deadpan').look('linda', -0.2)
  d.place('paper', 'tabletop', 380, 772, -90)
  d.place('mug', 'linda.front', 0, 30)
  d.pose('linda', 'mug', 0.3)
  d.wait(0.4)
  d.say('linda', "I'll make breakfast.", { hold: 0.2 })
  cam(WIDE, 0.6)
  d.place('mug', 'linda.back', 0, 30)
  d.pose('linda', 'rest', 0.3)
  d.look('frank', -0.2, 0.2).face('frank', 'defeated')
  const lindaWalk = d.walk('linda', LINDA_AT, 300)
  d.look('linda', 0.6, 0.2)
  d.wait(lindaWalk)
  cam(COUNTER, 0.5)
  d.pose('linda', 'pushLever', 0.3)
  oBread.add(d.t, true)
  oLever.add(d.t + 0.25, 1, 0.1, 'in')
  d.sfx('clunk', d.t + 0.3)
  d.wait(0.6)
  // it just works. instantly.
  d.sfx('ding')
  oLever.add(d.t, 0, 0.08, 'out')
  oToasted.add(d.t, true)
  oPop.add(d.t, 1, 0.12, 'out')
  d.pose('linda', 'rest', 0.3).face('linda', 'smug')
  d.wait(0.2)
  // ...and the cat
  catLids.add(d.t - 0.3, 0, 0.1)
  catLook.add(d.t - 0.3, 0.9)
  oBread.add(d.t, false)
  d.place('catToast', 'fx', OLD_X - 24, ON_COUNTER - 140)
  d.showProp('catToast', true)
  catPaw.add(d.t, 1, 0.1, 'out').add(d.t + 0.15, 0, 0.2)
  catMouth.add(d.t, 'open')
  d.fly('catToast', CAT_X - 10, ON_COUNTER - 90, 30, 0.35, 120)
  d.sfx('whoosh')
  d.wait(0.3)
  d.showProp('catToast', false)
  catHolding.add(d.t, true)
  catMouth.add(d.t, 'closed')
  catLook.add(d.t, 0)
  d.sfx('crunch')
  d.face('linda', 'shocked').look('linda', 0.8, 0.4)
  d.wait(0.8)
  cam([CAT_X + 20, 520, 2.6])
  catLids.add(d.t, 0.45, 0.2)
  catTilt.add(d.t, -6, 0.3)
  d.wait(0.5)
  d.say('cat', 'Free tier.', { hold: 0.7 })

  cam(FRANK_CU)
  d.face('frank', 'shocked').look('frank', 0.9, 0.3).pose('frank', 'point', 0.2)
  d.wait(0.2)
  d.say('frank', 'Did the cat just—', { hold: 0 })
  // the smart toaster finally has something to say about that
  cam(TWO_SHOT)
  d.sfx('rumble')
  shake.add(d.t, 3)
  screen.add(d.t, 'TOAST\nREADY!!')
  led.add(d.t, '#ffd23a')
  d.look('frank', 0.7, 0.4).face('frank', 'worried').pose('frank', 'rest', 0.2)
  sPop.add(d.t, 0)
  d.wait(1.1)
  shake.add(d.t, 0)
  sPop.add(d.t, 1, 0.1, 'out')
  d.place('flyToast', 'fx', SMART_X + 20, ON_COUNTER - 150, 0)
  d.showProp('flyToast', true)
  sBread.add(d.t, false)
  d.sfx('whoosh')
  // it lands in his mouth and stays there
  d.fly('flyToast', FRANK_AT - 74, FLOOR - 426, 380, 0.35, 220)
  d.face('frank', 'shocked')
  d.wait(0.35)
  d.sfx('thwack')
  d.face('frank', 'stuffed').squash('frank', 0.9, 0.06).squash('frank', 1, 0.25, d.t + 0.06).tilt('frank', -10, 0.1).tilt('frank', 0, 0.4, d.t + 0.1)
  d.wait(0.8)

  cam(TOASTER_CU)
  screen.add(d.t, 'RATE US!\n* * * * *')
  d.sfx('chime')
  d.wait(0.2)
  d.say('toaster', 'Toast delivered! Please rate your experience.', { hold: 0.4 })

  cam(FRANK_CU)
  d.pose('frank', 'thumbsUp', 0.3, 'back').look('frank', -0.2, 0)
  d.wait(0.4)
  d.say('frank', 'Mmff. Five stars.', { hold: 0.6, muffled: true })

  // Linda gets the last word, which is a slurp
  cam(COUNTER, 0)
  d.place('mug', 'linda.front', 0, 30)
  d.face('linda', 'deadpan').pose('linda', 'sip', 0.4).look('linda', -0.3, 0.1)
  d.wait(0.4)
  d.sfx('slurp')
  d.wait(1.4)
  d.card('end', true, 0.3)
  d.sfx('sting')
  d.wait(4)

  return { director: d, length: d.finish(d.t) }
}
