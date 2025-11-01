import type { GeneratedShapeDefinition } from '../generated/shapes'

export const FINAL_SHAPE_ID = 'finale' as const
export const FINAL_SHAPE_LABEL = 'Eclipse Relic'

export type FinalShapeId = typeof FINAL_SHAPE_ID
export type GeneratedShapeId = GeneratedShapeDefinition['id']
export type ShapeId = GeneratedShapeId | FinalShapeId

export function ensureShapeCount(
  shapes: GeneratedShapeDefinition[],
  requiredCount: number,
  fallback: GeneratedShapeDefinition[],
): GeneratedShapeDefinition[] {
  if (requiredCount <= shapes.length) {
    return shapes.slice(0, requiredCount)
  }
  const next: GeneratedShapeDefinition[] = [...shapes]
  let fallbackIndex = 0
  if (fallback.length === 0) {
    return next
  }
  while (next.length < requiredCount) {
    const item = fallback[fallbackIndex % fallback.length]
    next.push(item)
    fallbackIndex += 1
  }
  return next.slice(0, requiredCount)
}

export function shapeLabelFromCatalog(
  shapes: GeneratedShapeDefinition[],
  id: ShapeId | null,
): string {
  if (!id) {
    return 'Shape pending'
  }
  if (id === FINAL_SHAPE_ID) {
    return FINAL_SHAPE_LABEL
  }
  const match = shapes.find((shape) => shape.id === id)
  return match ? match.label : 'Shape pending'
}
