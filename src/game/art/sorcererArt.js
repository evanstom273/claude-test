// Hooded sorcerer, eight directions, elevated three-quarter view.
// Built from a small 3D rig projected to 2D so every view shares proportions and lighting.

const PX = 64 // rig units per metre
const SCALE = 96 / 64 // final art: 96 world pixels per metre (1 SVG unit = 1 world pixel)
const W = 150
const H = 178
const OUT_W = W * SCALE
const OUT_H = H * SCALE
const FOOT = { x: 75, y: 154 }
const KY = 0.88 // vertical foreshortening of height
const KZ = 0.42 // how far toward-camera depth pushes down the screen
const LIGHT = norm([-0.55, 0.75, 0.45]) // from upper left, slightly toward camera

const C = {
  ink: '#121614',
  robe: ['#2a302e', '#3d4542', '#525b56', '#68716a'], // deep shadow → highlight
  mantle: ['#1c2120', '#2a302e', '#38403d', '#4a524e'],
  lining: ['#3d1618', '#5a2124'],
  trim: ['#6e5630', '#9a7a42', '#c9a45e', '#e3c580'],
  leather: ['#3a2416', '#55361f', '#70492b'],
  wood: ['#2e1f14', '#4a3220', '#66472c', '#86603a'],
  bronze: ['#5a4426', '#8a6a38', '#c4a060'],
  skin: ['#6e4a36', '#9a6c50', '#c08c6a'],
  boot: ['#1e1814', '#33281f'],
  crystal: ['#7fb8c8', '#c4eef5', '#ffffff'],
}

