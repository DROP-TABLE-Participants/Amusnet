import { memo } from 'react'
import { SlotTicker } from './SlotTicker'
import type { ShapeSlotSpinnerState } from '../hooks/useShapeSlotSpinner'

export type CountdownSlotProps = {
  spinner: ShapeSlotSpinnerState
}

export const CountdownSlot = memo(({ spinner }: CountdownSlotProps) => {
  return (
    <div className="countdown-slot">
      <SlotTicker
        previousId={spinner.previousId}
        currentId={spinner.currentId}
        nextId={spinner.nextId}
        locked={spinner.locked}
        spinning={spinner.spinning}
      />
    </div>
  )
})

CountdownSlot.displayName = 'CountdownSlot'
