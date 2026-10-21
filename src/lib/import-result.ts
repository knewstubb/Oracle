/**
 * Numbers and wording for the import result screen. Pure functions so the
 * result stays testable (import-stage-screens spec, sections 4.4 and 6).
 */

export interface FoilCountable {
  finish: string
  is_proxy?: boolean
}

/** Copies stored with a foil or etched finish. Proxies are not counted (they are not owned foils). */
export function countStoredFoils(rows: FoilCountable[]): number {
  return rows.filter((row) => !row.is_proxy && row.finish !== 'nonfoil').length
}

export type ImportResultKind = 'collection' | 'deck'

export interface ResultInput {
  kind: ImportResultKind
  /** Collection: copies added. Deck: cards added to the deck (originals + proxies + unsleeved). */
  inserted: number
  proxies: number
  foils: number
  tokensSkipped: number
  unsleeved: number
  basics: number
}

export interface BreakdownRow {
  key: 'originals' | 'proxies' | 'foil' | 'tokens' | 'unsleeved' | 'basics'
  label: string
  value: number
  note?: string
}

export interface ResultBreakdown {
  /** Collection only. Null for decks until Architect confirms the maths. */
  originals: number | null
  rows: BreakdownRow[]
  /** True when nothing but originals was added: shows "All originals." instead of rows. */
  allOriginals: boolean
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function resultHeadline(kind: ImportResultKind, inserted: number, deckName: string): { headline: string; sub: string } {
  if (kind === 'collection') {
    return { headline: `${plural(inserted, 'copy', 'copies')} added`, sub: 'to your collection' }
  }
  return { headline: `${deckName} imported`, sub: `${plural(inserted, 'card', 'cards')} added` }
}

/**
 * Breakdown rows: a row shows only when it has something to report, except
 * Originals (collection). Collection originals = inserted - proxies. Deck
 * originals are not shown: whether they are inserted - proxies - unsleeved is
 * an open Architect question (spec section 6).
 */
export function buildResultBreakdown(input: ResultInput): ResultBreakdown {
  const originals = input.kind === 'collection' ? Math.max(0, input.inserted - input.proxies) : null
  const extras: BreakdownRow[] = []
  if (input.proxies > 0) extras.push({ key: 'proxies', label: 'Proxies', value: input.proxies })
  if (input.foils > 0) extras.push({ key: 'foil', label: 'Foil', value: input.foils, note: 'included in the counts above' })
  if (input.kind === 'deck' && input.unsleeved > 0) extras.push({ key: 'unsleeved', label: 'Unsleeved', value: input.unsleeved })
  if (input.kind === 'deck' && input.basics > 0) extras.push({ key: 'basics', label: 'Basics (generic)', value: input.basics })
  if (input.tokensSkipped > 0) extras.push({ key: 'tokens', label: 'Tokens skipped', value: input.tokensSkipped })

  const rows: BreakdownRow[] =
    extras.length === 0
      ? []
      : [...(originals !== null ? [{ key: 'originals' as const, label: 'Originals', value: originals }] : []), ...extras]

  return { originals, rows, allOriginals: extras.length === 0 && input.kind === 'collection' }
}

export interface NeedsLookInput {
  unrecognisedValues: number
  unlistedFinish: number
  unmatchedCount: number
}

export interface NeedsLookNotice {
  key: 'unrecognised' | 'unlisted' | 'unmatched'
  text: string
}

/** One notice per kind, only when the count is above zero. Plain wording from the spec. */
export function buildNeedsLook(input: NeedsLookInput): NeedsLookNotice[] {
  const notices: NeedsLookNotice[] = []
  if (input.unrecognisedValues > 0) {
    notices.push({
      key: 'unrecognised',
      text:
        input.unrecognisedValues === 1
          ? "1 value in your file wasn't recognised, so your default was used."
          : `${input.unrecognisedValues} values in your file weren't recognised, so your defaults were used.`,
    })
  }
  if (input.unlistedFinish > 0) {
    notices.push({
      key: 'unlisted',
      text:
        input.unlistedFinish === 1
          ? "1 copy has a finish Scryfall doesn't list for that printing. It was kept as in your file."
          : `${input.unlistedFinish} copies have a finish Scryfall doesn't list for that printing. They were kept as in your file.`,
    })
  }
  if (input.unmatchedCount > 0) {
    notices.push({
      key: 'unmatched',
      text:
        input.unmatchedCount === 1
          ? "1 card couldn't be matched, so it wasn't added."
          : `${input.unmatchedCount} cards couldn't be matched, so they weren't added.`,
    })
  }
  return notices
}

/** The lines shown for unmatched cards: first three, or all when expanded. */
export function visibleUnmatched<T>(lines: T[], expanded: boolean, limit = 3): { shown: T[]; hidden: number } {
  if (expanded || lines.length <= limit) return { shown: lines, hidden: 0 }
  return { shown: lines.slice(0, limit), hidden: lines.length - limit }
}

/** Plain-text export of unmatched lines for the "Copy unmatched lines" button. */
export function unmatchedLinesText(lines: Array<{ rawLine: string; reason: string }>): string {
  return lines.map((line) => line.rawLine).join('\n')
}
