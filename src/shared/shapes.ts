export type ShapeId = 'cat' | 'star' | 'airplane'

export type ShapeInfo = {
  id: ShapeId
  label: string
}

export const SHAPES: ShapeInfo[] = [
  { id: 'cat', label: 'Cosmo Cat' },
  { id: 'star', label: 'Nova Star' },
  { id: 'airplane', label: 'Sky Racer' },
]

export const SHAPE_LABELS: Record<ShapeId, string> = SHAPES.reduce(
  (acc, shape) => ({ ...acc, [shape.id]: shape.label }),
  {} as Record<ShapeId, string>,
)

export function randomShapeId(): ShapeId {
  const index = Math.floor(Math.random() * SHAPES.length)
  return SHAPES[index].id
}
