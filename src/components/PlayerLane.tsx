import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Center } from '@react-three/drei'
import { Euler, MathUtils, Quaternion, ShaderMaterial, Vector3, Mesh } from 'three'
import type { Material } from 'three'
import type { Group } from 'three'
import type { PlayerSnapshot, RoundStatus } from '../shared/messages'
import type { QuaternionTuple } from '../utils/quaternion'
import { IDENTITY_QUATERNION, toQuaternion } from '../utils/quaternion'
import type { ShapeId } from '../shared/shapes'
import { FINAL_SHAPE_ID } from '../shared/shapes'
import { getPlayerColor } from '../shared/playerColors'
import { getShapeDefinition } from '../shapes/catalog'
import {
  createSilhouetteFillMaterial,
  createSilhouetteOutlineMaterial
} from '../shaders/silhouetteMaterial'

const CAMERA_DISTANCE = 10
const CAMERA_FRONT_POSITION: [number, number, number] = [0, 0, CAMERA_DISTANCE]
const CAMERA_FINAL_POSITION: [number, number, number] = [
  -CAMERA_DISTANCE * Math.SQRT1_2,
  0,
  CAMERA_DISTANCE * Math.SQRT1_2,
]
const ORTHO_ZOOM = 100
const CAMERA_LOOK_AT: [number, number, number] = [0, 0, 0]
const WALL_POSITION: [number, number, number] = [0, 0, -2]
const WALL_TARGET = new Vector3(...WALL_POSITION)
const BASE_ROTATION = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2)
const GHOST_OFFSET_Z = -0.45
const MAX_ZOOM = 145

type LaneSceneProps = {
  orientation: QuaternionTuple
  targetOrientation: QuaternionTuple | null
  shapeId: ShapeId | null
  rotationLocked: boolean
  zoomIntensity: number
  snapStrength: number
}

