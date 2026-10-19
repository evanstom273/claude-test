import { useEffect, useRef, useState } from 'react'
import { bakeStats } from './game/art/bake'
import { TestScene } from './game/testScene'

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [progress, setProgress] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const scene = new TestScene(canvas.current!)
    if (import.meta.env.DEV) (window as unknown as { __scene: TestScene }).__scene = scene
    let alive = true
    scene.load((k) => alive && setProgress(k)).then(() => {
      if (!alive) return
      setReady(true)
      scene.start()
    })
    return () => {
      alive = false
      scene.dispose()
    }
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b1413] select-none">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-[#e7dfc9]">
          <div className="w-64 text-center">
            <div className="text-sm tracking-[0.3em] text-[#e3c580]">ASHEN VOW</div>
            <div className="mt-3 h-1 bg-[#192522]">
              <div className="h-full bg-[#e3c580]" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>
      )}
      {ready && (
        <div className="pointer-events-none absolute left-3 top-3 border border-[#6d6852] bg-[#0b1211]/80 px-3 py-2 text-xs leading-relaxed text-[#e7dfc9]">
          <div className="text-[#e3c580]">Movement test</div>
          <div>Move: WASD / arrows / left stick</div>
          <div>Sprint: hold Shift or Space / B</div>
          <div>Touch: drag to move, push to the outer ring to sprint</div>
          <div className="mt-1 text-[#878a84]">
            Art loaded: {bakeStats.done - bakeStats.blank}/{bakeStats.done}
            {bakeStats.blank > 0 && <span className="text-[#c46a6a]"> ({bakeStats.blank} blank)</span>}
          </div>
        </div>
      )}
    </div>
  )
}
