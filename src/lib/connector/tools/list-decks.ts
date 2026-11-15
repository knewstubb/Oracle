import { z } from 'zod'
import type { DeckSummary } from '../../../../docs/oracle/contracts/claude-connector-slice-a.types'
import { DECKS_PAGE_MAX, fitRows } from '../limits'
import { fetchAllIn, LookupFailed, lookupFailed, must, pageNote, rows, tooLarge, type ToolContext, type ToolOutput } from './common'

export const listDecksInput = z.strictObject({
  include_inactive: z.boolean().optional().describe('Also list inactive (archived) decks. Default false.'),
  limit: z.number().int().min(1).max(DECKS_PAGE_MAX).optional().describe('Decks per page, 1-50. Default 50.'),
  offset: z.number().int().min(0).optional().describe('Decks to skip, for paging.'),
})

export const DECK_COLUMNS = 'id, name, commander_name, format, status, bracket, card_count, is_active'
export type DeckRow = {
  id: number
  name: string
  commander_name: string | null
  format: string | null
  status: string | null
  bracket: string | null
  card_count: number | null
  is_active: boolean
}

export function toDeckSummary(d: DeckRow, sleevedCount: number): DeckSummary {
  return {
    deckId: d.id,
    name: d.name,
    commanderName: d.commander_name,
    format: d.format,
    status: d.status,
    bracket: d.bracket,
    cardCount: d.card_count ?? 0,
    sleevedCount,
    isActive: d.is_active,
  }
}

export async function listDecks(ctx: ToolContext, input: z.infer<typeof listDecksInput>): Promise<ToolOutput> {
  const limit = input.limit ?? DECKS_PAGE_MAX
  const offset = input.offset ?? 0
  try {
    let q = ctx.db.select('decks', DECK_COLUMNS, { count: 'exact' }).eq('user_id', ctx.userId)
    if (!input.include_inactive) q = q.eq('is_active', true)
    const r = await must(q.order('name', { ascending: true }).range(offset, offset + limit - 1))
    if (typeof r.count !== 'number') throw new LookupFailed()
    const total = r.count
    const decks = rows<DeckRow>(r)
    const sleeved = decks.length
      ? await fetchAllIn<{ deck_id: number }>(ctx, 'deck_cards', 'deck_id', 'deck_id', decks.map((d) => d.id), (x) => x.not('copy_id', 'is', null))
      : []
    const perDeck = new Map<number, number>()
    for (const s of sleeved) perDeck.set(s.deck_id, (perDeck.get(s.deck_id) ?? 0) + 1)
    const items = decks.map((d) => toDeckSummary(d, perDeck.get(d.id) ?? 0))
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
