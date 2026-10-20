/**
 * Splits a line of dialogue into syllables with timings. The same syllables
 * drive the subtitle reveal, the mouth shapes and the gibberish voice, so the
 * three always stay in step.
 */

export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u'

export interface Syllable {
  /** Seconds from the start of the line. */
  t: number
  dur: number
  vowel: Vowel
  /** Characters of the text revealed once this syllable has been spoken. */
  reveal: number
  /** Rises at the end of questions, jumps for shouting. */
  pitch: number
  loud: number
}

export interface SpeechTiming {
  syllables: Syllable[]
  duration: number
}

const VOWELS = /[aeiouy]+/gi

/** Seconds per syllable is 1 / rate; punctuation adds pauses. */
export function timeSpeech(text: string, rate: number): SpeechTiming {
  const syllables: Syllable[] = []
  let t = 0
  const words = text.split(/(\s+)/)
  let pos = 0
  const question = text.trim().endsWith('?')
  const shout = text.includes('!')
  const total = (text.match(VOWELS) ?? []).length || 1
  let n = 0
  for (const w of words) {
    const start = pos
    pos += w.length
    if (!w.trim()) continue
    const groups = [...w.matchAll(VOWELS)]
    const count = Math.max(1, groups.length)
    for (let i = 0; i < count; i++) {
      const v = (groups[i]?.[0]?.[0]?.toLowerCase() ?? 'a') as string
      const vowel: Vowel = v === 'y' ? 'i' : (v as Vowel)
      const reveal = i === count - 1 ? pos : start + Math.round(((i + 1) / count) * w.length)
      const k = n / total
      syllables.push({
        t,
        dur: (1 / rate) * 0.8,
        vowel,
        reveal,
        pitch: (question && k > 0.75 ? 1 + (k - 0.75) * 1.6 : 1) * (shout ? 1.12 : 1),
        loud: shout ? 1.15 : 1,
      })
      t += 1 / rate
      n++
    }
    // pauses: longer after full stops and dashes, short after commas
    const last = w[w.length - 1]
    if (last === ',' ) t += 0.18
    else if ('.!?—'.includes(last)) t += 0.32
    else if (w.endsWith('...')) t += 0.45
  }
  return { syllables, duration: t }
}

/** Mouth shape for a moment in a line: open on the vowel, closing between syllables. */
export function visemeAt(timing: SpeechTiming, t: number): Vowel | 'closed' | null {
  if (t < 0 || t > timing.duration) return null
  for (const s of timing.syllables) {
    if (t >= s.t && t < s.t + s.dur) return (t - s.t) / s.dur < 0.75 ? s.vowel : 'closed'
  }
  return 'closed'
}

/** How much of the subtitle should be showing. */
export function revealAt(timing: SpeechTiming, text: string, t: number) {
  if (t >= timing.duration) return text.length
  let r = 0
  for (const s of timing.syllables) if (t >= s.t) r = s.reveal
  return r
}
