const DAYS = ['Loamsday', 'Tuesk', 'Midweal', 'Thornsday', 'Freeday', 'Hearthday', 'Sunnday']

export interface Clock {
  minutes: number
  day: number
}

export function advance(t: Clock, minutes: number) {
  t.minutes += minutes
  if (t.minutes >= 24 * 60) {
    t.minutes -= 24 * 60
    t.day++
  }
}

export function clockText(t: Clock) {
  const h = Math.floor(t.minutes / 60) % 24
  const m = Math.floor(t.minutes % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

export const dateText = (t: Clock) => `${DAYS[t.day % 7]}, ${12 + t.day}th of Harvestide`
