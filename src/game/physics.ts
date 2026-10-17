import type { Body, Level, Rect } from './types'

export const bodyRect = (b: Body): Rect => ({ x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h })

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/** Hitbox defined facing right relative to a body's feet, mirrored by `facing`. */
export function worldBox(b: Body, facing: 1 | -1, box: Rect): Rect {
  const x = facing === 1 ? b.x + box.x : b.x - box.x - box.w
  return { x, y: b.y + box.y, w: box.w, h: box.h }
}

/** Axis-separated movement against the level's platforms. */
export function moveBody(b: Body, level: Level, dt: number, dropThrough = false) {
  const prevLeft = b.x - b.w / 2
  const prevRight = b.x + b.w / 2
  b.x += b.vx * dt
  for (const p of level.platforms) {
    if (p.oneWay) continue
    const r = bodyRect(b)
    if (!overlaps(r, p)) continue
    if (prevRight <= p.x + 0.5) {
      b.x = p.x - b.w / 2
      b.vx = Math.min(0, b.vx)
    } else if (prevLeft >= p.x + p.w - 0.5) {
      b.x = p.x + p.w + b.w / 2
      b.vx = Math.max(0, b.vx)
    }
  }
  b.x = Math.max(40 + b.w / 2, Math.min(level.width - 40 - b.w / 2, b.x))

  const prevBottom = b.y
  const prevTop = b.y - b.h
  b.y += b.vy * dt
  b.onGround = false
  for (const p of level.platforms) {
    const left = b.x - b.w / 2
    const right = b.x + b.w / 2
    if (right <= p.x || left >= p.x + p.w) continue
    if (p.oneWay) {
      if (!dropThrough && b.vy >= 0 && prevBottom <= p.y + 0.5 && b.y >= p.y) {
        b.y = p.y
        b.vy = 0
        b.onGround = true
      }
      continue
    }
    if (b.y > p.y && b.y - b.h < p.y + p.h) {
      if (b.vy >= 0 && prevBottom <= p.y + 0.5) {
        b.y = p.y
        b.vy = 0
        b.onGround = true
      } else if (b.vy < 0 && prevTop >= p.y + p.h - 0.5) {
        b.y = p.y + p.h + b.h
        b.vy = 0
      }
    }
  }
}

/** True if the body is standing on something. Used for coyote checks while still. */
export function groundProbe(b: Body, level: Level) {
  for (const p of level.platforms) {
    if (b.x + b.w / 2 <= p.x || b.x - b.w / 2 >= p.x + p.w) continue
    if (Math.abs(b.y - p.y) < 1) return true
  }
  return false
}
