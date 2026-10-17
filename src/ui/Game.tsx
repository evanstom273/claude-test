import { useEffect, useRef, useState } from 'react'
import { isMuted, setMuted, sfx } from '../game/audio'
import { InputState } from '../game/input'
import type { World } from '../game/types'
import { createWorld, nearShrine, respawn, rest, step, STEP, toggleLock, VIEW_H } from '../game/world'
import { Scene } from '../render/Scene'
import { Hud } from './Hud'
import { TouchControls } from './TouchControls'

export type Banner = { kind: 'chapter' | 'death' | 'harvested' | 'rest'; at: number }

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

function fitView(w: World) {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight)
  if (aspect >= 1.25) {
    w.view.h = VIEW_H
    w.view.w = VIEW_H * aspect
  } else {
    w.view.w = 1000
    w.view.h = 1000 / aspect
  }
}

export function Game({ onQuit }: { onQuit: () => void }) {
  const world = useRef<World>(null as unknown as World)
  if (!world.current) world.current = createWorld()
  const input = useRef(new InputState())
  const [, setFrame] = useState(0)
  const [banner, setBanner] = useState<Banner | null>({ kind: 'chapter', at: performance.now() })
  const [paused, setPaused] = useState(false)
  const [muted, setMutedState] = useState(isMuted())
  const [touch] = useState(isTouch)
  if (import.meta.env.DEV) (window as unknown as { __w: World }).__w = world.current
  const pausedRef = useRef(false)
  pausedRef.current = paused

  useEffect(() => {
    const inp = input.current
    inp.onPause = () => setPaused((p) => !p)
    const detach = inp.attach()
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') world.current.debug = !world.current.debug
      if (e.code === 'KeyM') {
        setMuted(!isMuted())
        setMutedState(isMuted())
      }
    }
    window.addEventListener('keydown', onKey)
    const onResize = () => fitView(world.current)
    fitView(world.current)
    window.addEventListener('resize', onResize)
    return () => {
      detach()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let deathAt = 0
    const loop = (now: number) => {
      const w = world.current
      const inp = input.current
      inp.pollGamepad()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (!pausedRef.current) {
        if (nearShrine(w) && inp.take('interact', 200)) rest(w)
        if (inp.take('lock', 200)) toggleLock(w)
        acc += dt
        let steps = 0
        while (acc >= STEP && steps < 24) {
          step(w, inp)
          acc -= STEP
          steps++
        }
        for (const ev of w.events) {
          switch (ev.type) {
            case 'swing':
              sfx.swing(ev.heavy)
              break
            case 'hit':
              sfx.hit(ev.heavy, ev.crit)
              navigator.vibrate?.(ev.heavy ? 40 : 20)
              break
            case 'hurt':
              sfx.hurt()
              navigator.vibrate?.(80)
              break
            case 'roll':
              sfx.roll()
              break
            case 'jump':
              sfx.jump()
              break
            case 'land':
              sfx.land()
              break
            case 'heal':
              sfx.heal()
              break
            case 'rest':
              sfx.rest()
              setBanner({ kind: 'rest', at: now })
              break
            case 'tele':
              sfx.tele(ev.move)
              break
            case 'cast':
              sfx.cast(ev.rite)
              break
            case 'thorns':
              sfx.thorns()
              break
            case 'crow':
              sfx.crow()
              break
            case 'riteSwap':
              sfx.riteSwap()
              break
            case 'noTallow':
              sfx.noTallow()
              break
            case 'enemyStrike':
              sfx.enemyStrike()
              break
            case 'slam':
              sfx.slam()
              break
            case 'stagger':
              sfx.stagger()
              break
            case 'aggro':
              sfx.aggro()
              break
            case 'harvested':
              sfx.harvested()
              setBanner({ kind: 'harvested', at: now + 600 })
              break
            case 'death':
              sfx.death()
              deathAt = now
              setBanner({ kind: 'death', at: now + 700 })
              break
            case 'noStamina':
              sfx.noStamina()
              break
            case 'lock':
              sfx.lock(ev.on)
              break
          }
        }
        w.events.length = 0
        if (deathAt && now - deathAt > 4200) {
          deathAt = 0
          respawn(w)
          setBanner(null)
        }
      } else {
        last = now
      }
      setFrame((f) => (f + 1) % 1e6)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const w = world.current
  const now = performance.now()
  const bannerAge = banner ? (now - banner.at) / 1000 : 0
  const canRest = nearShrine(w)

  return (
    <div className="fixed inset-0 touch-none select-none overflow-hidden bg-[#170f1d]">
      <Scene w={w} />
      <div className="paper-grain pointer-events-none fixed inset-0" />
      <div className="vignette pointer-events-none fixed inset-0" />
      <Hud p={w.player} e={w.enemy} />

      {canRest && !touch && (
        <div className="pointer-events-none fixed bottom-[28%] left-1/2 -translate-x-1/2 font-fell text-lg text-[#e9dcc0] drop-shadow-[2px_2px_0_#0b0507] fade-in">
          <span className="key">E</span> Rest at the Corn Mother
        </div>
      )}

      {banner && <BannerView kind={banner.kind} age={bannerAge} onDone={() => setBanner(null)} />}

      <button
        onClick={() => setPaused(true)}
        className="fixed right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-[#0b0507]/50 font-fell text-[#e9dcc0] ring-1 ring-[#e9dcc0]/20"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))', right: 'max(0.75rem, env(safe-area-inset-right))' }}
        aria-label="Pause"
      >
        ❚❚
      </button>

      {touch && !paused && <TouchControls input={input.current} canRest={canRest} locked={w.player.lockOn} />}

      {paused && (
        <PauseMenu
          muted={muted}
          debug={w.debug}
          onResume={() => setPaused(false)}
          onMute={() => {
            setMuted(!isMuted())
            setMutedState(isMuted())
          }}
          onDebug={() => {
            w.debug = !w.debug
            setFrame((f) => f + 1)
          }}
          onQuit={onQuit}
        />
      )}
    </div>
  )
}

export function BannerView({ kind, age, onDone }: { kind: Banner['kind']; age: number; onDone: () => void }) {
  if (age < 0) return null
  const life = kind === 'death' ? 99 : kind === 'chapter' ? 4.5 : kind === 'harvested' ? 4 : 2.6
  if (age > life) {
    queueMicrotask(onDone)
    return null
  }
  const fadeIn = Math.min(1, age / 0.8)
  const fadeOut = Math.min(1, (life - age) / 0.8)
  const o = Math.min(fadeIn, fadeOut)
  if (kind === 'death')
    return (
      <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center" style={{ opacity: Math.min(1, age / 1.2) }}>
        <div className="absolute inset-x-0 top-1/2 h-36 -translate-y-1/2 bg-gradient-to-r from-transparent via-black/75 to-transparent" />
        <h2 className="relative font-fell-sc text-5xl tracking-[0.12em] text-[#a32020] drop-shadow-[3px_3px_0_#0b0507] sm:text-7xl" style={{ transform: `scale(${1 + age * 0.015})` }}>
          The Fields Take You
        </h2>
      </div>
    )
  if (kind === 'harvested')
    return (
      <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center" style={{ opacity: o }}>
        <div className="absolute inset-x-0 top-1/2 h-36 -translate-y-1/2 bg-gradient-to-r from-transparent via-black/60 to-transparent" />
        <h2 className="relative font-fell-sc text-5xl tracking-[0.14em] text-[#e0b04a] drop-shadow-[3px_3px_0_#0b0507] sm:text-7xl" style={{ transform: `scale(${1 + age * 0.012})` }}>
          Harvested
        </h2>
      </div>
    )
  if (kind === 'rest')
    return (
      <div className="pointer-events-none fixed inset-x-0 top-[22%] z-10 text-center font-fell text-2xl italic text-[#f1d58a] drop-shadow-[2px_2px_0_#0b0507]" style={{ opacity: o }}>
        The Corn Mother keeps you.
        <div className="mt-1 text-base not-italic text-[#e9dcc0]/70">Health and honey restored. The fields stir again.</div>
      </div>
    )
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[18%] z-10 text-center drop-shadow-[2px_2px_0_#0b0507]" style={{ opacity: o }}>
      <div className="font-fell-sc text-lg tracking-[0.4em] text-[#c9a24a]">Chapter the First</div>
      <div className="mt-1 font-fell text-4xl italic text-[#e9dcc0] sm:text-5xl">The Long Harvest</div>
    </div>
  )
}

export function PauseMenu({ muted, debug, onResume, onMute, onDebug, onQuit, rows = SIDE_ROWS }: { muted: boolean; debug: boolean; onResume: () => void; onMute: () => void; onDebug: () => void; onQuit: () => void; rows?: [string, string][] }) {
  return <PauseMenuView muted={muted} debug={debug} onResume={onResume} onMute={onMute} onDebug={onDebug} onQuit={onQuit} rows={rows} />
}

const SIDE_ROWS: [string, string][] = [
    ['Move', 'A / D · ← →'],
    ['Jump', 'Space (down + jump drops through)'],
    ['Strike', 'J · left click (chain three)'],
    ['Heavy', 'K · right click'],
    ['Roll', 'Shift · L'],
    ['Lock on', 'Tab · middle click'],
    ['Cast rite', 'I · C (tallow refills slowly, faster with scythe hits)'],
    ['Change rite', 'Q · R · mouse wheel'],
    ['Drink honey', 'F'],
    ['Rest', 'E at the shrine'],
    ['Gamepad', 'A jump · B roll · X strike · Y heavy · LT cast · D-pad up rite · LB heal · R3 lock on'],
]

function PauseMenuView({ muted, debug, onResume, onMute, onDebug, onQuit, rows }: { muted: boolean; debug: boolean; onResume: () => void; onMute: () => void; onDebug: () => void; onQuit: () => void; rows: [string, string][] }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0b0507]/75 p-4 backdrop-blur-[2px] fade-in">
      <div className="page w-full max-w-lg p-6 sm:p-8">
        <h2 className="text-center font-fell-sc text-3xl tracking-[0.2em] text-[#3b1d1d]">Paused</h2>
        <div className="mx-auto my-4 h-px w-2/3 bg-[#3b1d1d]/30" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-fell text-[#3b2a20]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-fell-sc text-[#7a1f24]">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={onResume} className="ink-btn">
            Resume
          </button>
          <button onClick={onMute} className="ink-btn ink-btn-ghost">
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button onClick={onDebug} className="ink-btn ink-btn-ghost">
            Hitboxes: {debug ? 'on' : 'off'}
          </button>
          <button onClick={onQuit} className="ink-btn ink-btn-ghost">
            Close the book
          </button>
        </div>
      </div>
    </div>
  )
}
