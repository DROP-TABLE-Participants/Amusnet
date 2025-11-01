import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { nanoid } from 'nanoid'
import { Quaternion } from 'three'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as https from 'node:https'
import {
  IDENTITY_QUATERNION,
  clampProgress,
  randomDeviceOrientationQuaternion,
  shadowAngleBetween,
  toQuaternion,
  toTuple,
  type QuaternionTuple,
} from '../src/utils/quaternion'
import { randomShapeId } from '../src/shared/shapes'
import type { ShapeId } from '../src/shared/shapes'
import type {
  ClientMessage,
  LobbyStatus,
  PlayerSnapshot,
  RoundStatus,
  ServerMessage,
  SessionStatePayload,
  SelfSnapshot,
  DeviceEuler,
} from '../src/shared/messages'

const PORT = Number(process.env.PORT ?? 8787)
const MATCH_THRESHOLD = 0.35
const CODE_LENGTH = 6
const ROUND_TRANSITION_DELAY_MS = 2000
const COUNTDOWN_DURATION_MS = 3000

const generateLobbyCode = (): string => {
  const digits = Math.floor(Math.random() * 10 ** CODE_LENGTH)
  return digits.toString().padStart(CODE_LENGTH, '0')
}

type DeviceType = 'mobile' | 'desktop'

type ClientRecord = {
  id: string
  socket: WebSocket
  device: DeviceType
  role: 'viewer' | 'player' | 'host'
  slot?: number
}

type PlayerSlot = {
  slot: number
  clientId: string | null
  ready: boolean
  playing: boolean
  finished: boolean
  calibration: QuaternionTuple | null
  targetOrientation: QuaternionTuple | null
  rawOrientation: DeviceEuler | null
  orientation: QuaternionTuple
  angle: number
  progress: number
}

type RoundState = {
  status: RoundStatus
  shapeId: ShapeId | null
  targetOrientation: QuaternionTuple | null
  winnerSlot: number | null
}

class Session {
  private clients = new Map<string, ClientRecord>()
  private players: PlayerSlot[] = Array.from({ length: 3 }, (_, slot) => ({
    slot,
    clientId: null,
    ready: false,
    playing: false,
    finished: false,
    calibration: null,
    targetOrientation: null,
    rawOrientation: null,
    orientation: [...IDENTITY_QUATERNION] as QuaternionTuple,
    angle: Math.PI,
    progress: 0,
  }))
  private round: RoundState = {
    status: 'waiting',
    shapeId: null,
    targetOrientation: null,
    winnerSlot: null,
  }
  private targetQuaternion: Quaternion | null = null
  private lobby = {
    status: 'idle' as LobbyStatus,
    code: null as string | null,
    timerSeconds: 60,
    totalRounds: 3,
    currentRound: 0,
  }
  private hostId: string | null = null
  private roundEndTime: number | null = null
  private countdownEndTime: number | null = null
  private roundTicker: NodeJS.Timeout | null = null
  private roundTransition: NodeJS.Timeout | null = null
  private countdownTicker: NodeJS.Timeout | null = null

  addClient(socket: WebSocket) {
    const id = nanoid()
    const client: ClientRecord = { id, socket, device: 'desktop', role: 'viewer' }
    this.clients.set(id, client)

    socket.on('message', (buffer) => {
      this.handleMessage(client, buffer)
    })

    socket.on('close', () => {
      this.removeClient(id)
    })

    socket.on('error', () => {
      this.removeClient(id)
    })

    this.sendStateToClient(client)
  }

  private removeClient(clientId: string) {
    const client = this.clients.get(clientId)
    if (!client) {
      return
    }

    if (client.role === 'player' && typeof client.slot === 'number') {
      this.releaseSlot(client.slot)
    }

    if (clientId === this.hostId) {
      this.resetLobbyState()
    }

    this.clients.delete(clientId)
    this.rebalanceRound()
    this.broadcastState()
  }

  private resetLobbyState() {
    this.clearRoundTimers()
    this.hostId = null
    this.lobby = {
      status: 'idle',
      code: null,
      timerSeconds: 60,
      totalRounds: 3,
      currentRound: 0,
    }
    this.round = {
      status: 'waiting',
      shapeId: null,
      targetOrientation: null,
      winnerSlot: null,
    }
    this.targetQuaternion = null
    this.roundEndTime = null
    this.resetPlayers()
  }

