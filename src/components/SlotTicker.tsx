import { memo } from 'react'

export type SlotTickerProps = {
  previous?: string | null
  current?: string | null
  next?: string | null
  locked: boolean
  compact?: boolean
}

export const SlotTicker = memo(({ previous, current, next, locked, compact = false }: SlotTickerProps) => {
  return (
    <div className={`slot-ticker ${locked ? 'slot-ticker-locked' : ''} ${compact ? 'slot-ticker-compact' : ''}`}>
      <div className="slot-ticker-row slot-ticker-row-previous">{previous ?? ''}</div>
      <div className="slot-ticker-row slot-ticker-row-current">
        <span className="slot-ticker-label">{current ?? 'Spinning'}</span>
        {!locked ? <span className="slot-ticker-indicator" aria-hidden /> : null}
      </div>
      <div className="slot-ticker-row slot-ticker-row-next">{next ?? ''}</div>
    </div>
  )
})

SlotTicker.displayName = 'SlotTicker'
