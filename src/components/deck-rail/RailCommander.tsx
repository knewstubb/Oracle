'use client'
import { parseColourLetters } from '@/lib/command-zone'

const COLOUR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }

export interface RailCommanderProps {
  /** Commander names; a second name (partner or background) shows beside the first. Empty when none is chosen. */
  names: string[]
  colourIdentity: string | null | undefined
  saltScore?: number | null
}

export function RailCommander({ names, colourIdentity, saltScore }: RailCommanderProps) {
  const letters = 'WUBRG'.split('').filter((c) => parseColourLetters(colourIdentity).has(c))
  const colourText = letters.length === 0 ? 'Colourless' : letters.map((c) => COLOUR_NAMES[c]).join(', ')
  if (names.length === 0) {
    return (
      <section aria-labelledby="rail-commander-h" className="rounded-lg border border-dashed border-[#8A8A93] px-3 py-3">
        <h2 id="rail-commander-h" className="text-[length:var(--fs-sm)] font-semibold text-muted-foreground">Commander</h2>
        <p className="mt-1 text-[length:var(--fs-md)]">Choose a commander</p>
      </section>
    )
  }
  return (
    <section aria-labelledby="rail-commander-h" className="space-y-1">
      <h2 id="rail-commander-h" className="text-[length:var(--fs-sm)] font-semibold text-muted-foreground">Commander</h2>
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-[#8A8A93] px-1 text-[length:var(--fs-sm)] font-semibold"
          aria-hidden="true"
        >
          {letters.length === 0 ? 'C' : letters.join('')}
        </span>
        <div className="min-w-0">
          <p className="break-words text-[length:var(--fs-md)] font-medium">{names.join(' + ')}</p>
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">Commander · {colourText}</p>
        </div>
      </div>
      {saltScore != null && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium"
          style={{
            background: saltScore < 1 ? 'rgba(29, 158, 117, 0.12)' : saltScore < 2 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(226, 75, 74, 0.12)',
            color: saltScore < 1 ? 'var(--signal-success)' : saltScore < 2 ? 'var(--signal-warning)' : 'var(--signal-error)',
          }}
          title={`Salt Score: ${saltScore.toFixed(2)} — Community "saltiness" rating from EDHREC (0-4 scale)`}
        >
          <span aria-hidden="true">🧂</span>
          {saltScore.toFixed(1)}
        </span>
      )}
    </section>
  )
}
