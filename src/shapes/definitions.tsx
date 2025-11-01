import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Box3, Color, ExtrudeGeometry, Mesh, MeshStandardMaterial, Shape, Vector3 } from 'three'
import type { ShapeId } from '../shared/shapes'

export type ShapeVariant = 'default' | 'silhouette' | 'ghost' | 'shadow'

export type ShapeComponentProps = {
  variant?: ShapeVariant
}

export type ShapeDefinition = {
  id: ShapeId
  label: string
  Component: (props: ShapeComponentProps) => ReactNode
}

const materialPalette = {
  default: new Color('#6ec1ff'),
  silhouette: new Color('#060606'),
  ghost: new Color('#3dd9ff'),
  shadow: new Color('#000000'),
}

function getVariantMaterial(variant: ShapeVariant | undefined) {
  const key = variant ?? 'default'
  const color = materialPalette[key]
  const transparent = key === 'ghost' || key === 'default' || key === 'shadow'
  const opacity = key === 'ghost' ? 0.25 : key === 'default' ? 0.1 : key === 'shadow' ? 0 : 1
  const roughness = key === 'silhouette' || key === 'shadow' ? 1 : 0.35
  const metalness = key === 'silhouette' || key === 'shadow' ? 0 : 0.2
  const depthWrite = key === 'default' ? false : key !== 'shadow'
  const colorWrite = key !== 'shadow'

  return { color, transparent, opacity, roughness, metalness, depthWrite, colorWrite }
}

export const CatShape = memo(({ variant }: ShapeComponentProps) => {
  const materialProps = getVariantMaterial(variant)

  return (
    <group>
      <mesh castShadow position={[0, 0.45, 0]}>
        <sphereGeometry args={[0.75, 48, 48]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <mesh castShadow position={[0.75, 1.1, 0]}>
        <sphereGeometry args={[0.45, 48, 48]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <mesh castShadow position={[0.3, 1.45, 0.28]} rotation={[0, 0, Math.PI / 6]}>
        <coneGeometry args={[0.18, 0.32, 16]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <mesh castShadow position={[0.3, 1.45, -0.28]} rotation={[0, 0, -Math.PI / 6]}>
        <coneGeometry args={[0.18, 0.32, 16]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <mesh
        castShadow
        position={[-0.85, 0.55, -0.1]}
        rotation={[Math.PI / 6, 0, Math.PI / 3]}
      >
        <cylinderGeometry args={[0.08, 0.08, 1.1, 12]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <mesh castShadow position={[1.18, 0.9, 0.28]}>
        <sphereGeometry args={[0.12, 24, 24]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <mesh castShadow position={[1.18, 0.9, -0.28]}>
        <sphereGeometry args={[0.12, 24, 24]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
    </group>
  )
})
CatShape.displayName = 'CatShape'

export const StarShape = memo(({ variant }: ShapeComponentProps) => {
  const materialProps = getVariantMaterial(variant)

  const geometry = useMemo(() => {
    const spikes = 5
    const outerRadius = 1.1
    const innerRadius = 0.48

    const shape = new Shape()
    shape.moveTo(0, outerRadius)
    for (let i = 0; i < spikes * 2; i += 1) {
      const angle = (Math.PI * i) / spikes
      const radius = i % 2 === 0 ? outerRadius : innerRadius
      shape.lineTo(Math.sin(angle) * radius, Math.cos(angle) * radius)
    }
    shape.closePath()

    return new ExtrudeGeometry(shape, {
      depth: 0.5,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.12,
      bevelSegments: 4,
    })
  }, [])

  geometry.center()

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow geometry={geometry}>
        <meshStandardMaterial {...materialProps} />
      </mesh>
    </group>
  )
})
StarShape.displayName = 'StarShape'

export const AirplaneShape = memo(({ variant }: ShapeComponentProps) => {
  const materialProps = getVariantMaterial(variant)

  return (
    <group>
      <mesh castShadow position={[0, 0.2, 0]} scale={[1.3, 0.25, 0.25]}>
        <boxGeometry args={[2, 0.8, 0.6]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <mesh castShadow position={[0, 0.35, -0.05]}>
        <coneGeometry args={[0.38, 0.6, 32]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <mesh castShadow position={[0, 0.45, 0]}
        scale={[1.8, 0.1, 0.8]}
      >
        <boxGeometry args={[1.4, 0.32, 1.8]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <mesh castShadow position={[0, 0.55, -0.55]} scale={[0.5, 0.05, 1.4]}>
        <boxGeometry args={[1, 0.25, 1.2]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <mesh castShadow position={[0, 0.55, 0.55]} scale={[0.5, 0.05, 1.4]} rotation={[0, 0, 0]}>
        <boxGeometry args={[1, 0.25, 1.2]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      <mesh castShadow position={[0, 0.05, -1.0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 0.9, 20]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
    </group>
  )
})
AirplaneShape.displayName = 'AirplaneShape'

export const FinaleShape = memo(({ variant }: ShapeComponentProps) => {
  const { scene } = useGLTF(FINALE_MODEL_URL)

  const prepared = useMemo(() => {
    const clone = scene.clone(true)
    const materialProps = getVariantMaterial(variant)
    const bounds = new Box3()
    const sizeVector = new Vector3()
    const centerVector = new Vector3()

    clone.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        const material = new MeshStandardMaterial({
          color: materialProps.color,
          transparent: materialProps.transparent,
          opacity: materialProps.opacity,
          roughness: materialProps.roughness,
          metalness: materialProps.metalness,
          depthWrite: materialProps.depthWrite,
          colorWrite: materialProps.colorWrite,
        })
        material.side = (mesh.material as MeshStandardMaterial | undefined)?.side ?? material.side
        mesh.material = material
        mesh.castShadow = true
        mesh.receiveShadow = variant !== 'shadow'
      }
    })
    clone.updateMatrixWorld(true)
    bounds.setFromObject(clone)
    bounds.getSize(sizeVector)
    const maxDimension = Math.max(sizeVector.x, sizeVector.y, sizeVector.z)
    const targetSize = 2.4
    if (maxDimension > 0) {
      const scale = targetSize / maxDimension
      clone.scale.setScalar(scale)
      clone.updateMatrixWorld(true)
    }

    bounds.setFromObject(clone)
    bounds.getCenter(centerVector)
    clone.position.sub(centerVector)
    return clone
  }, [scene, variant])

  return <primitive object={prepared} />
})
FinaleShape.displayName = 'FinaleShape'

const FINALE_MODEL_URL = new URL('./five_shape.glb', import.meta.url).href

useGLTF.preload(FINALE_MODEL_URL)
