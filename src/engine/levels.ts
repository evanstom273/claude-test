import * as THREE from 'three'
import { backdropTex, cloudTex, cobbleTex, dirtTex, doorTex, flagstoneTex, grassTex, plankTex, plasterTex, propTex, moonTex, roofTex, signTex, stoneTex, sunTex, thatchTex, treeTex, windowTex } from './art'
import { Billboard, boxCollider, boxWU, gableEnds, gableRoof, type Collider } from './geo'

export type LevelId = 'town' | 'barrow'

export interface EnemySpawn {
  kind: 'rat' | 'skeleton'
  x: number
  z: number
}

export interface Interactable {
  id: string
  label: string
  x: number
  z: number
  radius: number
  /** Optional sprite to remove when taken. */
  sprite?: Billboard
}

export interface Level {
  id: LevelId
  group: THREE.Group
  colliders: Collider[]
  spawn: { x: number; z: number; yaw: number }
  enemies: EnemySpawn[]
  interactables: Interactable[]
  outdoors: boolean
  /** Sprites that should keep facing the camera. */
  billboards: Billboard[]
  /** Window and lamp meshes that light up at night. */
  nightLights: { mesh: THREE.Mesh; day: THREE.Material; night: THREE.Material }[]
  sun?: THREE.DirectionalLight
  hemi?: THREE.HemisphereLight
  sky?: { sun: THREE.Mesh; moon: THREE.Mesh; clouds: THREE.Mesh[] }
}

const lambert = (map: THREE.Texture, opts: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map, ...opts })

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ----------------------------------------------------------------- town

interface BuildingDef {
  x: number
  z: number
  w: number
  d: number
  h: number
  /** Degrees; the door faces local +z, so 90 faces +x. */
  rot: 0 | 90 | 180 | 270
  wall: 'plaster' | 'stone' | 'blue' | 'pink'
  roof: 'red' | 'slate' | 'thatch' | 'green'
  sign?: { text: string; pic: 'goose' | 'scales' | 'anvil' | 'sun' }
  spire?: boolean
}

const BUILDINGS: BuildingDef[] = [
  { x: -15, z: -24, w: 10, d: 9, h: 6.5, rot: 90, wall: 'plaster', roof: 'red', sign: { text: 'The Gilded Goose', pic: 'goose' } },
  { x: 15, z: -24, w: 11, d: 9, h: 7.5, rot: 270, wall: 'stone', roof: 'slate', sign: { text: "Reeve's Hall", pic: 'scales' } },
  { x: 24, z: 6, w: 10, d: 13, h: 9, rot: 270, wall: 'stone', roof: 'slate', sign: { text: 'The Lantern', pic: 'sun' }, spire: true },
  { x: -22, z: 8, w: 9, d: 8, h: 5.5, rot: 90, wall: 'plaster', roof: 'thatch', sign: { text: "Hobb's Forge", pic: 'anvil' } },
  { x: -15, z: 24, w: 9, d: 8, h: 6, rot: 90, wall: 'pink', roof: 'red' },
  { x: 15, z: 24, w: 9, d: 8, h: 6.5, rot: 270, wall: 'blue', roof: 'thatch' },
  { x: -28, z: -10, w: 8, d: 7, h: 5.5, rot: 90, wall: 'blue', roof: 'green' },
  { x: 28, z: -12, w: 8, d: 8, h: 6, rot: 270, wall: 'pink', roof: 'red' },
  { x: -28, z: 26, w: 8, d: 7, h: 5, rot: 0, wall: 'plaster', roof: 'thatch' },
  { x: 28, z: 28, w: 8, d: 7, h: 5, rot: 0, wall: 'plaster', roof: 'green' },
  { x: -24, z: -30, w: 8, d: 7, h: 5.5, rot: 0, wall: 'pink', roof: 'slate' },
  { x: 26, z: -30, w: 8, d: 7, h: 5.5, rot: 0, wall: 'blue', roof: 'red' },
]

const WALL_COLORS = { plaster: '#efe2c0', stone: '', blue: '#c8d8e0', pink: '#ecc8bc' }

