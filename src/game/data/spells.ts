export type School = 'magic' | 'fire' | 'holy'

export type SpellDelivery =
  | { kind: 'projectile'; speed: number; radius: number; range: number; pierce: number }
  /** A ring that grows outwards from the caster, hitting each target once. */
  | { kind: 'wave'; radius: number; speed: number }
  | { kind: 'self'; heal: number }

export interface SpellDef {
  id: string
  name: string
  school: School
  /** Unlimited; supplied by a catalyst rather than prepared. */
  basic?: boolean
  uses: number
  stamina: number
  windup: number
  active: number
  recovery: number
  damage: number
  poise: number
  delivery: SpellDelivery
  /** Glow colours: core and halo. */
  colour: [string, string]
  description: string
}

export const SPELLS: Record<string, SpellDef> = {
  glimmer: {
    id: 'glimmer',
    name: 'Glimmer',
    school: 'magic',
    basic: true,
    uses: -1,
    stamina: 8,
    windup: 0.18,
    active: 0.08,
    recovery: 0.24,
    damage: 50,
    poise: 12,
    delivery: { kind: 'projectile', speed: 14.38, radius: 0.11, range: 15.8, pierce: 0 },
    colour: ['#e6f2ff', '#7fb2ff'],
    description: 'A small mote of light. The wand never runs out of these.',
  },
  votive_spark: {
    id: 'votive_spark',
    name: 'Votive Spark',
    school: 'holy',
    basic: true,
    uses: -1,
    stamina: 8,
    windup: 0.18,
    active: 0.08,
    recovery: 0.24,
    damage: 48,
    poise: 12,
    delivery: { kind: 'projectile', speed: 14.38, radius: 0.11, range: 15.8, pierce: 0 },
    colour: ['#fff6d8', '#e3c580'],
    description: 'A votive flame flicked from the seal. Unlimited.',
  },
  cinder_lance: {
    id: 'cinder_lance',
    name: 'Cinder Lance',
    school: 'fire',
    uses: 16,
    stamina: 16,
    windup: 0.22,
    active: 0.1,
    recovery: 0.25,
    damage: 180,
    poise: 40,
    delivery: { kind: 'projectile', speed: 13.75, radius: 0.19, range: 22, pierce: 0 },
    colour: ['#fff0c0', '#ff7a2a'],
    description: 'A spear of packed embers, hurled straight.',
  },
  ember_wave: {
    id: 'ember_wave',
    name: 'Ember Wave',
    school: 'fire',
    uses: 10,
    stamina: 22,
    windup: 0.22,
    active: 0.1,
    recovery: 0.25,
    damage: 160,
    poise: 55,
    delivery: { kind: 'wave', radius: 3.28, speed: 9 },
    colour: ['#ffd27a', '#e0521f'],
    description: 'A ring of fire rolls out from you.',
  },
  mending_light: {
    id: 'mending_light',
    name: 'Mending Light',
    school: 'holy',
    uses: 8,
    stamina: 18,
    windup: 0.55,
    active: 0.1,
    recovery: 0.25,
    damage: 0,
    poise: 0,
    delivery: { kind: 'self', heal: 180 },
    colour: ['#fffbe6', '#e3c580'],
    description: 'Restores 180 health.',
  },
}
