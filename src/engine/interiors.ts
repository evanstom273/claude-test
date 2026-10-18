import * as THREE from 'three'
import { booksTex, doorTex, fireTex, paneTex, papersTex, plankTex, plasterTex, portraitTex, propTex, rugTex, stoneFloorTex, stoneTex } from './art'
import { Billboard, boxWU, type Collider, type Surface } from './geo'
import type { Level } from './levels'

export type BuildingKind = 'tavern' | 'hall' | 'temple' | 'forge' | 'house'

export interface Building {
  id: string
  name: string
  kind: BuildingKind
  x: number
  z: number
  w: number
  d: number
  h: number
  rot: 0 | 90 | 180 | 270
  seed: number
}

/** World positions for a building's front door and the spot just outside it. */
export function doorWorld(b: Building) {
  const th = (b.rot * Math.PI) / 180
  const toWorld = (lx: number, lz: number) => ({ x: b.x + lx * Math.cos(th) + lz * Math.sin(th), z: b.z - lx * Math.sin(th) + lz * Math.cos(th) })
  const door = toWorld(0, b.d / 2)
  const out = toWorld(0, b.d / 2 + 1.4)
  // facing away from the building (yaw 0 looks toward -z)
  return { door, out: { ...out, yaw: th + Math.PI }, toWorld }
}

interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

type RoomKind = 'living' | 'kitchen' | 'bedroom' | 'storage' | 'common' | 'office' | 'archive' | 'nave' | 'workshop'

interface Room extends Rect {
  floor: number
  kind: RoomKind
}

const F = 3 // storey height
const WALL_T = 0.16
const STAIR_W = 1.15

const overlaps = (a: Rect, b: Rect, pad = 0) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad
const area = (r: Rect) => (r.x1 - r.x0) * (r.z1 - r.z0)

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lam = (map: THREE.Texture, o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map, ...o })

/**
 * Builds the inside of a building. Layouts are generated from the
 * building's seed: where the stairs go, how the rooms are divided, and
 * what each room holds, so no two houses are the same.
 */
