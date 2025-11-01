import { memo, useMemo } from 'react'
import type { ComponentType } from 'react'
import '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  Box3,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import type { ShapeId } from '../shared/shapes'
import {
  GENERATED_SHAPES,
  type GeneratedPrimitive,
  type GeneratedShapeDefinition,
} from '../generated/shapes'

export type ShapeVariant = 'default' | 'silhouette' | 'ghost' | 'shadow'

export type ShapeComponentProps = {
  variant?: ShapeVariant
}

export type ShapeDefinition = {
  id: ShapeId
  label: string
  Component: ComponentType<ShapeComponentProps>
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

const GENERATED_SHAPE_DEFINITIONS: ShapeDefinition[] = GENERATED_SHAPES.map((shape) => {
  const Component = memo(({ variant }: ShapeComponentProps) => {
    const object = useMemo(() => buildGeneratedObject(shape, variant), [shape, variant])
    return <primitive object={object} />
  })
  Component.displayName = `${shape.id}-shape`
  return {
    id: shape.id,
    label: shape.label,
    Component,
  }
})

export const generatedShapeDefinitions = GENERATED_SHAPE_DEFINITIONS

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

function buildGeneratedObject(shape: GeneratedShapeDefinition, variant: ShapeVariant | undefined) {
  const materialProps = getVariantMaterial(variant)
  const group = new Group()

  shape.primitives.forEach((primitive, index) => {
  const mesh = createPrimitiveMesh(primitive, materialProps, variant !== 'shadow')
    if (mesh) {
      mesh.name = `${shape.id}-part-${index}`
      group.add(mesh)
    }
  })

  if (group.children.length === 0) {
    const fallback = new Mesh(new SphereGeometry(0.5, 24, 24), new MeshStandardMaterial(materialProps))
    fallback.castShadow = true
    fallback.receiveShadow = variant !== 'shadow'
    group.add(fallback)
  }

  normalizeGroupTransform(group)
  return group
}

function createPrimitiveMesh(
  primitive: GeneratedPrimitive,
  materialProps: ReturnType<typeof getVariantMaterial>,
  receiveShadow: boolean,
): Mesh | null {
  const material = new MeshStandardMaterial(materialProps)
  let geometry:
    | SphereGeometry
    | BoxGeometry
    | ConeGeometry
    | CylinderGeometry
    | TorusGeometry
    | null = null

  switch (primitive.kind) {
    case 'sphere':
      geometry = new SphereGeometry(...(primitive.args ?? [0.6, 32, 32]))
      break
    case 'box':
      geometry = new BoxGeometry(...(primitive.args ?? [1, 1, 1]))
      break
    case 'cone':
      geometry = new ConeGeometry(...(primitive.args ?? [0.6, 1.4, 24]))
      break
    case 'cylinder':
      geometry = new CylinderGeometry(...(primitive.args ?? [0.5, 0.5, 1.6, 24]))
      break
    case 'torus':
      geometry = new TorusGeometry(...(primitive.args ?? [0.8, 0.18, 24, 36]))
      break
    default:
      geometry = null
      break
  }

  if (!geometry) {
    return null
  }

  const mesh = new Mesh(geometry, material)
  applyVector(mesh.position, primitive.position ?? [0, 0, 0])
  applyRotation(mesh, primitive.rotation)
  applyScale(mesh, primitive.scale)
  mesh.castShadow = true
  mesh.receiveShadow = receiveShadow
  return mesh
}

function normalizeGroupTransform(group: Group) {
  const bounds = new Box3().setFromObject(group)
  const size = new Vector3()
  bounds.getSize(size)
  const maxDimension = Math.max(size.x, size.y, size.z)

  const targetSize = 2.2
  if (maxDimension > 0) {
    const scale = targetSize / maxDimension
    group.scale.setScalar(scale)

    const center = new Vector3()
    bounds.getCenter(center)
    group.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
  } else {
    group.position.set(0, 0, 0)
  }
}

function applyVector(target: Vector3, values: [number, number, number]) {
  target.set(values[0], values[1], values[2])
}

function applyRotation(mesh: Mesh, rotation?: [number, number, number]) {
  if (!rotation) {
    mesh.rotation.set(0, 0, 0)
    return
  }
  const radians = rotation.map((value) => (value * Math.PI) / 180)
  mesh.rotation.set(radians[0], radians[1], radians[2])
}

function applyScale(mesh: Mesh, scale?: number | [number, number, number]) {
  if (scale == null) {
    mesh.scale.set(1, 1, 1)
    return
  }
  if (typeof scale === 'number') {
    mesh.scale.setScalar(scale)
    return
  }
  mesh.scale.set(scale[0], scale[1], scale[2])
}
