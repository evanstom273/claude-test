import { useEffect, useRef, useState } from 'react'
import { sfx } from '../game/audio'
import { update } from '../game/engine'
import type { GameState, Input } from '../game/types'
import { Hud } from './Hud'
import { Scene, VIEW_MIN } from './Scene'

interface Props {
  game: GameState
  paused: boolean
  onDawn: () => void
  onDeath: () => void
  onTogglePause: () => void
  onToggleMute: () => void
  muted: boolean
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

export function Game({ game, paused, onDawn, onDeath, onTogglePause, onToggleMute, muted }: Props) {
  const { w, h } = useViewport()
  const [, setFrame] = useState(0)
  const keys = useRef(new Set<string>())
  const flareQueued = useRef(false)
  const stick = useRef<{ id: number; ox: number; oy: number; x: number; y: number } | null>(null)
  const [stickView, setStickView] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null)

  const cb = useRef({ onDawn, onDeath, onTogglePause, onToggleMute, paused })
  cb.current = { onDawn, onDeath, onTogglePause, onToggleMute, paused }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (MOVE_KEYS[e.code]) {
        keys.current.add(e.code)
        e.preventDefault()
      } else if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (!e.repeat) flareQueued.current = true
        e.preventDefault()
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        cb.current.onTogglePause()
      } else if (e.code === 'KeyM') {
        cb.current.onToggleMute()
      }
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __game: GameState }).__game = game
  }, [game])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (!cb.current.paused) {
        let mx = 0
        let my = 0
        for (const k of keys.current) {
          const v = MOVE_KEYS[k]
          if (v) {
            mx += v[0]
            my += v[1]
          }
        }
        const st = stick.current
        if (st) {
          const dx = st.x - st.ox
          const dy = st.y - st.oy
          const len = Math.hypot(dx, dy)
          if (len > 6) {
            const k = Math.min(1, len / 55)
            mx = (dx / len) * k
            my = (dy / len) * k
          }
        }
        const len = Math.hypot(mx, my)
        if (len > 1) {
          mx /= len
          my /= len
        }
        const input: Input = { mx, my, flare: flareQueued.current }
        flareQueued.current = false
        const scale = VIEW_MIN / Math.max(1, Math.min(window.innerWidth, window.innerHeight))
        const viewRadius = (Math.hypot(window.innerWidth, window.innerHeight) / 2) * scale
        update(game, input, dt, viewRadius)
        for (const ev of game.events) {
          switch (ev.type) {
            case 'pickup':
              sfx.pickup()
              break
            case 'hurt':
              sfx.hurt()
              navigator.vibrate?.(60)
              break
            case 'kill':
              sfx.kill()
              break
            case 'flare':
              sfx.flare()
              break
            case 'brazier':
              sfx.brazier()
              break
            case 'dawn':
              sfx.dawn()
              cb.current.onDawn()
              break
            case 'death':
              sfx.death()
              cb.current.onDeath()
              break
          }
        }
        game.events.length = 0
        setFrame((f) => (f + 1) % 1e6)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [game])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (stick.current) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    stick.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY }
    setStickView({ ...stick.current })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const st = stick.current
    if (!st || st.id !== e.pointerId) return
    st.x = e.clientX
    st.y = e.clientY
    setStickView({ ox: st.ox, oy: st.oy, x: st.x, y: st.y })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (stick.current?.id !== e.pointerId) return
    stick.current = null
    setStickView(null)
  }

  return (
    <div className="fixed inset-0 touch-none select-none overflow-hidden bg-[#03040a]">
      <div
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Scene s={game} vw={w} vh={h} />
      </div>
      {stickView && <Joystick {...stickView} />}
      <Hud
        s={game}
        muted={muted}
        onFlare={() => (flareQueued.current = true)}
        onTogglePause={onTogglePause}
        onToggleMute={onToggleMute}
      />
    </div>
  )
}

function Joystick({ ox, oy, x, y }: { ox: number; oy: number; x: number; y: number }) {
  const dx = x - ox
  const dy = y - oy
  const len = Math.hypot(dx, dy)
  const k = len > 55 ? 55 / len : 1
  return (
    <div className="pointer-events-none fixed" style={{ left: ox - 60, top: oy - 60 }}>
      <div className="h-[120px] w-[120px] rounded-full border-2 border-amber-200/30 bg-amber-100/5" />
      <div
        className="absolute h-12 w-12 rounded-full border-2 border-amber-200/60 bg-amber-300/30"
        style={{ left: 36 + dx * k, top: 36 + dy * k }}
      />
    </div>
  )
}
