import { memo, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PlayerSnapshot } from '../shared/messages'
import { getPlayerColor } from '../shared/playerColors'

type ScoreEntry = {
  slot: number
  name: string
  score: number
}

type ConfettiPiece = {
  id: number
  x: number
  delay: number
  duration: number
  rotation: number
  hue: number
  size: number
}

const CONFETTI_PIECES: ConfettiPiece[] = Array.from({ length: 36 }, (_, index) => ({
  id: index,
  x: Math.round(Math.random() * 100),
  delay: 120 + Math.round(Math.random() * 240),
  duration: 1400 + Math.round(Math.random() * 900),
  rotation: -35 + Math.round(Math.random() * 70),
  hue: 170 + Math.round(Math.random() * 120),
  size: 0.8 + Math.random() * 0.6,
}))

export type ResultsDashboardProps = {
  players: PlayerSnapshot[]
  compact?: boolean
  finalMultiplier?: number
}

export const ResultsDashboard = memo(({ players, compact = false }: ResultsDashboardProps) => {
  const scoreboard = useMemo<ScoreEntry[]>(() => {
    const ranked = players
      .filter((player) => {
        const hasName = Boolean(player.name && player.name.trim().length > 0)
        return hasName || player.score > 0
      })
      .map<ScoreEntry>((player) => ({
        slot: player.slot,
        name:
          player.name && player.name.trim().length > 0
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

  const hasPlayers = scoreboard.length > 0 && scoreboard[0].slot !== -1
  const scoreboardKey = useMemo(
    () => scoreboard.map((entry) => `${entry.slot}:${entry.score}:${entry.name}`).join('|'),
    [scoreboard],
  )

  const [revealStage, setRevealStage] = useState(compact ? 3 : 0)

  useEffect(() => {
    if (compact || !hasPlayers) {
      setRevealStage(3)
      return
    }

    setRevealStage(0)
    const timers: number[] = []
    timers.push(window.setTimeout(() => setRevealStage(1), 200))
    timers.push(window.setTimeout(() => setRevealStage(2), 860))
    timers.push(window.setTimeout(() => setRevealStage(3), 1520))

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [compact, hasPlayers, scoreboardKey])

  const podiumEntries = hasPlayers ? scoreboard.slice(0, 3) : []
  const first = podiumEntries[0] ?? null
  const second = podiumEntries[1] ?? null
  const third = podiumEntries[2] ?? null
  const others = hasPlayers ? scoreboard.slice(3) : []

  if (compact) {
    return (
      <div className="results-dashboard results-dashboard-compact">
        <header className="results-header">
          <h2>Final Scores</h2>
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
  }

  if (!hasPlayers) {
    return (
      <div className="results-stage results-stage-empty">
        <header className="results-header">
          <h2>Final Scores</h2>
        </header>
        <p className="results-empty">No players yet</p>
      </div>
    )
  }

  const podiumSpots = (
    [
      { entry: second, rankLabel: '2nd', position: 'second' as const, revealAt: 2 as const },
      { entry: first, rankLabel: '1st', position: 'first' as const, revealAt: 3 as const },
      { entry: third, rankLabel: '3rd', position: 'third' as const, revealAt: 1 as const },
    ] satisfies Array<{
      entry: ScoreEntry | null
      rankLabel: string
      position: 'second' | 'first' | 'third'
      revealAt: 1 | 2 | 3
    }>
  ).filter(({ entry }) => entry !== null)

  const showConfetti = revealStage >= 3 && Boolean(first)

  return (
    <div className="results-stage">
      <header className="results-header">
        <h2>Final Scores</h2>
      </header>
      <div className={`results-podium${showConfetti ? ' results-podium-confetti' : ''}`}>
        {showConfetti ? (
          <div className="results-confetti" aria-hidden>
            {CONFETTI_PIECES.map((piece) => {
              const style: CSSProperties = {
                left: `${piece.x}%`,
                animationDelay: `${piece.delay}ms`,
                animationDuration: `${piece.duration}ms`,
                background: `hsl(${piece.hue}, 82%, 64%)`,
                width: `${piece.size * 14}px`,
                height: `${piece.size * 20}px`,
              } as CSSProperties
              ;(style as CSSProperties & Record<string, string | number>)['--confetti-rotation'] = `${piece.rotation}deg`
              return <span key={piece.id} className="results-confetti-piece" style={style} />
            })}
          </div>
        ) : null}
        {podiumSpots.map(({ entry, rankLabel, position, revealAt }) => {
          const revealed = revealStage >= revealAt
          const colors = entry && entry.slot >= 0 ? getPlayerColor(entry.slot) : null
          const bubbleStyle: CSSProperties = colors
            ? {
              backgroundColor: colors.background,
              color: colors.text,
            }
            : {}
          const scoreText = entry ? `${entry.score} pts` : '—'
          const nameText = entry ? entry.name : 'Awaiting player'
          const initial = entry ? entry.name.charAt(0).toUpperCase() : '—'
          const spotClasses = [
            'results-podium-spot',
            `results-podium-spot-${position}`,
            revealed ? 'results-podium-spot-revealed' : 'results-podium-spot-hidden',
          ].join(' ')

          return (
            <div key={position} className={spotClasses}>
              <div className="results-podium-rank-label">{rankLabel}</div>
              <div className="results-podium-bubble" style={bubbleStyle}>
                <span>{initial}</span>
              </div>
              <div className="results-podium-score">{scoreText}</div>
              <div className="results-podium-name">{nameText}</div>
            </div>
          )
        })}
      </div>
      {others.length > 0 ? (
        <div className="results-others">
          <span className="results-others-label">Also placed</span>
          <ul className="results-others-list">
            {others.map((entry, index) => (
              <li key={entry.slot}
                  className="results-others-item">
                <span className="results-others-rank">{index + 4}</span>
                <span className="results-others-name">{entry.name}</span>
                <span className="results-others-score">{entry.score} pts</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
})

ResultsDashboard.displayName = 'ResultsDashboard'
