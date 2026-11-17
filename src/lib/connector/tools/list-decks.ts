import { z } from 'zod'
import type { DeckSummary } from '../../../../docs/oracle/contracts/claude-connector-slice-a.types'
import { DECKS_PAGE_MAX, fitRows } from '../limits'
import type { BracketInfo } from '../../../../docs/oracle/contracts/connector-card-facts-and-deck-health.types'
import { normaliseColours } from './deck-colours'
import { loadStrategyBrackets, resolveBracket } from './bracket'
import { countByDeck, type OwnershipSlotRow } from './list-deck-cards-by-ownership'
import { computeDeckReadiness } from '../../deck-readiness'
import { deckTargetFor } from '../../format-config'
import { isCountableCard } from '../../deck-list-data'
import { DECK_STATUS_LABEL } from '../../deck-status-label'
import { fetchAllIn, LookupFailed, lookupFailed, must, pageNote, rows, tooLarge, type ToolContext, type ToolOutput } from './common'

export const listDecksInput = z.strictObject({
  include_inactive: z.boolean().optional().describe('Kept for compatibility; has no effect. All of your decks are always listed.'),
  limit: z.number().int().min(1).max(DECKS_PAGE_MAX).optional().describe('Decks per page, 1-50. Default 50.'),
  offset: z.number().int().min(0).optional().describe('Decks to skip, for paging.'),
})

export const DECK_COLUMNS = 'id, name, commander_name, colour_identity, format, bracket, card_count'
export type DeckRow = {
  id: number
  name: string
  commander_name: string | null
  colour_identity?: string | null
  format: string | null
  bracket: string | null
  card_count: number | null
}

/** The deck's rows as the status rule needs them. */
export type StatusRow = { categories?: string | null; copy_id?: number | null; is_generic?: boolean | null; generic_sleeved?: boolean | null }
/**
 * Automatic status and sleeved count for one deck, from all of its rows. Maybeboard and sideboard cards
 * are left out. Same rule as the Decks page tile and the deck page header.
 */
export function deckStatusAndSleeved(format: string | null, deckRows: readonly StatusRow[]): { status: DeckSummary['status']; sleevedCount: number } {
  const target = deckTargetFor(format)
  const r = computeDeckReadiness(deckRows.filter((s) => isCountableCard(s.categories)), target.deckSize, target.countRule)
  return { status: DECK_STATUS_LABEL[r.state], sleevedCount: r.sleeved }
}
export function toDeckSummary(d: DeckRow, sleevedCount: number, status: DeckSummary['status'], counts?: { original: number; proxy: number; notOwned: number }, strategyBracket?: number | null): DeckSummary & { bracketInfo: BracketInfo } {
  const bracketInfo = resolveBracket(strategyBracket, d.bracket)
  return {
    deckId: d.id,
    name: d.name,
    commanderName: d.commander_name,
    colourIdentity: normaliseColours(d.colour_identity), // for example "R" or "WU"; null when the deck has no colours set
    format: d.format,
    status,
    bracket: bracketInfo.value === null ? d.bracket : String(bracketInfo.value), // old field kept for compatibility, same value as text
    bracketInfo,
    cardCount: d.card_count ?? 0,
    sleevedCount,
    ...(counts ? { ownershipCounts: counts } : {}),
  }
}

export async function listDecks(ctx: ToolContext, input: z.infer<typeof listDecksInput>): Promise<ToolOutput> {
  const limit = input.limit ?? DECKS_PAGE_MAX
  const offset = input.offset ?? 0
  try {
    let q = ctx.db.select('decks', DECK_COLUMNS, { count: 'exact' }).eq('user_id', ctx.userId)
    const r = await must(q.order('name', { ascending: true }).range(offset, offset + limit - 1))
    if (typeof r.count !== 'number') throw new LookupFailed()
    const total = r.count
    const decks = rows<DeckRow>(r)
    const slots = decks.length
      ? await fetchAllIn<OwnershipSlotRow & { copy_id?: number | null; generic_sleeved?: boolean | null }>(ctx, 'deck_cards', 'id, deck_id, card_name, quantity, categories, ownership_status, is_generic, copy_id, generic_sleeved', 'deck_id', decks.map((d) => d.id))
      : []
    const counts = countByDeck(slots)
    const strategy = await loadStrategyBrackets(ctx, decks.map((d) => d.id))
    const items = decks.map((d) => {
      const { status, sleevedCount } = deckStatusAndSleeved(d.format, slots.filter((s) => s.deck_id === d.id))
      return toDeckSummary(d, sleevedCount, status, counts.get(d.id) ?? { original: 0, proxy: 0, notOwned: 0 }, strategy.get(d.id))
    })
    const fit = fitRows(items, (kept) => {
      const meta = pageNote(total, offset, kept.length, kept.length < items.length)
      return { ok: true as const, items: kept, total, returned: kept.length, offset, truncated: meta.truncated, ...(meta.note ? { note: meta.note } : {}) }
    })
    if (!fit) return tooLarge()
    return fit.result
  } catch (e) {
    if (e instanceof LookupFailed) return lookupFailed()
    throw e
  }
}
