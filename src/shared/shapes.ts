import { GENERATED_SHAPES, type GeneratedShapeDefinition } from '../generated/shapes'

const FINAL_SHAPE_LABEL = 'Eclipse Relic'

export const FINAL_SHAPE_ID = 'finale' as const

export type FinalShapeId = typeof FINAL_SHAPE_ID
export type GeneratedShapeId = GeneratedShapeDefinition['id']
export type ShapeId = GeneratedShapeId | FinalShapeId

export type ShapeInfo = {
  id: ShapeId
  label: string
}

const GENERATED_SHAPE_INFO: ShapeInfo[] = GENERATED_SHAPES.map((shape) => ({
  id: shape.id,
  label: shape.label,
}))

const SPECIAL_SHAPES: ShapeInfo[] = [{ id: FINAL_SHAPE_ID, label: FINAL_SHAPE_LABEL }]

export const SHAPES: ShapeInfo[] = [...GENERATED_SHAPE_INFO, ...SPECIAL_SHAPES]

export const SHAPE_LABELS: Record<ShapeId, string> = SHAPES.reduce(
  (acc, shape) => ({ ...acc, [shape.id]: shape.label }),
  {} as Record<ShapeId, string>,
)

export const DEFAULT_SHAPE_ID: ShapeId = GENERATED_SHAPES[0]?.id ?? FINAL_SHAPE_ID

export function isGeneratedShapeId(id: ShapeId): id is GeneratedShapeId {
  return GENERATED_SHAPES.some((shape) => shape.id === id)
}

export function randomShapeId(): ShapeId {
  if (GENERATED_SHAPES.length === 0) {
    return DEFAULT_SHAPE_ID
  }
  const index = Math.floor(Math.random() * GENERATED_SHAPES.length)
  return GENERATED_SHAPES[index].id
}