export function buildInterior(b: Building): Level {
  const r = rng(b.seed * 9973 + 17)
  const lvl: Level = {
    id: `in:${b.id}`,
    group: new THREE.Group(),
    colliders: [],
    spawn: { x: 0, z: b.d / 2 - 1.1, yaw: 0 },
    enemies: [],
    interactables: [],
    outdoors: false,
    billboards: [],
    nightLights: [],
    surfaces: [],
    spots: {},
    title: cap(b.name),
    buildingId: b.id,
  }
  const g = lvl.group
  const inner: Rect = { x0: -b.w / 2 + WALL_T, z0: -b.d / 2 + WALL_T, x1: b.w / 2 - WALL_T, z1: b.d / 2 - WALL_T }
  const storeys = b.kind === 'temple' || b.kind === 'forge' ? 1 : b.kind === 'house' && b.h < 5.6 ? 1 : 2
  const top = b.kind === 'temple' ? 7 : storeys * F

  // materials per building
  const plasterColor = { tavern: '#efe2c0', hall: '#e4dccb', temple: '#f2ead6', forge: '#d8c8a8', house: ['#efe2c0', '#e8d4c4', '#d8e2e4', '#ece0b8'][b.seed % 4] }[b.kind]
  const wallMat = b.kind === 'temple' || b.kind === 'hall' ? lam(stoneTex('#c8bea8', '#b8ae98', 40 + b.seed)) : lam(plasterTex(plasterColor, 50 + b.seed))
  const floorMat =
    b.kind === 'temple' ? lam(stoneFloorTex('#c8bea8', 3)) : b.kind === 'forge' ? lam(stoneFloorTex('#8a8278', 4)) : lam(plankTex(['#9a7448', '#8a6440', '#a07a4a'][b.seed % 3]))
  const woodMat = lam(plankTex('#7a5636'))
  const darkWood = lam(plankTex('#5a3d26'))

  // ---- shell: floor, outer walls, ceiling
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.d), floorMat)
  floor.rotation.x = -Math.PI / 2
  ;(floor.material as THREE.MeshLambertMaterial).map!.repeat.set(b.w / 2.5, b.d / 2.5)
  g.add(floor)
  const wall = (x: number, z: number, w: number, d: number, y0: number, h: number, mat = wallMat, collide = true) => {
    const m = new THREE.Mesh(boxWU(w, h, d), mat)
    m.position.set(x, y0 + h / 2, z)
    g.add(m)
    if (collide) lvl.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, y0, y1: y0 + h })
  }
  wall(0, -b.d / 2 + WALL_T / 2, b.w, WALL_T, 0, top)
  wall(0, b.d / 2 - WALL_T / 2, b.w, WALL_T, 0, top)
  wall(-b.w / 2 + WALL_T / 2, 0, WALL_T, b.d, 0, top)
  wall(b.w / 2 - WALL_T / 2, 0, WALL_T, b.d, 0, top)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.d), darkWood)
  ceil.rotation.x = Math.PI / 2
  ceil.position.y = top
  ;(ceil.material as THREE.MeshLambertMaterial).map!.repeat.set(b.w / 3, b.d / 3)
  g.add(ceil)
  // exposed beams across the top ceiling
  for (let x = inner.x0 + 1.2; x < inner.x1; x += 2.2) {
    const beam = new THREE.Mesh(boxWU(0.22, 0.26, b.d), darkWood)
    beam.position.set(x, top - 0.13, 0)
    g.add(beam)
  }

  // the way back out
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.5), lam(doorTex('#6b4a2b'), { transparent: true, alphaTest: 0.5 }))
  door.position.set(0, 1.25, b.d / 2 - WALL_T - 0.01)
  door.rotation.y = Math.PI
  g.add(door)
  lvl.interactables.push({ id: 'exit', label: `Leave ${b.name}`, x: 0, z: b.d / 2 - 0.6, radius: 1.4 })

  // areas kept clear of furniture and walls, per floor: the front door, the foot and head of the stairs, doorways
  const keepouts: (Rect & { floor: number })[] = [{ x0: -1.1, z0: inner.z1 - 1.8, x1: 1.1, z1: inner.z1, floor: 0 }]
  let stairFoot: Rect | null = null
  let stairHead: Rect | null = null

  // ---- stairs: along the back, left or right wall, rising either way
  let stair: (Rect & { axis: 'x' | 'z'; up: 1 | -1 }) | null = null
  if (storeys > 1) {
    // A straight flight along a wall, never jammed into a corner: one end
    // leaves a landing upstairs, the other leaves room to walk on downstairs.
    const LAND = 1.3
    const cands: (Rect & { axis: 'x' | 'z'; up: 1 | -1 })[] = []
    const spanX = inner.x1 - inner.x0
    const spanZ = inner.z1 - inner.z0
    const lenX = Math.min(4.2, spanX - LAND - 1.6)
    const backZ = { z0: inner.z0, z1: inner.z0 + STAIR_W }
    if (lenX >= 3.2) {
      // along the back wall: top toward the left corner (landing there) or the right
      cands.push({ x0: inner.x0 + LAND, x1: inner.x0 + LAND + lenX, ...backZ, axis: 'x', up: -1 })
      cands.push({ x0: inner.x1 - LAND - lenX, x1: inner.x1 - LAND, ...backZ, axis: 'x', up: 1 })
    }
    // along a side wall, leaving the front-door area clear
    const lenZ = Math.min(4.2, spanZ - LAND - 1.2 - 1.9)
    if (lenZ >= 3.2) {
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? inner.x0 : inner.x1 - STAIR_W
        // top at the back with a landing behind it, foot toward the front
        cands.push({ x0, x1: x0 + STAIR_W, z0: inner.z0 + LAND, z1: inner.z0 + LAND + lenZ, axis: 'z', up: -1 })
        // foot at the back, climbing toward the front with the landing before the door wall
        cands.push({ x0, x1: x0 + STAIR_W, z0: inner.z0 + 1.2, z1: inner.z0 + 1.2 + lenZ, axis: 'z', up: 1 })
      }
    }
    stair = cands[Math.floor(r() * cands.length)] ?? null
  }
  if (stair) buildStairs(stair)

  function buildStairs(s: Rect & { axis: 'x' | 'z'; up: 1 | -1 }) {
    const along = s.axis === 'x' ? s.x1 - s.x0 : s.z1 - s.z0
    const n = 12
    for (let i = 0; i < n; i++) {
      // step i counts from the bottom
      const h = ((i + 1) / n) * F
      const t0 = (i / n) * along
      const t1 = ((i + 1) / n) * along
      const lo = s.up === 1 ? t0 : along - t1
      const hi = s.up === 1 ? t1 : along - t0
      const step = new THREE.Mesh(
        s.axis === 'x' ? boxWU(hi - lo, h, s.z1 - s.z0, 1.5) : boxWU(s.x1 - s.x0, h, hi - lo, 1.5),
        woodMat,
      )
      if (s.axis === 'x') step.position.set(s.x0 + (lo + hi) / 2, h / 2, (s.z0 + s.z1) / 2)
      else step.position.set((s.x0 + s.x1) / 2, h / 2, s.z0 + (lo + hi) / 2)
      g.add(step)
    }
    lvl.surfaces!.push({ ...s, minX: s.x0, maxX: s.x1, minZ: s.z0, maxZ: s.z1, y0: s.up === 1 ? 0 : F, y1: s.up === 1 ? F : 0, axis: s.axis })
    // a banister along the open side stops you stepping on from the side
    const rail = (x: number, z: number, w: number, d: number, y0: number, h: number) => {
      const m = new THREE.Mesh(boxWU(w, 0.08, d), darkWood)
      m.position.set(x, y0 + h, z)
      g.add(m)
      for (let k = 0; k <= 4; k++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.07), darkWood)
        post.position.set(w > d ? x - w / 2 + (k / 4) * w : x, y0 + h / 2, w > d ? z : z - d / 2 + (k / 4) * d)
        g.add(post)
      }
      lvl.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, y0, y1: y0 + h + 0.2 })
    }
    const openSide = s.axis === 'x' ? { x: (s.x0 + s.x1) / 2, z: s.z1 + 0.04, w: s.x1 - s.x0, d: 0.08 } : { x: s.x0 === inner.x0 ? s.x1 + 0.04 : s.x0 - 0.04, z: (s.z0 + s.z1) / 2, w: 0.08, d: s.z1 - s.z0 }
    // downstairs the banister follows the slope; a block underneath keeps you off the side
    lvl.colliders.push({ minX: openSide.x - openSide.w / 2, maxX: openSide.x + openSide.w / 2, minZ: openSide.z - openSide.d / 2, maxZ: openSide.z + openSide.d / 2, y0: 0, y1: F })
    const slope = new THREE.Mesh(new THREE.BoxGeometry(openSide.w, 0.08, openSide.d), darkWood)
    slope.position.set(openSide.x, F / 2 + 0.9, openSide.z)
    if (s.axis === 'x') slope.rotation.z = Math.atan2(F, along) * (s.up === 1 ? 1 : -1)
    else slope.rotation.x = -Math.atan2(F, along) * (s.up === 1 ? 1 : -1)
    slope.scale.set(s.axis === 'x' ? 1.15 : 1, 1, s.axis === 'z' ? 1.15 : 1)
    g.add(slope)
    // upstairs: railings round the stairwell
    rail(openSide.x, openSide.z, openSide.w, openSide.d, F, 1)
    const bottomEnd =
      s.axis === 'x'
        ? { x: s.up === 1 ? s.x0 - 0.04 : s.x1 + 0.04, z: (s.z0 + s.z1) / 2, w: 0.08, d: s.z1 - s.z0 }
        : { x: (s.x0 + s.x1) / 2, z: s.up === 1 ? s.z0 - 0.04 : s.z1 + 0.04, w: s.x1 - s.x0, d: 0.08 }
    rail(bottomEnd.x, bottomEnd.z, bottomEnd.w, bottomEnd.d, F, 1)
    // keep the foot of the stairs clear downstairs and the landing clear upstairs
    stairFoot = s.axis === 'x' ? { x0: s.up === 1 ? s.x0 - 1.4 : s.x1, z0: s.z0, x1: s.up === 1 ? s.x0 : s.x1 + 1.4, z1: s.z1 + 0.6 } : { x0: s.x0 - 0.4, z0: s.up === 1 ? s.z0 - 1.4 : s.z1, x1: s.x1 + 0.4, z1: s.up === 1 ? s.z0 : s.z1 + 1.4 }
    stairHead = s.axis === 'x' ? { x0: s.up === 1 ? s.x1 : s.x0 - 1.4, z0: s.z0, x1: s.up === 1 ? s.x1 + 1.4 : s.x0, z1: s.z1 + 0.6 } : { x0: s.x0 - 0.4, z0: s.up === 1 ? s.z1 : s.z0 - 1.4, x1: s.x1 + 0.4, z1: s.up === 1 ? s.z1 + 1.4 : s.z0 }
    keepouts.push({ ...stairFoot, floor: 0 }, { ...stairHead, floor: 1 })
  }

  // ---- upper floor: a slab with the stairwell cut out of it
  if (storeys > 1 && stair) {
    const s = stair
    const pieces: Rect[] = [
      { x0: inner.x0, z0: inner.z0, x1: s.x0, z1: inner.z1 },
      { x0: s.x1, z0: inner.z0, x1: inner.x1, z1: inner.z1 },
      { x0: s.x0, z0: inner.z0, x1: s.x1, z1: s.z0 },
      { x0: s.x0, z0: s.z1, x1: s.x1, z1: inner.z1 },
    ].filter((p) => p.x1 - p.x0 > 0.05 && p.z1 - p.z0 > 0.05)
    for (const p of pieces) {
      const slab = new THREE.Mesh(boxWU(p.x1 - p.x0, 0.16, p.z1 - p.z0, 2.5), floorMat)
      slab.position.set((p.x0 + p.x1) / 2, F - 0.08, (p.z0 + p.z1) / 2)
      g.add(slab)
      lvl.surfaces!.push({ minX: p.x0, maxX: p.x1, minZ: p.z0, maxZ: p.z1, y0: F })
      // the slab is a ceiling to anyone downstairs
      lvl.colliders.push({ minX: p.x0, maxX: p.x1, minZ: p.z0, maxZ: p.z1, y0: F - 0.2, y1: F - 0.01 })
    }
  }

  // ---- dividing walls with doorways, avoiding the stairs and the front door
  const rooms: Room[] = []
  function divide(region: Rect, floorN: number, avoid: Rect[], maxSplits: number) {
    const out: Rect[] = [region]
    for (let split = 0; split < maxSplits; split++) {
      out.sort((a, c) => area(c) - area(a))
      const big = out[0]
      if (area(big) < 16) break
      let done = false
      for (let tries = 0; tries < 14 && !done; tries++) {
        const alongX = r() < (big.x1 - big.x0 > big.z1 - big.z0 ? 0.25 : 0.75)
        // alongX: a wall running along x at some z
        const lo = alongX ? big.z0 : big.x0
        const hi = alongX ? big.z1 : big.x1
        if (hi - lo < 4.4) continue
        const at = lo + (hi - lo) * (0.35 + r() * 0.3)
        const len = alongX ? big.x1 - big.x0 : big.z1 - big.z0
        const gapAt = 0.4 + r() * (len - 1.6)
        const wallRect: Rect = alongX ? { x0: big.x0, x1: big.x1, z0: at - WALL_T / 2, z1: at + WALL_T / 2 } : { x0: at - WALL_T / 2, x1: at + WALL_T / 2, z0: big.z0, z1: big.z1 }
        const gapRect: Rect = alongX
          ? { x0: big.x0 + gapAt - 0.2, x1: big.x0 + gapAt + 1.4, z0: at - 1, z1: at + 1 }
          : { x0: at - 1, x1: at + 1, z0: big.z0 + gapAt - 0.2, z1: big.z0 + gapAt + 1.4 }
        const solidParts: Rect[] = alongX
          ? [
              { ...wallRect, x1: big.x0 + gapAt },
              { ...wallRect, x0: big.x0 + gapAt + 1.2 },
            ]
          : [
              { ...wallRect, z1: big.z0 + gapAt },
              { ...wallRect, z0: big.z0 + gapAt + 1.2 },
            ]
        if (solidParts.some((p) => avoid.some((a) => overlaps(p, a, 0.25)))) continue
        if (avoid.some((a) => overlaps(gapRect, a))) continue
        for (const p of solidParts) {
          if (p.x1 - p.x0 < 0.05 || p.z1 - p.z0 < 0.05) continue
          wall((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, p.x1 - p.x0, p.z1 - p.z0, floorN * F, F)
        }
        // a lintel over the doorway
        const gx = alongX ? big.x0 + gapAt + 0.6 : at
        const gz = alongX ? at : big.z0 + gapAt + 0.6
        wall(gx, gz, alongX ? 1.2 : WALL_T, alongX ? WALL_T : 1.2, floorN * F + 2.3, F - 2.3, wallMat, false)
        keepouts.push({ x0: gapRect.x0, x1: gapRect.x1, z0: gapRect.z0, z1: gapRect.z1, floor: floorN })
        out.shift()
        out.push(alongX ? { ...big, z1: at - WALL_T / 2 } : { ...big, x1: at - WALL_T / 2 }, alongX ? { ...big, z0: at + WALL_T / 2 } : { ...big, x0: at + WALL_T / 2 })
        done = true
      }
    }
    return out
  }

  const groundAvoid: Rect[] = [keepouts[0], ...(stair ? [stair] : []), ...(stairFoot ? [stairFoot] : [])]
  const plan = PLANS[b.kind]
  const groundRects = divide(inner, 0, groundAvoid, plan.groundSplits(r))
  // the room with the front door gets the main use
  groundRects.sort((a, c) => c.z1 - a.z1 || area(c) - area(a))
  groundRects.forEach((rc, i) => rooms.push({ ...rc, floor: 0, kind: plan.ground[Math.min(i, plan.ground.length - 1)] }))
  if (storeys > 1 && stair) {
    const upRects = divide(inner, 1, [stair, ...(stairHead ? [stairHead] : [])], plan.upperSplits(r))
    upRects.forEach((rc, i) => rooms.push({ ...rc, floor: 1, kind: plan.upper[Math.min(i, plan.upper.length - 1)] }))
  }

  // ---- windows on the outer walls, both storeys
  const paneDay = new THREE.MeshBasicMaterial({ map: paneTex(false) })
  const paneNight = new THREE.MeshBasicMaterial({ map: paneTex(true) })
  for (let fl = 0; fl < (b.kind === 'temple' ? 1 : storeys); fl++) {
    const y = fl * F + (b.kind === 'temple' ? 3.6 : 1.7)
    const size = b.kind === 'temple' ? 1.6 : 1
    const sideWin = (x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * (b.kind === 'temple' ? 1.8 : 1)), paneDay)
      m.position.set(x, y, z)
      m.rotation.y = ry
      g.add(m)
      lvl.nightLights.push({ mesh: m, day: paneDay, night: paneNight })
    }
    for (let x = inner.x0 + 1.6; x < inner.x1 - 1; x += 2.6) {
      if (!(fl === 0 && stair && stair.axis === 'x' && x > stair.x0 && x < stair.x1)) sideWin(x, inner.z0 + 0.01, 0)
      if (Math.abs(x) > 1.4 || fl > 0) sideWin(x, inner.z1 - 0.01, Math.PI)
    }
    for (let z = inner.z0 + 1.8; z < inner.z1 - 1; z += 2.8) {
      sideWin(inner.x0 + 0.01, z, Math.PI / 2)
      sideWin(inner.x1 - 0.01, z, -Math.PI / 2)
    }
  }

  // ---- furniture
  const placed: Rect[] = []
  const lights: THREE.PointLight[] = []
  const free = (rc: Rect, floorN: number) => {
    if (rc.x0 < inner.x0 - 0.01 || rc.x1 > inner.x1 + 0.01 || rc.z0 < inner.z0 - 0.01 || rc.z1 > inner.z1 + 0.01) return false
    if (placed.some((p) => overlaps(p, rc, 0.12))) return false
    if (keepouts.some((k) => k.floor === floorN && overlaps(k, rc))) return false
    if (stair && overlaps(stair, rc, 0.1)) return false
    return true
  }

  /** Put an item against one of the room's walls; returns where it went. */
  function againstWall(room: Room, w: number, d: number, make: (x: number, y: number, z: number, ry: number) => void, sides = ['n', 's', 'e', 'w']) {
    for (let tries = 0; tries < 60; tries++) {
      const side = sides[Math.floor(r() * sides.length)]
      const horiz = side === 'n' || side === 's'
      const fw = horiz ? w : d
      const fd = horiz ? d : w
      let cx: number
      let cz: number
      if (side === 'n') {
        cz = room.z0 + fd / 2 + 0.02
        cx = room.x0 + fw / 2 + r() * Math.max(0, room.x1 - room.x0 - fw)
      } else if (side === 's') {
        cz = room.z1 - fd / 2 - 0.02
        cx = room.x0 + fw / 2 + r() * Math.max(0, room.x1 - room.x0 - fw)
      } else if (side === 'w') {
        cx = room.x0 + fw / 2 + 0.02
        cz = room.z0 + fd / 2 + r() * Math.max(0, room.z1 - room.z0 - fd)
      } else {
        cx = room.x1 - fw / 2 - 0.02
        cz = room.z0 + fd / 2 + r() * Math.max(0, room.z1 - room.z0 - fd)
      }
      const rc = { x0: cx - fw / 2, x1: cx + fw / 2, z0: cz - fd / 2, z1: cz + fd / 2 }
      if (!free(rc, room.floor)) continue
      placed.push(rc)
      // items are modelled with their back toward -z
      const ry = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[side]!
      make(cx, room.floor * F, cz, ry)
      return { x: cx, z: cz, ry }
    }
    return null
  }

  function inMiddle(room: Room, w: number, d: number, make: (x: number, y: number, z: number, ry: number) => void, collide = true) {
    for (let tries = 0; tries < 40; tries++) {
      const turn = r() < 0.5
      const fw = turn ? d : w
      const fd = turn ? w : d
      const cx = (room.x0 + room.x1) / 2 + (r() - 0.5) * Math.max(0, room.x1 - room.x0 - fw - 1.6)
      const cz = (room.z0 + room.z1) / 2 + (r() - 0.5) * Math.max(0, room.z1 - room.z0 - fd - 1.6)
      const rc = { x0: cx - fw / 2, x1: cx + fw / 2, z0: cz - fd / 2, z1: cz + fd / 2 }
      if (collide && !free(rc, room.floor)) continue
      if (collide) placed.push(rc)
      make(cx, room.floor * F, cz, turn ? Math.PI / 2 : 0)
      return { x: cx, z: cz }
    }
    return null
  }

  // piece builders: each adds meshes and a collider sized to its footprint
  const piece = (x: number, y: number, z: number, ry: number, w: number, d: number, h: number, build: (grp: THREE.Group) => void, collide = true) => {
    const grp = new THREE.Group()
    build(grp)
    grp.position.set(x, y, z)
    grp.rotation.y = ry
    g.add(grp)
    const turned = Math.abs(Math.sin(ry)) > 0.5
    const fw = turned ? d : w
    const fd = turned ? w : d
    if (collide) lvl.colliders.push({ minX: x - fw / 2, maxX: x + fw / 2, minZ: z - fd / 2, maxZ: z + fd / 2, y0: y, y1: y + h })
  }
  const box = (grp: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(boxWU(w, h, d, 1.5), mat)
    m.position.set(x, y + h / 2, z)
    grp.add(m)
    return m
  }
  const red = new THREE.MeshLambertMaterial({ color: ['#a8322c', '#3f6a7a', '#4f6e44', '#7a5a9a'][b.seed % 4] })
  const linen = new THREE.MeshLambertMaterial({ color: '#f1e6c8' })
  const stoneMat = lam(stoneTex('#8a8278', '#7a7268', 61))
  const iron = new THREE.MeshLambertMaterial({ color: '#3a3a40' })

  const items = {
    bed: (x: number, y: number, z: number, ry: number) =>
      piece(x, y, z, ry, 1.15, 2.1, 0.6, (gp) => {
        box(gp, 1.15, 0.35, 2.1, 0, 0, 0, woodMat)
        box(gp, 1.05, 0.15, 1.5, 0, 0.35, 0.25, red)
        box(gp, 0.8, 0.14, 0.4, 0, 0.35, -0.75, linen)
        box(gp, 1.15, 0.9, 0.08, 0, 0, -1.02, darkWood)
      }),
    table: (x: number, y: number, z: number, ry: number) => {
      piece(x, y, z, ry, 1.6, 0.9, 0.8, (gp) => {
        box(gp, 1.6, 0.08, 0.9, 0, 0.72, 0, woodMat)
        for (const [lx, lz] of [
          [-0.7, -0.35],
          [0.7, -0.35],
          [-0.7, 0.35],
          [0.7, 0.35],
        ])
          box(gp, 0.08, 0.72, 0.08, lx, 0, lz, darkWood)
      })
      const c = sprite(propTex('torch'), x, y + 0.8, z, 0.3, 0.3, true)
      c.mesh.scale.set(0.8, 0.8, 0.8)
    },
    chairs: (x: number, y: number, z: number, ry: number) => {
      for (const s of [-1, 1]) {
        const off = new THREE.Vector3(0, 0, s * 0.85).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry)
        piece(x + off.x, y, z + off.z, ry + (s > 0 ? Math.PI : 0), 0.5, 0.5, 0.95, (gp) => {
          box(gp, 0.48, 0.06, 0.48, 0, 0.42, 0, woodMat)
          box(gp, 0.48, 0.5, 0.06, 0, 0.45, 0.22, darkWood)
          for (const [lx, lz] of [
            [-0.2, -0.2],
            [0.2, -0.2],
            [-0.2, 0.2],
            [0.2, 0.2],
          ])
            box(gp, 0.05, 0.42, 0.05, lx, 0, lz, darkWood)
        }, false)
      }
    },
    chest: (x: number, y: number, z: number, ry: number) =>
      piece(x, y, z, ry, 0.9, 0.55, 0.55, (gp) => {
        box(gp, 0.9, 0.55, 0.55, 0, 0, 0, darkWood)
        box(gp, 0.92, 0.06, 0.57, 0, 0.3, 0, iron)
      }),
    wardrobe: (x: number, y: number, z: number, ry: number) =>
      piece(x, y, z, ry, 1.2, 0.6, 2, (gp) => {
        box(gp, 1.2, 2, 0.6, 0, 0, 0, woodMat)
        box(gp, 0.04, 1.6, 0.02, 0, 0.2, 0.31, darkWood)
      }),
    bookshelf: (x: number, y: number, z: number, ry: number) =>
      piece(x, y, z, ry, 1.6, 0.4, 2.1, (gp) => {
        const m = box(gp, 1.6, 2.1, 0.4, 0, 0, 0, darkWood)
        const front = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), lam(booksTex(b.seed + Math.floor(x * 7))))
        front.position.set(0, 1.05, 0.205)
        gp.add(front)
        void m
      }),
    cupboard: (x: number, y: number, z: number, ry: number) =>
      piece(x, y, z, ry, 1.4, 0.5, 1.6, (gp) => {
        box(gp, 1.4, 1.6, 0.5, 0, 0, 0, woodMat)
        box(gp, 1.44, 0.06, 0.54, 0, 0.9, 0, darkWood)
        for (const jx of [-0.45, -0.1, 0.3]) {
          const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.26, 8), new THREE.MeshLambertMaterial({ color: ['#c9a24a', '#3f6a7a', '#a8582a'][Math.abs(Math.round(jx * 10)) % 3] }))
          jar.position.set(jx, 1.73, 0)
          gp.add(jar)
        }
      }),
    barrel: (x: number, y: number, z: number) =>
      piece(x, y, z, 0, 0.7, 0.7, 0.9, (gp) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.9, 10), woodMat)
        m.position.y = 0.45
        gp.add(m)
      }),
    crate: (x: number, y: number, z: number, ry: number) => piece(x, y, z, ry, 0.8, 0.8, 0.8, (gp) => box(gp, 0.8, 0.8, 0.8, 0, 0, 0, lam(plankTex('#9a7448')))),
    rug: (x: number, y: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), lam(rugTex(['#7a1f24', '#3f6a7a', '#5a3d6a', '#4f6e44'][(b.seed + Math.round(x)) % 4], '#e0b04a'), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }))
      m.rotation.x = -Math.PI / 2
      m.rotation.z = ry
      m.position.set(x, y + 0.01, z)
      g.add(m)
    },
    hearth: (x: number, y: number, z: number, ry: number) => {
      piece(x, y, z, ry, 1.8, 0.8, top - y, (gp) => {
        box(gp, 1.8, 1.3, 0.8, 0, 0, 0, stoneMat)
        box(gp, 1.1, top - y - 1.3, 0.6, 0, 1.3, -0.1, stoneMat)
        const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), new THREE.MeshBasicMaterial({ color: '#1a120c' }))
        mouth.position.set(0, 0.45, 0.405)
        gp.add(mouth)
        const fire = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: fireTex(), transparent: true, alphaTest: 0.5 }))
        fire.position.set(0, 0.42, 0.42)
        gp.add(fire)
      })
      const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry)
      addLight(x + fwd.x * 1.1, y + 0.8, z + fwd.z * 1.1, 0xffa04a, 5)
    },
    bar: (x: number, y: number, z: number, ry: number, len: number) =>
      piece(x, y, z, ry, len, 0.7, 1.1, (gp) => {
        box(gp, len, 1.05, 0.6, 0, 0, 0, darkWood)
        box(gp, len + 0.1, 0.08, 0.75, 0, 1.05, 0, woodMat)
        for (let k = -len / 2 + 0.5; k < len / 2; k += 0.9) {
          const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 8), lam(plankTex('#c9a24a')))
          mug.position.set(k, 1.21, 0.1)
          gp.add(mug)
        }
      }),
    desk: (x: number, y: number, z: number, ry: number) =>
      piece(x, y, z, ry, 1.5, 0.85, 0.8, (gp) => {
        box(gp, 1.5, 0.78, 0.85, 0, 0, 0, darkWood)
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), lam(papersTex(), { transparent: true }))
        p.rotation.x = -Math.PI / 2
        p.position.set(0, 0.785, 0)
        gp.add(p)
      }),
    pew: (x: number, y: number, z: number, ry: number) =>
      piece(x, y, z, ry, 2.8, 0.6, 0.95, (gp) => {
        box(gp, 2.8, 0.08, 0.5, 0, 0.42, 0, woodMat)
        box(gp, 2.8, 0.5, 0.08, 0, 0.45, 0.27, darkWood)
        for (const lx of [-1.3, 1.3]) box(gp, 0.08, 0.95, 0.55, lx, 0, 0, darkWood)
      }),
    anvil: (x: number, y: number, z: number, ry: number) =>
      piece(x, y, z, ry, 1, 0.5, 0.85, (gp) => {
        box(gp, 0.5, 0.5, 0.4, 0, 0, 0, darkWood)
        box(gp, 0.3, 0.15, 0.25, 0, 0.5, 0, iron)
        box(gp, 0.95, 0.2, 0.32, 0.08, 0.65, 0, iron)
      }),
    forge: (x: number, y: number, z: number, ry: number) => {
      piece(x, y, z, ry, 2, 1.2, top - y, (gp) => {
        box(gp, 2, 0.9, 1.2, 0, 0, 0, stoneMat)
        box(gp, 1.6, 0.6, 1, 0, 2.1, -0.05, iron)
        box(gp, 0.6, top - y - 2.7, 0.6, 0, 2.7, -0.2, stoneMat)
        const fire = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshBasicMaterial({ map: fireTex(), transparent: true, alphaTest: 0.5 }))
        fire.position.set(0, 1.15, 0.2)
        gp.add(fire)
      })
      const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry)
      addLight(x + fwd.x * 1.2, y + 1.3, z + fwd.z * 1.2, 0xff8a3a, 7)
    },
  }

  function sprite(tex: THREE.Texture, x: number, y: number, z: number, w: number, h: number, emissive: boolean, parent?: THREE.Group) {
    const s = new Billboard(tex, w, h, 0, emissive)
    s.root.position.set(x, y, z)
    ;(parent ?? g).add(s.root)
    if (!parent) lvl.billboards.push(s)
    return s
  }
  function addLight(x: number, y: number, z: number, color: number, intensity: number) {
    if (lights.length >= 3) return
    const l = new THREE.PointLight(color, intensity, 12, 1.4)
    l.position.set(x, y, z)
    g.add(l)
    lights.push(l)
  }

  // ---- dress each room for its purpose
  const spots = lvl.spots!
  for (const room of rooms) {
    const cx = (room.x0 + room.x1) / 2
    const cz = (room.z0 + room.z1) / 2
    switch (room.kind) {
      case 'living':
        againstWall(room, 1.8, 0.8, items.hearth, ['n', 'e', 'w'])
        inMiddle(room, 2.2, 1.5, items.rug, false)
        againstWall(room, 1.8, 0.5, (x, y, z, ry) => piece(x, y, z, ry, 1.8, 0.5, 0.5, (gp) => box(gp, 1.8, 0.45, 0.5, 0, 0, 0, woodMat)))
        againstWall(room, 1.4, 0.5, items.cupboard)
        spots.resident ??= { x: cx, z: cz }
        break
      case 'kitchen':
        inMiddle(room, 1.6, 2.6, (x, y, z, ry) => {
          items.table(x, y, z, ry)
          items.chairs(x, y, z, ry)
        })
        againstWall(room, 1.4, 0.5, items.cupboard)
        againstWall(room, 0.7, 0.7, items.barrel)
        againstWall(room, 0.7, 0.7, items.barrel)
        if (!lights.length) againstWall(room, 1.8, 0.8, items.hearth, ['n', 'e', 'w'])
        spots.resident ??= { x: cx, z: cz }
        break
      case 'bedroom':
        againstWall(room, 1.15, 2.1, items.bed)
        againstWall(room, 0.9, 0.55, items.chest)
        againstWall(room, 1.2, 0.6, items.wardrobe)
        inMiddle(room, 2.2, 1.5, items.rug, false)
        break
      case 'storage':
        for (let i = 0; i < 4; i++) againstWall(room, 0.8, 0.8, items.crate)
        for (let i = 0; i < 2; i++) againstWall(room, 0.7, 0.7, items.barrel)
        break
      case 'common': {
        // the bar runs along a side wall, the hearth opposite, tables between
        const barLen = Math.min(4.2, room.z1 - room.z0 - 2.4)
        const barSide = r() < 0.5 ? 'w' : 'e'
        const bx = barSide === 'w' ? room.x0 + 1.6 : room.x1 - 1.6
        const bz = room.z0 + 0.6 + barLen / 2
        const brc = { x0: bx - 0.35, x1: bx + 0.35, z0: bz - barLen / 2, z1: bz + barLen / 2 }
        if (free(brc, 0)) {
          placed.push({ ...brc, x0: barSide === 'w' ? room.x0 : brc.x0, x1: barSide === 'w' ? brc.x1 : room.x1 })
          items.bar(bx, 0, bz, barSide === 'w' ? Math.PI / 2 : -Math.PI / 2, barLen)
          spots.keeper = { x: barSide === 'w' ? room.x0 + 0.7 : room.x1 - 0.7, z: bz }
          for (let i = 0; i < 2; i++) items.barrel(barSide === 'w' ? room.x0 + 0.5 : room.x1 - 0.5, 0, room.z0 + 0.5 + i * 0.8)
        }
        againstWall(room, 1.8, 0.8, items.hearth, [barSide === 'w' ? 'e' : 'w', 'n'])
        for (let i = 0; i < 3; i++) {
          const t = inMiddle(room, 1.6, 2.6, (x, y, z, ry) => {
            items.table(x, y, z, ry)
            items.chairs(x, y, z, ry)
          })
          if (t && i === 0) spots.patron = { x: t.x + 0.9, z: t.z + 0.9 }
        }
        break
      }
      case 'office': {
        const d = againstWall(room, 1.5, 0.85, items.desk, ['n'])
        if (d) spots.reeve = { x: d.x, z: d.z - 0.9 }
        const portrait = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.12), lam(portraitTex(), { transparent: true }))
        portrait.position.set(cx, 1.9, room.z0 + 0.02)
        g.add(portrait)
        againstWall(room, 1.6, 0.4, items.bookshelf, ['e', 'w'])
        againstWall(room, 1.6, 0.4, items.bookshelf, ['e', 'w'])
        inMiddle(room, 2.2, 1.5, items.rug, false)
        againstWall(room, 1.8, 0.8, items.hearth, ['e', 'w', 'n'])
        break
      }
      case 'archive':
        for (let i = 0; i < 5; i++) againstWall(room, 1.6, 0.4, items.bookshelf)
        againstWall(room, 1.5, 0.85, items.desk)
        break
      case 'nave': {
        // a raised dais at the far end with the altar and the great lantern
        const daisD = 2.6
        const dais: Rect = { x0: room.x0 + 0.8, x1: room.x1 - 0.8, z0: room.z0, z1: room.z0 + daisD }
        const dm = new THREE.Mesh(boxWU(dais.x1 - dais.x0, 0.4, daisD, 2), stoneMat)
        dm.position.set((dais.x0 + dais.x1) / 2, 0.2, room.z0 + daisD / 2)
        g.add(dm)
        lvl.surfaces!.push({ minX: dais.x0, maxX: dais.x1, minZ: dais.z0, maxZ: dais.z1, y0: 0.4 })
        placed.push(dais)
        piece(cx, 0.4, room.z0 + 1, 0, 1.8, 0.8, 1, (gp) => {
          box(gp, 1.8, 1, 0.8, 0, 0, 0, stoneMat)
          box(gp, 1.84, 0.04, 0.84, 0, 1, 0, linen)
        })
        sprite(propTex('lamp', true), cx, 1.4, room.z0 + 1, 0.9, 2.2, true)
        addLight(cx, 3, room.z0 + 1.8, 0xffd27a, 8)
        spots.ide = { x: cx + 1.4, z: room.z0 + 2.2 }
        for (let z = room.z0 + daisD + 1.2; z < room.z1 - 2.2; z += 1.5)
          for (const s of [-1, 1]) items.pew(cx + s * (1.9 + (room.x1 - room.x0 - 9) / 4), 0, z, Math.PI)
        const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, room.z1 - room.z0 - daisD), lam(rugTex('#7a1f24', '#e0b04a'), { polygonOffset: true, polygonOffsetFactor: -2 }))
        runner.rotation.x = -Math.PI / 2
        runner.position.set(cx, 0.01, (room.z0 + daisD + room.z1) / 2)
        g.add(runner)
        break
      }
      case 'workshop': {
        const f = againstWall(room, 2, 1.2, items.forge, ['n', 'e', 'w'])
        const a = inMiddle(room, 1, 0.5, items.anvil)
        if (a) spots.hobb = { x: a.x + 0.9, z: a.z + 0.6 }
        else if (f) spots.hobb = { x: f.x, z: f.z + 1.6 }
        againstWall(room, 0.7, 0.7, items.barrel)
        againstWall(room, 0.8, 0.8, items.crate)
        break
      }
    }
  }
  spots.resident ??= { x: 0, z: 0 }
  // nobody should be standing on the doormat: pull any spot near the entrance deeper in
  for (const [k, s] of Object.entries(spots)) {
    if (Math.hypot(s.x - lvl.spawn.x, s.z - lvl.spawn.z) >= 3) continue
    let best = s
    for (let tries = 0; tries < 40; tries++) {
      const x = inner.x0 + 0.8 + r() * (inner.x1 - inner.x0 - 1.6)
      const z = inner.z0 + 0.8 + r() * (inner.z1 - inner.z0 - 1.6)
      const spot = { x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35 }
      if (Math.hypot(x - lvl.spawn.x, z - lvl.spawn.z) < 3.2 || !free(spot, 0)) continue
      best = { x, z }
      break
    }
    spots[k] = best
  }
  if (!lights.length) addLight(0, F * 0.8, 0, 0xffd9a0, 4)
  if (storeys > 1) addLight(0, F + 2.2, 0, 0xffd9a0, 3)

  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x5a4636, 0.9)
  g.add(hemi)
  lvl.hemi = hemi
  return lvl
}

interface Plan {
  ground: RoomKind[]
  upper: RoomKind[]
  groundSplits: (r: () => number) => number
  upperSplits: (r: () => number) => number
}

const PLANS: Record<BuildingKind, Plan> = {
  house: { ground: ['living', 'kitchen', 'storage'], upper: ['bedroom', 'bedroom', 'storage'], groundSplits: (r) => (r() < 0.75 ? 1 : 2), upperSplits: (r) => (r() < 0.6 ? 1 : 2) },
  tavern: { ground: ['common', 'kitchen'], upper: ['bedroom', 'bedroom', 'bedroom'], groundSplits: (r) => (r() < 0.5 ? 0 : 1), upperSplits: () => 2 },
  hall: { ground: ['office', 'living'], upper: ['archive', 'bedroom'], groundSplits: () => 1, upperSplits: (r) => (r() < 0.5 ? 0 : 1) },
  temple: { ground: ['nave'], upper: [], groundSplits: () => 0, upperSplits: () => 0 },
  forge: { ground: ['workshop', 'storage'], upper: [], groundSplits: () => 1, upperSplits: () => 0 },
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export type { Rect as InteriorRect, Surface as InteriorSurface, Collider as InteriorCollider }