function building(b: BuildingDef, lvl: Level) {
  const g = new THREE.Group()
  const wallMat = b.wall === 'stone' ? lambert(stoneTex('#b4aa98', '#a49a88', 3)) : lambert(plasterTex(WALL_COLORS[b.wall], b.x * 7 + b.z))
  const roofMat =
    b.roof === 'thatch' ? lambert(thatchTex(), { side: THREE.DoubleSide }) : lambert(roofTex({ red: '#c2563a', slate: '#5a6a80', green: '#5f7a4a' }[b.roof], { red: '#9a3a2a', slate: '#44526a', green: '#4a6038' }[b.roof]), { side: THREE.DoubleSide })
  const body = new THREE.Mesh(boxWU(b.w, b.h, b.d), wallMat)
  body.position.y = b.h / 2
  body.castShadow = body.receiveShadow = true
  g.add(body)
  const rh = Math.min(b.w, b.d) * 0.42
  const roof = new THREE.Mesh(gableRoof(b.w, b.d, rh, 0.6), roofMat)
  roof.position.y = b.h
  roof.castShadow = true
  g.add(roof)
  const ends = new THREE.Mesh(gableEnds(b.w, b.d, rh), wallMat.clone())
  ;(ends.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide
  ends.position.y = b.h
  g.add(ends)

  // door on the front (+z), windows along the front and sides
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), lambert(doorTex(b.wall === 'stone' ? '#4a3626' : '#6b4a2b'), { transparent: true, alphaTest: 0.5 }))
  door.position.set(0, 1.3, b.d / 2 + 0.03)
  g.add(door)
  const winDay = lambert(windowTex(false))
  const winNight = new THREE.MeshBasicMaterial({ map: windowTex(true) })
  const addWin = (x: number, y: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), winDay)
    m.position.set(x, y, z)
    m.rotation.y = ry
    g.add(m)
    lvl.nightLights.push({ mesh: m, day: winDay, night: winNight })
  }
  const floors = b.h > 6 ? [1.8, 4.6] : [1.8, 4.2]
  for (const y of floors)
    for (const x of [-b.w / 2 + 1.8, b.w / 2 - 1.8]) {
      if (y < 3 && Math.abs(x) < 1.5) continue
      addWin(x, y, b.d / 2 + 0.03, 0)
      addWin(x, y, -b.d / 2 - 0.03, Math.PI)
    }
  for (const y of floors) {
    addWin(b.w / 2 + 0.03, y, 0, Math.PI / 2)
    addWin(-b.w / 2 - 0.03, y, 0, -Math.PI / 2)
  }
  if (b.sign) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4), lambert(plankTex('#5a3d26')))
    arm.position.set(1.6, 3.3, b.d / 2 + 0.7)
    g.add(arm)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), lambert(signTex(b.sign.text, b.sign.pic), { side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }))
    sign.position.set(1.6, 2.6, b.d / 2 + 0.9)
    sign.rotation.y = Math.PI / 2
    g.add(sign)
  }
  if (b.spire) {
    const tower = new THREE.Mesh(boxWU(3, 6, 3), wallMat)
    tower.position.set(0, b.h + 3, -b.d / 2 + 2)
    tower.castShadow = true
    g.add(tower)
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5, 4), roofMat)
    cone.position.set(0, b.h + 8.5, -b.d / 2 + 2)
    cone.rotation.y = Math.PI / 4
    cone.castShadow = true
    g.add(cone)
  }
  g.position.set(b.x, 0, b.z)
  g.rotation.y = (b.rot * Math.PI) / 180
  lvl.group.add(g)
  const swap = b.rot === 90 || b.rot === 270
  lvl.colliders.push(boxCollider(b.x, b.z, swap ? b.d : b.w, swap ? b.w : b.d))
}