function LaneScene({ orientation, targetOrientation, shapeId, rotationLocked, zoomIntensity, snapStrength }: LaneSceneProps) {
  const playerRef = useRef<Group | null>(null)
  const ghostRef = useRef<Group | null>(null)
  const orientationQuat = useMemo(() => toQuaternion(orientation), [orientation])
  const targetQuat = useMemo(
    () => (targetOrientation ? toQuaternion(targetOrientation) : null),
    [targetOrientation],
  )
  const isFinalShape = shapeId === FINAL_SHAPE_ID
  const camera = useThree((state) => state.camera)
  const wallViewport = useThree((state) =>
    state.viewport.getCurrentViewport(state.camera, WALL_TARGET),
  )
  const wallScale = useMemo<[number, number]>(
    () => [wallViewport.width * 1.05, wallViewport.height * 1.05],
    [wallViewport.width, wallViewport.height],
  )

  useEffect(() => {
    const position = isFinalShape ? CAMERA_FINAL_POSITION : CAMERA_FRONT_POSITION
    camera.position.set(...position)
    camera.lookAt(...CAMERA_LOOK_AT)
    if ('isOrthographicCamera' in camera && camera.isOrthographicCamera) {
      camera.zoom = ORTHO_ZOOM
      camera.near = 0.1
      camera.far = 100
      camera.updateProjectionMatrix()
    }
  }, [camera, isFinalShape])
  const displayQuaternion = useMemo(() => {
    if (!targetQuat || rotationLocked || snapStrength <= 0) {
      return orientationQuat
    }
    const blend = Math.min(1, snapStrength * 1.15)
    return orientationQuat.clone().slerp(targetQuat.clone(), blend).normalize()
  }, [orientationQuat, rotationLocked, snapStrength, targetQuat])

  useEffect(() => {
    if (!playerRef.current) {
      return
    }
    const baseQuat = rotationLocked ? orientationQuat : displayQuaternion
    const adjusted = baseQuat.clone().multiply(BASE_ROTATION)
    playerRef.current.quaternion.copy(adjusted)
  }, [displayQuaternion, orientationQuat, rotationLocked])

  useEffect(() => {
    if (ghostRef.current && targetQuat) {
      const adjusted = targetQuat.clone().multiply(BASE_ROTATION)
      ghostRef.current.quaternion.copy(adjusted)
    }
  }, [targetQuat])

  const zoomIntensityRef = useRef(0)
  useEffect(() => {
    zoomIntensityRef.current = zoomIntensity
  }, [zoomIntensity])

  useFrame((_, delta) => {
    if (!('isOrthographicCamera' in camera) || !camera.isOrthographicCamera) {
      return
    }
    const effectiveIntensity = rotationLocked ? 0 : zoomIntensityRef.current
    const targetZoom = ORTHO_ZOOM + effectiveIntensity * (MAX_ZOOM - ORTHO_ZOOM)
    const nextZoom = MathUtils.damp(camera.zoom, targetZoom, 6, delta)
    if (Math.abs(nextZoom - camera.zoom) > 0.001) {
      camera.zoom = nextZoom
      camera.updateProjectionMatrix()
    }
  })

  useEffect(() => {
    const root = playerRef.current
    if (!root) {
      return
    }

    root.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) {
        return
      }

      mesh.receiveShadow = false
      mesh.castShadow = isFinalShape
    })
  }, [isFinalShape, shapeId])

  const ghostOutlineClones = useRef<Mesh[]>([])
  const ghostFillMaterials = useRef<Material[]>([])
  const ghostOutlineMaterials = useRef<ShaderMaterial[]>([])

  useEffect(() => {
    // cleanup previous
    ghostOutlineClones.current.forEach((mesh) => {
      mesh.parent?.remove(mesh)
      mesh.geometry.dispose()
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose())
      } else {
        mesh.material?.dispose()
      }
    })
    ghostOutlineClones.current = []
    ghostFillMaterials.current.forEach((mat) => mat.dispose())
    ghostOutlineMaterials.current.forEach((mat) => mat.dispose())
    ghostFillMaterials.current = []
    ghostOutlineMaterials.current = []

    const ghostGroup = ghostRef.current
    if (!ghostGroup) {
      return
    }

    if (!isFinalShape) {
      ghostGroup.scale.setScalar(1.035)
      ghostGroup.position.set(0, 0, GHOST_OFFSET_Z)
    } else {
      ghostGroup.scale.setScalar(1)
      ghostGroup.position.set(0, 0, 0)
    }

    ghostGroup.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) {
        return
      }

      if (isFinalShape) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        return
      }

      // 1) FILL — flat silhouette color
      const fillMat = createSilhouetteFillMaterial()
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose())
      } else {
        mesh.material?.dispose()
      }
      mesh.material = fillMat
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.renderOrder = -2
      ghostFillMaterials.current.push(fillMat)

      // 2) OUTLINE — inflated backfaces
      const outlineMesh = mesh.clone()
      outlineMesh.geometry = mesh.geometry.clone()
      const outlineMat = createSilhouetteOutlineMaterial()
      outlineMesh.material = outlineMat
      outlineMesh.castShadow = false
      outlineMesh.receiveShadow = false
      outlineMesh.renderOrder = -3
      mesh.parent?.add(outlineMesh)

      ghostOutlineClones.current.push(outlineMesh)
      ghostOutlineMaterials.current.push(outlineMat)
    })

    return () => {
      ghostOutlineClones.current.forEach((mesh) => {
        mesh.parent?.remove(mesh)
        mesh.geometry.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat.dispose())
        } else {
          mesh.material?.dispose()
        }
      })
      ghostOutlineClones.current = []
      ghostFillMaterials.current.forEach((mat) => mat.dispose())
      ghostOutlineMaterials.current.forEach((mat) => mat.dispose())
      ghostFillMaterials.current = []
      ghostOutlineMaterials.current = []
    }
  }, [isFinalShape, shapeId, targetQuat])


  const { Component } = getShapeDefinition(shapeId)

  return (
    <>
      <color attach="background" args={['#ffffff']} />
      <ambientLight intensity={0.72} color="#ffffff" />
      <directionalLight
        position={[0, 0, 9.4]}
        intensity={isFinalShape ? 1.6 : 1.1}
        castShadow={isFinalShape}
        shadow-mapSize={[1536, 1536]}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0002}
      />
      <spotLight position={[0, 0, 9.8]} angle={0.42} intensity={isFinalShape ? 0.5 : 0.25} penumbra={0.6} castShadow={false} color="#f3f6ff" />
      <group ref={ghostRef} position={[0, 0, 0]} visible={!isFinalShape && Boolean(targetQuat)}>
        {targetQuat ? (
          <Center>
            <Component variant={isFinalShape ? 'shadow' : 'default'} />
          </Center>
        ) : null}
      </group>
      <group ref={playerRef} position={[0, 0, 0]}>
        <Center>
          <Component variant={isFinalShape ? 'finale' : 'player'} />
        </Center>
      </group>
      <mesh
        position={WALL_POSITION}
        rotation={[0, 0, 0]}
        scale={[wallScale[0], wallScale[1], 1]}
        receiveShadow={isFinalShape}
        castShadow={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={isFinalShape ? '#f0f3fb' : '#ffffff'} roughness={1} metalness={0} />
      </mesh>
    </>
  )
}

type PlayerLaneProps = {
  player: PlayerSnapshot
  roundStatus: RoundStatus
  shapeId: ShapeId | null
  isSelf: boolean
  winnerSlot: number | null
}

