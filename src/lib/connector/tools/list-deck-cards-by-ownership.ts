// list_deck_cards_by_ownership: which deck cards are proxies / not owned, per deck, with what they would cost to buy.
// Read-only. Prices are the existing Scryfall estimates in ref_printings (D-035, D-040), chosen the same way as
// owned-copy-lookup's estimatePrice (cheapest non-digital printing above zero). Unknown is null, never 0.
import { z } from 'zod'
import type { OwnershipByDeckResult, OwnershipCardView, OwnershipDeckTotals, OwnershipFilter, OwnershipPriceSource } from '../../../../docs/oracle/contracts/claude-connector-slice-a.types'
import { DECK_CARDS_PAGE_MAX, fitRows } from '../limits'
import type { WithFacts } from '../../../../docs/oracle/contracts/connector-card-facts-and-deck-health.types'
import { fetchCardFacts, factsFor } from './card-facts'
import { fetchPrintingFacts, rarityField, type PrintingFactFields } from './card-printing-facts'
import { estimatePrice } from '../../owned-copy-lookup'
import { isPriceDataStale } from '../../price-store'
import { fetchAll, fetchAllIn, LookupFailed, lookupFailed, notFound, pageNote, tooLarge, escapeLike, type ToolContext, type ToolOutput } from './common'
import { parseCategories } from './get-deck'

export const listByOwnershipInput = z.strictObject({
  state: z.enum(['proxy', 'not_owned', 'both']).optional().describe('Which cards: proxy, not_owned, or both. Default both.'),
  deck_id: z.number().int().positive().optional().describe('Only this deck (id from list_decks). Default: all of your decks.'),
  limit: z.number().int().min(1).max(DECK_CARDS_PAGE_MAX).optional().describe('Cards per page, 1-150. Default 150.'),
  offset: z.number().int().min(0).optional().describe('Cards to skip, for paging.'),
})

export interface OwnershipSlotRow {
  id: number
  deck_id: number
  card_name: string
  quantity: number | null
  categories: string | null
  ownership_status: string | null
  is_generic: boolean
  copy_id?: number | null
  scryfall_id?: string | null
}

export const PRICE_SOURCE_BASE = {
  source: 'Scryfall price estimates stored in Oracle (shared card data)',
  currency: 'USD' as const,
  basis: 'Estimate: the cheapest known paper printing of the card, not a fixed shop price',
  unknownMeans: 'No price is known for the card. It is NOT free; it is left out of the totals and counted in unpricedCards',
  currentValueMeans: 'Proxies and cards not owned add nothing to the collection value, so their current value is $0',
}

type PrintingRow = { name: string; price_usd: number | null; digital: boolean | null; updated_at: string | null }
const PRICE_COLS = 'name, price_usd, digital, updated_at'
const NAME_CHUNK = 50
const DFC_LOOKUP_MAX = 40
export const key = (n: string) => n.trim().toLowerCase()

/** Slots that count: main deck (not maybeboard), not a generic placeholder. */
export function isCountedSlot(r: OwnershipSlotRow): boolean {
  return !r.is_generic && !parseCategories(r.categories).includes('Maybeboard')
}

