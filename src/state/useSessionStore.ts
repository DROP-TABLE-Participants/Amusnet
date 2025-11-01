import { create } from 'zustand'
import type { QuaternionTuple } from '../utils/quaternion'
import { IDENTITY_QUATERNION } from '../utils/quaternion'
import type {
  ClientMessage,
  ServerMessage,
  SessionStatePayload,
  SelfSnapshot,
} from '../shared/messages'
import { GENERATED_SHAPES } from '../generated/shapes'
import { updateGeneratedShapeRegistry } from '../shapes/catalog'

const PLAYER_SLOTS = 4

const initialState = (): SessionStatePayload => ({
  lobby: {
    status: 'idle',
    code: null,
    timerSeconds: 60,
    totalRounds: 3,
    finalRoundMultiplier: 3,
    shapesReady: true,
  },
  shapes: GENERATED_SHAPES,
  players: Array.from({ length: PLAYER_SLOTS }, (_, slot) => ({
    slot,
    connected: false,
    ready: false,
    playing: false,
    finished: false,
  score: 0,
    name: null,
    angle: Math.PI,
    progress: 0,
    orientation: [...IDENTITY_QUATERNION] as QuaternionTuple,
    targetOrientation: null,
    rawOrientation: null,
  })),
  round: {
    status: 'waiting',
    shapeId: null,
    targetOrientation: null,
    index: 0,
    total: 0,
    durationSeconds: 60,
    remainingMs: 0,
    countdownMs: 0,
    winnerSlot: null,
  },
  readyCount: 0,
  connectedPlayerCount: 0,
})

type ConnectionStatus = 'connecting' | 'open' | 'closed'

type DeviceType = 'mobile' | 'desktop'

type SessionStore = {
  connection: ConnectionStatus
  device: DeviceType
  state: SessionStatePayload
  self: SelfSnapshot
  connect: () => void
  createLobby: (timerSeconds: number, totalRounds: number, finalMultiplier: number) => void
  joinLobby: (code: string, name: string) => void
  startGame: () => void
  restartGame: () => void
  leaveSlot: () => void
  sendOrientation: (orientation: QuaternionTuple) => void
}

const isMobileDevice = (): DeviceType => {
  if (typeof navigator === 'undefined') {
    return 'desktop'
  }
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? 'mobile'
    : 'desktop'
}

const resolveSocketUrl = () => {
  if (typeof window === 'undefined') {
    return 'ws://localhost:8787'
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.hostname
  const port = (import.meta.env.VITE_WS_PORT as string | undefined) ?? '8787'
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL as string
  }
  return `${protocol}://${host}:${port}`
}

let socket: WebSocket | null = null
let orientationFrame: number | null = null
let pendingOrientation: QuaternionTuple | null = null

const sendMessage = (message: ClientMessage) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return
  }
  socket.send(JSON.stringify(message))
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  connection: 'connecting',
  device: isMobileDevice(),
  state: initialState(),
  self: { role: 'viewer' },
  connect: () => {
    if (typeof window === 'undefined') {
      return
    }
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return
    }
    const url = resolveSocketUrl()
    socket = new WebSocket(url)
    set({ connection: 'connecting' })

    socket.addEventListener('open', () => {
      set({ connection: 'open' })
      sendMessage({ type: 'register', device: get().device })
    })

    socket.addEventListener('close', () => {
      updateGeneratedShapeRegistry(GENERATED_SHAPES)
      set({ connection: 'closed', state: initialState(), self: { role: 'viewer' } })
    })

    socket.addEventListener('message', (event) => {
      let payload: ServerMessage | null = null
      try {
        payload = JSON.parse(event.data as string) as ServerMessage
      } catch {
        return
      }

      if (payload.type === 'session-state') {
        updateGeneratedShapeRegistry(payload.state.shapes)
        set({ state: payload.state, self: payload.self })
      }
    })
  },
  createLobby: (timerSeconds: number, totalRounds: number, finalMultiplier: number) => {
    sendMessage({ type: 'create-lobby', timerSeconds, totalRounds, finalMultiplier })
  },
  joinLobby: (code: string, name: string) => {
    sendMessage({ type: 'join-lobby', code, name })
  },
  startGame: () => {
    sendMessage({ type: 'start-game' })
  },
  restartGame: () => {
    sendMessage({ type: 'restart-game' })
  },
  leaveSlot: () => {
    sendMessage({ type: 'leave-slot' })
  },
  sendOrientation: (orientation: QuaternionTuple) => {
    pendingOrientation = orientation
    if (orientationFrame !== null) {
      return
    }
    if (typeof window === 'undefined') {
      return
    }
    orientationFrame = window.requestAnimationFrame(() => {
      orientationFrame = null
      if (!pendingOrientation) {
        return
      }
      sendMessage({ type: 'orientation', orientation: pendingOrientation })
      pendingOrientation = null
    })
  },
}))

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (socket) {
      socket.close()
    }
  })
}
