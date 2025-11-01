import 'dotenv/config'
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
import { ensureShapeCount, FINAL_SHAPE_ID } from '../src/shared/shapes'
import type { ShapeId } from '../src/shared/shapes'
import { GENERATED_SHAPES, type GeneratedShapeDefinition } from '../src/generated/shapes'
import { generateShapeBatch } from './shapeGenerator'
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
const MAX_NAME_LENGTH = 32

const LOG_PREFIX = '[shadow-play]'
const DEBUG_ENABLED = process.env.DEBUG_SHADOW_PLAY !== '0'

const log = {
  debug(message: string, ...args: unknown[]) {
    if (DEBUG_ENABLED) {
      console.debug(LOG_PREFIX, message, ...args)
    }
  },
  info(message: string, ...args: unknown[]) {
    console.log(LOG_PREFIX, message, ...args)
  },
  warn(message: string, ...args: unknown[]) {
    console.warn(LOG_PREFIX, message, ...args)
  },
  error(message: string, ...args: unknown[]) {
    console.error(LOG_PREFIX, message, ...args)
  },
}

const sanitizeDisplayName = (raw: string | null | undefined): string => {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) {
    return 'Player'
  }
  const normalized = trimmed.replace(/\s+/g, ' ')
  return normalized.length > MAX_NAME_LENGTH
    ? normalized.slice(0, MAX_NAME_LENGTH).trimEnd()
    : normalized
}

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
  score: number
  name: string | null
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
    score: 0,
    name: null,
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
    finalRoundMultiplier: 3,
    currentRound: 0,
  }
  private hostId: string | null = null
  private roundEndTime: number | null = null
  private countdownEndTime: number | null = null
  private roundTicker: NodeJS.Timeout | null = null
  private roundTransition: NodeJS.Timeout | null = null
  private countdownTicker: NodeJS.Timeout | null = null
  private availableShapes: GeneratedShapeDefinition[] = Array.from(GENERATED_SHAPES)
  private roundShapeSequence: GeneratedShapeDefinition[] = Array.from(GENERATED_SHAPES)
  private shapeGenerationRequestId = 0
  private shapesReady = GENERATED_SHAPES.length > 0
  private pendingStartAfterShapes = false

  addClient(socket: WebSocket) {
    const id = nanoid()
    const client: ClientRecord = { id, socket, device: 'desktop', role: 'viewer' }
    this.clients.set(id, client)

    log.info('client connected', { clientId: id, totalClients: this.clients.size })

    socket.on('message', (buffer) => {
      this.handleMessage(client, buffer)
    })

    socket.on('close', () => {
      this.removeClient(id)
    })

    socket.on('error', () => {
      log.warn('socket error received, removing client', { clientId: id })
      this.removeClient(id)
    })

    this.sendStateToClient(client)
  }

  private removeClient(clientId: string) {
    const client = this.clients.get(clientId)
    if (!client) {
      return
    }

    log.info('client disconnected', { clientId, role: client.role })

    if (client.role === 'player' && typeof client.slot === 'number') {
      this.releaseSlot(client.slot)
    }

    if (clientId === this.hostId) {
      this.resetLobbyState()
    }

    this.clients.delete(clientId)
    log.debug('active client count updated', { totalClients: this.clients.size })
    this.rebalanceRound()
    this.broadcastState()
  }

  private resetLobbyState() {
    log.info('resetting lobby state due to host disconnect')
    this.clearRoundTimers()
    this.hostId = null
    this.lobby = {
      status: 'idle',
      code: null,
      timerSeconds: 60,
      totalRounds: 3,
      finalRoundMultiplier: 3,
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
    this.availableShapes = Array.from(GENERATED_SHAPES)
    this.roundShapeSequence = Array.from(GENERATED_SHAPES)
    this.shapesReady = GENERATED_SHAPES.length > 0
    this.pendingStartAfterShapes = false
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
    log.debug('round timers cleared')
  }

  private resetPlayers() {
    log.debug('resetting player slots')
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
      slot.score = 0
    slot.name = null
      slot.calibration = null
      slot.targetOrientation = null
      slot.rawOrientation = null
      slot.orientation = [...IDENTITY_QUATERNION]
      slot.angle = Math.PI
      slot.progress = 0
    })
  }

  private prepareShapes(totalRounds: number) {
    const required = Math.max(totalRounds - 1, 0)
    const fallbackPool = Array.from(GENERATED_SHAPES)
    const selectionCount = required > 0 ? required : Math.min(3, fallbackPool.length)
    const baseline = selectionCount > 0 ? ensureShapeCount(fallbackPool, selectionCount, fallbackPool) : []

    this.availableShapes = baseline
    this.roundShapeSequence = baseline.slice(0, required)

    const requestId = ++this.shapeGenerationRequestId

    log.info('preparing shapes for lobby', {
      totalRounds,
      required,
      baselineCount: baseline.length,
      requestId,
    })

    if (required === 0) {
      log.debug('no shape generation required for final round only flow')
      this.shapesReady = true
      this.maybeStartPendingRound()
      return
    }

    this.shapesReady = false

    log.info('requesting generated shapes from OpenAI', { count: required, requestId })
    void generateShapeBatch(required)
      .then((shapes: GeneratedShapeDefinition[]) => {
        if (requestId !== this.shapeGenerationRequestId) {
          log.debug('discarding stale shape generation response', { requestId })
          return
        }
        if (!shapes.length) {
          log.warn('shape generation returned empty payload', { requestId })
          return
        }
        const generated = ensureShapeCount(shapes, required, fallbackPool)
        this.availableShapes = generated
        this.roundShapeSequence = generated.slice(0, required)
        this.shapesReady = true
        log.info('shape generation completed', {
          requestId,
          received: shapes.length,
          availableShapes: this.availableShapes.length,
        })
        this.broadcastState()
        this.maybeStartPendingRound()
      })
      .catch((error: unknown) => {
        log.error('shape generation failed', error)
      })
  }

  private maybeStartPendingRound() {
    if (!this.pendingStartAfterShapes) {
      return
    }
    if (!this.shapesReady) {
      return
    }

    this.pendingStartAfterShapes = false
    if (this.lobby.status === 'open') {
      this.lobby.status = 'in-progress'
    }

    const activePlayers = this.players.filter((slot) => slot.clientId !== null)
    if (activePlayers.length === 0) {
      log.warn('deferred round start cancelled because all players disconnected', {
        round: this.lobby.currentRound + 1,
      })
      this.lobby.status = 'open'
      this.broadcastState()
      return
    }

    log.info('resuming deferred round start after shapes ready', {
      round: this.lobby.currentRound + 1,
      totalRounds: this.lobby.totalRounds,
      players: activePlayers.length,
    })

    this.startNextRound()
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
        log.debug('registering client device', { clientId: client.id, device: message.device })
        client.device = message.device
        break
      case 'create-lobby':
        log.info('host requested lobby creation', {
          clientId: client.id,
          timerSeconds: message.timerSeconds,
          totalRounds: message.totalRounds,
          finalMultiplier: message.finalMultiplier,
        })
        this.handleCreateLobby(client, message.timerSeconds, message.totalRounds, message.finalMultiplier)
        break
      case 'join-lobby':
        log.info('join lobby request received', {
          clientId: client.id,
          code: message.code,
        })
        this.handleJoinLobby(client, message.code, message.name)
        break
      case 'start-game':
        log.info('start game requested', { clientId: client.id })
        this.handleStartGame(client)
        break
      case 'leave-slot':
        if (client.role === 'player' && typeof client.slot === 'number') {
          log.info('player leaving slot', { clientId: client.id, slot: client.slot })
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
        log.warn('received unknown client message', { clientId: client.id, message })
        break
    }
  }

  private handleCreateLobby(client: ClientRecord, timerSeconds: number, totalRounds: number, finalMultiplier: number) {
    if (client.device !== 'desktop') {
      log.warn('lobby creation rejected for non-desktop client', { clientId: client.id })
      return
    }
    const safeTimer = Number.isFinite(timerSeconds) && timerSeconds > 0 ? Math.round(timerSeconds) : 60
    const safeRounds = Number.isFinite(totalRounds) ? Math.round(totalRounds) : 3
    const safeMultiplier = Number.isFinite(finalMultiplier) ? Math.round(finalMultiplier) : 3
    const clampedRounds = Math.min(10, Math.max(3, safeRounds))
    const clampedTimer = Math.min(300, Math.max(15, safeTimer))
    const clampedMultiplier = Math.min(10, Math.max(1, safeMultiplier))

    if (this.hostId && this.hostId !== client.id && this.lobby.status !== 'idle' && this.lobby.status !== 'complete') {
      log.warn('lobby creation blocked because another host already active', { clientId: client.id })
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
      finalRoundMultiplier: clampedMultiplier,
      currentRound: 0,
    }

    this.pendingStartAfterShapes = false

    log.info('lobby created', {
      hostId: client.id,
      code: this.lobby.code,
      timerSeconds: clampedTimer,
      totalRounds: clampedRounds,
      finalRoundMultiplier: clampedMultiplier,
    })

    this.prepareShapes(clampedRounds)
    this.broadcastState()
  }

  private handleJoinLobby(client: ClientRecord, code: string, name: string) {
    if (client.device !== 'mobile') {
      log.warn('join lobby rejected for non-mobile client', { clientId: client.id })
      return
    }
    if (this.lobby.status !== 'open' || !this.lobby.code || code.trim() !== this.lobby.code) {
      log.warn('join lobby rejected due to invalid code or lobby status', {
        clientId: client.id,
        providedCode: code,
        lobbyStatus: this.lobby.status,
      })
      return
    }
    if (typeof client.slot === 'number') {
      log.warn('client already in a slot attempted to join again', { clientId: client.id, slot: client.slot })
      return
    }

    const assigned = this.assignPlayerSlot(client, name)
    if (assigned) {
      log.info('player joined lobby slot', { clientId: client.id, slot: client.slot })
      this.broadcastState()
    } else {
      log.warn('no available slots for joining player', { clientId: client.id })
    }
  }

  private handleStartGame(client: ClientRecord) {
    if (client.id !== this.hostId) {
      log.warn('start game rejected for non-host', { clientId: client.id })
      return
    }
    if (this.lobby.status !== 'open') {
      log.warn('start game rejected due to lobby status', { clientId: client.id, status: this.lobby.status })
      return
    }
    const activePlayers = this.players.filter((slot) => slot.clientId !== null)
    if (activePlayers.length === 0) {
      log.warn('start game ignored because no players joined', { clientId: client.id })
      return
    }

    if (!this.shapesReady) {
      log.info('deferring game start until shapes finish generating', {
        clientId: client.id,
        activePlayers: activePlayers.length,
      })
      this.pendingStartAfterShapes = true
      this.broadcastState()
      return
    }

    this.lobby.status = 'in-progress'
    log.info('game started', {
      hostId: client.id,
      players: activePlayers.length,
      totalRounds: this.lobby.totalRounds,
    })
    this.startNextRound()
  }

  private assignPlayerSlot(client: ClientRecord, name: string): boolean {
    const available = this.players.find((slot) => slot.clientId === null)
    if (!available) {
      log.warn('no available slots for assignment', { clientId: client.id })
      return false
    }

    available.clientId = client.id
    available.ready = false
    available.playing = false
    available.finished = false
    available.score = 0
    available.name = sanitizeDisplayName(name)
    available.calibration = null
    available.targetOrientation = null
    available.rawOrientation = null
    available.orientation = [...IDENTITY_QUATERNION]
    available.angle = Math.PI
    available.progress = 0

    client.role = 'player'
    client.slot = available.slot
    log.info('assigned player slot', {
      clientId: client.id,
      slot: available.slot,
      displayName: available.name,
    })
    return true
  }

  private releaseSlot(slotIndex: number) {
    const slot = this.players[slotIndex]
    const clientId = slot.clientId
    slot.clientId = null
    slot.ready = false
    slot.playing = false
    slot.finished = false
  slot.score = 0
    slot.name = null
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
    log.info('released player slot', { slot: slotIndex, clientId })
  }

  private startNextRound() {
    if (!this.shapesReady) {
      log.info('startNextRound deferred until shapes ready', {
        round: this.lobby.currentRound + 1,
        totalRounds: this.lobby.totalRounds,
      })
      this.pendingStartAfterShapes = true
      return
    }

    if (this.lobby.currentRound >= this.lobby.totalRounds) {
      this.finishLobby()
      return
    }

    this.lobby.currentRound += 1

  const isFinalRound = this.lobby.currentRound === this.lobby.totalRounds
  const scheduleIndex = this.lobby.currentRound - 1
  const scheduledShape = !isFinalRound ? this.roundShapeSequence[scheduleIndex] : null
  const fallbackShapeId = this.availableShapes[0]?.id ?? (GENERATED_SHAPES[0]?.id ?? FINAL_SHAPE_ID)
  const shapeId = isFinalRound ? FINAL_SHAPE_ID : (scheduledShape?.id ?? fallbackShapeId)
  const target = randomDeviceOrientationQuaternion()

    log.info('starting next round', {
      round: this.lobby.currentRound,
      totalRounds: this.lobby.totalRounds,
      isFinalRound,
      shapeId,
      availableShapes: this.availableShapes.length,
    })

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
      log.warn('round aborted before countdown due to no connected players')
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
    log.debug('countdown timer started', { countdownEndsAt: this.countdownEndTime })
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
        log.info('countdown complete, activating round', { round: this.lobby.currentRound })
        this.activateRound()
      } else {
        this.broadcastState()
      }
    }, 100)
  }

  private activateRound() {
    if (this.round.status !== 'countdown') {
      log.warn('activateRound invoked while not in countdown state', { status: this.round.status })
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
      log.warn('round activation aborted because no players connected')
      this.broadcastState()
      return
    }

    this.round.status = 'active'
    this.round.winnerSlot = null
    this.roundEndTime = Date.now() + this.lobby.timerSeconds * 1000

    log.info('round activated', {
      round: this.lobby.currentRound,
      timerSeconds: this.lobby.timerSeconds,
      playerCount: connectedPlayers.length,
    })

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
    log.debug('round ticker started', { roundEndsAt: this.roundEndTime })
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
        log.info('round timer elapsed', { round: this.lobby.currentRound })
        this.completeRound('timeout')
      } else {
        this.broadcastState()
      }
    }, 500)
  }

  private completeRound(_reason: 'matched' | 'timeout' | 'aborted', winnerSlot?: number) {
    if (this.round.status !== 'active') {
      log.warn('completeRound invoked while not active', { status: this.round.status })
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

    if (_reason === 'matched' && typeof winnerSlot === 'number') {
      const winner = this.players[winnerSlot]
      if (winner) {
        const isFinalRound = this.round.shapeId === FINAL_SHAPE_ID
        const points = isFinalRound ? this.lobby.finalRoundMultiplier : 1
        winner.score += points
        log.info('awarded round points', {
          slot: winnerSlot,
          points,
          totalScore: winner.score,
          isFinalRound,
        })
      }
    }

    log.info('round complete', {
      reason: _reason,
      winnerSlot: typeof winnerSlot === 'number' ? winnerSlot : null,
      round: this.lobby.currentRound,
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
      log.warn('round complete with no players remaining, returning lobby to open state')
      this.broadcastState()
      return
    }

    this.roundTransition = setTimeout(() => {
      this.roundTransition = null
      log.info('advancing to next round after transition delay', { round: this.lobby.currentRound + 1 })
      this.startNextRound()
    }, ROUND_TRANSITION_DELAY_MS)
  }

  private finishLobby() {
    this.clearRoundTimers()
    this.lobby.status = 'complete'
    this.pendingStartAfterShapes = false
    log.info('lobby complete', {
      totalRounds: this.lobby.totalRounds,
      connectedPlayers: this.players.filter((slot) => slot.clientId !== null).length,
    })
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
    log.debug('rebalancing round players', { connectedPlayers: connectedPlayers.length, roundStatus: this.round.status })

    if (this.round.status === 'active' && connectedPlayers.length === 0) {
      log.warn('active round aborted due to zero connected players')
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
      log.warn('countdown cancelled because all players disconnected')
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
      log.debug('calibration established for player', { slot: slotIndex })
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
        log.info('player matched target shape', { slot: slotIndex, angle })
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

    const readyCount = this.players.filter((slot) => slot.ready).length
    const connectedCount = this.players.filter((slot) => slot.clientId !== null).length

    return {
      lobby: {
        status: this.lobby.status,
        code: this.lobby.code,
        timerSeconds: this.lobby.timerSeconds,
        totalRounds: this.lobby.totalRounds,
        finalRoundMultiplier: this.lobby.finalRoundMultiplier,
        shapesReady: this.shapesReady,
      },
      shapes: this.availableShapes.map((shape) => ({
        id: shape.id,
        label: shape.label,
        description: shape.description,
        primitives: shape.primitives.map((primitive) => ({
          kind: primitive.kind,
          position: primitive.position ? [...primitive.position] as [number, number, number] : undefined,
          rotation: primitive.rotation ? [...primitive.rotation] as [number, number, number] : undefined,
          scale: Array.isArray(primitive.scale)
            ? [...primitive.scale] as [number, number, number]
            : primitive.scale,
          args: primitive.args ? [...primitive.args] : undefined,
        })),
      })),
      players: this.players.map<PlayerSnapshot>((slot) => ({
        slot: slot.slot,
        connected: slot.clientId !== null,
        ready: slot.ready,
        playing: slot.playing,
        finished: slot.finished,
  score: slot.score,
        name: slot.name,
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
      readyCount,
      connectedPlayerCount: connectedCount,
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
    /*
    log.debug('sent session state snapshot', {
      clientId: client.id,
      roundStatus: snapshot.round.status,
      connectedPlayerCount: snapshot.connectedPlayerCount,
    })*/
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
    log.warn('WS_SSL_KEY or WS_SSL_CERT path not found. Falling back to ws://', {
      keyPath,
      certPath,
    })
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
      log.error('websocket error', error)
    })

    httpsServer.listen(PORT, () => {
      log.info(`secure websocket server listening on port ${PORT}`)
    })

    httpsServer.on('error', (error: unknown) => {
      log.error('https server error', error)
    })
  } else {
    const httpServer = http.createServer()
    const wss = new WebSocketServer({ server: httpServer })

    wss.on('connection', (socket) => {
      session.addClient(socket)
    })

    wss.on('error', (error: unknown) => {
      log.error('websocket error', error)
    })

    httpServer.listen(PORT, () => {
      log.info(`websocket server listening on ws://localhost:${PORT}`)
    })

    httpServer.on('error', (error: unknown) => {
      log.error('http server error', error)
    })
  }
}

startServer().catch((error) => {
  log.error('failed to start websocket server', error)
  process.exit(1)
})