  private clearRoundTimers() {
    if (this.roundTicker) {
      clearInterval(this.roundTicker)
      this.roundTicker = null
    }
    if (this.roundTransition) {
      clearTimeout(this.roundTransition)
      this.roundTransition = null
    }
      if (this.countdownTicker) {
        clearInterval(this.countdownTicker)
        this.countdownTicker = null
      }
      this.countdownEndTime = null
    this.roundEndTime = null
  }

  private resetPlayers() {
    this.players.forEach((slot) => {
      if (slot.clientId) {
        const client = this.clients.get(slot.clientId)
        if (client) {
          client.role = 'viewer'
          client.slot = undefined
        }
      }
      slot.clientId = null
      slot.ready = false
      slot.playing = false
      slot.finished = false
      slot.calibration = null
      slot.targetOrientation = null
      slot.rawOrientation = null
      slot.orientation = [...IDENTITY_QUATERNION]
      slot.angle = Math.PI
      slot.progress = 0
    })
  }

  private handleMessage(client: ClientRecord, buffer: RawData) {
    let message: ClientMessage | null = null
    try {
      message = JSON.parse(buffer.toString()) as ClientMessage
    } catch {
      return
    }

    switch (message.type) {
      case 'register':
        client.device = message.device
        break
      case 'create-lobby':
        this.handleCreateLobby(client, message.timerSeconds, message.totalRounds)
        break
      case 'join-lobby':
        this.handleJoinLobby(client, message.code)
        break
      case 'start-game':
        this.handleStartGame(client)
        break
      case 'leave-slot':
        if (client.role === 'player' && typeof client.slot === 'number') {
          this.releaseSlot(client.slot)
          this.rebalanceRound()
          this.broadcastState()
        }
        break
      case 'orientation':
        if (client.role === 'player' && client.device === 'mobile' && typeof client.slot === 'number') {
          this.updateOrientation(client.slot, message.orientation, message.rawOrientation)
        }
        break
      default:
        break
    }
  }

  private handleCreateLobby(client: ClientRecord, timerSeconds: number, totalRounds: number) {
    if (client.device !== 'desktop') {
      return
    }
    const safeTimer = Number.isFinite(timerSeconds) && timerSeconds > 0 ? Math.round(timerSeconds) : 60
    const safeRounds = Number.isFinite(totalRounds) ? Math.round(totalRounds) : 3
    const clampedRounds = Math.min(10, Math.max(3, safeRounds))
    const clampedTimer = Math.min(300, Math.max(15, safeTimer))

    if (this.hostId && this.hostId !== client.id && this.lobby.status !== 'idle' && this.lobby.status !== 'complete') {
      return
    }

    this.clearRoundTimers()
    this.round = {
      status: 'waiting',
      shapeId: null,
      targetOrientation: null,
      winnerSlot: null,
    }
    this.targetQuaternion = null
    this.roundEndTime = null
    this.resetPlayers()

    this.hostId = client.id
    client.role = 'host'

    this.lobby = {
      status: 'open',
      code: generateLobbyCode(),
      timerSeconds: clampedTimer,
      totalRounds: clampedRounds,
      currentRound: 0,
    }

    this.broadcastState()
  }

  private handleJoinLobby(client: ClientRecord, code: string) {
    if (client.device !== 'mobile') {
      return
    }
    if (this.lobby.status !== 'open' || !this.lobby.code || code.trim() !== this.lobby.code) {
      return
    }
    if (typeof client.slot === 'number') {
      return
    }

    const assigned = this.assignPlayerSlot(client)
    if (assigned) {
      this.broadcastState()
    }
  }

  private handleStartGame(client: ClientRecord) {
    if (client.id !== this.hostId) {
      return
    }
    if (this.lobby.status !== 'open') {
      return
    }
    const activePlayers = this.players.filter((slot) => slot.clientId !== null)
    if (activePlayers.length === 0) {
      return
    }

    this.lobby.status = 'in-progress'
    this.startNextRound()
  }