function norm(v) {
  const l = Math.hypot(...v)
  return v.map((x) => x / l)
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const f = (n) => +n.toFixed(2)

/** The current pose. Idle is all zeros; the walk and sprint cycles fill these in per frame. */
const IDLE = {
  bob: 0, // metres the upper body rises (feet stay planted)
  lean: 0, // forward lean, metres of forward shift per metre of height
  sway: 0, // weight shifting side to side over the standing leg
  hem: { ox: 0, oz: 0, flare: 0 }, // robe hem offset and extra width
  mantle: { oz: 0 }, // capelet trailing behind
  hoodTip: 0, // hood point swinging back
  feet: [{ z: 0, lift: 0 }, { z: 0, lift: 0 }], // left, right
  leftHand: { z: 0, y: 0 },
  grip: { z: 0, y: 0 },
  staffTilt: 0, // staff top pushed forward (metres)
  staffLift: 0, // carried off the ground
}
let POSE = IDLE

/** a = facing angle in radians; 0 faces the camera (south), π/2 faces east (screen right). */
function rig(a) {
  const fwd = [Math.sin(a), 0, Math.cos(a)]
  const right = [-Math.cos(a), 0, Math.sin(a)]
  // body space (x right, y up, z forward, metres) → world (X screen right, Y up, Z toward camera)
  // the pose bends body space first: bob lifts everything above the knees, lean tips it forward
  const k = (y) => Math.max(0, Math.min(1, y / 0.45))
  const w = (x, y, z) => {
    const yy = y + POSE.bob * k(y)
    const zz = z + POSE.lean * y
    const xx = x + POSE.sway * k(y)
    return [right[0] * xx + fwd[0] * zz, yy, right[2] * xx + fwd[2] * zz]
  }
  const p = ([X, Y, Z]) => ({ x: FOOT.x + X * PX, y: FOOT.y - Y * PX * KY + Z * PX * KZ, d: Z })
  const P = (x, y, z) => p(w(x, y, z))
  return { fwd, right, w, p, P }
}

/** Quantised lambert → one of 4 cel tones. */
function tone(n, ramp) {
  const l = dot(n, LIGHT)
  const i = l > 0.55 ? 3 : l > 0.2 ? 2 : l > -0.15 ? 1 : 0
  return ramp[Math.min(i, ramp.length - 1)]
}

const pts = (arr) => arr.map((q) => `${f(q.x)},${f(q.y)}`).join(' ')

/**
 * A tapered fabric cone (robe, mantle) between two elliptical rings, drawn as
 * cel-shaded vertical panels; only panels facing the camera are drawn.
 */
function cone(R, ring0, ring1, ramp, opts = {}) {
  const N = 28
  const ringPts = (r) => {
    const out = []
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2
      const x = Math.sin(t) * r.rx + (r.ox ?? 0)
      const z = Math.cos(t) * r.rz + (r.oz ?? 0)
      // a gentle wave at the hem for folds
      const fold = r.fold ? Math.sin(t * 7) * r.fold : 0
      const dv = r.deform ? r.deform(t) : { dy: 0, dz: 0 }
      out.push({ t, P: R.P(x * (1 + fold), r.y + dv.dy, z * (1 + fold) + dv.dz), n: R.w(Math.sin(t), 0, Math.cos(t) * (r.rx / r.rz)) })
    }
    return out
  }
  const a = ringPts(ring0)
  const b = ringPts(ring1)
  let s = ''
  // back panels first, then front (painter's order around the ring)
  const panels = []
  for (let i = 0; i < N; i++) {
    const n = norm(a[i].n.map((v, k) => v + a[i + 1].n[k]))
    const facing = n[2] * 0.9 + 0.35 // camera is above and in front
    const depth = (a[i].P.d + a[i + 1].P.d) / 2
    panels.push({ i, n, facing, depth })
  }
  panels.sort((p, q) => p.depth - q.depth)
  for (const pn of panels) {
    const i = pn.i
    const c = tone(pn.n, ramp)
    const poly = [a[i].P, a[i + 1].P, b[i + 1].P, b[i].P]
    s += `<polygon points="${pts(poly)}" fill="${c}" stroke="${c}" stroke-width="0.6" stroke-linejoin="round"/>`
  }
  // silhouette outline: convex hull of both rings
  const hull = convexHull([...a, ...b].map((q) => q.P))
  s = `<g>${s}</g>`
  const outline = `<polygon points="${pts(hull)}" fill="none" stroke="${C.ink}" stroke-width="1.1" stroke-linejoin="round"/>`
  // hem band (trim) along the visible front of ring0
  let trim = ''
  if (opts.trim) {
    const facesCam = (q) => q.n[2] > 0.05
    const vis = a.filter((q, i) => i < N && facesCam(q))
    if (vis.length > 1) {
      const lift = a.map((q) => {
        const dv = ring0.deform ? ring0.deform(q.t) : { dy: 0, dz: 0 }
        return R.P(Math.sin(q.t) * ring0.rx + (ring0.ox ?? 0), ring0.y + opts.trim.h + dv.dy, Math.cos(q.t) * ring0.rz + (ring0.oz ?? 0) + dv.dz)
      })
      const visIdx = a.map((q, i) => (facesCam(q) && facesCam(a[i + 1] ?? q) ? i : -1)).filter((i) => i >= 0 && i < N)
      for (const i of visIdx) {
        const n = norm(a[i].n)
        const c = tone(n, C.trim)
        trim += `<polygon points="${pts([a[i].P, a[i + 1].P, lift[i + 1], lift[i]])}" fill="${c}" stroke="${c}" stroke-width="0.5"/>`
        if (opts.trim.motif && i % 2 === 0 && a[i].n[2] > 0.3) {
          const mx = (a[i].P.x + a[i + 1].P.x + lift[i].x + lift[i + 1].x) / 4
          const my = (a[i].P.y + a[i + 1].P.y + lift[i].y + lift[i + 1].y) / 4
          trim += `<path d="M${f(mx)} ${f(my - 1.6)} l1.3 1.6 l-1.3 1.6 l-1.3 -1.6Z" fill="${C.trim[0]}"/>`
        }
      }
    }
  }
  return { body: s + trim, outline, hull }
}

/** A closed curve through the points, rounding off the hull's corners. */
function smooth(pp) {
  const n = pp.length
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  let d = `M${f(mid(pp[n - 1], pp[0]).x)} ${f(mid(pp[n - 1], pp[0]).y)}`
  for (let i = 0; i < n; i++) {
    const m = mid(pp[i], pp[(i + 1) % n])
    d += ` Q${f(pp[i].x)} ${f(pp[i].y)} ${f(m.x)} ${f(m.y)}`
  }
  return d + 'Z'
}

