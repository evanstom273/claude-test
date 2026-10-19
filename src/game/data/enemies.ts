import { actorUnits } from '../units'
import type { School } from './spells'

export type EnemyLook = 'warden' | 'stalker' | 'cantor' | 'effigy'

export interface EnemyAttack {
  damage: number
  school: School | 'physical'
  /** Metres: the attack starts when the target is inside this band. */
  minRange: number
  maxRange: number
  windup: number
  active: number
  recovery: number
  cooldown: number
  /** Melee swings reach this far and this wide; ranged ones throw a bolt instead. */
  reach?: number
  radius?: number
  arc?: number
  bolt?: { speed: number; radius: number }
  /** Steps forward during the active frames, metres per second. */
  lunge?: number
  poise: number
}

export interface EnemyDef {
  id: string
  name: string
  look: EnemyLook
  health: number
  poise: number
  poiseRegen: number
  poiseRegenDelay: number
  staggerDuration: number
  /** Metres per second. */
  speed: number
  radius: number
  sight: number
  /** Gives up and walks home past this distance from its post. */
  leash: number
  embers: number
  attack: EnemyAttack | null
}

const speed = (approach: number) => actorUnits(approach)

export const ENEMIES: Record<string, EnemyDef> = {
  grave_warden: {
    id: 'grave_warden',
    name: 'Grave Warden',
    look: 'warden',
    health: 430,
    poise: 45,
    poiseRegen: 15,
    poiseRegenDelay: 1.5,
    staggerDuration: 0.45,
    speed: speed(85),
    radius: 0.42,
    sight: 9,
    leash: 22,
    embers: 60,
    attack: { damage: 100, school: 'physical', minRange: 0, maxRange: 2.34, windup: 0.55, active: 0.2, recovery: 0.75, cooldown: 1, reach: 1.3, radius: 1.0, arc: 120, lunge: 3, poise: 40 },
  },
  thorn_stalker: {
    id: 'thorn_stalker',
    name: 'Thorn Stalker',
    look: 'stalker',
    health: 260,
    poise: 25,
    poiseRegen: 15,
    poiseRegenDelay: 1.5,
    staggerDuration: 0.4,
    speed: speed(145),
    radius: 0.34,
    sight: 11,
    leash: 26,
    embers: 40,
    attack: { damage: 55, school: 'physical', minRange: 0, maxRange: 1.5, windup: 0.25, active: 0.2, recovery: 0.42, cooldown: 0.25, reach: 0.9, radius: 0.7, arc: 100, lunge: 5, poise: 20 },
  },
  ash_cantor: {
    id: 'ash_cantor',
    name: 'Ash Cantor',
    look: 'cantor',
    health: 300,
    poise: 25,
    poiseRegen: 15,
    poiseRegenDelay: 1.5,
    staggerDuration: 0.4,
    speed: speed(78),
    radius: 0.34,
    sight: 13,
    leash: 24,
    embers: 50,
    attack: { damage: 65, school: 'fire', minRange: 2, maxRange: 12, windup: 0.8, active: 0.2, recovery: 0.9, cooldown: 1, bolt: { speed: 9, radius: 0.22 }, poise: 15 },
  },
  training_effigy: {
    id: 'training_effigy',
    name: 'Training Effigy',
    look: 'effigy',
    health: 1000,
    poise: 1,
    poiseRegen: 1,
    poiseRegenDelay: 0,
    staggerDuration: 0.2,
    speed: 0,
    radius: 0.4,
    sight: 0,
    leash: 0,
    embers: 0,
    attack: null,
  },
}
