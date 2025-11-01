import type { ShapeId } from './shapes'
import type { QuaternionTuple } from '../utils/quaternion'

export type DeviceEuler = {
  alpha: number
  beta: number
  gamma: number
}

export type RoundStatus = 'waiting' | 'countdown' | 'active' | 'complete'
export type LobbyStatus = 'idle' | 'open' | 'in-progress' | 'complete'

export type PlayerSnapshot = {
  slot: number
  connected: boolean
  ready: boolean
  playing: boolean
  finished: boolean
  angle: number
  progress: number
  orientation: QuaternionTuple
  targetOrientation: QuaternionTuple | null
  rawOrientation: DeviceEuler | null
}

export type RoundSnapshot = {
  status: RoundStatus
  shapeId: ShapeId | null
  targetOrientation: QuaternionTuple | null
  index: number
  total: number
  durationSeconds: number
  remainingMs: number
  countdownMs: number
  winnerSlot: number | null
}

export type LobbySnapshot = {
  status: LobbyStatus
  code: string | null
  timerSeconds: number
  totalRounds: number
}

export type SessionStatePayload = {
  lobby: LobbySnapshot
  players: PlayerSnapshot[]
  round: RoundSnapshot
  readyCount: number
  connectedPlayerCount: number
}

export type SelfSnapshot = {
  role: 'viewer' | 'player' | 'host'
  slot?: number
}

export type ServerMessage = {
  type: 'session-state'
  state: SessionStatePayload
  self: SelfSnapshot
}

export type ClientMessage =
  | { type: 'register'; device: 'mobile' | 'desktop' }
  | { type: 'create-lobby'; timerSeconds: number; totalRounds: number }
  | { type: 'join-lobby'; code: string }
  | { type: 'start-game' }
  | { type: 'leave-slot' }
  | {
      type: 'orientation'
      orientation: QuaternionTuple
      rawOrientation?: DeviceEuler
    }