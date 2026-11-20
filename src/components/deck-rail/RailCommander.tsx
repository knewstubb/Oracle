'use client'
import { parseColourLetters } from '@/lib/command-zone'
import { ManaSymbol } from '@/components/ManaSymbol'
import { RailSection } from './RailSection'
import type { ManaLetter } from '@/lib/ui-tokens'
export interface RailCommanderProps {
  /** Commander names; a second name (partner or background) shows beside the first. Empty when none is chosen. */
  names: string[]
  colourIdentity: string | null | undefined
  saltScore?: number | null
}
export function RailCommander({ names, colourIdentity, saltScore }: RailCommanderProps) {
  const parsed = parseColourLetters(colourIdentity)
  const letters = 'WUBRG'.split('').filter((c) => parsed.has(c)) as ManaLetter[]
  if (names.length === 0) {
    return (
      <RailSection id="rail-commander-h" title="Commander">
        <p className="rounded-lg border border-dashed border-[#8A8A93] px-3 py-3 text-[length:var(--fs-md)]">Choose a commander</p>
      </RailSection>
    )
  }
  return (
    <RailSection id="rail-commander-h" title="Commander" className="space-y-1">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-[length:var(--fs-lg)]">
          {(letters.length === 0 ? (['C'] as ManaLetter[]) : letters).map((c) => (
            <ManaSymbol key={c} colour={c} />
          ))}
        </span>
        <p className="min-w-0 break-words text-[length:var(--fs-md)] font-medium">{names.join(' + ')}</p>
      </div>
      {saltScore != null && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium text-[var(--text-muted)]"
          title={`Salt Score: ${saltScore.toFixed(2)} — Community "saltiness" rating from EDHREC (0-4 scale)`}
        >
          <span aria-hidden="true">🧂</span>
          Salt {saltScore.toFixed(1)}
        </span>
      )}
    </RailSection>
  )
}