export function PlayerLane({
  player,
  roundStatus,
  shapeId,
  isSelf,
  winnerSlot,
}: PlayerLaneProps) {
  const playerColor = getPlayerColor(player.slot)
  const laneInitial = useMemo(() => {
    if (!player.connected) {
      return '—'
    }
    const name = player.name?.trim()
    if (name && name.length > 0) {
      return name[0]?.toUpperCase() ?? 'P'
    }
    return 'P'
  }, [player.connected, player.name])
  const percentage = Math.round(Math.min(Math.max(player.progress, 0), 1) * 100)
  const isWinner = winnerSlot != null && winnerSlot === player.slot
  const laneMuted = winnerSlot != null && winnerSlot !== player.slot
  const finishedDuringRound = player.finished && (roundStatus === 'active' || roundStatus === 'complete')
  const rotationLocked = roundStatus === 'countdown' || finishedDuringRound || isWinner
  const orientationForDisplay: QuaternionTuple = roundStatus === 'countdown'
    ? [...IDENTITY_QUATERNION] as QuaternionTuple
    : player.orientation
  const zoomIntensity = roundStatus === 'countdown'
    ? 0
    : Math.max(0, Math.min(1, (player.progress - 0.8) / 0.2))
  const snapStrength = roundStatus === 'countdown'
    ? 0
    : Math.max(0, Math.min(1, (player.progress - 0.97) / 0.03))
  const laneTargetOrientation = player.targetOrientation
  const lastLoggedQuaternion = useRef<QuaternionTuple | null>(null)

  useEffect(() => {
    if (shapeId !== FINAL_SHAPE_ID) {
      lastLoggedQuaternion.current = null
      return
    }
    if (!player.connected) {
      return
    }
    const current = player.orientation
    const previous = lastLoggedQuaternion.current
    const threshold = 0.0005
    const hasChanged =
      !previous || current.some((value, index) => Math.abs(value - previous[index]) > threshold)
    if (!hasChanged) {
      return
    }
    lastLoggedQuaternion.current = [...current] as QuaternionTuple

    const quaternion = toQuaternion(current)
    const euler = new Euler().setFromQuaternion(quaternion.clone(), 'XYZ')
    const degreesFactor = 180 / Math.PI
    
    console.log('[Finale orientation]', {
      slot: player.slot,
      quaternion: current.map((value) => Number(value.toFixed(6))),
      eulerDegrees: {
        x: Number((euler.x * degreesFactor).toFixed(2)),
        y: Number((euler.y * degreesFactor).toFixed(2)),
        z: Number((euler.z * degreesFactor).toFixed(2)),
      },
    })
  }, [player.connected, player.orientation, player.slot, shapeId])

  return (
    <div
      className={`lane ${player.connected ? 'lane-connected' : 'lane-open'} ${isSelf ? 'lane-self' : ''} ${isWinner ? 'lane-winner' : ''} ${laneMuted ? 'lane-muted' : ''}`}
      style={{ borderColor: playerColor.background }}
    >
      <div
        className="lane-canvas"
        aria-hidden
        style={{ borderColor: playerColor.background, backgroundColor: `${playerColor.background}1a` }}
      >
        <div
          className="player-bubble lane-player-bubble lane-player-bubble-overlay"
          style={{ backgroundColor: playerColor.background, color: playerColor.text }}
        >
          {laneInitial}
        </div>
        <div
          className="lane-score-badge"
          style={{ borderColor: playerColor.background, color: playerColor.text, backgroundColor: `${playerColor.background}cc` }}
        >
          <span className="lane-score-badge-label">Score</span>
          <span className="lane-score-badge-value">{player.score}</span>
        </div>
        <Canvas
          shadows
          orthographic
          dpr={[1, 1.5]}
          camera={{
            position: shapeId === FINAL_SHAPE_ID ? CAMERA_FINAL_POSITION : CAMERA_FRONT_POSITION,
            zoom: ORTHO_ZOOM,
            near: 0.1,
            far: 100,
          }}
        >
          <LaneScene
            orientation={orientationForDisplay}
            targetOrientation={laneTargetOrientation}
            shapeId={shapeId}
            rotationLocked={rotationLocked}
            zoomIntensity={zoomIntensity}
            snapStrength={snapStrength}
          />
        </Canvas>
        {laneMuted ? <div className="lane-muted-overlay" /> : null}
        {isWinner ? <div className="lane-winner-glow" /> : null}

        <div className="lane-footer-container">
          <div className="lane-footer" style={{ borderColor: playerColor.background, color: playerColor.text, backgroundColor: `${playerColor.background}cc` }}>
            <div className="lane-progress">
              <div className="lane-progress-fill" style={{ width: `${percentage}%` }} />
            </div>
            <span className="lane-progress-label">{player.connected ? `${percentage}%` : '0%'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
