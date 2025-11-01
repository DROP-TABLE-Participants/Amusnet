import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { Quaternion } from 'three'
import { toCanvas } from 'qrcode'
import { Scanner } from '@yudiel/react-qr-scanner'
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner'
import { PlayerLane } from './components/PlayerLane'
import { CountdownSlot } from './components/CountdownSlot'
import { ResultsDashboard } from './components/ResultsDashboard'
import { useSessionStore } from './state/useSessionStore'
import { shapeLabelFromCatalog } from './shared/shapes'
import { useShapeSlotSpinner } from './hooks/useShapeSlotSpinner'
import type { LobbyStatus, RoundStatus } from './shared/messages'
import { eulerFromDeviceOrientation, toTuple } from './utils/quaternion'
import { getPlayerColor } from './shared/playerColors'
import slotTick from './assets/slot-tick.mp3'
import roundWon from './assets/round-won.mp3'
import clickSfx from './assets/click.mp3'
import loopTrack from './assets/loop.mp3'
import joinLobbyChime from './assets/join-lobby.mp3'
import leaveLobbyChime from './assets/leave-lobby.mp3'

const NAME_STORAGE_KEY = 'shadow-play.displayName'

function App() {
  return (
    <SessionBootstrap>
      <Routes>
        <Route path="/join" element={<JoinScreen />} />
        <Route path="*" element={<HostDashboard />} />
      </Routes>
    </SessionBootstrap>
  )
}

function SessionBootstrap({ children }: { children: ReactNode }) {
  const connect = useSessionStore((state) => state.connect)

  useEffect(() => {
    connect()
  }, [connect])

  return <>{children}</>
}