function convexHull(points) {
  const p = points.map((q) => [q.x, q.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper = []
  for (const q of p.slice().reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].map(([x, y]) => ({ x, y }))
}

/** A tapered limb from a to b, cel-shaded: shadow base, lit band, outline. */
function limb(a, b, w0, w1, ramp, id) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L = Math.hypot(dx, dy) || 1
  const nx = -dy / L
  const ny = dx / L
  const poly = [
    { x: a.x + nx * w0, y: a.y + ny * w0 },
    { x: b.x + nx * w1, y: b.y + ny * w1 },
    { x: b.x - nx * w1, y: b.y - ny * w1 },
    { x: a.x - nx * w0, y: a.y - ny * w0 },
  ]
  // which side faces the light (screen-space light comes from upper left)
  const lit = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1
  const band = [
    { x: a.x + nx * w0 * lit, y: a.y + ny * w0 * lit },
    { x: b.x + nx * w1 * lit, y: b.y + ny * w1 * lit },
    { x: b.x + nx * w1 * lit * 0.1, y: b.y + ny * w1 * lit * 0.1 },
    { x: a.x + nx * w0 * lit * 0.1, y: a.y + ny * w0 * lit * 0.1 },
  ]
  return `<g><polygon points="${pts(poly)}" fill="${ramp[1]}" stroke="${C.ink}" stroke-width="1" stroke-linejoin="round"/><polygon points="${pts(band)}" fill="${ramp[2]}"/></g>`
}

function sorcerer(a, idp) {
  // the staff runs through the right hand's grip point (body space, metres)
  const GRIP = [0.4, 1.0 + POSE.grip.y, 0.08 + POSE.grip.z]
  const STAFF_TOP = [0.37, 1.92 + POSE.grip.y + POSE.staffLift, 0.05 + POSE.grip.z + POSE.staffTilt]
  const below = GRIP[1] - POSE.staffLift
  const STAFF_BASE = GRIP.map((g, i) => g - ((STAFF_TOP[i] - g) / (STAFF_TOP[1] - GRIP[1])) * below)
  const R = rig(a)
  const facingCam = R.fwd[2] // 1 toward camera, -1 away
  const parts = []

  // contact shadow
  const shadow = `<ellipse cx="${FOOT.x}" cy="${FOOT.y}" rx="22" ry="8" fill="url(#${idp}sh)"/>`

  // boots: drawn behind the robe, so they show where they step out past the hem or the hem lifts
  for (const [i, sx] of [[0, -0.09], [1, 0.09]]) {
    const ft = POSE.feet[i]
    const y0 = 0.01 + ft.lift
    const q = (x, y, z) => R.w(sx + x, y0 + y, ft.z + z)
    const pts3 = [q(-0.05, 0, -0.07), q(0.05, 0, -0.07), q(-0.045, 0, 0.19), q(0.045, 0, 0.19), q(0, 0.05, 0.2), q(-0.05, 0.12, -0.03), q(0.05, 0.12, -0.03), q(-0.05, 0.12, 0.06), q(0.05, 0.12, 0.06)]
    const hull = convexHull(pts3.map((v) => R.p(v)))
    const sole = [q(-0.05, 0, -0.07), q(0.05, 0, -0.07), q(-0.045, 0, 0.19), q(0.045, 0, 0.19), q(0, 0.015, 0.2)].map((v) => R.p(v))
    const soleHull = convexHull(sole)
    const toe = R.p(q(0, 0.06, 0.15))
    parts.push({
      d: -0.5,
      s: `<path d="${smooth(hull)}" fill="${C.boot[1]}" stroke="${C.ink}" stroke-width="0.9"/><path d="${smooth(soleHull)}" fill="${C.boot[0]}"/><ellipse cx="${f(toe.x - 0.8)}" cy="${f(toe.y - 0.8)}" rx="1.8" ry="1" fill="#4a3c30"/>`,
    })
  }

  // robe: hem to waist, then waist to shoulders
  const legZ = (t) => {
    // each leg drives its own half of the hem, with a short blend down the middle
    const wR = Math.max(0, Math.min(1, 0.5 + Math.sin(t) * 2.5))
    return POSE.feet[0].z * (1 - wR) + POSE.feet[1].z * wR
  }
  const hem = {
    y: 0.04,
    rx: 0.3 + POSE.hem.flare,
    rz: 0.24 + POSE.hem.flare,
    ox: POSE.hem.ox,
    oz: -0.02 + POSE.hem.oz,
    fold: 0.035 + POSE.hem.flare * 0.3,
    deform: (t) => {
      const lz = legZ(t)
      const front = Math.max(0, Math.cos(t))
      return { dz: lz * (lz > 0 ? 0.45 : 0.3), dy: Math.max(0, lz) * 0.6 * front }
    },
  }
  const waist = { y: 0.98, rx: 0.17, rz: 0.12 }
  const chest = { y: 1.36, rx: 0.2, rz: 0.13 }
  const skirt = cone(R, hem, waist, C.robe, { trim: { h: 0.07, motif: true } })
  const torso = cone(R, waist, chest, C.robe)
  {
    const cid = `${idp}skirt`
    const top = R.P(0, 0.98, 0)
    const bot = R.P(0, 0.04, 0)
    let folds = ''
    for (const k of [-0.6, -0.15, 0.35, 0.75]) {
      const t = k
      const pT = R.P(Math.sin(t) * 0.17, 0.95, Math.cos(t) * 0.12)
      const pB = R.P(Math.sin(t * 1.08) * 0.29, 0.1, Math.cos(t * 1.08) * 0.23 - 0.02)
      if (R.w(Math.sin(t), 0, Math.cos(t))[2] < 0.15) continue
      folds += `<path d="M${f(pT.x)} ${f(pT.y)} Q${f((pT.x + pB.x) / 2 + 1)} ${f((pT.y + pB.y) / 2)} ${f(pB.x)} ${f(pB.y)}" stroke="${C.robe[0]}" stroke-width="0.9" fill="none" opacity="0.8"/>`
    }
    const occl = `<clipPath id="${cid}"><polygon points="${pts(skirt.hull)}"/></clipPath><g clip-path="url(#${cid})"><rect x="0" y="${f(top.y)}" width="${W}" height="${f(bot.y - top.y + 6)}" fill="url(#${idp}occ)"/>${folds}</g>`
    parts.push({ d: 0, s: skirt.body + occl + skirt.outline })
  }
  parts.push({ d: 0.001, s: torso.body + torso.outline })

  // belt and satchel
  {
    let belt = ''
    const N = 20
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI * 2
      const t1 = ((i + 1) / N) * Math.PI * 2
      const q = (t, y) => R.P(Math.sin(t) * 0.178, y, Math.cos(t) * 0.128)
      const mid = R.w(Math.sin((t0 + t1) / 2), 0, Math.cos((t0 + t1) / 2))
      if (mid[2] < -0.05) continue
      const c = tone(norm(mid), C.leather)
      belt += `<polygon points="${pts([q(t0, 0.95), q(t1, 0.95), q(t1, 1.01), q(t0, 1.01)])}" fill="${c}" stroke="${c}" stroke-width="0.4"/>`
    }
    // buckle at the front
    const bk = R.P(0, 0.98, 0.13)
    if (facingCam > 0.1) belt += `<rect x="${f(bk.x - 2)}" y="${f(bk.y - 2)}" width="4" height="4" rx="0.6" fill="${C.bronze[1]}" stroke="${C.ink}" stroke-width="0.7"/><rect x="${f(bk.x - 0.8)}" y="${f(bk.y - 0.8)}" width="1.6" height="1.6" fill="${C.bronze[0]}"/>`
    parts.push({ d: 0.002, s: belt })
    // satchel on the left hip
    const sp = R.w(-0.19, 0.82, -0.02)
    const sc = R.p(sp)
    const side = R.w(-1, 0, 0)
    const c = tone(norm([side[0], 0.3, side[2]]), C.leather)
    parts.push({
      d: sp[2] + 0.12 * Math.sign(sp[2] || 1),
      s: `<g><rect x="${f(sc.x - 5)}" y="${f(sc.y - 5)}" width="10" height="9" rx="1.6" fill="${c}" stroke="${C.ink}" stroke-width="0.9"/><path d="M${f(sc.x - 5)} ${f(sc.y - 2)} Q${f(sc.x)} ${f(sc.y + 1.5)} ${f(sc.x + 5)} ${f(sc.y - 2)}" fill="none" stroke="${C.leather[0]}" stroke-width="0.8"/><circle cx="${f(sc.x)}" cy="${f(sc.y)}" r="0.9" fill="${C.bronze[2]}"/></g>`,
    })
  }

  // mantle: short cape over the shoulders with a trimmed edge
  const mBot = { y: 1.13, rx: 0.27, rz: 0.21, oz: -0.02 + POSE.mantle.oz, fold: 0.03 }
  const mTop = { y: 1.47, rx: 0.15, rz: 0.11 }
  const mantle = cone(R, mBot, mTop, C.mantle, { trim: { h: 0.035 } })
  {
    let extra = ''
    const cl = R.P(0, 1.43, 0.115)
    if (facingCam > 0.2) {
      extra += `<path d="M${f(cl.x - 4.5)} ${f(cl.y - 1)} Q${f(cl.x)} ${f(cl.y + 2)} ${f(cl.x + 4.5)} ${f(cl.y - 1)}" stroke="${C.bronze[0]}" stroke-width="0.8" fill="none"/>`
      extra += `<circle cx="${f(cl.x)}" cy="${f(cl.y + 0.5)}" r="2.3" fill="${C.bronze[1]}" stroke="${C.ink}" stroke-width="0.8"/><circle cx="${f(cl.x - 0.6)}" cy="${f(cl.y - 0.1)}" r="0.9" fill="${C.bronze[2]}"/>`
    }
    parts.push({ d: 0.01, s: mantle.body + mantle.outline + extra })
  }
  // a knotted cord hanging from the belt on the right hip
  {
    const k = R.w(0.12, 0.96, 0.1)
    if (R.w(0.6, 0, 0.8)[2] > 0.15) {
      const a0 = R.p(k)
      const b0 = R.P(0.13, 0.68, 0.12)
      parts.push({ d: k[2] + 0.003, s: `<path d="M${f(a0.x)} ${f(a0.y)} Q${f(a0.x + 1.5)} ${f((a0.y + b0.y) / 2)} ${f(b0.x)} ${f(b0.y)}" stroke="${C.ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M${f(a0.x)} ${f(a0.y)} Q${f(a0.x + 1.5)} ${f((a0.y + b0.y) / 2)} ${f(b0.x)} ${f(b0.y)}" stroke="${C.trim[1]}" stroke-width="1.1" fill="none" stroke-linecap="round"/><circle cx="${f(a0.x)}" cy="${f(a0.y)}" r="1.6" fill="${C.trim[2]}" stroke="${C.ink}" stroke-width="0.6"/><path d="M${f(b0.x - 1.3)} ${f(b0.y)} l1.3 3.2 l1.3 -3.2Z" fill="${C.trim[1]}" stroke="${C.ink}" stroke-width="0.5"/>` })
    }
  }

  // arms: right hand grips the staff, left hangs by the satchel
  const arm = (side) => {
    const sh = R.P(side * 0.17, 1.3, 0.0)
    const el = R.P(side * (side > 0 ? 0.3 : 0.23), 1.07, 0.05)
    const hd = side > 0 ? R.P(...GRIP) : R.P(-0.15, 0.92 + POSE.leftHand.y, 0.15 + POSE.leftHand.z)
    const depth = R.w(side * (side > 0 ? 0.32 : 0.24), 0, side > 0 ? 0.06 : 0.08)[2]
    // a bell sleeve: narrow at the shoulder, flaring at the wrist
    const seg = (a0, b0, w0, w1) => {
      const dx = b0.x - a0.x, dy = b0.y - a0.y, L = Math.hypot(dx, dy) || 1
      return { nx: -dy / L, ny: dx / L, a0, b0, w0, w1 }
    }
    const s1 = seg(sh, el, 3.4, 3.6)
    const s2 = seg(el, hd, 3.6, 5.6)
    const L = (sg, k) => ({ x: sg.a0.x + (sg.b0.x - sg.a0.x) * k, y: sg.a0.y + (sg.b0.y - sg.a0.y) * k })
    const off = (q, sg, w) => ({ x: q.x + sg.nx * w, y: q.y + sg.ny * w })
    const outer = [off(sh, s1, s1.w0), off(el, s1, s1.w1), off(hd, s2, s2.w1)]
    const inner = [off(hd, s2, -s2.w1), off(el, s2, -s2.w0 * 0.8), off(sh, s1, -s1.w0)]
    const path = `M${f(outer[0].x)} ${f(outer[0].y)} Q${f(outer[1].x)} ${f(outer[1].y)} ${f(outer[2].x)} ${f(outer[2].y)} L${f(inner[0].x)} ${f(inner[0].y)} Q${f(inner[1].x)} ${f(inner[1].y)} ${f(inner[2].x)} ${f(inner[2].y)} Z`
    // lit band on the side facing the upper-left light
    const lit = s2.nx * -0.6 + s2.ny * -0.8 > 0 ? 1 : -1
    const band = `M${f(off(sh, s1, s1.w0 * lit).x)} ${f(off(sh, s1, s1.w0 * lit).y)} Q${f(off(el, s1, s1.w1 * lit).x)} ${f(off(el, s1, s1.w1 * lit).y)} ${f(off(hd, s2, s2.w1 * lit).x)} ${f(off(hd, s2, s2.w1 * lit).y)} L${f(off(hd, s2, s2.w1 * lit * 0.2).x)} ${f(off(hd, s2, s2.w1 * lit * 0.2).y)} Q${f(off(el, s1, s1.w1 * lit * 0.15).x)} ${f(off(el, s1, s1.w1 * lit * 0.15).y)} ${f(off(sh, s1, s1.w0 * lit * 0.2).x)} ${f(off(sh, s1, s1.w0 * lit * 0.2).y)}Z`
    const fold = `M${f(L(s2, 0.25).x)} ${f(L(s2, 0.25).y)} L${f(off(hd, s2, -s2.w1 * 0.3).x)} ${f(off(hd, s2, -s2.w1 * 0.3).y)}`
    const sleeve = `<path d="${path}" fill="${C.robe[1]}" stroke="${C.ink}" stroke-width="1" stroke-linejoin="round"/><path d="${band}" fill="${C.robe[2]}"/><path d="${fold}" stroke="${C.robe[0]}" stroke-width="0.7" fill="none"/>`
    // the open cuff, seen end-on as a dark ellipse with a trim rim
    const ca = (Math.atan2(s2.ny, s2.nx) * 180) / Math.PI
    const cuff = `<ellipse cx="${f(hd.x)}" cy="${f(hd.y)}" rx="${f(s2.w1)}" ry="2.2" transform="rotate(${f(ca)} ${f(hd.x)} ${f(hd.y)})" fill="${C.trim[1]}" stroke="${C.ink}" stroke-width="0.8"/><ellipse cx="${f(hd.x)}" cy="${f(hd.y)}" rx="${f(s2.w1 - 1.4)}" ry="1.2" transform="rotate(${f(ca)} ${f(hd.x)} ${f(hd.y)})" fill="#141716"/>`
    let hx = hd.x + (hd.x - el.x) * 0.18, hy = hd.y + (hd.y - el.y) * 0.18 + 1
    if (side > 0) {
      // the grip sits on the shaft, just below the cuff
      const b = R.P(...STAFF_BASE), t = R.P(...STAFF_TOP)
      const k = 1.2 / Math.hypot(t.x - b.x, t.y - b.y)
      hx = hd.x - (t.x - b.x) * k
      hy = hd.y - (t.y - b.y) * k
    }
    const hand = `<ellipse cx="${f(hx)}" cy="${f(hy)}" rx="2.4" ry="2.7" fill="${C.skin[1]}" stroke="${C.ink}" stroke-width="0.8"/><ellipse cx="${f(hx - 0.7)}" cy="${f(hy - 0.8)}" rx="1" ry="0.9" fill="${C.skin[2]}"/>`
    if (side > 0) {
      const grip = `<ellipse cx="${f(hx)}" cy="${f(hy)}" rx="2.6" ry="2.9" fill="${C.skin[1]}" stroke="${C.ink}" stroke-width="0.8"/><path d="M${f(hx - 2.2)} ${f(hy - 0.4)} h4.4 M${f(hx - 2.2)} ${f(hy + 1)} h4.4" stroke="${C.skin[0]}" stroke-width="0.6"/><ellipse cx="${f(hx - 0.8)}" cy="${f(hy - 1.2)}" rx="1" ry="0.8" fill="${C.skin[2]}"/>`
      // cuff and hand travel together, so one is never shown without the other
      parts.push({ d: Math.max(R.w(GRIP[0], 0, GRIP[2])[2], depth) + 0.004, s: cuff + grip })
      return { d: depth, s: `<g>${sleeve}</g>`, hand: hd }
    }
    return { d: depth, s: `<g>${sleeve}${cuff}${hand}</g>`, hand: hd }
  }
  const armR = arm(1)
  const armL = arm(-1)
  parts.push(armL, armR)

  // staff, held in the right hand
  {
    const base = R.P(...STAFF_BASE)
    const top = R.P(...STAFF_TOP)
    const depth = R.w(GRIP[0], 0, GRIP[2])[2] - 0.005
    const dx = top.x - base.x
    const dy = top.y - base.y
    const L = Math.hypot(dx, dy)
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    // drawn upright in local space, then rotated into place
    const g = `<g transform="translate(${f(base.x)} ${f(base.y)}) rotate(${f(ang)})">
      <rect x="-1.7" y="${f(-L)}" width="3.4" height="${f(L)}" rx="1.4" fill="${C.wood[1]}" stroke="${C.ink}" stroke-width="0.9"/>
      <rect x="-1.7" y="${f(-L)}" width="1.3" height="${f(L)}" rx="0.6" fill="${C.wood[2]}"/>
      <path d="M0.4 ${f(-L * 0.2)} q0.5 -6 -0.3 -12 M0.6 ${f(-L * 0.55)} q-0.4 -5 0.3 -10" stroke="${C.wood[0]}" stroke-width="0.5" fill="none"/>
      <rect x="-2.3" y="${f(-L * 0.78)}" width="4.6" height="2.4" rx="0.8" fill="${C.bronze[1]}" stroke="${C.ink}" stroke-width="0.7"/>
      <rect x="-2.3" y="${f(-L * 0.78)}" width="4.6" height="0.8" fill="${C.bronze[2]}"/>
      <path d="M0 ${f(-L + 1)} C-6 ${f(-L - 2)} -6 ${f(-L - 11)} -1 ${f(-L - 13)} C3 ${f(-L - 14)} 6 ${f(-L - 9)} 4 ${f(-L - 5)} C3 ${f(-L - 8)} 0 ${f(-L - 9)} -2 ${f(-L - 7)} C-3 ${f(-L - 4)} -1 ${f(-L - 1)} 0 ${f(-L + 1)}Z" fill="${C.wood[1]}" stroke="${C.ink}" stroke-width="0.9"/>
      <path d="M-4.2 ${f(-L - 4)} C-4.5 ${f(-L - 9)} -2 ${f(-L - 12)} 0.5 ${f(-L - 12.5)}" stroke="${C.wood[3]}" stroke-width="0.9" fill="none"/>
      <circle cx="0.4" cy="${f(-L - 6.5)}" r="5.5" fill="url(#${idp}glow)"/>
      <path d="M0.4 ${f(-L - 10.5)} L3 ${f(-L - 6.5)} L0.4 ${f(-L - 2.8)} L-2.2 ${f(-L - 6.5)}Z" fill="${C.crystal[0]}" stroke="${C.ink}" stroke-width="0.7"/>
      <path d="M0.4 ${f(-L - 10.5)} L-2.2 ${f(-L - 6.5)} L0.4 ${f(-L - 6.5)}Z" fill="${C.crystal[1]}"/>
      <circle cx="-0.6" cy="${f(-L - 8)}" r="0.6" fill="${C.crystal[2]}"/>
    </g>`
    parts.push({ d: depth, s: g })
  }

  // hood and head
  {
    const head = R.w(0, 1.6, 0.03)
    const hc = R.p(head)
    const r = 0.155 * PX
    const tip = R.P(0, 1.56, -0.24 - POSE.hoodTip)
    const drapeL = R.P(-0.19, 1.4, -0.06)
    const drapeR = R.P(0.19, 1.4, -0.06)
    const drapeB = R.P(0, 1.38, -0.18)
    // circle approximated by points so it can join the hull with the tip and drapes
    const circ = []
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2
      circ.push({ x: hc.x + Math.cos(t) * r * 0.92, y: hc.y + Math.sin(t) * r * 0.95 })
    }
    const brim = []
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2
      brim.push(R.P(Math.cos(t) * 0.085, 1.58 + Math.sin(t) * 0.11, 0.15))
    }
    const hull = convexHull([...circ, tip, drapeL, drapeR, drapeB, ...brim])
    const id = `${idp}hood`
    const hp = smooth(hull)
    let s = `<clipPath id="${id}"><path d="${hp}"/></clipPath>`
    s += `<path d="${hp}" fill="${C.mantle[1]}"/>`
    // cel bands: light from upper left, shade lower right
    s += `<g clip-path="url(#${id})"><circle cx="${f(hc.x - r * 0.55)}" cy="${f(hc.y - r * 0.6)}" r="${f(r * 1.05)}" fill="${C.mantle[2]}"/><circle cx="${f(hc.x - r * 0.75)}" cy="${f(hc.y - r * 0.85)}" r="${f(r * 0.55)}" fill="${C.mantle[3]}"/><circle cx="${f(hc.x + r * 0.9)}" cy="${f(hc.y + r * 0.9)}" r="${f(r * 0.9)}" fill="${C.mantle[0]}"/></g>`
    // seam down the back/top of the hood
    const s0 = R.P(0, 1.76, -0.02)
    const s1 = R.P(0, 1.62, -0.2)
    if (facingCam < 0.6) s += `<path d="M${f(s0.x)} ${f(s0.y)} Q${f((s0.x + s1.x) / 2 + (s1.x - s0.x) * 0.2)} ${f((s0.y + s1.y) / 2 - 1)} ${f(s1.x)} ${f(s1.y)}" stroke="${C.mantle[0]}" stroke-width="0.8" fill="none"/>`
    // face opening when facing the camera at all
    s = s.replace('<!--rim-->', '')
    s += `<path d="${hp}" fill="none" stroke="${C.ink}" stroke-width="1.1"/>`
    if (facingCam > -0.3) {
      // the opening is a circle on the hood's front plane, so it narrows as the head turns
      const ring = [], inner = []
      for (let i = 0; i < 20; i++) {
        const t = (i / 20) * Math.PI * 2
        ring.push(R.P(Math.cos(t) * 0.08, 1.575 + Math.sin(t) * 0.1, 0.15))
        inner.push(R.P(Math.cos(t) * 0.064, 1.57 + Math.sin(t) * 0.085, 0.145))
      }
      const fid = `${idp}face`
      const fc = R.P(0, 1.55, 0.14)
      const side = R.fwd[0]
      s += `<polygon points="${pts(ring)}" fill="${C.lining[1]}" stroke="${C.ink}" stroke-width="0.8" stroke-linejoin="round"/>`
      s += `<clipPath id="${fid}"><polygon points="${pts(inner)}"/></clipPath><polygon points="${pts(inner)}" fill="#0c0e0d"/>`
      // only the chin and the tip of the nose catch any light under the hood
      s += `<g clip-path="url(#${fid})"><ellipse cx="${f(fc.x + side * 1.2)}" cy="${f(fc.y + 5.2)}" rx="4.2" ry="3.4" fill="${C.skin[0]}"/><ellipse cx="${f(fc.x + side * 1.2 - 0.8)}" cy="${f(fc.y + 5.8)}" rx="2.3" ry="1.8" fill="${C.skin[1]}"/><path d="M${f(fc.x + side * 2.4)} ${f(fc.y - 0.6)} l${f(0.6 + side * 1.4)} 2.6 l-1.5 0.3Z" fill="${C.skin[0]}"/></g>`
    }
    parts.push({ d: 0.02, s })
  }

  // painter's order by depth toward the camera
  parts.sort((p, q) => p.d - q.d)
  const defs = `<defs>
    <radialGradient id="${idp}sh"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="0.6" stop-color="#000" stop-opacity="0.22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="${idp}occ" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.25"/><stop offset="0.25" stop-color="#000" stop-opacity="0"/><stop offset="0.8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></linearGradient>
    <radialGradient id="${idp}glow"><stop offset="0" stop-color="${C.crystal[1]}" stop-opacity="0.75"/><stop offset="1" stop-color="${C.crystal[0]}" stop-opacity="0"/></radialGradient>
  </defs>`
  return `${defs}${shadow}${parts.map((p) => p.s).join('')}`
}

