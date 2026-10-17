import { useEffect, useRef, useState } from 'react'
import { isMuted, setMuted, sfx } from '../game/audio'
import { InputState } from '../game/input'
import { BannerView, PauseMenu, type Banner } from '../ui/Game'
import { Hud } from '../ui/Hud'
import { TouchControls } from '../ui/TouchControls'
import { IsoScene } from './IsoScene'
import { createIsoWorld, nearShrine, respawn, rest, STEP, stepIso, toggleLock, type IsoWorld } from './sim'

const ISO_ROWS: [string, string][] = [
  ['Move', 'WASD · arrows (8 directions)'],
  ['Strike', 'J · left click (chain three)'],
  ['Heavy', 'K · right click'],
  ['Roll', 'Space · Shift · L'],
  ['Lock on', 'Tab · middle click (once he has moved)'],
  ['Cast rite', 'I · C'],
  ['Change rite', 'Q · R · mouse wheel'],
  ['Drink honey', 'F'],
  ['Rest', 'E at the shrine'],
  ['Gamepad', 'Left stick move · A/B roll · X strike · Y heavy · LT cast · D-pad up rite · LB heal · R3 lock on'],
]

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

function fitView(w: IsoWorld) {
  // a fixed slice of the world on any screen, close enough to read the puppets
  const aspect = window.innerWidth / Math.max(1, window.innerHeight)
  w.view.h = aspect >= 1 ? 600 : 900
  w.view.w = w.view.h * aspect
}

export function IsoGame({ onQuit }: { onQuit: () => void }) {
  const world = useRef<IsoWorld>(null as unknown as IsoWorld)
  if (!world.current) world.current = createIsoWorld()
  if (import.meta.env.DEV) (window as unknown as { __iso: IsoWorld }).__iso = world.current
  const input = useRef(new InputState())
  const [, setFrame] = useState(0)
  const [banner, setBanner] = useState<Banner | null>({ kind: 'chapter', at: performance.now() })
  const [paused, setPaused] = useState(false)
  const [muted, setMutedState] = useState(isMuted())
  const [touch] = useState(isTouch)
  const pausedRef = useRef(false)
  pausedRef.current = paused

  useEffect(() => {
    const inp = input.current
    inp.isoMode = true
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
          stepIso(w, inp)
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
      } else last = now
      setFrame((f) => (f + 1) % 1e6)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const w = world.current
  const bannerAge = banner ? (performance.now() - banner.at) / 1000 : 0
  const canRest = nearShrine(w)

  return (
    <div className="fixed inset-0 touch-none select-none overflow-hidden bg-[#160c12]">
      <IsoScene w={w} />
      <div className="paper-grain pointer-events-none fixed inset-0" />
      <div className="vignette pointer-events-none fixed inset-0" />
      <Hud p={w.player} e={w.enemy} />

      {canRest && !touch && (
        <div className="pointer-events-none fixed bottom-[22%] left-1/2 -translate-x-1/2 font-fell text-lg text-[#e9dcc0] drop-shadow-[2px_2px_0_#0b0507] fade-in">
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

      {touch && !paused && <TouchControls input={input.current} canRest={canRest} locked={w.player.lockOn} iso />}

      {paused && (
        <PauseMenu
          muted={muted}
          debug={w.debug}
          rows={ISO_ROWS}
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
