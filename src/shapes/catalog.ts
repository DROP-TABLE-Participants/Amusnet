import { AirplaneShape, CatShape, StarShape } from './definitions'
import type { ShapeDefinition } from './definitions'
import type { ShapeId } from '../shared/shapes'
import { SHAPE_LABELS } from '../shared/shapes'

const registry: Record<ShapeId, ShapeDefinition> = {
  cat: { id: 'cat', label: SHAPE_LABELS.cat, Component: CatShape },
  star: { id: 'star', label: SHAPE_LABELS.star, Component: StarShape },
  airplane: { id: 'airplane', label: SHAPE_LABELS.airplane, Component: AirplaneShape },
}

export function getShapeDefinition(id: ShapeId): ShapeDefinition {
  return registry[id]
}

export function listShapeDefinitions(): ShapeDefinition[] {
  return Object.values(registry)
}
