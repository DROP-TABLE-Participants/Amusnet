import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Center, Environment } from '@react-three/drei'
import { Quaternion, Vector3, type Group } from 'three'
import type { PlayerSnapshot, RoundStatus } from '../shared/messages'
import type { QuaternionTuple } from '../utils/quaternion'
import { toQuaternion } from '../utils/quaternion'
import type { ShapeId } from '../shared/shapes'
import { getShapeDefinition } from '../shapes/catalog'

const cameraFrontPosition: [number, number, number] = [0, 0, 5]
const CAMERA_LOOK_AT: [number, number, number] = [0, 0, 0]
const WALL_POSITION: [number, number, number] = [0, 0, -2]
const WALL_TARGET = new Vector3(...WALL_POSITION)
const BASE_ROTATION = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2)

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
  const camera = useThree((state) => state.camera)
  const wallViewport = useThree((state) =>
    state.viewport.getCurrentViewport(state.camera, WALL_TARGET),
  )
  const wallScale = useMemo<[number, number]>(
    () => [wallViewport.width * 1.05, wallViewport.height * 1.05],
    [wallViewport.width, wallViewport.height],
  )

  useEffect(() => {
    camera.position.set(...cameraFrontPosition)
    camera.lookAt(...CAMERA_LOOK_AT)
  }, [camera])

  useEffect(() => {
    if (playerRef.current) {
      const adjusted = orientationQuat.clone().multiply(BASE_ROTATION)
      playerRef.current.quaternion.copy(adjusted)
    }
  }, [orientationQuat])

  useEffect(() => {
    if (ghostRef.current && targetQuat) {
      const adjusted = targetQuat.clone().multiply(BASE_ROTATION)
      ghostRef.current.quaternion.copy(adjusted)
    }
  }, [targetQuat])

  const { Component } = getShapeDefinition(shapeId ?? 'cat')

  return (
    <>
      <color attach="background" args={['#0a0f24']} />
      <ambientLight intensity={0.26} />
      <directionalLight
        position={[0, 0, 9.4]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[1536, 1536]}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0002}
      />
      <spotLight position={[0, 0, 9.8]} angle={0.4} intensity={0.35} penumbra={0.45} castShadow={false} />
      <group ref={ghostRef} position={[0, 0, 0]} visible={Boolean(targetQuat)}>
        {targetQuat ? (
          <Center>
            <Component variant="shadow" />
          </Center>
        ) : null}
      </group>
      <group ref={playerRef} position={[0, 0, 0]}>
        <Center>
          <Component variant="default" />
        </Center>
      </group>
      <mesh
        position={WALL_POSITION}
        rotation={[0, 0, 0]}
        scale={[wallScale[0], wallScale[1], 1]}
        receiveShadow
        castShadow={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color="#10183a" roughness={1} metalness={0} />
      </mesh>
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