function townWalls(lvl: Level) {
  const mat = lambert(stoneTex('#a49a88', '#948a78', 5))
  const H = 7
  const R = 42
  const T = 2
  const seg = (x: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(boxWU(w, H, d), mat)
    m.position.set(x, H / 2, z)
    m.castShadow = m.receiveShadow = true
    lvl.group.add(m)
    lvl.colliders.push(boxCollider(x, z, w, d))
    // crenellations along the top
    const along = w > d
    const len = along ? w : d
    for (let i = -len / 2 + 0.8; i < len / 2; i += 2) {
      const c = new THREE.Mesh(boxWU(along ? 1 : w, 1, along ? d : 1), mat)
      c.position.set(x + (along ? i : 0), H + 0.5, z + (along ? 0 : i))
      lvl.group.add(c)
    }
  }
  const gate = 3.5
  seg(-(R + gate) / 2, -R, R - gate, T)
  seg((R + gate) / 2, -R, R - gate, T)
  seg(-(R + gate) / 2, R, R - gate, T)
  seg((R + gate) / 2, R, R - gate, T)
  seg(-R, 0, T, R * 2 + T)
  seg(R, 0, T, R * 2 + T)
  // gatehouse towers and corner towers
  const towerMat = lambert(roofTex('#5a6a80', '#44526a'))
  const tower = (x: number, z: number, r: number, h: number) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 10), mat)
    t.position.set(x, h / 2, z)
    t.castShadow = true
    lvl.group.add(t)
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 1.3, r * 2.2, 10), towerMat)
    cap.position.set(x, h + r * 1.1, z)
    cap.castShadow = true
    lvl.group.add(cap)
    lvl.colliders.push(boxCollider(x, z, r * 2, r * 2))
  }
  for (const z of [-R, R]) {
    tower(-gate - 1.6, z, 2, 10)
    tower(gate + 1.6, z, 2, 10)
  }
  for (const x of [-R, R]) for (const z of [-R, R]) tower(x, z, 2.6, 11)
}

function addSprite(lvl: Level, tex: THREE.Texture, x: number, z: number, w: number, h: number, shadow = w * 0.35, emissive = false) {
  const b = new Billboard(tex, w, h, shadow, emissive)
  b.root.position.set(x, 0, z)
  lvl.group.add(b.root)
  lvl.billboards.push(b)
  return b
}

function backdrop(lvl: Level) {
  const ring = (kind: 'hills' | 'mountains' | 'forest', radius: number, height: number, count: number, seed: number) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const w = ((Math.PI * 2 * radius) / count) * 1.08
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, height), new THREE.MeshLambertMaterial({ map: backdropTex(kind, seed + (i % 3)), alphaTest: 0.5, side: THREE.DoubleSide, fog: true }))
      m.position.set(Math.sin(a) * radius, height / 2 - 1, Math.cos(a) * radius)
      m.rotation.y = a + Math.PI
      lvl.group.add(m)
    }
  }
  ring('mountains', 230, 70, 14, 1)
  ring('hills', 185, 34, 14, 4)
  ring('forest', 150, 18, 16, 7)
}

