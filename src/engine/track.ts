import { ease, lerp, type Ease } from './ease'

/** A keyframe: from time `t`, move to `value` over `dur` seconds. */
interface Key<T> {
  t: number
  value: T
  dur: number
  ease: Ease
}

type Num = number | Record<string, number>

function mix<T extends Num>(a: T, b: T, k: number): T {
  if (typeof a === 'number') return lerp(a, b as number, k) as T
  const out: Record<string, number> = { ...(a as Record<string, number>) }
  for (const key of Object.keys(b as Record<string, number>)) out[key] = lerp((a as Record<string, number>)[key] ?? (b as Record<string, number>)[key], (b as Record<string, number>)[key], k)
  return out as T
}

/**
 * A value over time. Numbers (and records of numbers) tween between keys;
 * anything else switches at the key's time. Sampling is pure, so the film can
 * be scrubbed, paused and restarted anywhere.
 */
export class Track<T> {
  keys: Key<T>[] = []

  constructor(public initial: T) {}

  add(t: number, value: T, dur = 0, e: Ease = 'inOut') {
    this.keys.push({ t, value, dur, ease: e })
    this.keys.sort((a, b) => a.t - b.t)
    return this
  }

  /** The value as it stands at time t. */
  at(t: number): T {
    let prev: T = this.initial
    for (let i = 0; i < this.keys.length; i++) {
      const k = this.keys[i]
      if (k.t > t) break
      if (k.dur > 0 && t < k.t + k.dur && (typeof k.value === 'number' || (typeof k.value === 'object' && k.value !== null))) {
        return mix(prev as Num, k.value as Num, ease((t - k.t) / k.dur, k.ease)) as T
      }
      prev = k.value
    }
    return prev
  }

  /** The time the last change finishes. */
  get end() {
    return this.keys.reduce((m, k) => Math.max(m, k.t + k.dur), 0)
  }
}
