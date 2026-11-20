'use client'
import { parseColourLetters, type CommandZoneRole } from '@/lib/command-zone'
import { ManaSymbol } from '@/components/ManaSymbol'
import { RailSection } from './RailSection'
import type { ManaLetter } from '@/lib/ui-tokens'

export interface RailCommanderRow {
  name: string
  /** Colour letters of this commander ("BG" or "B,G"). Null when unknown: the row then shows no symbols. */
  colourIdentity: string | null
  /** command_zone_role of a second commander; null for the primary commander. */
  role?: CommandZoneRole | null
}

export interface RailCommanderProps {
  /** One entry per commander, primary first. Empty when none is chosen. A companion is never in this list. */
  commanders: RailCommanderRow[]
  /** The deck's combined colour identity, shown on its own row when there are two or more commanders. */
  combinedIdentity: string | null | undefined
}

const lettersOf = (raw: string | null | undefined): ManaLetter[] => {
  const parsed = parseColourLetters(raw)
  const l = 'WUBRG'.split('').filter((c) => parsed.has(c)) as ManaLetter[]
  return l.length === 0 ? ['C'] : l
}

function Symbols({ identity }: { identity: string | null | undefined }) {
  if (identity == null) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-[length:var(--fs-lg)]">
      {lettersOf(identity).map((c) => (
        <ManaSymbol key={c} colour={c} />
      ))}
    </span>
  )
}

/** "Partners" for a partner pair, "Background" when the second commander is a Background. */
export function roleChipText(commanders: RailCommanderRow[]): string {
  return commanders.some((c) => c.role === 'background') ? 'Background' : 'Partners'
}

export function RailCommander({ commanders, combinedIdentity }: RailCommanderProps) {
  if (commanders.length === 0) {
    return (
      <RailSection id="rail-commander-h" title="Command zone">
        <p className="rounded-lg border border-dashed border-[#8A8A93] px-3 py-3 text-[length:var(--fs-md)]">Choose a commander</p>
      </RailSection>
    )
  }
  const several = commanders.length > 1
  return (
    <RailSection id="rail-commander-h" title="Command zone" className="space-y-2">
      {several && (
        <span className="inline-flex items-center rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium text-[var(--text-muted)]" data-testid="role-chip">
          {roleChipText(commanders)}
        </span>
      )}
      <ul className="space-y-1.5">
        {commanders.map((c) => (
          <li key={c.name} className="flex items-start justify-between gap-2">
            <span className="min-w-0 break-words text-[length:var(--fs-md)] font-medium">{c.name}</span>
            <Symbols identity={c.colourIdentity} />
          </li>
        ))}
      </ul>
      {several && (
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] pt-2" data-testid="combined-identity">
          <span className="text-[length:var(--fs-sm)] text-[var(--text-muted)]">Combined identity</span>
          <Symbols identity={combinedIdentity ?? ''} />
        </div>
      )}
    </RailSection>
  )
}
