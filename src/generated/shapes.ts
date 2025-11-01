export type GeneratedPrimitiveKind = 'sphere' | 'box' | 'cone' | 'cylinder' | 'torus'

export type GeneratedPrimitive = {
  kind: GeneratedPrimitiveKind
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
  args?: number[]
}

export type GeneratedShapeDefinition = {
  id: `shape-${string}`
  label: string
  description: string
  primitives: GeneratedPrimitive[]
}

export const GENERATED_SHAPES: GeneratedShapeDefinition[] = []