/** original / proxy / not_owned counts by quantity per deck. Used by list_decks too. */
export function countByDeck(slots: OwnershipSlotRow[]): Map<number, { original: number; proxy: number; notOwned: number }> {
  const out = new Map<number, { original: number; proxy: number; notOwned: number }>()
  for (const r of slots) {
    if (!isCountedSlot(r)) continue
    const c = out.get(r.deck_id) ?? { original: 0, proxy: 0, notOwned: 0 }
    const q = r.quantity ?? 1
    if (r.ownership_status === 'original') c.original += q
    else if (r.ownership_status === 'proxy') c.proxy += q
    else if (r.ownership_status === 'not_owned') c.notOwned += q
    out.set(r.deck_id, c)
  }
  return out
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function loadPrices(ctx: ToolContext, names: string[]): Promise<{ price: Map<string, number | null>; lastRefresh: string | null }> {
  const byName = new Map<string, PrintingRow[]>()
  let lastRefresh: string | null = null
  const add = (rs: PrintingRow[]) => {
    for (const r of rs) {
      const k = key(r.name)
      const l = byName.get(k) ?? []
      l.push(r)
      byName.set(k, l)
      if (r.updated_at && (!lastRefresh || r.updated_at > lastRefresh)) lastRefresh = r.updated_at
    }
  }
  for (let i = 0; i < names.length; i += NAME_CHUNK) {
    const chunk = names.slice(i, i + NAME_CHUNK)
    add(await fetchAll<PrintingRow>(() => ctx.db.select('ref_printings', PRICE_COLS).in('name', chunk).not('price_usd', 'is', null).order('name', { ascending: true })))
  }
  // Double-faced cards are stored as "Front // Back"; deck lists may hold just the front.
  const missing = names.filter((n) => !byName.has(key(n)) && !n.includes(' // '))
  for (const n of missing.slice(0, DFC_LOOKUP_MAX)) {
    const got = await fetchAll<PrintingRow>(() => ctx.db.select('ref_printings', PRICE_COLS).ilike('name', `${escapeLike(n)} // %`).not('price_usd', 'is', null))
    for (const r of got) {
      const l = byName.get(key(n)) ?? []
      l.push(r)
      byName.set(key(n), l)
      if (r.updated_at && (!lastRefresh || r.updated_at > lastRefresh)) lastRefresh = r.updated_at
    }
  }
  const price = new Map<string, number | null>()
  for (const n of names) price.set(key(n), estimatePrice((byName.get(key(n)) ?? []) as never).usd)
  return { price, lastRefresh }
}

export async function listDeckCardsByOwnership(ctx: ToolContext, input: z.infer<typeof listByOwnershipInput>): Promise<ToolOutput> {
  const filter: OwnershipFilter = input.state ?? 'both'
  const limit = input.limit ?? DECK_CARDS_PAGE_MAX
  const offset = input.offset ?? 0
  try {
    const deckRows = await fetchAll<{ id: number; name: string }>(() => {
      let q = ctx.db.select('decks', 'id, name').eq('user_id', ctx.userId)
      if (input.deck_id !== undefined) q = q.eq('id', input.deck_id)
      return q.order('id', { ascending: true })
    })
    if (input.deck_id !== undefined && deckRows.length === 0) return notFound()
    const deckName = new Map(deckRows.map((d) => [d.id, d.name]))

    const slots = deckRows.length
      ? (
          await fetchAll<OwnershipSlotRow>(() => {
            let q = ctx.db
              .select('deck_cards', 'id, deck_id, card_name, quantity, categories, ownership_status, is_generic, copy_id, scryfall_id')
              .eq('user_id', ctx.userId)
              .in('ownership_status', ['proxy', 'not_owned'])
            q = input.deck_id !== undefined ? q.eq('deck_id', input.deck_id) : q.in('deck_id', deckRows.map((d) => d.id))
            return q.order('id', { ascending: true })
          })
        ).filter((r) => isCountedSlot(r) && deckName.has(r.deck_id))
      : []

    const wanted = filter === 'both' ? ['proxy', 'not_owned'] : [filter]
    const matching = slots.filter((r) => wanted.includes(r.ownership_status ?? ''))
    const { price, lastRefresh } = matching.length ? await loadPrices(ctx, [...new Set(matching.map((r) => r.card_name))]) : { price: new Map<string, number | null>(), lastRefresh: null }
    const stale = matching.length ? await isPriceDataStale(lastRefresh) : false
    const priceSource: OwnershipPriceSource = { ...PRICE_SOURCE_BASE, stale }

    const all: OwnershipCardView[] = matching.map((r) => {
      const qty = r.quantity ?? 1
      const unit = price.get(key(r.card_name)) ?? null
      return {
        deckId: r.deck_id,
        deckName: deckName.get(r.deck_id) as string,
        slotId: r.id,
        name: r.card_name,
        quantity: qty,
        state: r.ownership_status as 'proxy' | 'not_owned',
        unitPriceUsd: unit,
        currentValueUsd: 0,
        valueIfBoughtUsd: unit === null ? null : round2(unit * qty),
      }
    })

    const perDeck = new Map<number, OwnershipDeckTotals>()
    for (const c of all) {
      const t = perDeck.get(c.deckId) ?? { deckId: c.deckId, deckName: c.deckName, proxy: 0, notOwned: 0, matching: 0, currentValueUsd: 0, valueIfBoughtUsd: 0, unpricedCards: 0 }
      if (c.state === 'proxy') t.proxy += c.quantity
      else t.notOwned += c.quantity
      t.matching += c.quantity
      if (c.valueIfBoughtUsd === null) t.unpricedCards += c.quantity
      else t.valueIfBoughtUsd = round2(t.valueIfBoughtUsd + c.valueIfBoughtUsd)
      perDeck.set(c.deckId, t)
    }
    const decks = [...perDeck.values()].sort((a, b) => b.matching - a.matching || a.deckName.localeCompare(b.deckName) || a.deckId - b.deckId)
    const rank = new Map(decks.map((d, i) => [d.deckId, i]))
    all.sort((a, b) => (rank.get(a.deckId) as number) - (rank.get(b.deckId) as number) || a.name.localeCompare(b.name) || a.slotId - b.slotId)

    const totals = decks.reduce(
      (s, d) => ({ proxy: s.proxy + d.proxy, notOwned: s.notOwned + d.notOwned, matching: s.matching + d.matching, currentValueUsd: 0, valueIfBoughtUsd: round2(s.valueIfBoughtUsd + d.valueIfBoughtUsd), unpricedCards: s.unpricedCards + d.unpricedCards }),
      { proxy: 0, notOwned: 0, matching: 0, currentValueUsd: 0, valueIfBoughtUsd: 0, unpricedCards: 0 },
    )

    const total = all.length
    const pageBase = all.slice(offset, offset + limit)
    // Facts (no rules text here) for the page only; prices are the ones already loaded above, so no second price lookup.
    const facts = await fetchCardFacts(ctx, pageBase.map((c) => c.name), { includeRulesText: false, prices: price })
    // Rarity of the printing in each slot (the proxy copy's printing, else the printing the slot asks for), one batched read.
    const slotById = new Map(matching.map((r) => [r.id, r]))
    const copyIds = pageBase.map((c) => slotById.get(c.slotId)?.copy_id).filter((x): x is number => x != null)
    const copies = copyIds.length ? await fetchAllIn<{ id: number; printing_id: string | null }>(ctx, 'user_copies', 'id, printing_id', 'id', copyIds) : []
    const copyPrinting = new Map(copies.map((c) => [c.id, c.printing_id]))
    const printingOf = (slotId: number) => {
      const s = slotById.get(slotId)
      return (s?.copy_id != null ? copyPrinting.get(s.copy_id) : null) ?? s?.scryfall_id ?? null
    }
    const rarityById = await fetchPrintingFacts(ctx, pageBase.map((c) => printingOf(c.slotId)).filter((x): x is string => !!x), { pauper: false })
    const page: (OwnershipCardView & WithFacts & Pick<PrintingFactFields, 'rarity' | 'rarity_unavailable'>)[] = pageBase.map((c) => ({ ...c, ...rarityField(rarityById, printingOf(c.slotId)), facts: factsFor(facts, c.name, false) }))
    const fit = fitRows(page, (kept) => {
      const meta = pageNote(total, offset, kept.length, kept.length < page.length)
      const result: OwnershipByDeckResult = { ok: true, filter, priceSource, totals, decks, items: kept, total, returned: kept.length, offset, truncated: meta.truncated, ...(meta.note ? { note: meta.note } : {}) }
      return result
    })
    if (!fit) return tooLarge()
    return fit.result as unknown as ToolOutput
  } catch (e) {
    if (e instanceof LookupFailed) return lookupFailed()
    throw e
  }
}
