/** World units: 1 SVG unit = 1 world pixel, and 96 world pixels = 1 metre. */
export const PX_PER_M = 96

/** Metres to world pixels. */
export const m = (metres: number) => metres * PX_PER_M

/** The Godot source authored melee reach in "actor units": ×4 actor scale, 128 units per metre. */
export const actorUnits = (u: number) => (u * 4) / 128

export const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Signed smallest difference between two angles. */
export const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

export interface Vec {
  x: number
  y: number
}
