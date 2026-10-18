import * as THREE from 'three'
import type { Level } from './levels'

const SKY_KEYS: [number, number, number, number][] = [
  // hour, sky colour, sun intensity, ambient intensity
  [0, 0x1c2440, 0, 0.35],
  [5, 0x2c3456, 0, 0.4],
  [6.5, 0xe8a87a, 0.6, 0.7],
  [8, 0xbfe0e8, 1.6, 1.05],
  [17, 0xbfe0e8, 1.6, 1.05],
  [19, 0xe89a6a, 0.7, 0.75],
  [20.5, 0x3a3a62, 0.05, 0.45],
  [24, 0x1c2440, 0, 0.35],
]

function skyAt(hour: number) {
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const [h0, c0, s0, a0] = SKY_KEYS[i]
    const [h1, c1, s1, a1] = SKY_KEYS[i + 1]
    if (hour >= h0 && hour <= h1) {
      const k = (hour - h0) / (h1 - h0)
      return { color: new THREE.Color(c0).lerp(new THREE.Color(c1), k), sun: s0 + (s1 - s0) * k, amb: a0 + (a1 - a0) * k }
    }
  }
  return { color: new THREE.Color(SKY_KEYS[0][1]), sun: 0, amb: 0.35 }
}

/** Day and night: lit windows, sun and moon, sky colour and the light it casts. */
export function updateSky(scene: THREE.Scene, lvl: Level, hour: number, player: THREE.Vector3, camera: THREE.Camera) {
  const night = hour < 6.5 || hour > 19.5
  for (const l of lvl.nightLights) l.mesh.material = night ? l.night : l.day
  if (lvl.buildingId && lvl.hemi) lvl.hemi.intensity = night ? 0.45 : 0.95
  if (!lvl.outdoors || !lvl.sun || !lvl.hemi) return
  const s = skyAt(hour)
  scene.background = s.color
  if (!(scene.fog instanceof THREE.Fog)) scene.fog = new THREE.Fog(s.color, 70, 300)
  ;(scene.fog as THREE.Fog).color.copy(s.color)
  ;(scene.fog as THREE.Fog).near = 70
  ;(scene.fog as THREE.Fog).far = 300
  // the sun climbs from the east (+x) and sets in the west
  const a = ((hour - 6) / 12) * Math.PI
  const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.35).normalize()
  lvl.sun.intensity = s.sun
  lvl.sun.position.copy(player).addScaledVector(dir, 80)
  lvl.sun.target.position.copy(player)
  lvl.sun.color.setHSL(0.1, 0.6, hour < 8 || hour > 17 ? 0.75 : 0.9)
  lvl.hemi.intensity = s.amb
  if (lvl.sky) {
    lvl.sky.sun.position.copy(camera.position).addScaledVector(dir, 220)
    lvl.sky.sun.lookAt(camera.position)
    lvl.sky.sun.visible = dir.y > -0.1
    lvl.sky.moon.position.copy(camera.position).addScaledVector(dir, -220)
    lvl.sky.moon.lookAt(camera.position)
    lvl.sky.moon.visible = dir.y < 0.1
    for (const c of lvl.sky.clouds) {
      c.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0004)
      c.lookAt(camera.position.x, c.position.y, camera.position.z)
    }
  }
}