export function buildTown(): Level {
  const lvl: Level = { id: 'town', group: new THREE.Group(), colliders: [], spawn: { x: 0, z: 30, yaw: 0 }, enemies: [], interactables: [], outdoors: true, billboards: [], nightLights: [] }
  const r = rng(77)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), lambert(grassTex()))
  ;(ground.material as THREE.MeshLambertMaterial).map!.repeat.set(140, 140)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  lvl.group.add(ground)

  // Flat ground layers sit almost on top of each other, so each gets its own
  // depth bias (higher layers always win) instead of fighting over pixels.
  const flat = (mesh: THREE.Mesh, layer: number) => {
    const m = mesh.material as THREE.MeshLambertMaterial
    m.polygonOffset = true
    m.polygonOffsetFactor = -layer
    m.polygonOffsetUnits = -layer * 4
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0.005 * layer
    mesh.receiveShadow = true
    lvl.group.add(mesh)
    return mesh
  }
  // dirt roads out of both gates, tucked just under the cobbles where they meet
  const south = flat(new THREE.Mesh(new THREE.PlaneGeometry(4, 46), lambert(dirtTex('south'))), 1)
  ;(south.material as THREE.MeshLambertMaterial).map!.repeat.set(1.3, 15)
  south.position.z = 42 + 23
  const north = flat(new THREE.Mesh(new THREE.PlaneGeometry(4, 60), lambert(dirtTex('north'))), 1)
  ;(north.material as THREE.MeshLambertMaterial).map!.repeat.set(1.3, 20)
  north.position.z = -42 - 30
  const street = flat(new THREE.Mesh(new THREE.PlaneGeometry(6, 87), lambert(cobbleTex('street'))), 2)
  ;(street.material as THREE.MeshLambertMaterial).map!.repeat.set(2, 29)
  const square = flat(new THREE.Mesh(new THREE.CircleGeometry(14, 40), lambert(cobbleTex())), 3)
  ;(square.material as THREE.MeshLambertMaterial).map!.repeat.set(9, 9)

  for (const b of BUILDINGS) building(b, lvl)
  townWalls(lvl)

  // the well in the square
  const stone = lambert(stoneTex('#b4aa98', '#a49a88', 11))
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 1, 14), stone)
  well.position.set(0, 0.5, 0)
  well.castShadow = true
  lvl.group.add(well)
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.05, 14), new THREE.MeshLambertMaterial({ color: 0x3a5a7a }))
  water.rotation.x = -Math.PI / 2
  water.position.set(0, 0.85, 0)
  lvl.group.add(water)
  const wood = lambert(plankTex('#6b4a2b'))
  for (const x of [-1.2, 1.2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), wood)
    post.position.set(x, 1.3, 0)
    lvl.group.add(post)
  }
  const wroof = new THREE.Mesh(gableRoof(3, 2.2, 0.9, 0.3), lambert(roofTex('#c2563a', '#9a3a2a'), { side: THREE.DoubleSide }))
  wroof.position.set(0, 2.6, 0)
  wroof.castShadow = true
  lvl.group.add(wroof)
  lvl.colliders.push(boxCollider(0, 0, 2.8, 2.8))

  // market stalls, crates and barrels
  for (const [x, z, ry] of [
    [-8, 6, 0.6],
    [8, 7, -0.6],
    [-9, -5, 2.4],
  ] as [number, number, number][]) {
    const s = addSprite(lvl, propTex('stall'), x, z, 4, 4, 1.8)
    s.face = () => {
      s.pivot.rotation.y = ry
    }
    lvl.colliders.push(boxCollider(x, z, 3, 1.4))
  }
  const crateMat = lambert(plankTex('#9a7448'))
  for (const [x, z] of [
    [-10.5, 4.5],
    [-10, 3.2],
    [10.2, 9],
    [-12, -22],
    [12, -20],
    [-19, 12],
  ] as [number, number][]) {
    const c = new THREE.Mesh(boxWU(1, 1, 1, 1), crateMat)
    c.position.set(x, 0.5, z)
    c.rotation.y = r() * 0.6
    c.castShadow = true
    lvl.group.add(c)
    lvl.colliders.push(boxCollider(x, z, 1, 1))
  }
  const barrelMat = lambert(plankTex('#7a5636'))
  for (const [x, z] of [
    [-10.5, -20],
    [-10.5, -21.2],
    [11, 10.5],
    [-18, 10],
  ] as [number, number][]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 1.1, 10), barrelMat)
    b.position.set(x, 0.55, z)
    b.castShadow = true
    lvl.group.add(b)
    lvl.colliders.push(boxCollider(x, z, 0.9, 0.9))
  }

  // lamps along the street
  const lampOff = propTex('lamp', false)
  const lampOn = propTex('lamp', true)
  for (const z of [-32, -16, 16, 32]) {
    for (const x of [-3.6, 3.6]) {
      const l = addSprite(lvl, lampOff, x, z, 1.6, 4.2, 0.4)
      const onMat = new THREE.MeshBasicMaterial({ map: lampOn, alphaTest: 0.5, side: THREE.DoubleSide })
      lvl.nightLights.push({ mesh: l.mesh, day: l.mat, night: onMat })
    }
  }

  // greenery inside the walls
  for (const [x, z, k] of [
    [-34, -36, 'oak'],
    [34, -36, 'birch'],
    [-34, 36, 'birch'],
    [35, 16, 'oak'],
    [-35, 14, 'pine'],
    [20, 36, 'oak'],
    [-20, -36, 'pine'],
  ] as [number, number, 'oak' | 'pine' | 'birch'][]) {
    addSprite(lvl, treeTex(k, Math.abs(x + z)), x, z, 6, 12, 2.2)
    lvl.colliders.push(boxCollider(x, z, 0.8, 0.8))
  }
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1
    addSprite(lvl, propTex('flowers'), side * (4.2 + r() * 0.5), -36 + i * 5.2, 1.4, 0.7, 0)
  }

  // outside the walls: woods, the south road, the barrow
  for (let i = 0; i < 110; i++) {
    const a = r() * Math.PI * 2
    const d = 50 + r() * 80
    const x = Math.sin(a) * d
    const z = Math.cos(a) * d
    if (Math.abs(x) < 7 && Math.abs(z) > 40) continue
    if (Math.hypot(x, z - 96) < 17) continue
    const k = (['oak', 'pine', 'pine', 'birch', 'bush'] as const)[Math.floor(r() * 5)]
    const s = k === 'bush' ? 0.6 : 1
    addSprite(lvl, treeTex(k, i % 6), x, z, 6 * s * (0.8 + r() * 0.5), 12 * s * (0.8 + r() * 0.5), 2.2 * s)
    if (k !== 'bush') lvl.colliders.push(boxCollider(x, z, 0.8, 0.8))
  }

  // the Hollow Barrow: a grassy mound with a stone doorway built into its front
  const mound = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lambert(grassTex('mound')))
  ;(mound.material as THREE.MeshLambertMaterial).map!.repeat.set(8, 4)
  mound.scale.y = 0.45
  mound.position.set(0, 0, 103)
  mound.castShadow = mound.receiveShadow = true
  lvl.group.add(mound)
  lvl.colliders.push(boxCollider(0, 104, 20, 18))
  const stoneMat = lambert(stoneTex('#8a8278', '#7a7268', 13))
  const slab = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    const s = new THREE.Mesh(boxWU(w, h, d), stoneMat)
    s.position.set(x, y, z)
    s.castShadow = s.receiveShadow = true
    lvl.group.add(s)
  }
  // a short stone passage running from the doorway back into the hill
  for (const x of [-1.9, 1.9]) slab(x, 1.65, 90.2, 0.8, 3.3, 4.4)
  slab(0, 3.6, 90.2, 4.6, 0.6, 4.4)
  // the standing stones and lintel framing the door, proud of the hillside
  for (const x of [-1.9, 1.9]) slab(x, 1.9, 87.9, 1, 3.8, 1)
  slab(0, 4.1, 87.9, 5.2, 0.9, 1.2)
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.3), new THREE.MeshBasicMaterial({ color: 0x0e0b09 }))
  mouth.position.set(0, 1.65, 88.5)
  mouth.rotation.y = Math.PI
  lvl.group.add(mouth)
  lvl.colliders.push(boxCollider(0, 90.2, 4.6, 4.4))
  lvl.interactables.push({ id: 'enterBarrow', label: 'Enter the Hollow Barrow', x: 0, z: 86.6, radius: 2.4 })
  addSprite(lvl, propTex('mushrooms'), -3.4, 87.6, 1.2, 0.7, 0)
  addSprite(lvl, propTex('mushrooms'), 3.6, 88.1, 1, 0.6, 0)

  backdrop(lvl)

  // lighting
  const hemi = new THREE.HemisphereLight(0xfff4dc, 0x6a7a4a, 1.1)
  lvl.group.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.8)
  sun.castShadow = true
  sun.shadow.mapSize.set(1536, 1536)
  const sc = sun.shadow.camera
  sc.left = sc.bottom = -45
  sc.right = sc.top = 45
  sc.near = 1
  sc.far = 200
  sun.shadow.bias = -0.0006
  lvl.group.add(sun, sun.target)
  lvl.sun = sun
  lvl.hemi = hemi

  // a paper sun and moon in the sky, and drifting clouds
  const skyMat = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5, fog: false, side: THREE.DoubleSide })
  const sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), skyMat(sunTex()))
  const moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), skyMat(moonTex()))
  lvl.group.add(sunMesh, moonMesh)
  const clouds: THREE.Mesh[] = []
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshLambertMaterial({ map: cloudTex(i % 4), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: false }))
    const a = r() * Math.PI * 2
    const d = 120 + r() * 70
    c.position.set(Math.sin(a) * d, 55 + r() * 30, Math.cos(a) * d)
    c.lookAt(0, c.position.y, 0)
    clouds.push(c)
    lvl.group.add(c)
  }
  lvl.sky = { sun: sunMesh, moon: moonMesh, clouds }
  return lvl
}

