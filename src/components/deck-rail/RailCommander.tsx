'use client'
import { parseColourLetters, type CommandZoneRole } from '@/lib/command-zone'
import { ManaSymbol } from '@/components/ManaSymbol'
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
  /** The companion's name, when the deck has one. */
  companion?: string | null
}

const lettersOf = (raw: string | null | undefined): ManaLetter[] => {
  const parsed = parseColourLetters(raw)
  const l = 'WUBRG'.split('').filter((c) => parsed.has(c)) as ManaLetter[]
  return l.length === 0 ? ['C'] : l
}

function Symbols({ identity }: { identity: string | null | undefined }) {
  if (identity == null) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-[12.3px] leading-none">
      {lettersOf(identity).map((c) => (
        <ManaSymbol key={c} colour={c} />
      ))}
    </span>
  )
}

function Tag({ label, name }: { label: string; name: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-[4px] border border-[var(--border-default)] px-1.5 py-0.5 text-[11px] font-medium uppercase text-[var(--text-secondary)]">{label}</span>
      <span className="min-w-0 break-words text-[13px]">{name}</span>
    </div>
  )
}

export function RailCommander({ commanders, companion }: RailCommanderProps) {
  if (commanders.length === 0) {
    return (
      <div data-testid="rail-commander">
        <p className="rounded-lg border border-dashed border-[#8A8A93] px-3 py-3 text-[length:var(--fs-md)]">Choose a commander</p>
      </div>
    )
  }
  const background = commanders.find((c) => c.role === 'background')
  const rows = commanders.filter((c) => c !== background)
  return (
    <div className="space-y-2" data-testid="rail-commander">
      <ul className="space-y-2">
        {rows.map((c) => (
          <li key={c.name} className="flex items-center justify-between gap-2">
            <span className="min-w-0 break-words text-[13px] font-medium">{c.name}</span>
            <Symbols identity={c.colourIdentity} />
          </li>
        ))}
      </ul>
      {background && <Tag label="Background" name={background.name} />}
      {companion && <Tag label="Companion" name={companion} />}
    </div>
  )
}
