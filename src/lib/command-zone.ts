/**
 * Command-zone roles (T-62, contract: docs/oracle/contracts/command-zone-roles.md).
 *
 * One nullable column, `deck_cards.command_zone_role`: partner | background | companion.
 * The primary commander keeps `is_commander = true` with a NULL role (no backfill).
 * A companion is NOT a commander, is not one of the 100, and is saved with category "Sideboard"
 * so every existing category-driven count already ignores it.
 */

export type CommandZoneRole = 'partner' | 'background' | 'companion'

export const COMPANION_CATEGORY = 'Sideboard'

export interface CommandZoneRow {
  is_commander?: boolean | number | null
  command_zone_role?: string | null
}

export function isCompanion(row: CommandZoneRow | null | undefined): boolean {
  return row?.command_zone_role === 'companion'
}

/** Partner or Background second commander. */
export function isSecondCommander(row: CommandZoneRow | null | undefined): boolean {
  return row?.command_zone_role === 'partner' || row?.command_zone_role === 'background'
}

/** A commander for colour identity / legality: is_commander rows only, never a companion. */
export function isCommanderRow(row: CommandZoneRow | null | undefined): boolean {
  return !!row?.is_commander && !isCompanion(row)
}

export function parseCommandZoneRole(value: unknown): CommandZoneRole | null {
  return value === 'partner' || value === 'background' || value === 'companion' ? value : null
}

const COLOURS = 'WUBRG'

/** Parse "B, U" / "BU" / ["B","U"] into a set of WUBRG letters. */
export function parseColourLetters(raw: string | string[] | null | undefined): Set<string> {
  const text = Array.isArray(raw) ? raw.join('') : raw ?? ''
  return new Set(text.split('').filter((c) => COLOURS.includes(c)))
}

/**
 * Deck colour identity = union of the commander rows only (primary + partner/background).
 * A companion's colours are ignored (contract §2).
 */
export function deckColourIdentity(
  rows: Array<CommandZoneRow & { color_identity?: string | string[] | null }>
): string {
  const set = new Set<string>()
  for (const row of rows) {
    if (!isCommanderRow(row)) continue
    for (const c of parseColourLetters(row.color_identity)) set.add(c)
  }
  return COLOURS.split('').filter((c) => set.has(c)).join('')
}

/** Text shown next to the deck count, e.g. "100/100 + Companion". */
export function deckCountLabel(mainCount: number, target: number, hasCompanion: boolean): string {
  return `${mainCount}/${target}${hasCompanion ? ' + Companion' : ''}`
}

/** Header chip text: both commanders side by side as equals, e.g. "Commander · Tymna + Thrasios". Null when there is none. */
export function commanderChipText(names: Array<string | null | undefined>): string | null {
  const list = names.filter((n): n is string => !!n)
  return list.length > 0 ? `Commander · ${list.join(' + ')}` : null
}