function HostDashboard() {
  const connection = useSessionStore((state) => state.connection)
  const sessionState = useSessionStore((state) => state.state)
  const self = useSessionStore((state) => state.self)
  const device = useSessionStore((state) => state.device)
  const createLobby = useSessionStore((state) => state.createLobby)
  const startGame = useSessionStore((state) => state.startGame)
  const restartGame = useSessionStore((state) => state.restartGame)
  const [timerInput, setTimerInput] = useState(sessionState.lobby.timerSeconds || 60)
  const [roundsInput, setRoundsInput] = useState(sessionState.lobby.totalRounds || 3)
  const [multiplierInput, setMultiplierInput] = useState(sessionState.lobby.finalRoundMultiplier || 3)
  const [showSetup, setShowSetup] = useState(() => self.role !== 'host' || sessionState.lobby.status === 'idle')
  const clickSoundRef = useRef<HTMLAudioElement | null>(null)
  const loopAudioRef = useRef<HTMLAudioElement | null>(null)
  const loopFadeTargetRef = useRef<{ volume: number; playbackRate: number } | null>(null)
  const loopContextRef = useRef({ roundStatus: sessionState.round.status, lobbyStatus: sessionState.lobby.status })

  useEffect(() => {
    if (self.role === 'host' && sessionState.lobby.status !== 'idle') {
      setShowSetup(false)
    }
  }, [self.role, sessionState.lobby.status])

  useEffect(() => {
    if (sessionState.lobby.status === 'idle') {
      setShowSetup(true)
    }
  }, [sessionState.lobby.status])

  useEffect(() => {
    setTimerInput(sessionState.lobby.timerSeconds || 60)
    setRoundsInput(sessionState.lobby.totalRounds || 3)
    setMultiplierInput(sessionState.lobby.finalRoundMultiplier || 3)
  }, [sessionState.lobby.timerSeconds, sessionState.lobby.totalRounds, sessionState.lobby.finalRoundMultiplier])

  useEffect(() => {
    clickSoundRef.current = typeof Audio !== 'undefined' ? new Audio(clickSfx) : null
    if (typeof Audio !== 'undefined') {
      const audio = new Audio(loopTrack)
      audio.loop = true
      audio.volume = 0
      audio.playbackRate = 1
      loopAudioRef.current = audio
    }
    return () => {
      loopAudioRef.current?.pause()
      loopAudioRef.current = null
    }
  }, [])

  const playClick = useCallback(() => {
    const audio = clickSoundRef.current
    if (!audio) {
      return
    }
    audio.currentTime = 0
    void audio.play().catch(() => {})
  }, [])

  const scheduleLoopTarget = useCallback((volume: number, playbackRate: number) => {
    loopFadeTargetRef.current = {
      volume: Math.max(0, Math.min(1, volume)),
      playbackRate: Math.max(0.4, Math.min(2.4, playbackRate)),
    }
  }, [])

  const ensureLoopPlaying = useCallback(() => {
    const audio = loopAudioRef.current
    if (!audio) {
      return
    }
    if (audio.paused) {
      audio.currentTime = 0
      void audio.play().catch(() => {})
    }
  }, [])

  useEffect(() => {
    loopContextRef.current = {
      roundStatus: sessionState.round.status,
      lobbyStatus: sessionState.lobby.status,
    }
  }, [sessionState.lobby.status, sessionState.round.status])

  useEffect(() => {
    const audio = loopAudioRef.current
    if (!audio) {
      return
    }

    let rafId: number | null = null

    const tick = () => {
      const target = loopFadeTargetRef.current
      if (target) {
        const delta = 0.02
        const nextVolume = Math.abs(audio.volume - target.volume) < delta
          ? target.volume
          : audio.volume + Math.sign(target.volume - audio.volume) * delta
        audio.volume = Math.max(0, Math.min(0.5, nextVolume))
        audio.playbackRate += (target.playbackRate - audio.playbackRate) * 0.08
        if (Math.abs(audio.playbackRate - target.playbackRate) < 0.01) {
          audio.playbackRate = target.playbackRate
        }
        if (audio.volume === target.volume && Math.abs(audio.playbackRate - target.playbackRate) < 0.01) {
          loopFadeTargetRef.current = null
        }
      } else if (audio.volume < 0.01) {
        const context = loopContextRef.current
        if (context.roundStatus !== 'active' && context.roundStatus !== 'countdown') {
          audio.pause()
        }
      }
      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [])

  const handleCreateLobby = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const safeRounds = Math.max(3, Math.min(10, Math.round(roundsInput)))
      const safeTimer = Math.max(15, Math.min(300, Math.round(timerInput)))
      const safeMultiplier = Math.max(1, Math.min(10, Math.round(multiplierInput)))
      playClick()
      createLobby(safeTimer, safeRounds, safeMultiplier)
    },
    [createLobby, multiplierInput, playClick, roundsInput, timerInput],
  )

  const spinnerState = useShapeSlotSpinner({
    roundStatus: sessionState.round.status,
    countdownMs: sessionState.round.countdownMs,
    targetShapeId: sessionState.round.shapeId,
    shapes: sessionState.shapes,
  })
  const lastTickIdRef = useRef<string | null>(null)
  const celebrationRoundRef = useRef<number | null>(null)
  const lastConnectedPlayersRef = useRef<number>(sessionState.connectedPlayerCount)


  const shapesReady = sessionState.lobby.shapesReady
  const startDisabledReason = (() => {
    if (sessionState.lobby.status !== 'open') {
      return 'Lobby is not open yet'
    }
    if (sessionState.connectedPlayerCount === 0) {
      return 'No players have joined yet'
    }
    if (!shapesReady) {
      return 'Generating round shapes…'
    }
    return null
  })()
  const startDisabled = Boolean(startDisabledReason)
  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined' || !sessionState.lobby.code) {
      return null
    }
    return `${window.location.origin}/join?code=${sessionState.lobby.code}`
  }, [sessionState.lobby.code])
  const lobbyStatus = sessionState.lobby.status
  const roundStatus = sessionState.round.status
  const connectedPlayers = sessionState.players
    .filter((player) => player.connected)
    .slice()
    .sort((a, b) => a.slot - b.slot)
  const showLobbyView = lobbyStatus === 'open'
  const showGameView = lobbyStatus === 'in-progress'
  const showResults = lobbyStatus === 'complete'
  const statusLabel = describeLobbyStatus(
    lobbyStatus,
    roundStatus,
    sessionState.round.index,
    sessionState.round.total,
  )
  const shapeLabel = shapeLabelFromCatalog(sessionState.shapes, sessionState.round.shapeId)
  const timerLabel = (() => {
    if (roundStatus === 'countdown') {
      return 'Spinning shapes'
    }
    if (roundStatus === 'active') {
      return formatTimer(sessionState.round.remainingMs)
    }
    return `${sessionState.lobby.timerSeconds}s`
  })()
  const lobbyCodeDisplay = sessionState.lobby.code ?? '------'
  const roundDurationMs = sessionState.round.durationSeconds * 1000
  const timerRatio =
    roundStatus === 'active' && roundDurationMs > 0
      ? Math.max(0, Math.min(1, sessionState.round.remainingMs / roundDurationMs))
      : null
  const timerWidth = timerRatio != null ? `${(timerRatio * 100).toFixed(1)}%` : '0%'
  const showTimerBar = timerRatio != null
  const showCountdownOverlay = showGameView && roundStatus === 'countdown'

  useEffect(() => {
    const audio = loopAudioRef.current
    if (!audio) {
      return
    }

    if (sessionState.lobby.status === 'complete') {
      scheduleLoopTarget(0, 0.92)
      return
    }

    if (roundStatus === 'countdown') {
      ensureLoopPlaying()
      scheduleLoopTarget(0.48, 1)
      return
    }

    if (roundStatus === 'active') {
      ensureLoopPlaying()
      const cutoff = 15000
      const remaining = sessionState.round.remainingMs
      const intensity = remaining <= cutoff ? Math.max(0, Math.min(1, (cutoff - remaining) / cutoff)) : 0
      const volumeBase = 0.62
      const targetVolume = volumeBase + intensity * 0.22
      const targetRate = 1 + intensity * 0.36
      scheduleLoopTarget(targetVolume, targetRate)
      return
    }

    if (roundStatus === 'complete') {
      const hasWinner = sessionState.round.winnerSlot != null
      scheduleLoopTarget(hasWinner ? 0.24 : 0.12, 0.95)
      return
    }

    scheduleLoopTarget(0, 0.9)
  }, [ensureLoopPlaying, roundStatus, scheduleLoopTarget, sessionState.lobby.status, sessionState.round.remainingMs, sessionState.round.winnerSlot])

  useEffect(() => {
    if (device === 'desktop') {
      const previous = lastConnectedPlayersRef.current
      const current = sessionState.connectedPlayerCount
      if (current !== previous) {
        lastConnectedPlayersRef.current = current
        if (current > previous) {
          const audio = new Audio(joinLobbyChime)
          audio.volume = 0.2
          void audio.play().catch(() => {})
        } else if (current < previous) {
          const audio = new Audio(leaveLobbyChime)
          audio.volume = 0.15
          void audio.play().catch(() => {})
        }
      }
    } else {
      lastConnectedPlayersRef.current = sessionState.connectedPlayerCount
    }
  }, [device, sessionState.connectedPlayerCount])

  useEffect(() => {
    if (roundStatus !== 'countdown') {
      lastTickIdRef.current = null
      return
    }
    const currentId = spinnerState.currentId
    if (!currentId) {
      return
    }
    if (lastTickIdRef.current === currentId) {
      return
    }
    lastTickIdRef.current = currentId
    const audio = new Audio(slotTick)
    audio.volume = 0.25
    void audio.play().catch(() => {})
  }, [roundStatus, spinnerState.currentId])

  useEffect(() => {
    if (device !== 'desktop') {
      celebrationRoundRef.current = null
      return
    }
    if (roundStatus !== 'complete') {
      return
    }
    if (sessionState.round.winnerSlot == null) {
      return
    }
    const roundIndex = sessionState.round.index
    if (celebrationRoundRef.current === roundIndex) {
      return
    }
    celebrationRoundRef.current = roundIndex
    const audio = new Audio(roundWon)
    audio.volume = 0.38
    void audio.play().catch(() => {})
  }, [device, roundStatus, sessionState.round.index, sessionState.round.winnerSlot])


  if (device === 'mobile') {
    return <Navigate to="/join" replace />
  }

  const gridStyle: CSSProperties = (() => {
    const count = connectedPlayers.length
    if (count <= 1) {
      return { gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gridAutoRows: '1fr' }
    }
    if (count === 2) {
      return { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: '1fr' }
    }
    if (count === 3) {
      return { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridAutoRows: '1fr' }
    }
    if (count === 4) {
      return {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
      }
    }
    return { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: '1fr' }
  })()

  if (showSetup) {
    return (
      <div className="page host-setup">
        <div className="host-card">
          <h1>Shadow Shapes Lobby</h1>
          <p className="host-subtitle">Configure your race and share the code with your players.</p>
          <form className="host-form" onSubmit={handleCreateLobby}>
            <label className="input-group">
              <span>Round timer (seconds)</span>
              <input
                type="number"
                min={15}
                max={300}
                value={timerInput}
                onChange={(event) => setTimerInput(Number(event.target.value))}
              />
            </label>
            <label className="input-group">
              <span>Number of rounds</span>
              <input
                type="number"
                min={3}
                max={10}
                value={roundsInput}
                onChange={(event) => setRoundsInput(Number(event.target.value))}
              />
            </label>
            <label className="input-group">
              <span>Final figure multiplier</span>
              <input
                type="number"
                min={1}
                max={10}
                value={multiplierInput}
                onChange={(event) => setMultiplierInput(Number(event.target.value))}
              />
            </label>
            <button type="submit" className="hud-button accent host-submit">
              Create lobby
            </button>
          </form>
        </div>
      </div>
    )
  }

  const renderPlayerBubble = (player: (typeof sessionState.players)[number]) => {
    const color = getPlayerColor(player.slot)
    const name = player.name?.trim()
    const displayName = name && name.length > 0 ? name : `Player ${player.slot + 1}`
    const initial = name && name.length > 0 ? name.charAt(0).toUpperCase() : 'P'
    return (
      <div key={player.slot} className="lobby-player-item">
        <div className="player-bubble" style={{ backgroundColor: color.background, color: color.text }}>
          {initial}
        </div>
        <span className="lobby-player-name">{displayName}</span>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="hud">
        <div className="hud-left">
          <span className={`status-pill status-${roundStatus}`}>{statusLabel}</span>
          <span className="divider" />
          <span className="hud-meta">Players {sessionState.connectedPlayerCount}</span>
          {sessionState.lobby.code ? (
            <>
              <span className="divider" />
              <span className="hud-meta">Code {sessionState.lobby.code}</span>
            </>
          ) : null}
          {showGameView ? (
            <>
              <span className="divider" />
              <span className="shape-label">{shapeLabel}</span>
              <span className="divider" />
              <span className="hud-meta">Timer {timerLabel}</span>
            </>
          ) : null}
        </div>
        <div className="hud-right">
          <span className={`connection-dot ${connection}`}>{connection}</span>
          {self.role === 'host' && (
            <>
              <button
                type="button"
                className="hud-button accent"
                onClick={() => {
                  playClick()
                  ensureLoopPlaying()
                  startGame()
                }}
                disabled={startDisabled}
                title={startDisabledReason ?? 'Start the race'}
              >
                Start game
              </button>
              {sessionState.lobby.status === 'complete' ? (
                <div className="hud-finish-actions">
                  <button type="button" className="hud-button accent" onClick={restartGame}>
                    Play again
                  </button>
                  <button type="button" className="hud-button ghost" onClick={() => setShowSetup(true)}>
                    Create new lobby
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </header>

      {showTimerBar ? (
        <div className="round-timer-bar">
          <div className="round-timer-fill" style={{ width: timerWidth }} />
        </div>
      ) : null}

      {showCountdownOverlay ? (
        <div className="countdown-overlay">
          <div className="countdown-overlay-backdrop" />
          <div className="countdown-overlay-dialog">
            <CountdownSlot spinner={spinnerState} />
          </div>
        </div>
      ) : null}

      {showLobbyView ? (
        <section className="lobby-layout">
          <div className="lobby-column">
            <h2 className="lobby-players-header">Players</h2>
            {connectedPlayers.length > 0 ? (
              <div className="lobby-player-grid">{connectedPlayers.map(renderPlayerBubble)}</div>
            ) : (
              <div className="lobby-player-empty">Waiting for players to join…</div>
            )}
          </div>
          <div className="lobby-column lobby-instructions">
            <h2>Connect your phones as controllers</h2>
            <p>Type in the code below:</p>
            <div className="lobby-code-block">{lobbyCodeDisplay}</div>
            {joinUrl ? <p className="lobby-instructions-link">{joinUrl}</p> : null}
            {sessionState.lobby.code ? (
              <div className="lobby-qr-wrap">
                <span className="lobby-qr-caption">Or scan:</span>
                <div className="lobby-qr-frame">
                  <QRPreview value={joinUrl ?? sessionState.lobby.code} />
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {showGameView ? (
        <main
          className={`game-grid ${connectedPlayers.length === 0 ? 'game-grid-empty' : ''}`}
          style={gridStyle}
        >
          {connectedPlayers.length === 0 ? (
            <div className="lane-empty">No players joined yet.</div>
          ) : (
            connectedPlayers.map((player) => (
              <PlayerLane
                key={player.slot}
                player={player}
                roundStatus={roundStatus}
                shapeId={sessionState.round.shapeId ?? null}
                targetOrientation={sessionState.round.targetOrientation}
                isSelf={self.role === 'player' && self.slot === player.slot}
                winnerSlot={sessionState.round.winnerSlot}
              />
            ))
          )}
        </main>
      ) : null}

      {showResults ? (
        <section className="results-section">
          <ResultsDashboard
            players={sessionState.players}
            finalMultiplier={sessionState.lobby.finalRoundMultiplier}
          />
        </section>
      ) : null}
    </div>
  )
}

function JoinScreen() {
  const connection = useSessionStore((state) => state.connection)
  const sessionState = useSessionStore((state) => state.state)
  const self = useSessionStore((state) => state.self)
  const joinLobby = useSessionStore((state) => state.joinLobby)
  const leaveSlot = useSessionStore((state) => state.leaveSlot)
  const device = useSessionStore((state) => state.device)
  const [codeInput, setCodeInput] = useState('')
  const [nameInput, setNameInput] = useState(() => {
    if (typeof window === 'undefined') {
      return ''
    }
    return window.localStorage.getItem(NAME_STORAGE_KEY) ?? ''
  })
  const [validationError, setValidationError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [searchParams] = useSearchParams()
  const lastAutoCodeRef = useRef<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const showResults = sessionState.lobby.status === 'complete'

  useEffect(() => {
    const paramCode = searchParams.get('code')
    if (!paramCode) {
      return
    }
    const sanitized = paramCode.replace(/[^0-9]/g, '').slice(0, 6)
    if (!sanitized || sanitized === lastAutoCodeRef.current) {
      return
    }
    lastAutoCodeRef.current = sanitized
    setCodeInput(sanitized)
    const trimmedName = nameInput.trim()
    if (trimmedName) {
      joinLobby(sanitized, trimmedName)
    } else {
      setValidationError('Enter a display name to join.')
      nameInputRef.current?.focus()
    }
  }, [joinLobby, nameInput, searchParams])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const safeCode = codeInput.replace(/[^0-9]/g, '').slice(0, 6)
    const safeName = nameInput.trim()
    if (safeCode.length !== 6) {
      setValidationError('Enter the 6 digit lobby code.')
      return
    }
    if (!safeName) {
      setValidationError('Enter a display name to join.')
      nameInputRef.current?.focus()
      return
    }
    setValidationError(null)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NAME_STORAGE_KEY, safeName)
    }
    joinLobby(safeCode, safeName)
  }

  const handleScan = useCallback(
    (value: string | null) => {
      if (!value) {
        return
      }
      const extracted = extractCode(value)
      if (!extracted) {
        return
      }
      setCodeInput(extracted)
      const safeName = nameInput.trim()
      if (!safeName) {
        setValidationError('Enter a display name to join.')
        setScanning(false)
        nameInputRef.current?.focus()
        return
      }
      setValidationError(null)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(NAME_STORAGE_KEY, safeName)
      }
      joinLobby(extracted, safeName)
      setScanning(false)
    },
    [joinLobby, nameInput],
  )

  const handleScanError = useCallback(() => {
    // ignore scanner errors to keep UI minimal
  }, [])

  const showMobilePanel = self.role === 'player'

  return (
    <div className="page join-page">
      <header className="hud">
        <div className="hud-left">
          <span className="shape-label">{device === 'mobile' ? 'Join on mobile' : 'Join lobby'}</span>
          {sessionState.lobby.code ? <span className="hud-meta">Lobby {sessionState.lobby.code}</span> : null}
        </div>
        <div className="hud-right">
          <span className={`connection-dot ${connection}`}>{connection}</span>
          {self.role === 'player' ? (
            <button type="button" className="hud-button ghost" onClick={leaveSlot}>
              Leave
            </button>
          ) : null}
        </div>
      </header>

      {showMobilePanel ? (
        <MobilePlayerView />
      ) : (
        <>
          <section className="join-card">
            <form className="join-form" onSubmit={handleSubmit}>
              <label className="input-group">
                <span>Enter 6 digit code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={codeInput}
                  onChange={(event) => {
                    setCodeInput(event.target.value.replace(/[^0-9]/g, ''))
                    setValidationError(null)
                  }}
                />
              </label>
              <label className="input-group">
                <span>Display name</span>
                <input
                  ref={nameInputRef}
                  type="text"
                  maxLength={32}
                  value={nameInput}
                  placeholder="Pick a nickname"
                  autoComplete="name"
                  onChange={(event) => {
                    setNameInput(event.target.value)
                    setValidationError(null)
                  }}
                />
              </label>
              {validationError ? <p className="join-error">{validationError}</p> : null}
              <div className="join-actions">
                <button type="submit" className="hud-button accent">
                  Join lobby
                </button>
                <button
                  type="button"
                  className="hud-button ghost"
                  onClick={() => setScanning(true)}
                >
                  Scan QR
                </button>
              </div>
            </form>
          </section>
          {showResults ? (
            <section className="results-card">
              <ResultsDashboard
                players={sessionState.players}
                finalMultiplier={sessionState.lobby.finalRoundMultiplier}
                compact
              />
            </section>
          ) : null}
        </>
      )}

      {scanning ? (
        <div className="scanner-overlay">
          <div className="scanner-frame">
            <Scanner
              constraints={{ facingMode: 'environment' }}
              onScan={(codes: IDetectedBarcode[]) => handleScan(codes[0]?.rawValue ?? null)}
              onError={handleScanError}
            />
          </div>
          <button type="button" className="hud-button ghost" onClick={() => setScanning(false)}>
            Close scanner
          </button>
        </div>
      ) : null}
    </div>
  )
}

function MobilePlayerView() {
  const sessionState = useSessionStore((state) => state.state)
  const self = useSessionStore((state) => state.self)
  const sendOrientation = useSessionStore((state) => state.sendOrientation)
  const leaveSlot = useSessionStore((state) => state.leaveSlot)
  const device = useSessionStore((state) => state.device)
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>(() => {
    if (typeof window === 'undefined') {
      return 'unknown'
    }
    if (!('DeviceOrientationEvent' in window)) {
      return 'denied'
    }
    return 'unknown'
  })
  const permissionRequestedRef = useRef(false)
  const hapticLevelRef = useRef(0)

  const playerState = useMemo(() => {
    if (self.role !== 'player' || typeof self.slot !== 'number') {
      return null
    }
    return sessionState.players.find((player) => player.slot === self.slot) ?? null
  }, [self, sessionState.players])

  const secureContext = typeof window === 'undefined' ? true : window.isSecureContext

  const requestMotionAccess = useCallback(async () => {
    if (permissionStatus === 'granted') {
      return true
    }
    if (permissionRequestedRef.current) {
      return false
    }
    if (!secureContext) {
      setPermissionStatus('denied')
      return false
    }

    permissionRequestedRef.current = true
    try {
      const granted = await requestOrientationPermission()
      setPermissionStatus(granted ? 'granted' : 'denied')
      return granted
    } finally {
      permissionRequestedRef.current = false
    }
  }, [permissionStatus, secureContext])

  useEffect(() => {
    if (device !== 'mobile' || self.role !== 'player') {
      return
    }
    if (permissionStatus === 'denied') {
      return
    }

    let disposed = false
    const lastQuaternion = new Quaternion()
    const currentQuaternion = new Quaternion()
    let hasLast = false

    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha == null || event.beta == null || event.gamma == null) {
        return
      }

      if (!disposed) {
        setPermissionStatus((prev) => (prev === 'unknown' ? 'granted' : prev))
      }

      const euler = eulerFromDeviceOrientation(event.alpha, event.beta, event.gamma)
      currentQuaternion.setFromEuler(euler)

      if (hasLast && currentQuaternion.equals(lastQuaternion)) {
        return
      }

      lastQuaternion.copy(currentQuaternion)
      hasLast = true
      sendOrientation(toTuple(currentQuaternion))
    }

    window.addEventListener('deviceorientation', handleDeviceOrientation)

    return () => {
      disposed = true
      window.removeEventListener('deviceorientation', handleDeviceOrientation)
    }
  }, [device, self.role, permissionStatus, sendOrientation])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
      return
    }
    const progress = playerState?.progress ?? 0
    const nextLevel = progress >= 0.97 ? 3 : progress >= 0.9 ? 2 : progress >= 0.75 ? 1 : 0

    if (nextLevel > hapticLevelRef.current) {
      const patterns: Record<number, number | number[]> = {
        1: 18,
        2: [20, 60, 20],
        3: [40, 40, 40, 40],
      }
      navigator.vibrate(patterns[nextLevel] ?? 16)
    }

    if (nextLevel === 0 && hapticLevelRef.current !== 0) {
      hapticLevelRef.current = 0
    } else if (nextLevel > 0) {
      hapticLevelRef.current = nextLevel
    }
  }, [playerState?.progress])

  useEffect(() => {
    if (sessionState.round.status !== 'active') {
      hapticLevelRef.current = 0
    }
  }, [sessionState.round.status])

  useEffect(() => {
    if (self.role !== 'player') {
      setPermissionStatus('unknown')
      hapticLevelRef.current = 0
    }
  }, [self.role])

  const lobbyInactive = sessionState.lobby.status !== 'in-progress'
  const isCountdown = sessionState.round.status === 'countdown'
  const isActive = sessionState.round.status === 'active'
  const isComplete = sessionState.round.status === 'complete'
  const isWinner = isComplete && typeof self.slot === 'number' && sessionState.round.winnerSlot === self.slot

  const countdownSpinner = useShapeSlotSpinner({
    roundStatus: sessionState.round.status,
    countdownMs: sessionState.round.countdownMs,
    targetShapeId: sessionState.round.shapeId,
    shapes: sessionState.shapes,
  })

  const displayContent = (() => {
    if (sessionState.lobby.status === 'complete') {
      return <span className="mobile-message">Game complete</span>
    }
    if (lobbyInactive) {
      return <span className="mobile-message">Waiting for lobby to start</span>
    }
    if (isCountdown) {
  return <CountdownSlot spinner={countdownSpinner} />
    }
    if (isActive) {
      return <span className="mobile-timer">{formatTimer(sessionState.round.remainingMs)}</span>
    }
    if (isWinner) {
      return <span className="mobile-message">You won!</span>
    }
    return <span className="mobile-message">Round complete</span>
  })()

  return (
    <div className="mobile-shell">
      <div className="mobile-content">
        {!secureContext ? <span className="mobile-warning">Use HTTPS to enable motion controls.</span> : null}
        {permissionStatus !== 'granted' ? (
          <button type="button" className="hud-button accent" onClick={requestMotionAccess}>
            Enable motion control
          </button>
        ) : null}
        <div className="mobile-display">
          {displayContent}
        </div>
        <button type="button" className="hud-button ghost mobile-leave" onClick={leaveSlot}>
          Leave lobby
        </button>
      </div>
    </div>
  )
}

