export type ShapeId = 'cat' | 'star' | 'airplane' | 'finale'

export type ShapeInfo = {
  id: ShapeId
  label: string
}

const FINAL_SHAPE_LABEL = 'Eclipse Relic'

export const FINAL_SHAPE_ID: ShapeId = 'finale'

const BASE_SHAPES: ShapeInfo[] = [
  { id: 'cat', label: 'Cosmo Cat' },
  { id: 'star', label: 'Nova Star' },
  { id: 'airplane', label: 'Sky Racer' },
]

const SPECIAL_SHAPES: ShapeInfo[] = [{ id: FINAL_SHAPE_ID, label: FINAL_SHAPE_LABEL }]

export const SHAPES: ShapeInfo[] = [...BASE_SHAPES, ...SPECIAL_SHAPES]

export const SHAPE_LABELS: Record<ShapeId, string> = SHAPES.reduce(
  (acc, shape) => ({ ...acc, [shape.id]: shape.label }),
  {} as Record<ShapeId, string>,
)

export function randomShapeId(): ShapeId {
  const index = Math.floor(Math.random() * BASE_SHAPES.length)
  return BASE_SHAPES[index].id
}