  private assignPlayerSlot(client: ClientRecord): boolean {
    const available = this.players.find((slot) => slot.clientId === null)
    if (!available) {
      return false
    }

    available.clientId = client.id
    available.ready = false
    available.playing = false
    available.finished = false
  available.calibration = null
  available.targetOrientation = null
  available.rawOrientation = null
    available.orientation = [...IDENTITY_QUATERNION]
    available.angle = Math.PI
    available.progress = 0

    client.role = 'player'
    client.slot = available.slot
    return true
  }

  private releaseSlot(slotIndex: number) {
    const slot = this.players[slotIndex]
    const clientId = slot.clientId
    slot.clientId = null
    slot.ready = false
    slot.playing = false
    slot.finished = false
    slot.calibration = null
  slot.targetOrientation = null
  slot.rawOrientation = null
    slot.orientation = [...IDENTITY_QUATERNION]
    slot.angle = Math.PI
    slot.progress = 0

    if (clientId) {
      const client = this.clients.get(clientId)
      if (client) {
        client.role = 'viewer'
        client.slot = undefined
      }
    }
  }

  private startNextRound() {
    if (this.lobby.currentRound >= this.lobby.totalRounds) {
      this.finishLobby()
      return
    }

    this.lobby.currentRound += 1

    const shapeId = randomShapeId()
    const target = randomDeviceOrientationQuaternion()

    this.round = {
      status: 'countdown',
      shapeId,
      targetOrientation: toTuple(target),
      winnerSlot: null,
    }
    this.targetQuaternion = target
    this.countdownEndTime = Date.now() + COUNTDOWN_DURATION_MS
    this.roundEndTime = null

    this.players.forEach((slot) => {
      slot.finished = false
      slot.progress = 0
      slot.angle = Math.PI
      slot.orientation = [...IDENTITY_QUATERNION]
      slot.playing = false
      slot.ready = false
      slot.calibration = null
      slot.targetOrientation = null
      slot.rawOrientation = null
    })

    const connectedPlayers = this.players.filter((slot) => slot.clientId !== null)
    if (connectedPlayers.length === 0) {
      this.round = {
        status: 'waiting',
        shapeId: null,
        targetOrientation: null,
        winnerSlot: null,
      }
      this.targetQuaternion = null
      this.countdownEndTime = null
      this.lobby.status = 'open'
      this.broadcastState()
      return
    }

    this.startCountdownTimer()
    this.broadcastState()
  }

  private startCountdownTimer() {
    if (this.countdownTicker) {
      clearInterval(this.countdownTicker)
    }
    this.countdownTicker = setInterval(() => {
      if (this.round.status !== 'countdown' || !this.countdownEndTime) {
        if (this.countdownTicker) {
          clearInterval(this.countdownTicker)
          this.countdownTicker = null
        }
        return
      }
      const remaining = this.countdownEndTime - Date.now()
      if (remaining <= 0) {
        this.activateRound()
      } else {
        this.broadcastState()
      }
    }, 100)
  }

  private activateRound() {
    if (this.round.status !== 'countdown') {
      return
    }

    if (this.countdownTicker) {
      clearInterval(this.countdownTicker)
      this.countdownTicker = null
    }
    this.countdownEndTime = null

    const connectedPlayers = this.players.filter((slot) => slot.clientId !== null)
    if (connectedPlayers.length === 0) {
      this.round = {
        status: 'waiting',
        shapeId: null,
        targetOrientation: null,
        winnerSlot: null,
      }
      this.targetQuaternion = null
      this.lobby.status = 'open'
      this.broadcastState()
      return
    }

    this.round.status = 'active'
    this.round.winnerSlot = null
    this.roundEndTime = Date.now() + this.lobby.timerSeconds * 1000

    this.players.forEach((slot) => {
      slot.playing = slot.clientId !== null
    })

    this.startRoundTicker()
    this.broadcastState()
  }

  private startRoundTicker() {
    if (this.roundTicker) {
      clearInterval(this.roundTicker)
    }
    this.roundTicker = setInterval(() => {
      if (this.round.status !== 'active' || !this.roundEndTime) {
        if (this.roundTicker) {
          clearInterval(this.roundTicker)
          this.roundTicker = null
        }
        return
      }
      const remaining = this.roundEndTime - Date.now()
      if (remaining <= 0) {
        this.completeRound('timeout')
      } else {
        this.broadcastState()
      }
    }, 500)
  }

