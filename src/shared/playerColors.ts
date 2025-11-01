export type PlayerColorId = 'blue' | 'purple' | 'red' | 'green'

export type PlayerColor = {
  id: PlayerColorId
  background: string
  text: string
}

const PLAYER_PALETTE: PlayerColor[] = [
  { id: 'blue', background: '#7596FA', text: '#0B1F58' },
  { id: 'purple', background: '#E387FF', text: '#3E134B' },
  { id: 'red', background: '#F87F81', text: '#480B0C' },
  { id: 'green', background: '#6CD07F', text: '#0A3913' },
]

export function getPlayerColor(slot: number | null | undefined): PlayerColor {
  if (slot == null || Number.isNaN(slot)) {
    return PLAYER_PALETTE[0]
  }
  const index = Math.max(0, Math.floor(slot)) % PLAYER_PALETTE.length
  return PLAYER_PALETTE[index]
}

export function listPlayerColors(): PlayerColor[] {
  return [...PLAYER_PALETTE]
}
