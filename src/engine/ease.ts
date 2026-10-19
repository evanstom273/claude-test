export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'back' | 'snap'

export function ease(k: number, e: Ease = 'inOut') {
  k = Math.max(0, Math.min(1, k))
  switch (e) {
    case 'linear':
      return k
    case 'in':
      return k * k
    case 'out':
      return 1 - (1 - k) * (1 - k)
    case 'inOut':
      return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
    case 'back': {
      // a little overshoot, for cartoon snap
      const c = 1.70158
      return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2)
    }
    case 'snap':
      return k < 1 ? 0 : 1
  }
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k
