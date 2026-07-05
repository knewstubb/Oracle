'use client'

const COLOUR_MAP: Record<string, { hex: string; label: string }> = {
  W: { hex: '#F9FAF4', label: 'White' },
  U: { hex: '#0E68AB', label: 'Blue' },
  B: { hex: '#150B00', label: 'Black' },
  R: { hex: '#D3202A', label: 'Red' },
  G: { hex: '#00733E', label: 'Green' },
}

const COLOUR_ORDER = ['W', 'U', 'B', 'R', 'G']

interface ColourPipsProps {
  colours: string[]
  size?: number
}

export function ColourPips({ colours, size = 12 }: ColourPipsProps) {
  const sorted = COLOUR_ORDER.filter((c) => colours.includes(c))
  const label = sorted.map((c) => COLOUR_MAP[c]?.label).filter(Boolean).join(', ')

  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label={label || 'Colourless'}
      role="img"
    >
      {sorted.map((c) => {
        const colour = COLOUR_MAP[c]
        if (!colour) return null
        return (
          <span
            key={c}
            className="inline-block shrink-0 rounded-full border border-border"
            style={{
              width: size,
              height: size,
              backgroundColor: colour.hex,
            }}
            aria-hidden="true"
          />
        )
      })}
    </span>
  )
}
