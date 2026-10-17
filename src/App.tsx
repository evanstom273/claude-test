import { useCallback, useRef, useState } from 'react'
import { initAudio, isMuted, setMuted, sfx } from './game/audio'
import { createGame, startNextNight } from './game/engine'
import type { GameState } from './game/types'
import { rollUpgrades, takeUpgrade, type Upgrade } from './game/upgrades'
import { Game } from './components/Game'
import { GameOverScreen, PauseScreen, TitleScreen, UpgradeScreen } from './components/Screens'

type Screen = 'title' | 'playing' | 'paused' | 'upgrade' | 'over'

const BEST_KEY = 'emberwake.best'

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBest(v: number) {
  try {
    localStorage.setItem(BEST_KEY, String(v))
  } catch {
    // storage unavailable; best score just won't persist
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('title')
  const [game, setGame] = useState<GameState | null>(null)
  const [choices, setChoices] = useState<Upgrade[]>([])
  const [best, setBest] = useState(loadBest)
  const [newBest, setNewBest] = useState(false)
  const [muted, setMutedState] = useState(isMuted())
  const gameRef = useRef<GameState | null>(null)
  gameRef.current = game

  const start = useCallback(() => {
    initAudio()
    sfx.click()
    setGame(createGame())
    setNewBest(false)
    setScreen('playing')
  }, [])

  const onDawn = useCallback(() => {
    const g = gameRef.current
    if (!g) return
    setChoices(rollUpgrades(g))
    setScreen('upgrade')
  }, [])

  const onDeath = useCallback(() => {
    const g = gameRef.current
    if (!g) return
    setBest((b) => {
      if (g.score > b) {
        saveBest(g.score)
        setNewBest(true)
        return g.score
      }
      return b
    })
    setTimeout(() => setScreen('over'), 1200)
  }, [])

  const pick = useCallback((u: Upgrade) => {
    const g = gameRef.current
    if (!g) return
    sfx.click()
    takeUpgrade(g, u)
    startNextNight(g)
    setScreen('playing')
  }, [])

  const togglePause = useCallback(() => {
    setScreen((s) => (s === 'playing' ? 'paused' : s === 'paused' ? 'playing' : s))
  }, [])

  const toggleMute = useCallback(() => {
    const m = !isMuted()
    setMuted(m)
    setMutedState(m)
  }, [])

  if (screen === 'title' || !game) return <TitleScreen best={best} onStart={start} />

  return (
    <>
      <Game
        game={game}
        paused={screen === 'paused'}
        onDawn={onDawn}
        onDeath={onDeath}
        onTogglePause={togglePause}
        onToggleMute={toggleMute}
        muted={muted}
      />
      {screen === 'upgrade' && <UpgradeScreen night={game.night} choices={choices} onPick={pick} />}
      {screen === 'paused' && <PauseScreen onResume={togglePause} onQuit={() => setScreen('title')} />}
      {screen === 'over' && <GameOverScreen s={game} best={best} isNewBest={newBest} onRestart={start} onMenu={() => setScreen('title')} />}
    </>
  )
}
