/**
 * Wording for the import result's "Where they went" block (spec section 21.6). Pure; counts come from the
 * server's `placement`, never recomputed on the screen.
 */
import type { ImportPlacementResult, ImportUnsortedReason } from '../../docs/oracle/contracts/know-where-cards-are.types'

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export interface WhereTheyWent {
  heading: string
  /** One line, zero parts left out. */
  line: string
  /** Copies that ended up in Unsorted (deck destination only; for Unsorted itself the line says it). */
  unsortedCount: number
}

/** Null when there is no placement (older response): the screen shows nothing extra. */
export function whereTheyWent(p: ImportPlacementResult | undefined): WhereTheyWent | null {
  if (!p) return null
  const name = p.destination.name
  if (p.destination.kind === 'deck') {
    const parts: string[] = []
    if (p.filledSlots) parts.push(plural(p.filledSlots, 'filled planned slot', 'filled planned slots'))
    if (p.addedAsNew) parts.push(`${p.addedAsNew} added as new`)
    if (p.sentToUnsorted) parts.push(`${p.sentToUnsorted} sent to Unsorted`)
    return {
      heading: `Where they went: ${name}`,
      line: parts.length > 0 ? parts.join(', ') : 'Nothing was added',
      unsortedCount: p.sentToUnsorted ?? 0,
    }
  }
  const total = p.placedInStorage ?? p.total
  return { heading: 'Where they went', line: `${total} put in ${name}`, unsortedCount: p.destination.kind === 'unsorted' ? total : 0 }
}

const REASON_TEXT: Record<ImportUnsortedReason, (deck: string) => string> = {
  duplicate: (deck) => `${deck} already has it`,
  in_maybeboard: () => 'only on the Maybeboard',
  basic_land: () => 'basic land',
  could_not_place: () => "couldn't be placed",
}

export function reasonText(reason: ImportUnsortedReason, deckName: string): string {
  return REASON_TEXT[reason](deckName)
}

/**
 * Warning lines under "Where they went" for a deck import. Warn only: the cards were still added.
 * A check that could not run says so, it is never shown as "no warnings".
 */
export function deckWarningLines(p: ImportPlacementResult | undefined): string[] {
  const w = p?.warnings
  if (!p || p.destination.kind !== 'deck' || !w) return []
  const deck = p.destination.name
  const lines: string[] = []
  if (w.outsideColours.length > 0) {
    lines.push(`Added anyway, but outside ${deck}'s colours: ${w.outsideColours.join(', ')}.`)
  }
  if (w.notLegal.length > 0) {
    lines.push(`Added anyway, but not legal in this format: ${w.notLegal.join(', ')}.`)
  }
  if (w.overTarget && w.targetCount !== null) {
    lines.push(`${deck} now lists ${w.mainCountAfter} cards, ${w.mainCountAfter - w.targetCount} more than ${w.targetCount}.`)
  }
  if (w.checksUnavailable) {
    lines.push(`Could not check colours or legality for ${deck}. The cards were added.`)
  }
  return lines
}
