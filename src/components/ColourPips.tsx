'use client'

import { ManaIcon } from './ManaIcon'

const COLOUR_ORDER = ['W', 'U', 'B', 'R', 'G']

interface ColourPipsProps {
  colours: string[]
  size?: number
}

export function ColourPips({ colours, size = 14 }: ColourPipsProps) {
  const sorted = COLOUR_ORDER.filter((c) => colours.includes(c))
  const labels: Record<string, string> = {
    W: 'White',
    U: 'Blue', 
    B: 'Black',
    R: 'Red',
    G: 'Green',
  }
  const label = sorted.map((c) => labels[c]).filter(Boolean).join(', ')

  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={label || 'Colourless'}
      role="img"
    >
      {sorted.map((c) => (
        <ManaIcon key={c} color={c} size={size} />
      ))}
    </span>
  )
}