  private completeRound(_reason: 'matched' | 'timeout' | 'aborted', winnerSlot?: number) {
    if (this.round.status !== 'active') {
      return
    }
    this.round.status = 'complete'
    this.round.winnerSlot = typeof winnerSlot === 'number' ? winnerSlot : null
    this.roundEndTime = null
    if (this.roundTicker) {
      clearInterval(this.roundTicker)
      this.roundTicker = null
    }

    this.players.forEach((slot) => {
      slot.playing = false
    })

    this.broadcastState()

    if (this.roundTransition) {
      clearTimeout(this.roundTransition)
    }

    const hasPlayers = this.players.some((slot) => slot.clientId !== null)
    if (!hasPlayers) {
      this.roundTransition = null
      this.lobby.status = 'open'
      this.round = {
        status: 'waiting',
        shapeId: null,
        targetOrientation: null,
        winnerSlot: null,
      }
      this.targetQuaternion = null
      this.broadcastState()
      return
    }

    this.roundTransition = setTimeout(() => {
      this.roundTransition = null
      this.startNextRound()
    }, ROUND_TRANSITION_DELAY_MS)
  }

  private finishLobby() {
    this.clearRoundTimers()
    this.lobby.status = 'complete'
    this.round = {
      status: 'waiting',
      shapeId: null,
      targetOrientation: null,
      winnerSlot: null,
    }
    this.targetQuaternion = null

    this.players.forEach((slot) => {
      slot.playing = false
      slot.finished = false
      slot.progress = 0
      slot.angle = Math.PI
    })

    this.broadcastState()
  }

  private rebalanceRound() {
    const connectedPlayers = this.players.filter((slot) => slot.clientId !== null)

    if (this.round.status === 'active' && connectedPlayers.length === 0) {
      this.completeRound('aborted')
    }

    if (this.round.status === 'countdown' && connectedPlayers.length === 0) {
      if (this.countdownTicker) {
        clearInterval(this.countdownTicker)
        this.countdownTicker = null
      }
      this.round = {
        status: 'waiting',
        shapeId: null,
        targetOrientation: null,
        winnerSlot: null,
      }
      this.targetQuaternion = null
      this.countdownEndTime = null
      this.lobby.status = 'open'
      this.broadcastState()
    }
  }

  private updateOrientation(slotIndex: number, payload: QuaternionTuple, raw?: DeviceEuler) {
    const slot = this.players[slotIndex]
    if (!slot || slot.clientId === null) {
      return
    }

    const absoluteOrientation = toQuaternion(payload)
    if (!slot.calibration) {
      slot.calibration = toTuple(absoluteOrientation)
    }

    const calibrationQuat = slot.calibration
      ? toQuaternion(slot.calibration)
      : new Quaternion(...IDENTITY_QUATERNION)
    const relativeOrientation = calibrationQuat.clone().invert().multiply(absoluteOrientation).normalize()

    const targetForSlot = this.targetQuaternion
      ? calibrationQuat.clone().invert().multiply(this.targetQuaternion.clone()).normalize()
      : null

    slot.rawOrientation = raw ?? null
    slot.orientation = toTuple(relativeOrientation)
    slot.targetOrientation = targetForSlot ? toTuple(targetForSlot) : null

    if (this.round.status === 'active' && this.targetQuaternion) {
      const comparisonTarget = targetForSlot ?? new Quaternion(...IDENTITY_QUATERNION)
      const angle = shadowAngleBetween(relativeOrientation, comparisonTarget)
      slot.angle = angle

      if (!slot.finished && angle < MATCH_THRESHOLD) {
        slot.finished = true
        slot.progress = 1
        this.completeRound('matched', slotIndex)
      } else if (!slot.finished) {
        slot.progress = clampProgress(angle)
      }
    } else {
      const baselineTarget = targetForSlot ?? new Quaternion(...IDENTITY_QUATERNION)
      slot.angle = shadowAngleBetween(relativeOrientation, baselineTarget)
      if (!slot.finished) {
        slot.progress = 0
      }
    }

    this.broadcastState()
  }

