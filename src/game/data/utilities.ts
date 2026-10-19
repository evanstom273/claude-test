export interface UtilityDef {
  id: string
  name: string
  charges: number
  health?: number
  stamina?: number
  useTime: number
  recovery: number
  description: string
}

export const UTILITIES: Record<string, UtilityDef> = {
  healing_flask: { id: 'healing_flask', name: 'Healing Flask', charges: 3, health: 180, useTime: 0.25, recovery: 0.55, description: 'Restores a portion of health.' },
  stamina_tonic: { id: 'stamina_tonic', name: 'Stamina Tonic', charges: 2, stamina: 75, useTime: 0.15, recovery: 0.35, description: 'Restores a portion of stamina.' },
}