// --------------------------------------------------------------- barrow

const TILE = 3.6
const WALL_H = 4

/** Carves a looping maze with a few rooms, Daggerfall-style. */
function carve(n: number, seed: number) {
  const r = rng(seed)
  const g: boolean[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => true))
  const stack: [number, number][] = [[1, 1]]
  g[1][1] = false
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]
    const dirs = [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ].filter(([dx, dy]) => x + dx > 0 && x + dx < n - 1 && y + dy > 0 && y + dy < n - 1 && g[y + dy][x + dx])
    if (!dirs.length) {
      stack.pop()
      continue
    }
    const [dx, dy] = dirs[Math.floor(r() * dirs.length)]
    g[y + dy / 2][x + dx / 2] = false
    g[y + dy][x + dx] = false
    stack.push([x + dx, y + dy])
  }
  // knock through some walls so it loops back on itself
  for (let i = 0; i < n * 2; i++) {
    const x = 1 + Math.floor(r() * (n - 2))
    const y = 1 + Math.floor(r() * (n - 2))
    if (g[y][x] && ((!g[y][x - 1] && !g[y][x + 1]) || (!g[y - 1][x] && !g[y + 1][x]))) g[y][x] = false
  }
  // a few chambers
  const rooms: { x: number; y: number }[] = []
  for (let i = 0; i < 5; i++) {
    const rx = 2 + Math.floor(r() * (n - 6))
    const ry = 2 + Math.floor(r() * (n - 6))
    for (let y = ry; y < ry + 3; y++) for (let x = rx; x < rx + 3; x++) g[y][x] = false
    rooms.push({ x: rx + 1, y: ry + 1 })
  }
  return { g, rooms }
}

