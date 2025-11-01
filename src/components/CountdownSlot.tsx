import { memo } from 'react'
import { SlotTicker } from './SlotTicker'
import type { ShapeSlotSpinnerState } from '../hooks/useShapeSlotSpinner'
import { shapeLabelFromCatalog, type ShapeId } from '../shared/shapes'
import type { GeneratedShapeDefinition } from '../generated/shapes'

export type CountdownSlotProps = {
  spinner: ShapeSlotSpinnerState
  shapes: GeneratedShapeDefinition[]
}

export const CountdownSlot = memo(({ spinner, shapes }: CountdownSlotProps) => {
  const resolveLabel = (id: ShapeId | null | undefined) => shapeLabelFromCatalog(shapes, id ?? null)
  return (
    <div className="countdown-slot">
      <SlotTicker
        previous={resolveLabel(spinner.previousId)}
        current={resolveLabel(spinner.currentId)}
        next={resolveLabel(spinner.nextId)}
        locked={spinner.locked}
      />
    </div>
  )
})

CountdownSlot.displayName = 'CountdownSlot'
