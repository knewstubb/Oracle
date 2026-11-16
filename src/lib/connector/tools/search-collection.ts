import { z } from 'zod'
import type { CollectionCard, CopyView } from '../../../../docs/oracle/contracts/claude-connector-slice-a.types'
import type { WithFacts } from '../../../../docs/oracle/contracts/connector-card-facts-and-deck-health.types'
import { fetchCardFacts, factsFor } from './card-facts'
import { COPIES_PER_CARD_MAX, SEARCH_PAGE_MAX, fitRows } from '../limits'
import { fetchAll, fetchAllIn, escapeLike, LookupFailed, lookupFailed, must, pageNote, rows, tooLarge, type ToolContext, type ToolOutput } from './common'

export const searchCollectionInput = z.strictObject({
  query: z.string().min(1).max(100).optional().describe('Part of a card name (not case sensitive).'),
  only_free: z.boolean().optional().describe('Only copies that are not in any deck.'),
  include_proxies: z.boolean().optional().describe('Include proxy copies. Default true.'),
  limit: z.number().int().min(1).max(SEARCH_PAGE_MAX).optional().describe('Cards per page, 1-25. Default 25.'),
  offset: z.number().int().min(0).optional().describe('Cards to skip, for paging.'),
})

type CardRow = { id: number; oracle_id: string; card_name: string; type_line: string | null }
type CopyRow = { id: number; card_id: number; printing_id: string | null; finish: string | null; is_proxy: boolean; missing: boolean; location_id: number | null }

const SCAN_CAP = 3000 // most cards checked when a filter needs copy data to decide

async function copyViews(ctx: ToolContext, copies: CopyRow[]): Promise<Map<number, CopyView>> {
  const ids = copies.map((c) => c.id)
  const placements = ids.length ? await fetchAllIn<{ copy_id: number; deck_id: number }>(ctx, 'deck_cards', 'copy_id, deck_id', 'copy_id', ids) : []
  const deckOf = new Map<number, number>()
  for (const p of placements) deckOf.set(p.copy_id, p.deck_id)
  const deckIds = [...new Set(deckOf.values())]
  const locIds = [...new Set(copies.map((c) => c.location_id).filter((x): x is number => x != null))]
  const decks = deckIds.length ? await fetchAllIn<{ id: number; name: string }>(ctx, 'decks', 'id, name', 'id', deckIds) : []
  const locs = locIds.length ? await fetchAllIn<{ id: number; name: string }>(ctx, 'user_locations', 'id, name', 'id', locIds) : []
  const deckName = new Map(decks.map((d) => [d.id, d.name]))
  const locName = new Map(locs.map((l) => [l.id, l.name]))
  const out = new Map<number, CopyView>()
  for (const c of copies) {
    const deckId = deckOf.get(c.id)
    let location: CopyView['location'] = { kind: 'unknown' }
    if (deckId != null) location = { kind: 'deck', deckId, deckName: deckName.get(deckId) ?? '' }
    else if (c.location_id != null) location = { kind: 'storage', name: locName.get(c.location_id) ?? null }
    out.set(c.id, { copyId: c.id, printingId: c.printing_id, finish: c.finish, isProxy: c.is_proxy, location, missing: c.missing })
  }
  return out
}

type CardWithFacts = CollectionCard & WithFacts

function cardView(card: CardRow, views: CopyView[], facts: WithFacts['facts']): CardWithFacts {
  return {
    oracleId: card.oracle_id,
    name: card.card_name,
    // The saved type is empty for cards imported without one; the card library's type is the better source.
    typeLine: card.type_line || facts.typeLine,
    facts,
    copyCount: views.length,
    copies: views.slice(0, COPIES_PER_CARD_MAX),
    copiesTruncated: views.length > COPIES_PER_CARD_MAX,
  }
}

export async function searchCollection(ctx: ToolContext, input: z.infer<typeof searchCollectionInput>): Promise<ToolOutput> {
  const limit = input.limit ?? SEARCH_PAGE_MAX
  const offset = input.offset ?? 0
  const includeProxies = input.include_proxies ?? true
  const onlyFree = input.only_free ?? false
  const cardsQuery = () => {
    let q = ctx.db.select('user_cards', 'id, oracle_id, card_name, type_line', { count: 'exact' }).eq('user_id', ctx.userId)
    if (input.query) q = q.ilike('card_name', `%${escapeLike(input.query)}%`)
    return q.order('card_name', { ascending: true })
  }
  const copyFilter = (q: ReturnType<typeof cardsQuery>) => (includeProxies ? q : q.eq('is_proxy', false))
  const copyCols = 'id, card_id, printing_id, finish, is_proxy, missing, location_id'

  try {
    let total: number
    let cards: { card: CardRow; views: CopyView[] }[]
    let scanNote: string | undefined

    if (!onlyFree && includeProxies) {
      // Fast path: no filter needs copy data, so page the cards directly.
      const r = await must(cardsQuery().range(offset, offset + limit - 1))
      if (typeof r.count !== 'number') throw new LookupFailed()
      total = r.count
      const pageCards = rows<CardRow>(r)
      const copies = pageCards.length ? await fetchAllIn<CopyRow>(ctx, 'user_copies', copyCols, 'card_id', pageCards.map((c) => c.id)) : []
      const views = await copyViews(ctx, copies)
      cards = pageCards.map((card) => ({ card, views: copies.filter((c) => c.card_id === card.id).map((c) => views.get(c.id)!) }))
    } else {
      // Filtered path: the filter depends on copies, so scan matching cards in batches and filter here.
      const all = await fetchAll<CardRow>(() => cardsQuery())
      const scanned = all.slice(0, SCAN_CAP)
      if (all.length > SCAN_CAP) scanNote = `Only the first ${SCAN_CAP} matching cards were checked, so the total may be higher.`
      const matches: { card: CardRow; views: CopyView[] }[] = []
      for (let i = 0; i < scanned.length; i += 200) {
        const batch = scanned.slice(i, i + 200)
        const copies = await fetchAllIn<CopyRow>(ctx, 'user_copies', copyCols, 'card_id', batch.map((c) => c.id), (q) => copyFilter(q as never))
        const views = await copyViews(ctx, copies)
        for (const card of batch) {
          let vs = copies.filter((c) => c.card_id === card.id).map((c) => views.get(c.id)!)
          if (onlyFree) vs = vs.filter((v) => v.location.kind !== 'deck')
          if (vs.length > 0) matches.push({ card, views: vs })
        }
      }
      total = matches.length
      cards = matches.slice(offset, offset + limit)
    }

    // One batched facts lookup for the page (rules text always on for search results).
    const facts = await fetchCardFacts(ctx, cards.map((c) => c.card.card_name), { includeRulesText: true })
    const items = cards.map((c) => cardView(c.card, c.views, factsFor(facts, c.card.card_name, true)))
    const build = (kept: CardWithFacts[]) => {
      const meta = pageNote(total, offset, kept.length, kept.length < items.length)
      const note = [meta.note, scanNote].filter(Boolean).join(' ') || undefined
      return { ok: true as const, items: kept, total, returned: kept.length, offset, truncated: meta.truncated || !!scanNote, ...(note ? { note } : {}) }
    }
    const fit = fitRows(items, build)
    if (!fit) return tooLarge()
    return fit.result
  } catch (e) {
    if (e instanceof LookupFailed) return lookupFailed()
    throw e
  }
}
