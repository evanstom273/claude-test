import { actorUnits } from '../units'

export interface AttackDef {
  damage: number
  stamina: number
  windup: number
  active: number
  recovery: number
  /** Metres from the body to the centre of the hit. */
  reach: number
  /** Metres. */
  radius: number
  /** Degrees either side combined. */
  arc: number
  poise: number
  /** Metres per second of knockback given. */
  recoil: number
}

export type WeaponArt = 'wand' | 'seal' | 'sword' | 'shield' | 'dagger' | 'staff' | 'spear' | 'mace' | 'greatblade'

export interface WeaponDef {
  id: string
  name: string
  art: WeaponArt
  /** Catalysts cast the selected spell instead of swinging. */
  catalyst?: { basic: string }
  light: AttackDef
  /** Held past `chargeThreshold`, the release becomes this. */
  charged?: AttackDef
  chargeThreshold: number
}

const atk = (damage: number, stamina: number, w: number, a: number, r: number, reach: number, radius: number, arc: number, poise: number, recoil = 180): AttackDef => ({
  damage,
  stamina,
  windup: w,
  active: a,
  recovery: r,
  reach: actorUnits(reach),
  radius: actorUnits(radius),
  arc,
  poise,
  recoil: recoil / 128,
})

export const WEAPONS: Record<string, WeaponDef> = {
  pilgrim_wand: { id: 'pilgrim_wand', name: 'Pilgrim Wand', art: 'wand', catalyst: { basic: 'glimmer' }, light: atk(110, 12, 0.06, 0.07, 0.12, 34, 15, 70, 30), chargeThreshold: 0.3 },
  ashen_seal: { id: 'ashen_seal', name: 'Ashen Seal', art: 'seal', catalyst: { basic: 'votive_spark' }, light: atk(110, 18, 0.1, 0.1, 0.18, 38, 26, 112, 48, 240), chargeThreshold: 0.45 },
  wanderer_sword: {
    id: 'wanderer_sword',
    name: 'Wanderer Sword',
    art: 'sword',
    light: atk(110, 22, 0.1, 0.1, 0.18, 42, 22, 112, 30),
    charged: atk(185, 32, 0.24, 0.16, 0.38, 48, 24, 112, 45),
    chargeThreshold: 0.45,
  },
  court_shield_bash: {
    id: 'court_shield_bash',
    name: 'Court Shield',
    art: 'shield',
    light: atk(110, 18, 0.1, 0.1, 0.18, 38, 26, 112, 48, 240),
    charged: atk(110, 34, 0.24, 0.14, 0.34, 44, 30, 112, 90, 420),
    chargeThreshold: 0.45,
  },
}
