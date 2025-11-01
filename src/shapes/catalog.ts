import { FinaleShape, createGeneratedShapeDefinitions, generatedShapeDefinitions } from './definitions'
import type { ShapeDefinition } from './definitions'
import type { ShapeId } from '../shared/shapes'
import { FINAL_SHAPE_ID, FINAL_SHAPE_LABEL } from '../shared/shapes'
import { GENERATED_SHAPES, type GeneratedShapeDefinition } from '../generated/shapes'

const registry = new Map<ShapeId, ShapeDefinition>()
let defaultGeneratedShapeId: ShapeId = generatedShapeDefinitions[0]?.id ?? FINAL_SHAPE_ID

function setRegistryEntries(definitions: ShapeDefinition[]) {
  definitions.forEach((definition) => {
    registry.set(definition.id, {
      id: definition.id,
      label: definition.label,
      Component: definition.Component,
    })
  })
}

setRegistryEntries(generatedShapeDefinitions)

registry.set(FINAL_SHAPE_ID, {
  id: FINAL_SHAPE_ID,
  label: FINAL_SHAPE_LABEL,
  Component: FinaleShape,
})

export function updateGeneratedShapeRegistry(shapes: GeneratedShapeDefinition[]) {
  Array.from(registry.keys()).forEach((key) => {
    if (key !== FINAL_SHAPE_ID) {
      registry.delete(key)
    }
  })
  const source = shapes.length > 0 ? shapes : GENERATED_SHAPES
  const definitions = createGeneratedShapeDefinitions(source)
  setRegistryEntries(definitions)
  defaultGeneratedShapeId = definitions[0]?.id ?? FINAL_SHAPE_ID
}

export function getShapeDefinition(id: ShapeId | null | undefined): ShapeDefinition {
  const resolvedId = id && registry.has(id) ? id : defaultGeneratedShapeId
  const definition = registry.get(resolvedId)
  if (!definition) {
    throw new Error(`Shape definition not found for id ${String(resolvedId)}`)
  }
  return definition
}

export function listShapeDefinitions(): ShapeDefinition[] {
  return Array.from(registry.values())
}
