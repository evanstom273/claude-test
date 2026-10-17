import type { GameState } from './types'

export interface Upgrade {
  id: string
  name: string
  desc: string
  glyph: string
  color: string
  max: number
  apply: (s: GameState) => void
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'glow',
    name: 'Wider Glow',
    desc: 'Your light reaches 15% further.',
    glyph: '☼',
    color: '#fde68a',
    max: 4,
    apply: (s) => (s.stats.lightMul *= 1.15),
  },
  {
    id: 'heat',
    name: 'Hotter Flame',
    desc: 'Light, flares and sparks burn shades 30% harder.',
    glyph: '♨',
    color: '#fb923c',
    max: 5,
    apply: (s) => (s.stats.burnMul *= 1.3),
  },
  {
    id: 'wick',
    name: 'Deep Wick',
    desc: '+25 max fuel, and refill to full.',
    glyph: '❂',
    color: '#fbbf24',
    max: 4,
    apply: (s) => {
      s.player.maxFuel += 25
      s.player.fuel = s.player.maxFuel
    },
  },
  {
    id: 'feet',
    name: 'Fleet Foot',
    desc: 'Move 12% faster.',
    glyph: '➶',
    color: '#86efac',
    max: 3,
    apply: (s) => (s.stats.speedMul *= 1.12),
  },
  {
    id: 'slow',
    name: 'Slow Burn',
    desc: 'Your flame drains 15% slower.',
    glyph: '⧗',
    color: '#93c5fd',
    max: 3,
    apply: (s) => (s.stats.drainMul *= 0.85),
  },
  {
    id: 'flare',
    name: 'Sunburst',
    desc: 'Flare recharges 25% faster and reaches 20% further.',
    glyph: '✺',
    color: '#fef08a',
    max: 3,
    apply: (s) => {
      s.stats.flareCdMul *= 0.75
      s.stats.flareRadiusMul *= 1.2
    },
  },
  {
    id: 'magnet',
    name: 'Kindred Pull',
    desc: 'Embers are drawn to you from much further away.',
    glyph: '⊛',
    color: '#f9a8d4',
    max: 3,
    apply: (s) => (s.stats.magnet += 70),
  },
  {
    id: 'rich',
    name: 'Rich Embers',
    desc: 'Embers restore 25% more fuel.',
    glyph: '◆',
    color: '#fdba74',
    max: 3,
    apply: (s) => (s.stats.emberMul *= 1.25),
  },
  {
    id: 'armor',
    name: 'Ironbark Ward',
    desc: 'Shades steal 25% less fuel when they touch you.',
    glyph: '⛨',
    color: '#d6d3d1',
    max: 3,
    apply: (s) => (s.stats.armor = 1 - (1 - s.stats.armor) * 0.75),
  },
  {
    id: 'sparks',
    name: 'Spitfire',
    desc: 'Each ember you collect throws off a homing spark.',
    glyph: '✧',
    color: '#facc15',
    max: 4,
    apply: (s) => (s.stats.sparks += 1),
  },
  {
    id: 'keeper',
    name: 'Brazier Keeper',
    desc: 'Braziers cost 40% less to light and shine 30% wider.',
    glyph: '♆',
    color: '#fca5a5',
    max: 2,
    apply: (s) => {
      s.stats.brazierCostMul *= 0.6
      s.stats.brazierRadiusMul *= 1.3
    },
  },
]

export function rollUpgrades(s: GameState, n = 3): Upgrade[] {
  const pool = UPGRADES.filter((u) => (s.taken[u.id] ?? 0) < u.max)
  const out: Upgrade[] = []
  while (out.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(i, 1)[0])
  }
  return out
}

export function takeUpgrade(s: GameState, u: Upgrade) {
  u.apply(s)
  s.taken[u.id] = (s.taken[u.id] ?? 0) + 1
}
