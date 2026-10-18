import type { Outfit } from './art'

export type Role = 'reeve' | 'innkeeper' | 'merchant' | 'guard' | 'priest' | 'folk'
export type QuestStage = 'none' | 'accepted' | 'found' | 'done'

export interface NpcDef {
  id: string
  name: string
  title: string
  role: Role
  outfit: Outfit
  home: { x: number; z: number }
  /** How far from home they wander; 0 stands still. */
  wander: number
  greeting: string[]
}

export interface Place {
  id: string
  name: string
  x: number
  z: number
}

export const PLACES: Place[] = [
  { id: 'goose', name: 'the Gilded Goose', x: -9, z: -24 },
  { id: 'hall', name: "the Reeve's Hall", x: 10, z: -24 },
  { id: 'temple', name: 'the Temple of the Lantern', x: 18, z: 6 },
  { id: 'smithy', name: "Hobb's smithy", x: -16, z: 8 },
  { id: 'market', name: 'the market', x: 0, z: 2 },
  { id: 'barrow', name: 'the Hollow Barrow', x: 0, z: 92 },
]

const SKIN = ['#f0c8a0', '#d9a77a', '#a8754e', '#7a5236', '#f4d4b4']

export const NPCS: NpcDef[] = [
  {
    id: 'reeve',
    name: 'Aldous Penhallow',
    title: 'Reeve of Brindle',
    role: 'reeve',
    outfit: { skin: SKIN[0], hair: '#9a9a9a', top: '#3a3a6a', trim: '#e0b04a', legs: '#2b2b33', hat: 'tall', beard: true, chain: true },
    home: { x: 6, z: -24 },
    wander: 1.5,
    greeting: ['Ah. A traveller. Splendid. Do you happen to be any good at finding things?', 'Yes, yes, what is it? I am a very busy man. Extremely busy. Mostly worrying.'],
  },
  {
    id: 'tansy',
    name: 'Mother Tansy',
    title: 'keeper of the Gilded Goose',
    role: 'innkeeper',
    outfit: { skin: SKIN[1], hair: '#6b3a2a', top: '#a84a3a', trim: '#f4ecd6', legs: '#5a3d26', hat: 'kerchief', dress: true, apron: true },
    home: { x: -6, z: -22 },
    wander: 1,
    greeting: ['Come in out of the weather, love. Well. Stand near the door, anyway.', "You look like you've walked a long way. You look like you've walked it badly, too."],
  },
  {
    id: 'wilmot',
    name: 'Wilmot Crane',
    title: 'purveyor of sundries',
    role: 'merchant',
    outfit: { skin: SKIN[2], hair: '#2b2118', top: '#3f7a5a', trim: '#c94a3a', legs: '#5a4330', hat: 'wide', basket: true },
    home: { x: -6, z: 5 },
    wander: 2,
    greeting: ['Draughts, tinctures, whetstones, and string! Everyone needs string.', 'Wilmot Crane, purveyor of sundries. You look like a woman in need of sundries.'],
  },
  {
    id: 'holt',
    name: 'Sergeant Holt',
    title: 'of the south gate',
    role: 'guard',
    outfit: { skin: SKIN[3], hair: '#2b2118', top: '#7a2a2a', trim: '#e0b04a', legs: '#2b2b33', hat: 'helm', spear: true },
    home: { x: 4.5, z: 37 },
    wander: 0,
    greeting: ["Move along. Or don't. I'm not your mother.", "Gate's open. Barrow's that way. If you die, I'm not carrying you back."],
  },
  {
    id: 'pike',
    name: 'Pike',
    title: 'of the north gate',
    role: 'guard',
    outfit: { skin: SKIN[4], hair: '#c9a24a', top: '#7a2a2a', trim: '#e0b04a', legs: '#2b2b33', hat: 'helm', spear: true },
    home: { x: -4.5, z: -37 },
    wander: 0,
    greeting: ['Halt! Oh. Sorry. Force of habit. Carry on.', "Nothing ever comes through the north gate. That's what makes it the best gate."],
  },
  {
    id: 'ide',
    name: 'Sister Ide',
    title: 'of the Temple of the Lantern',
    role: 'priest',
    outfit: { skin: SKIN[0], hair: '#2b2118', top: '#f4ecd6', trim: '#e0b04a', legs: '#f4ecd6', hat: 'hood', dress: true },
    home: { x: 13, z: 6 },
    wander: 1.5,
    greeting: ['The Lantern keeps you, child. Mostly. Within reason.', 'Light and warmth to you. You smell of the road.'],
  },
  {
    id: 'hobb',
    name: 'Hobb',
    title: 'the smith',
    role: 'folk',
    outfit: { skin: SKIN[2], hair: '#2b2118', top: '#5a5a60', trim: '#3a2a1c', legs: '#3a2a1c', hat: 'none', beard: true, apron: true },
    home: { x: -11, z: 8 },
    wander: 2,
    greeting: ['Mind the anvil. It bites.', "If you've come about the noise, it's called work."],
  },
  {
    id: 'nell',
    name: 'Old Nell',
    title: 'who has seen things',
    role: 'folk',
    outfit: { skin: SKIN[4], hair: '#e8e8e8', top: '#6a4a7a', trim: '#b8903a', legs: '#3a2a1c', hat: 'hood', dress: true },
    home: { x: 6, z: 12 },
    wander: 3,
    greeting: ['I knew your grandmother. Or someone very like her. Probably.', 'Sit down, sit down. Not there.'],
  },
  {
    id: 'bram',
    name: 'Bram',
    title: "the miller's lad",
    role: 'folk',
    outfit: { skin: SKIN[1], hair: '#b8582a', top: '#c9a24a', trim: '#3f7a5a', legs: '#5a4330', hat: 'cap' },
    home: { x: -4, z: 18 },
    wander: 6,
    greeting: ["Is that a real sword? Can I hold it? I won't stab anyone. Much.", "You're not from round here. Nobody's not from round here."],
  },
  {
    id: 'mags',
    name: 'Mags Fennimore',
    title: 'who sells eggs',
    role: 'folk',
    outfit: { skin: SKIN[3], hair: '#2b2118', top: '#3a6a8a', trim: '#f4ecd6', legs: '#5a4330', hat: 'kerchief', dress: true, basket: true },
    home: { x: 7, z: -6 },
    wander: 5,
    greeting: ['Eggs? No? Suit yourself. They are very good eggs.', 'Morning. Or whatever it is. I lose track.'],
  },
]

