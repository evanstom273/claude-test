import { DIALOGUE, PLACES, RUMOURS, type NpcDef, type Place } from '../../data'
import type { GameState } from '../core/state'
import { check } from './rules'

export interface TopicView {
  id: string
  label: string
}

/** What a person will talk about right now, in the order dialogue.json lists them. */
export function topicsFor(s: GameState, npc: NpcDef): TopicView[] {
  return DIALOGUE.topics.filter((t) => (!t.roles || t.roles.includes(npc.role)) && check(s, t.show)).map((t) => ({ id: t.id, label: t.label }))
}

export const topic = (id: string) => DIALOGUE.topics.find((t) => t.id === id)

export function rumour(s: GameState, quest: string) {
  const pool = RUMOURS[quest][s.quests[quest]]
  return pool[Math.floor(Math.random() * pool.length)]
}

export const placeTopics = (): TopicView[] => [...PLACES.map((p) => ({ id: `place:${p.id}`, label: cap(p.name) })), { id: 'back', label: DIALOGUE.places.back }]

export const placeFor = (topicId: string) => PLACES.find((p) => `place:${p.id}` === topicId)

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

/** Directions from where the speaker stands, Daggerfall-style. */
export function directions(fromX: number, fromZ: number, place: Place) {
  const t = DIALOGUE.directions
  const dx = place.x - fromX
  const dz = place.z - fromZ
  const dist = Math.hypot(dx, dz)
  // north is -z in this world
  const ang = Math.atan2(dx, -dz)
  const dir = DIRS[(Math.round(ang / (Math.PI / 4)) + 8) % 8]
  const how = dist < 25 ? t.near : dist < 60 ? t.mid : t.far
  return (dist < 8 ? t.here : t.there).replace('{Place}', cap(place.name)).replace('{how}', how).replace('{dir}', dir)
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
