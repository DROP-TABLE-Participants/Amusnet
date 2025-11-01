import { memo, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Group } from 'three'
import type { ShapeId } from '../shared/shapes'
import { getShapeDefinition } from '../shapes/catalog'

export type SlotTickerProps = {
  previousId?: ShapeId | null
  currentId?: ShapeId | null
  nextId?: ShapeId | null
  locked: boolean
  compact?: boolean
  spinning: boolean
}

export const SlotTicker = memo(({ previousId, currentId, nextId, locked, compact = false, spinning }: SlotTickerProps) => {
  const previousLabel = useMemo(() => (previousId ? getShapeDefinition(previousId).label : ''), [previousId])
  const currentLabel = useMemo(() => (currentId ? getShapeDefinition(currentId).label : 'Spinning'), [currentId])
  const nextLabel = useMemo(() => (nextId ? getShapeDefinition(nextId).label : ''), [nextId])

  return (
    <div className={`slot-ticker ${locked ? 'slot-ticker-locked' : ''} ${compact ? 'slot-ticker-compact' : ''}`}>
      <div className="slot-ticker-row slot-ticker-row-previous">{previousLabel}</div>
      <div className="slot-ticker-row slot-ticker-row-current">
        <SlotShapePreview shapeId={currentId ?? null} active={!locked} spinning={spinning} />
        <div className="slot-ticker-current-meta">
          <span className="slot-ticker-label">{currentLabel}</span>
          {!locked ? <span className="slot-ticker-indicator" aria-hidden /> : null}
        </div>
      </div>
      <div className="slot-ticker-row slot-ticker-row-next">{nextLabel}</div>
    </div>
  )
})

SlotTicker.displayName = 'SlotTicker'

type SlotShapePreviewProps = {
  shapeId: ShapeId | null
  active: boolean
  spinning: boolean
}

const SlotShapePreview = memo(({ shapeId, active, spinning }: SlotShapePreviewProps) => {
  const definition = useMemo(() => getShapeDefinition(shapeId), [shapeId])

  return (
    <div className={`slot-preview ${active ? 'slot-preview-active' : ''}`}>
      <Canvas
        className="slot-preview-canvas"
        camera={{ position: [0, 0, 5.3], fov: 40 }}
        shadows={false}
        dpr={[1, 1.5]}
      >
        <SlotPreviewScene />
        <RotatingShape component={definition.Component} spinning={spinning} />
      </Canvas>
    </div>
  )
})
SlotShapePreview.displayName = 'SlotShapePreview'

const SlotPreviewScene = () => {
  return (
    <>
      <color attach="background" args={['#050915']} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[2.5, 3.2, 8]} intensity={1.1} />
      <directionalLight position={[-2.5, -3.2, 6]} intensity={0.6} />
    </>
  )
}

type RotatingShapeProps = {
  component: ReturnType<typeof getShapeDefinition>['Component']
  spinning: boolean
}

const RotatingShape = ({ component: ShapeComponent, spinning }: RotatingShapeProps) => {
  const groupRef = useRef<Group>(null)

  useFrame((state, delta) => {
    if (!groupRef.current) {
      return
    }
    const baseSpeed = spinning ? 6.5 : 1.2
    groupRef.current.rotation.y += delta * baseSpeed
    groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 1.4) * 0.22
  })

  return (
    <group ref={groupRef} scale={0.9}>
      <ShapeComponent variant="default" />
    </group>
  )
}