function QRPreview({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    toCanvas(canvas, value, {
      margin: 1,
      width: 160,
      color: {
        dark: '#9eeaff',
        light: '#00000000',
      },
    }).catch(() => {
      const context = canvas.getContext('2d')
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height)
      }
    })
  }, [value])

  return <canvas ref={canvasRef} className="qr-canvas" width={160} height={160} />
}

function extractCode(value: string): string | null {
  try {
    const parsed = new URL(value)
    const fromParam = parsed.searchParams.get('code')
    if (fromParam) {
      return fromParam.replace(/[^0-9]/g, '').slice(0, 6)
    }
  } catch {
    // ignore parse error, fall back to raw value
  }
  const digits = value.replace(/[^0-9]/g, '').slice(0, 6)
  return digits || null
}

function describeLobbyStatus(lobbyStatus: LobbyStatus, roundStatus: RoundStatus, index: number, total: number): string {
  if (lobbyStatus === 'idle') {
    return 'Lobby closed'
  }
  if (lobbyStatus === 'open') {
    return 'Lobby open'
  }
  if (lobbyStatus === 'in-progress') {
    const current = Math.max(index, 1)
    if (roundStatus === 'countdown') {
      return `Round ${current}/${Math.max(total, 1)} starting`
    }
    if (roundStatus === 'active') {
      return `Round ${current}/${Math.max(total, 1)}`
    }
    if (roundStatus === 'complete') {
      return 'Round complete'
    }
    return 'Between rounds'
  }
  return 'Game complete'
}

function formatTimer(ms: number): string {
  const clamped = Math.max(0, ms)
  const totalSeconds = Math.ceil(clamped / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

async function requestOrientationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false
  }

  const orientation = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }
  if (orientation && typeof orientation.requestPermission === 'function') {
    try {
      const response = await orientation.requestPermission()
      if (response !== 'granted') {
        return false
      }
    } catch {
      return false
    }
  }

  const motion = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }
  if (motion && typeof motion.requestPermission === 'function') {
    try {
      const response = await motion.requestPermission()
      if (response !== 'granted') {
        return false
      }
    } catch {
      return false
    }
  }

  return true
}

export default App
