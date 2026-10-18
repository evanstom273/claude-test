/**
 * Loads the game's JSON resources and checks that they hang together:
 * every item, quest, building, skill and spot they mention must exist.
 * A broken reference fails loudly at startup rather than mid-game.
 */

import buildingsJson from './buildings.json'
import dialogueJson from './dialogue.json'
import enemiesJson from './enemies.json'
import itemsJson from './items.json'
import levelsJson from './levels.json'
import npcsJson from './npcs.json'
import placesJson from './places.json'
import playerJson from './player.json'
import propsJson from './props.json'
import questsJson from './quests.json'
import rumoursJson from './rumours.json'
import type { BuildingDef, Cond, DialogueData, Effect, EnemyDef, EnemyKind, ItemDef, LevelDef, NpcDef, Place, PlayerDef, PropDef, QuestDef, Rule } from './types'

export * from './types'

const as = <T,>(v: unknown) => v as T

export const BUILDINGS = as<BuildingDef[]>(buildingsJson)
export const DIALOGUE = as<DialogueData>(dialogueJson)
export const ENEMIES = as<Record<EnemyKind, EnemyDef>>(enemiesJson)
export const ITEMS = as<Record<string, ItemDef>>(itemsJson)
export const LEVELS = as<Record<'town' | 'barrow' | 'interior', LevelDef>>(levelsJson)
export const NPCS = as<NpcDef[]>(npcsJson)
export const PLACES = as<Place[]>(placesJson)
export const PLAYER = as<PlayerDef>(playerJson)
export const PROPS = as<Record<string, PropDef>>(propsJson)
export const QUESTS = as<Record<string, QuestDef>>(questsJson)
/** Quest id → stage → things people say. */
export const RUMOURS = as<Record<string, Record<string, string[]>>>({ signet: rumoursJson })

export const levelDef = (id: string) => (id === 'town' ? LEVELS.town : id === 'barrow' ? LEVELS.barrow : LEVELS.interior)

// ------------------------------------------------------------- validation

function validate() {
  const errors: string[] = []
  const skills = new Set(PLAYER.skills.map((s) => s.id))
  const buildings = new Set(BUILDINGS.map((b) => b.id))
  const levelOk = (id: string) => id === 'town' || id === 'barrow' || id === 'in:{id}' || (id.startsWith('in:') && buildings.has(id.slice(3)))

  const cond = (c: Cond | undefined, at: string) => {
    if (!c) return
    for (const [q, st] of Object.entries(c.quest ?? {})) {
      if (!QUESTS[q]) errors.push(`${at}: unknown quest "${q}"`)
      else for (const s of [st].flat()) if (!QUESTS[q].stages.includes(s)) errors.push(`${at}: quest "${q}" has no stage "${s}"`)
    }
    for (const it of [c.has, c.lacks]) if (it && !ITEMS[it]) errors.push(`${at}: unknown item "${it}"`)
  }
  const effects = (list: Effect[] | undefined, at: string) => {
    for (const e of list ?? []) {
      if ('give' in e && !ITEMS[e.give]) errors.push(`${at}: unknown item "${e.give}"`)
      if ('take' in e && !ITEMS[e.take]) errors.push(`${at}: unknown item "${e.take}"`)
      if ('train' in e && !skills.has(e.train)) errors.push(`${at}: unknown skill "${e.train}"`)
      if ('travel' in e && !levelOk(e.travel)) errors.push(`${at}: unknown level "${e.travel}"`)
      if ('quest' in e && 'stage' in e) cond({ quest: { [e.quest]: e.stage } }, at)
      if ('if' in e) {
        cond(e.if, at)
        effects(e.do, at)
        effects(e.else, at)
      }
    }
  }
  const rule = (r: Rule, at: string) => {
    cond(r.when, at)
    effects(r.do, at)
  }

  for (const t of DIALOGUE.topics) {
    rule(t, `dialogue topic "${t.id}"`)
    cond(t.show, `dialogue topic "${t.id}"`)
    if (t.rumour && !RUMOURS[t.rumour]) errors.push(`dialogue topic "${t.id}": no rumours for quest "${t.rumour}"`)
  }
  for (const [id, p] of Object.entries(PROPS)) {
    p.use.forEach((r) => rule(r, `prop "${id}"`))
    cond(p.gone, `prop "${id}"`)
  }
  for (const [q, stages] of Object.entries(RUMOURS)) for (const s of QUESTS[q]?.stages ?? []) if (!stages[s]?.length) errors.push(`rumours: nothing to say for quest "${q}" at "${s}"`)
  for (const n of NPCS) if (n.inside && !buildings.has(n.inside)) errors.push(`npc "${n.id}": unknown building "${n.inside}"`)
  for (const it of Object.keys(PLAYER.inventory)) if (!ITEMS[it]) errors.push(`player: unknown item "${it}"`)
  if (!levelOk(PLAYER.level) || !levelOk(PLAYER.respawn.level)) errors.push('player: unknown start or respawn level')
  if (errors.length) throw new Error(`Bad game data:\n${errors.join('\n')}`)
}

validate()