const RUMOURS: Record<QuestStage, string[]> = {
  none: [
    "They say the barrow down the south road is older than the town. Older than the hills, if you ask Nell, which nobody does.",
    'Jory Quickfingers was in the Goose three nights back, buying rounds with money he never earned. Nobody has seen him since.',
    "The Reeve's been in a right state all week. Something about a ring. Man's lost without his paperwork.",
    "Mother Tansy waters the ale. Don't tell her I said.",
    'A traveller with a sword? You want the Reeve. He has been asking anyone who looks remotely capable. The bar is low.',
    'The rats in the barrow are the size of dogs. Small dogs. Very cross ones.',
  ],
  accepted: [
    "Going into the barrow? Mind the dead. They don't like visitors and they've had a long time to think about it.",
    'Jory went south, last anyone saw. Running, with a candle in one hand and his dignity in the other.',
    'The skeletons down there swing slow but hard. Wait for the arm to come up, then get out of the way.',
    'If you find Jory, tell him he owes me four pennies and an apology.',
  ],
  found: ['Is that the Reeve\'s ring? Get it back to him before he worries himself into a puddle.', 'You came back out of the barrow? Most people come back out of it in a sack.'],
  done: [
    "You found the Reeve's ring! Well, aren't you the hero of the hour. The hour's nearly up, mind.",
    "The Reeve's been smiling all day. It's very unsettling.",
    'Poor Jory. Mind you, he did steal from the Reeve. And from me. And from everyone.',
  ],
}

export function rumour(stage: QuestStage) {
  const pool = RUMOURS[stage]
  return pool[Math.floor(Math.random() * pool.length)]
}

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

/** Directions from where the speaker stands, Daggerfall-style. */
export function directions(fromX: number, fromZ: number, place: Place) {
  const dx = place.x - fromX
  const dz = place.z - fromZ
  const dist = Math.hypot(dx, dz)
  // north is -z in this world
  const ang = Math.atan2(dx, -dz)
  const dir = DIRS[(Math.round(ang / (Math.PI / 4)) + 8) % 8]
  if (dist < 8) return `${cap(place.name)}? You're practically standing in it.`
  const how = dist < 25 ? 'just a short walk' : dist < 60 ? 'not far' : 'a fair way'
  return `${cap(place.name)} is ${how} to the ${dir} of here.`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
