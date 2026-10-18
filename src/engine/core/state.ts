import { PLAYER, QUESTS } from '../../data'

/**
 * Everything that makes one playthrough different from another, as plain
 * data. This is what gets saved; the engine rebuilds the world around it.
 */
export interface GameState {
  version: 1
  /** 'town', 'barrow' or `in:<building>`. */
  level: string
  player: {
    /** Where you're standing; left out until the first save, so you start at the level's spawn. */
    at?: { x: number; y: number; z: number; yaw: number }
    hp: number
    maxHp: number
    stamina: number
    maxStamina: number
    gold: number
    level: number
    /** Skill raises since the last level. */
    raises: number
  }
  skills: Record<string, { value: number; progress: number }>
  /** Item id → how many you carry. */
  inventory: Record<string, number>
  /** Quest id → current stage. */
  quests: Record<string, string>
  /** One-off facts about the world: `met:<npc>`, `taken:ring`, `searched:jory`. */
  flags: Record<string, boolean>
  journal: string[]
  time: { minutes: number; day: number }
}

export function newGame(): GameState {
  return {
    version: 1,
    level: PLAYER.level,
    player: { hp: PLAYER.hp, maxHp: PLAYER.hp, stamina: PLAYER.stamina, maxStamina: PLAYER.stamina, gold: PLAYER.gold, level: 1, raises: 0 },
    skills: Object.fromEntries(PLAYER.skills.map((s) => [s.id, { value: s.value, progress: 0 }])),
    inventory: { ...PLAYER.inventory },
    quests: Object.fromEntries(Object.entries(QUESTS).map(([id, q]) => [id, q.stages[0]])),
    flags: {},
    journal: [...PLAYER.journal],
    time: { ...PLAYER.time },
  }
}

/** Fills in anything an older save is missing (new quests, new skills). */
export function upgrade(s: GameState): GameState {
  const fresh = newGame()
  return {
    ...fresh,
    ...s,
    player: { ...fresh.player, ...s.player },
    skills: { ...fresh.skills, ...s.skills },
    quests: { ...fresh.quests, ...s.quests },
  }
}

export const count = (s: GameState, item: string) => s.inventory[item] ?? 0

export function give(s: GameState, item: string, n = 1) {
  s.inventory[item] = count(s, item) + n
  if (s.inventory[item] <= 0) delete s.inventory[item]
}