  private toSnapshot(): SessionStatePayload {
    const remainingMs = this.round.status === 'active' && this.roundEndTime
      ? Math.max(this.roundEndTime - Date.now(), 0)
      : 0
    const countdownMs = this.round.status === 'countdown' && this.countdownEndTime
      ? Math.max(this.countdownEndTime - Date.now(), 0)
      : 0

    return {
      lobby: {
        status: this.lobby.status,
        code: this.lobby.code,
        timerSeconds: this.lobby.timerSeconds,
        totalRounds: this.lobby.totalRounds,
      },
      players: this.players.map<PlayerSnapshot>((slot) => ({
        slot: slot.slot,
        connected: slot.clientId !== null,
        ready: slot.ready,
        playing: slot.playing,
        finished: slot.finished,
        angle: slot.angle,
        progress: slot.progress,
        orientation: [...slot.orientation] as QuaternionTuple,
        targetOrientation: slot.targetOrientation
          ? [...slot.targetOrientation] as QuaternionTuple
          : null,
        rawOrientation: slot.rawOrientation
          ? { ...slot.rawOrientation }
          : null,
      })),
      round: {
        status: this.round.status,
        shapeId: this.round.shapeId,
        targetOrientation: this.round.targetOrientation
          ? [...this.round.targetOrientation] as QuaternionTuple
          : null,
        index: this.lobby.currentRound,
        total: this.lobby.totalRounds,
        durationSeconds: this.lobby.timerSeconds,
        remainingMs,
        countdownMs,
        winnerSlot: this.round.winnerSlot,
      },
      readyCount: 0,
      connectedPlayerCount: this.players.filter((slot) => slot.clientId !== null).length,
    }
  }

  private describeSelf(client: ClientRecord): SelfSnapshot {
    if (client.id === this.hostId) {
      return { role: 'host' }
    }
    if (client.role === 'player' && typeof client.slot === 'number') {
      return { role: 'player', slot: client.slot }
    }
    return { role: 'viewer' }
  }

  private broadcastState() {
    const snapshot = this.toSnapshot()
    this.clients.forEach((client) => {
      this.sendSnapshotToClient(client, snapshot)
    })
  }

  private sendStateToClient(client: ClientRecord) {
    const snapshot = this.toSnapshot()
    this.sendSnapshotToClient(client, snapshot)
  }

  private sendSnapshotToClient(client: ClientRecord, snapshot: SessionStatePayload) {
    if (client.socket.readyState !== WebSocket.OPEN) {
      return
    }
    const message: ServerMessage = {
      type: 'session-state',
      state: snapshot,
      self: this.describeSelf(client),
    }
    client.socket.send(JSON.stringify(message))
  }
}

type TlsConfig = { key: Buffer; cert: Buffer }

const loadTlsConfig = (): TlsConfig | null => {
  const keyPath = process.env.WS_SSL_KEY
  const certPath = process.env.WS_SSL_CERT

  if (!keyPath || !certPath) {
    return null
  }

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.warn('[shadow-play] WS_SSL_KEY or WS_SSL_CERT path not found. Falling back to ws://')
    return null
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  }
}

const session = new Session()

async function startServer() {
  const tlsConfig = loadTlsConfig()

  if (tlsConfig) {
    const httpsServer = https.createServer(tlsConfig)
    const wss = new WebSocketServer({ server: httpsServer })

    wss.on('connection', (socket) => {
      session.addClient(socket)
    })

    wss.on('error', (error: unknown) => {
      console.error('[shadow-play] websocket error', error)
    })

    httpsServer.listen(PORT, () => {
      console.log(`[shadow-play] secure websocket server listening on port ${PORT}`)
    })

    httpsServer.on('error', (error: unknown) => {
      console.error('[shadow-play] https server error', error)
    })
  } else {
    const httpServer = http.createServer()
    const wss = new WebSocketServer({ server: httpServer })

    wss.on('connection', (socket) => {
      session.addClient(socket)
    })

    wss.on('error', (error: unknown) => {
      console.error('[shadow-play] websocket error', error)
    })

    httpServer.listen(PORT, () => {
      console.log(`[shadow-play] websocket server listening on ws://localhost:${PORT}`)
    })

    httpServer.on('error', (error: unknown) => {
      console.error('[shadow-play] http server error', error)
    })
  }
}

startServer().catch((error) => {
  console.error('[shadow-play] failed to start websocket server', error)
  process.exit(1)
})