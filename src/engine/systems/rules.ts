import type { Cond, Effect, NoteKind, Rule, SfxName } from '../../data'
import { sfx } from '../core/audio'
import { count, give, type GameState } from '../core/state'
import { fill } from '../entities/prop'

/** What the rules need from the game to do their work. */
export interface RuleHost {
  state: GameState
  note(text: string, kind?: NoteKind): void
  train(skill: string): void
  rest(hours: number): void
  heal(hp: number | 'full'): void
  travel(level: string, at?: { x: number; z: number; yaw: number }): void
  exitBuilding(): void
  endDialogue(): void
}

export interface RuleContext {
  /** Fills `{id}`, `{building}` and so on in text and level ids. */
  params?: Record<string, string>
  /** Called by a `remove` effect. */
  remove?: () => void
}

export function check(s: GameState, c?: Cond) {
  if (!c) return true
  for (const [q, stage] of Object.entries(c.quest ?? {})) if (![stage].flat().includes(s.quests[q])) return false
  if (c.flag && !s.flags[c.flag]) return false
  if (c.notFlag && s.flags[c.notFlag]) return false
  if (c.has && count(s, c.has) <= 0) return false
  if (c.lacks && count(s, c.lacks) > 0) return false
  return true
}

/** The first rule whose condition holds. */
export const pick = <R extends Rule>(s: GameState, rules: R[]) => rules.find((r) => check(s, r.when))

export const say = (r: Rule) => (Array.isArray(r.say) ? r.say[Math.floor(Math.random() * r.say.length)] : r.say)

/**
 * Takes the rule's cost, if any, then runs its effects.
 * Returns what should be said, or the `poor` line if you couldn't pay.
 */
export function apply(h: RuleHost, r: Rule, ctx: RuleContext = {}): string | undefined {
  if (r.cost) {
    if (h.state.player.gold < r.cost) return r.poor
    h.state.player.gold -= r.cost
    sfx.coin()
  }
  run(h, r.do ?? [], ctx)
  const line = say(r)
  return line && fill(line, ctx.params ?? {})
}

export function run(h: RuleHost, effects: Effect[], ctx: RuleContext = {}) {
  const s = h.state
  const p = ctx.params ?? {}
  for (const e of effects) {
    if ('if' in e) run(h, check(s, e.if) ? e.do : (e.else ?? []), ctx)
    else if ('gold' in e) s.player.gold += e.gold
    else if ('give' in e) give(s, e.give, e.count ?? 1)
    else if ('take' in e) give(s, e.take, -(e.count ?? 1))
    else if ('stage' in e) s.quests[e.quest] = e.stage
    else if ('journal' in e) s.journal = [...s.journal, fill(e.journal, p)]
    else if ('note' in e) h.note(fill(e.note, p), e.kind)
    else if ('sfx' in e) sfx[e.sfx as SfxName]()
    else if ('train' in e) h.train(e.train)
    else if ('heal' in e) h.heal(e.heal)
    else if ('rest' in e) h.rest(e.rest)
    else if ('flag' in e) s.flags[e.flag] = e.value ?? true
    else if ('end' in e) h.endDialogue()
    else if ('travel' in e) h.travel(fill(e.travel, p), e.at)
    else if ('exitBuilding' in e) h.exitBuilding()
    else if ('remove' in e) ctx.remove?.()
  }
}