/** Pose generators for each animation, by phase in [0, 1). */
export const CYCLES = {
  idle: () => IDLE,
  walk: (ph) => {
    const s = Math.sin(ph * Math.PI * 2)
    const c = Math.cos(ph * Math.PI * 2)
    return {
      ...IDLE,
      bob: 0.035 * (1 - Math.abs(s)) - 0.015,
      lean: 0.04,
      sway: 0.022 * c,
      hem: { ox: 0, oz: 0.01, flare: 0.01 },
      mantle: { oz: -0.015 },
      hoodTip: 0.015,
      feet: [{ z: -0.22 * s, lift: 0.05 * Math.max(0, -c) }, { z: 0.22 * s, lift: 0.05 * Math.max(0, c) }],
      leftHand: { z: 0.13 * s, y: 0 },
      grip: { z: -0.07 * s, y: 0.012 * Math.abs(s) },
      staffTilt: -0.08 * s,
      staffLift: 0.06,
    }
  },
  sprint: (ph) => {
    const s = Math.sin(ph * Math.PI * 2)
    const c = Math.cos(ph * Math.PI * 2)
    return {
      ...IDLE,
      bob: 0.05 * (1 - Math.abs(s)) - 0.02,
      lean: 0.13,
      sway: 0.015 * c,
      hem: { ox: 0, oz: -0.06, flare: 0.04 },
      mantle: { oz: -0.07 },
      hoodTip: 0.08,
      feet: [{ z: -0.32 * s, lift: 0.09 * Math.max(0, -c) }, { z: 0.32 * s, lift: 0.09 * Math.max(0, c) }],
      leftHand: { z: 0.2 * s, y: 0.08 + 0.04 * Math.abs(s) },
      // staff carried low and slanted forward, rocking with the stride
      grip: { z: 0.06 - 0.06 * s, y: -0.05 },
      staffTilt: 0.36 - 0.05 * s,
      staffLift: 0.14,
    }
  },
}

/**
 * The sorcerer as a standalone SVG at native size (96 world pixels per metre).
 * angle: facing in radians, 0 = towards the camera (south), π/2 = east.
 * mode/phase pick the pose: 'idle', or 'walk'/'sprint' at a phase in [0, 1).
 */
export function sorcererSvg(angle, mode, phase) {
  POSE = CYCLES[mode](phase)
  const body = sorcerer(angle, 'p')
  POSE = IDLE
  const thin = body.replace(/stroke-width="([\d.]+)"/g, (_, w) => `stroke-width="${f((+w / SCALE) * 1.15)}"`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${OUT_W} ${OUT_H}"><g transform="scale(${SCALE})">${thin}</g></svg>`
}

/** Sprite size in world pixels, and where the feet sit inside it. */
export const SORCERER_SIZE = { w: OUT_W, h: OUT_H, footX: FOOT.x * SCALE, footY: FOOT.y * SCALE }
