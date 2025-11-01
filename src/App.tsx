import type { FormEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { Quaternion } from 'three'
import { toCanvas } from 'qrcode'
import { Scanner } from '@yudiel/react-qr-scanner'
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner'
import { PlayerLane } from './components/PlayerLane'
import { CountdownSlot } from './components/CountdownSlot'
import { useSessionStore } from './state/useSessionStore'
import { shapeLabelFromCatalog } from './shared/shapes'
import { useShapeSlotSpinner } from './hooks/useShapeSlotSpinner'
import type { LobbyStatus, RoundStatus } from './shared/messages'
import { eulerFromDeviceOrientation, toTuple } from './utils/quaternion'

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
  const [timerInput, setTimerInput] = useState(sessionState.lobby.timerSeconds || 60)
  const [roundsInput, setRoundsInput] = useState(sessionState.lobby.totalRounds || 3)
  const [showSetup, setShowSetup] = useState(() => self.role !== 'host' || sessionState.lobby.status === 'idle')

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
  }, [sessionState.lobby.timerSeconds, sessionState.lobby.totalRounds])

  const handleCreateLobby = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const safeRounds = Math.max(3, Math.min(10, Math.round(roundsInput)))
      const safeTimer = Math.max(15, Math.min(300, Math.round(timerInput)))
      createLobby(safeTimer, safeRounds)
    },
    [createLobby, roundsInput, timerInput],
  )

  const spinnerState = useShapeSlotSpinner({
    roundStatus: sessionState.round.status,
    countdownMs: sessionState.round.countdownMs,
    targetShapeId: sessionState.round.shapeId,
    shapes: sessionState.shapes,
  })

  const startDisabled = sessionState.lobby.status !== 'open' || sessionState.connectedPlayerCount === 0
  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined' || !sessionState.lobby.code) {
      return null
    }
    return `${window.location.origin}/join?code=${sessionState.lobby.code}`
  }, [sessionState.lobby.code])

  if (device === 'mobile') {
    return <Navigate to="/join" replace />
  }

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
            <button type="submit" className="hud-button accent host-submit">
              Create lobby
            </button>
          </form>
        </div>
      </div>
    )
  }

  const statusLabel = describeLobbyStatus(
    sessionState.lobby.status,
    sessionState.round.status,
    sessionState.round.index,
    sessionState.round.total,
  )
  const shapeLabel = shapeLabelFromCatalog(sessionState.shapes, sessionState.round.shapeId)
  const timerLabel = (() => {
    if (sessionState.round.status === 'countdown') {
      return 'Spinning shapes'
    }
    if (sessionState.round.status === 'active') {
      return formatTimer(sessionState.round.remainingMs)
    }
    return `${sessionState.lobby.timerSeconds}s`
  })()
  const connectedPlayers = sessionState.players.filter((player) => player.connected)
  const lanesToRender = connectedPlayers.length > 0 ? connectedPlayers : []

  return (
    <div className="page">
      <header className="hud">
        <div className="hud-left">
          <span className={`status-pill status-${sessionState.round.status}`}>{statusLabel}</span>
          <span className="divider" />
          <span className="shape-label">{shapeLabel}</span>
          <span className="divider" />
          <span className="hud-meta">Players {sessionState.connectedPlayerCount}</span>
          <span className="hud-meta">Timer {timerLabel}</span>
        </div>
        <div className="hud-right">
          <span className={`connection-dot ${connection}`}>{connection}</span>
          {self.role === 'host' && (
            <>
              <button
                type="button"
                className="hud-button accent"
                onClick={startGame}
                disabled={startDisabled}
              >
                Start game
              </button>
              {sessionState.lobby.status === 'complete' ? (
                <button type="button" className="hud-button ghost" onClick={() => setShowSetup(true)}>
                  Create new lobby
                </button>
              ) : null}
            </>
          )}
        </div>
      </header>

      {sessionState.lobby.code ? (
        <section className="qr-card">
          <div className="qr-code">
            <QRPreview value={joinUrl ?? sessionState.lobby.code} />
          </div>
          <div className="qr-details">
            <span className="qr-label">Lobby code</span>
            <span className="qr-value">{sessionState.lobby.code}</span>
            {joinUrl ? <span className="qr-url">{joinUrl}</span> : null}
          </div>
        </section>
      ) : null}

      <main className={`lanes ${lanesToRender.length === 0 ? 'lanes-empty' : ''}`}>
        {lanesToRender.length === 0 ? (
          <div className="lane-empty">No players joined yet.</div>
        ) : (
          lanesToRender.map((player, index) => (
            <PlayerLane
              key={player.slot}
              displayIndex={index}
              player={player}
              roundStatus={sessionState.round.status}
              shapeId={sessionState.round.shapeId ?? null}
              targetOrientation={sessionState.round.targetOrientation}
              isSelf={self.role === 'player' && self.slot === player.slot}
              winnerSlot={sessionState.round.winnerSlot}
              spinner={spinnerState}
            />
          ))
        )}
      </main>
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
