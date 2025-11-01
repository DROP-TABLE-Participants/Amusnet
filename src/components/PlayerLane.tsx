import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Center, ContactShadows, Environment } from '@react-three/drei'
import type { Group } from 'three'
import type { PlayerSnapshot, RoundStatus } from '../shared/messages'
import type { QuaternionTuple } from '../utils/quaternion'
import { toQuaternion } from '../utils/quaternion'
import type { ShapeId } from '../shared/shapes'
import { getShapeDefinition } from '../shapes/catalog'

const cameraSidePosition: [number, number, number] = [5.4, 2.2, 0.3]
const SHAPE_PIVOT_HEIGHT = 0.95

type LaneSceneProps = {
  orientation: QuaternionTuple
  targetOrientation: QuaternionTuple | null
  shapeId: ShapeId | null
}

function LaneScene({ orientation, targetOrientation, shapeId }: LaneSceneProps) {
  const playerRef = useRef<Group>(null)
  const ghostRef = useRef<Group>(null)
  const orientationQuat = useMemo(() => toQuaternion(orientation), [orientation])
  const targetQuat = useMemo(
    () => (targetOrientation ? toQuaternion(targetOrientation) : null),
    [targetOrientation],
  )
  const { camera } = useThree()

  useEffect(() => {
    camera.position.set(...cameraSidePosition)
    camera.lookAt(0, 0.85, 0)
  }, [camera])

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.quaternion.copy(orientationQuat)
    }
  }, [orientationQuat])

  useEffect(() => {
    if (ghostRef.current && targetQuat) {
      ghostRef.current.quaternion.copy(targetQuat)
    }
  }, [targetQuat])

  const { Component } = getShapeDefinition(shapeId ?? 'cat')

  return (
    <>
      <color attach="background" args={['#0a0f24']} />
      <ambientLight intensity={0.58} />
      <directionalLight
        position={[6.5, 5.4, 2.2]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1536, 1536]}
      />
      <spotLight
        position={[-5.5, 3.4, -1.2]}
        angle={0.48}
        intensity={1.1}
        penumbra={0.4}
        castShadow
      />
      <group ref={ghostRef} position={[0, SHAPE_PIVOT_HEIGHT, 0]} visible={Boolean(targetQuat)}>
        {targetQuat ? (
          <Center>
            <Component variant="ghost" />
          </Center>
        ) : null}
      </group>
      <group ref={playerRef} position={[0, SHAPE_PIVOT_HEIGHT, 0]}>
        <Center>
          <Component variant="default" />
        </Center>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[9, 6]} />
        <meshStandardMaterial color="#161d3a" roughness={0.8} metalness={0.05} />
      </mesh>
      <ContactShadows
        position={[0, -0.04, 0]}
        opacity={0.68}
        blur={2.1}
        scale={6.6}
        color="#010208"
      />
      <Environment preset="sunset" />
    </>
  )
}

type PlayerLaneProps = {
  player: PlayerSnapshot
  displayIndex: number
  roundStatus: RoundStatus
  shapeId: ShapeId | null
  targetOrientation: QuaternionTuple | null
  isSelf: boolean
  winnerSlot: number | null
  countdownMs: number
}

export function PlayerLane({ player, displayIndex, roundStatus, shapeId, targetOrientation, isSelf, winnerSlot, countdownMs }: PlayerLaneProps) {
  const angleDeg = player.connected ? (player.angle * 180) / Math.PI : 0
  const percentage = Math.round(Math.min(Math.max(player.progress, 0), 1) * 100)
  const countdownSeconds = roundStatus === 'countdown' ? Math.max(0, Math.ceil(countdownMs / 1000)) : null
  const isWinner = roundStatus === 'complete' && winnerSlot === player.slot
  const laneTargetOrientation = player.targetOrientation ?? targetOrientation

  let statusLabel = 'Open'
  if (player.connected) {
    if (roundStatus === 'countdown') {
      statusLabel = 'Ready'
    } else if (roundStatus === 'active') {
      statusLabel = player.finished ? 'Matched' : 'Racing'
    } else if (roundStatus === 'complete') {
      if (isWinner) {
        statusLabel = 'Winner'
      } else {
        statusLabel = player.finished ? 'Matched' : 'Finished'
      }
    } else {
      statusLabel = 'Joined'
    }
  }

  return (
    <div className={`lane ${player.connected ? 'lane-connected' : 'lane-open'} ${isSelf ? 'lane-self' : ''} ${isWinner ? 'lane-winner' : ''}`}>
      <div className="lane-header">
        <span className="lane-slot">Player {displayIndex + 1}</span>
        <span className={`lane-status ${player.connected ? 'lane-status-active' : ''}`}>{statusLabel}</span>
      </div>
      <div className="lane-canvas" aria-hidden>
        <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 0, 0], fov: 46 }}>
          <LaneScene orientation={player.orientation} targetOrientation={laneTargetOrientation} shapeId={shapeId} />
        </Canvas>
        {countdownSeconds !== null ? (
          <div className="lane-countdown">
            <span>{countdownSeconds}</span>
          </div>
        ) : null}
        {isWinner ? <div className="lane-winner-glow" /> : null}
      </div>
      <div className="lane-footer">
        <span className="lane-angle">{player.connected ? `${angleDeg.toFixed(1)}°` : '--°'}</span>
        <div className="lane-progress">
          <div className="lane-progress-fill" style={{ width: `${percentage}%` }} />
        </div>
        <span className="lane-progress-label">{player.connected ? `${percentage}%` : '0%'}</span>
      </div>
    </div>
  )
}