export function buildBarrow(): Level {
  const n = 19
  const { g, rooms } = carve(n, 1847)
  const lvl: Level = { id: 'barrow', group: new THREE.Group(), colliders: [], spawn: { x: 1 * TILE + TILE / 2, z: 1 * TILE + TILE / 2, yaw: Math.PI }, enemies: [], interactables: [], outdoors: false, billboards: [], nightLights: [] }
  const r = rng(5)
  const cx = (x: number) => x * TILE + TILE / 2

  // walls as one instanced mesh
  const solid: [number, number][] = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g[y][x]) solid.push([x, y])
  const wallMat = lambert(stoneTex('#6a625a', '#5a534c', 21))
  const inst = new THREE.InstancedMesh(boxWU(TILE, WALL_H, TILE, 3.6), wallMat, solid.length)
  const m4 = new THREE.Matrix4()
  solid.forEach(([x, y], i) => {
    m4.makeTranslation(cx(x), WALL_H / 2, cx(y))
    inst.setMatrixAt(i, m4)
    // only walls next to open floor can ever touch the player
    const edge = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => g[y + dy]?.[x + dx] === false)
    if (edge) lvl.colliders.push(boxCollider(cx(x), cx(y), TILE, TILE))
  })
  lvl.group.add(inst)

  const size = n * TILE
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), lambert(flagstoneTex()))
  ;(floor.material as THREE.MeshLambertMaterial).map!.repeat.set(n, n)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(size / 2, 0, size / 2)
  lvl.group.add(floor)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(size, size), lambert(stoneTex('#3a3430', '#332e2a', 23)))
  ;(ceil.material as THREE.MeshLambertMaterial).map!.repeat.set(n / 2, n / 2)
  ceil.rotation.x = Math.PI / 2
  ceil.position.set(size / 2, WALL_H, size / 2)
  lvl.group.add(ceil)

  // torches on walls facing open floor
  const torch = propTex('torch')
  let placed = 0
  for (let y = 1; y < n - 1 && placed < 40; y++)
    for (let x = 1; x < n - 1; x++) {
      if (g[y][x] || r() > 0.12) continue
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (!g[y + dy][x + dx]) continue
        const t = addSprite(lvl, torch, cx(x) + dx * (TILE / 2 - 0.25), cx(y) + dy * (TILE / 2 - 0.25), 0.8, 0.8, 0, true)
        t.root.position.y = 1.9
        t.face = () => {
          t.pivot.rotation.y = Math.atan2(-dx, -dy)
        }
        placed++
        break
      }
    }

  // flood fill distances from the entrance to place the prize far away
  const dist: number[][] = g.map((row) => row.map(() => -1))
  const q: [number, number][] = [[1, 1]]
  dist[1][1] = 0
  while (q.length) {
    const [x, y] = q.shift()!
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx
      const ny = y + dy
      if (!g[ny]?.[nx] && dist[ny][nx] < 0) {
        dist[ny][nx] = dist[y][x] + 1
        q.push([nx, ny])
      }
    }
  }
  let far = { x: 1, y: 1, d: 0 }
  for (const rm of rooms) if (dist[rm.y][rm.x] > far.d) far = { x: rm.x, y: rm.y, d: dist[rm.y][rm.x] }
  addSprite(lvl, propTex('corpse'), cx(far.x), cx(far.y) + 0.6, 2.6, 0.8, 0)
  const ring = addSprite(lvl, propTex('ring'), cx(far.x) + 0.6, cx(far.y) - 0.4, 0.6, 0.6, 0.2, true)
  ring.root.position.y = 0.25
  lvl.interactables.push({ id: 'ring', label: "Take the Reeve's signet", x: cx(far.x) + 0.6, z: cx(far.y) - 0.4, radius: 1.8, sprite: ring })
  lvl.interactables.push({ id: 'jory', label: 'Search the body', x: cx(far.x), z: cx(far.y) + 0.6, radius: 1.8 })

  // the way out, behind where you came in
  const exit = addSprite(lvl, propTex('exit'), cx(1), cx(1) - TILE / 2 + 0.3, 2.4, 3.6, 0)
  exit.face = () => {
    exit.pivot.rotation.y = 0
  }
  g[0][1] = true
  lvl.interactables.push({ id: 'leaveBarrow', label: 'Climb back up to daylight', x: cx(1), z: cx(1) - 1.2, radius: 1.8 })

  // face down whichever corridor leads away from the entrance (yaw 0 looks toward -z)
  const out = [
    [1, 0, -Math.PI / 2],
    [0, 1, Math.PI],
    [-1, 0, Math.PI / 2],
  ].find(([dx, dy]) => !g[1 + dy][1 + dx])
  if (out) lvl.spawn.yaw = out[2]

  // inhabitants: rats near the entrance, the dead deeper in
  const open: [number, number][] = []
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) if (!g[y][x] && dist[y][x] > 4) open.push([x, y])
  open.sort(() => r() - 0.5)
  let rats = 0
  let skels = 0
  for (const [x, y] of open) {
    if (rats < 6 && dist[y][x] < 22) {
      lvl.enemies.push({ kind: 'rat', x: cx(x), z: cx(y) })
      rats++
    } else if (skels < 6 && dist[y][x] >= 14) {
      lvl.enemies.push({ kind: 'skeleton', x: cx(x), z: cx(y) })
      skels++
    }
    if (rats >= 6 && skels >= 6) break
  }
  for (const rm of rooms) if (rm !== rooms.find((q2) => q2.x === far.x && q2.y === far.y)) addSprite(lvl, propTex('mushrooms'), cx(rm.x) + 1, cx(rm.y) + 1.2, 1, 0.6, 0)
  lvl.enemies.push({ kind: 'skeleton', x: cx(far.x) - 1.5, z: cx(far.y) - 1 })

  const amb = new THREE.HemisphereLight(0x8a7a6a, 0x2a2018, 0.55)
  lvl.group.add(amb)
  lvl.hemi = amb
  return lvl
}

export const BARROW_TILE = TILE
