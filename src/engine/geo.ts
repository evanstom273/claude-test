import * as THREE from 'three'

/** A box whose UVs are in world units, so one tiling texture fits any size. */
export function boxWU(w: number, h: number, d: number, tile = 3) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile)
    }
  uv.needsUpdate = true
  return g
}

/** Two sloped planes over a w x d footprint, ridge running along x. */
export function gableRoof(w: number, d: number, h: number, over = 0.5, tile = 3) {
  const x0 = -w / 2 - over
  const x1 = w / 2 + over
  const z0 = -d / 2 - over
  const z1 = d / 2 + over
  const drop = (over / (d / 2)) * h
  const slope = Math.hypot(d / 2 + over, h + drop)
  // prettier-ignore
  const pos = [
    x0, -drop, z0, x1, -drop, z0, x1, h, 0, x0, h, 0,
    x0, -drop, z1, x0, h, 0, x1, h, 0, x1, -drop, z1,
  ]
  const u = (x1 - x0) / tile
  const v = slope / tile
  // prettier-ignore
  const uvs = [0, 0, u, 0, u, v, 0, v, 0, 0, 0, v, u, v, u, 0]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6])
  g.computeVertexNormals()
  return g
}

/** The triangular wall ends under a gable roof. */
export function gableEnds(w: number, d: number, h: number, tile = 3) {
  const x = w / 2
  // prettier-ignore
  const pos = [
    x, 0, -d / 2, x, 0, d / 2, x, h, 0,
    -x, 0, d / 2, -x, 0, -d / 2, -x, h, 0,
  ]
  // prettier-ignore
  const uvs = [0, 0, d / tile, 0, d / 2 / tile, h / tile, 0, 0, d / tile, 0, d / 2 / tile, h / tile]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.computeVertexNormals()
  return g
}

const blobTex = (() => {
  let t: THREE.CanvasTexture | null = null
  return () => {
    if (t) return t
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(30,20,10,0.55)')
    g.addColorStop(0.7, 'rgba(30,20,10,0.3)')
    g.addColorStop(1, 'rgba(30,20,10,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
    t = new THREE.CanvasTexture(c)
    return t
  }
})()

/** A soft dark ellipse on the ground under a sprite. */
export function blobShadow(radius: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false }))
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.02
  m.renderOrder = 1
  return m
}

/**
 * A paper cut-out standing in the world that always turns to face the
 * camera around its vertical axis, Daggerfall-style.
 */
export class Billboard {
  root = new THREE.Group()
  /** Pivot at the sprite's base, so it can tip over flat when it dies. */
  pivot = new THREE.Group()
  mesh: THREE.Mesh
  mat: THREE.MeshLambertMaterial
  shadow: THREE.Mesh | null

  constructor(tex: THREE.Texture, w: number, h: number, shadow = w * 0.4, emissive = false) {
    const geo = new THREE.PlaneGeometry(w, h)
    geo.translate(0, h / 2, 0)
    this.mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide })
    if (emissive) {
      this.mat.emissive = new THREE.Color(0xffffff)
      this.mat.emissiveMap = tex
    }
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.pivot.add(this.mesh)
    this.root.add(this.pivot)
    this.shadow = shadow > 0 ? blobShadow(shadow) : null
    if (this.shadow) this.root.add(this.shadow)
  }

  setTexture(tex: THREE.Texture) {
    if (this.mat.map === tex) return
    this.mat.map = tex
    if (this.mat.emissiveMap) this.mat.emissiveMap = tex
  }

  face(cam: THREE.Vector3) {
    this.pivot.rotation.y = Math.atan2(cam.x - this.root.position.x, cam.z - this.root.position.z)
  }
}

export interface Collider {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export const boxCollider = (x: number, z: number, w: number, d: number): Collider => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 })

/** Pushes a circle out of every box it overlaps. */
export function resolveCircle(p: { x: number; z: number }, r: number, cols: Collider[]) {
  for (const c of cols) {
    const cx = Math.max(c.minX, Math.min(c.maxX, p.x))
    const cz = Math.max(c.minZ, Math.min(c.maxZ, p.z))
    const dx = p.x - cx
    const dz = p.z - cz
    const d2 = dx * dx + dz * dz
    if (d2 >= r * r) continue
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2)
      p.x += (dx / d) * (r - d)
      p.z += (dz / d) * (r - d)
    } else {
      // centre inside the box: push out the shortest way
      const pushes = [c.maxX - p.x + r, p.x - c.minX + r, c.maxZ - p.z + r, p.z - c.minZ + r]
      const i = pushes.indexOf(Math.min(...pushes))
      if (i === 0) p.x = c.maxX + r
      else if (i === 1) p.x = c.minX - r
      else if (i === 2) p.z = c.maxZ + r
      else p.z = c.minZ - r
    }
  }
}

/** True if the segment between two points crosses any box (for line of sight). */
export function segmentBlocked(ax: number, az: number, bx: number, bz: number, cols: Collider[]) {
  for (const c of cols) {
    let t0 = 0
    let t1 = 1
    const dx = bx - ax
    const dz = bz - az
    const clip = (p: number, q: number) => {
      if (p === 0) return q >= 0
      const r = q / p
      if (p < 0) {
        if (r > t1) return false
        if (r > t0) t0 = r
      } else {
        if (r < t0) return false
        if (r < t1) t1 = r
      }
      return true
    }
    if (clip(-dx, ax - c.minX) && clip(dx, c.maxX - ax) && clip(-dz, az - c.minZ) && clip(dz, c.maxZ - az) && t0 < t1) return true
  }
  return false
}
