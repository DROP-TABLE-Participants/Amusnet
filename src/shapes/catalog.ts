import { FinaleShape, generatedShapeDefinitions } from './definitions'
import type { ShapeDefinition } from './definitions'
import type { ShapeId } from '../shared/shapes'
import { DEFAULT_SHAPE_ID, FINAL_SHAPE_ID, SHAPE_LABELS } from '../shared/shapes'

const registry = new Map<ShapeId, ShapeDefinition>()

generatedShapeDefinitions.forEach((definition) => {
  registry.set(definition.id, {
    id: definition.id,
    label: definition.label,
    Component: definition.Component,
  })
})

registry.set(FINAL_SHAPE_ID, {
  id: FINAL_SHAPE_ID,
  label: SHAPE_LABELS[FINAL_SHAPE_ID],
  Component: FinaleShape,
})

export function getShapeDefinition(id: ShapeId | null | undefined): ShapeDefinition {
  const resolvedId = (id && registry.has(id) ? id : DEFAULT_SHAPE_ID) ?? DEFAULT_SHAPE_ID
  const definition = registry.get(resolvedId)
  if (!definition) {
    throw new Error(`Shape definition not found for id ${resolvedId}`)
  }
  return definition
}

export function listShapeDefinitions(): ShapeDefinition[] {
  return Array.from(registry.values())
}
