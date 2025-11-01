import { memo, useMemo } from 'react'
import type { PlayerSnapshot } from '../shared/messages'

export type ResultsDashboardProps = {
  players: PlayerSnapshot[]
  finalMultiplier: number
  compact?: boolean
}

export const ResultsDashboard = memo(({ players, finalMultiplier, compact = false }: ResultsDashboardProps) => {
  const scoreboard = useMemo(() => {
    const ranked = players
      .filter((player) => {
        const hasName = Boolean(player.name && player.name.trim().length > 0)
        return hasName || player.score > 0
      })
      .map((player) => ({
        slot: player.slot,
        name: (player.name && player.name.trim().length > 0)
          ? player.name.trim()
          : `Player ${player.slot + 1}`,
        score: player.score,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score
        }
        return a.name.localeCompare(b.name)
      })

    if (ranked.length === 0) {
      return [
        {
          slot: -1,
          name: 'No players yet',
          score: 0,
        },
      ]
    }

    return ranked
  }, [players])

  return (
    <div className={`results-dashboard ${compact ? 'results-dashboard-compact' : ''}`}>
      <header className="results-header">
        <h2>Final Scores</h2>
  <span className="results-meta">Final figure ×{finalMultiplier}</span>
      </header>
      <ol className="results-list">
        {scoreboard.map((entry, index) => (
          <li key={entry.slot === -1 ? `empty-${index}` : entry.slot} className="results-row">
            <span className="results-rank">{index + 1}</span>
            <span className="results-name">{entry.name}</span>
            <span className="results-score">{entry.score}</span>
          </li>
        ))}
      </ol>
    </div>
  )
})

ResultsDashboard.displayName = 'ResultsDashboard'
