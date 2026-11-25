// get_buying_list (CC-18a): a shopping-shaped view of what decks are missing. Read-only, no database change.
// One line per card across decks (a card two decks want is two buys). Prices come from the same loader as
// list_deck_cards_by_ownership (Scryfall estimates; unknown is null, never free).
import { z } from 'zod'
import type { BuyingListDeckPart, BuyingListItem, BuyingListResult } from '../../../../docs/oracle/contracts/claude-connector-cc18-buying-list.types'
import { fitRows } from '../limits'
import { deckRanks } from '../../deck-order'
import { isPriceDataStale } from '../../price-store'
import { fetchAll, LookupFailed, lookupFailed, notFound, pageNote, tooLarge, type ToolContext, type ToolOutput } from './common'
import { parseCategories } from './get-deck'
import { PRICE_SOURCE_BASE, key, loadPrices, type OwnershipSlotRow } from './list-deck-cards-by-ownership'

export const BUYING_PAGE_MAX = 100

export const getBuyingListInput = z.strictObject({
  deck_id: z.number().int().positive().optional().describe('Only this deck (id from list_decks). Default: all of your decks.'),
  include_proxies: z.boolean().optional().describe('Also list proxies as "would upgrade" (buying an original). Default false: only cards not owned.'),
  include_maybeboard: z.boolean().optional().describe('Also include Maybeboard cards. Default false.'),
  sort: z.enum(['price', 'name']).optional().describe('price (most expensive line first, unpriced last; default) or name.'),
  limit: z.number().int().min(1).max(BUYING_PAGE_MAX).optional().describe('Cards per page, 1-100. Default 50.'),
  offset: z.number().int().min(0).optional().describe('Cards to skip, for paging.'),
})

const round2 = (n: number) => Math.round(n * 100) / 100

export async function getBuyingList(ctx: ToolContext, input: z.infer<typeof getBuyingListInput>): Promise<ToolOutput> {
  const includeProxies = input.include_proxies ?? false
  const includeMaybeboard = input.include_maybeboard ?? false
  const sort = input.sort ?? 'price'
  const limit = input.limit ?? 50
  const offset = input.offset ?? 0
  try {
    const deckRows = await fetchAll<{ id: number; name: string; position: number | null }>(() => {
      let q = ctx.db.select('decks', 'id, name, position').eq('user_id', ctx.userId)
      if (input.deck_id !== undefined) q = q.eq('id', input.deck_id)
      return q.order('id', { ascending: true })
    })
    if (input.deck_id !== undefined && deckRows.length === 0) return notFound()
    const deckName = new Map(deckRows.map((d) => [d.id, d.name]))
    const deckRank = deckRanks(deckRows) // the owner's saved deck order
    const statuses = includeProxies ? ['not_owned', 'proxy'] : ['not_owned']

    const slots = deckRows.length
      ? (
          await fetchAll<OwnershipSlotRow>(() => {
            let q = ctx.db
              .select('deck_cards', 'id, deck_id, card_name, quantity, categories, ownership_status, is_generic')
              .eq('user_id', ctx.userId)
              .in('ownership_status', statuses)
            q = input.deck_id !== undefined ? q.eq('deck_id', input.deck_id) : q.in('deck_id', deckRows.map((d) => d.id))
            return q.order('id', { ascending: true })
          })
        ).filter((r) => deckName.has(r.deck_id) && !r.is_generic && (includeMaybeboard || !parseCategories(r.categories).includes('Maybeboard')))
      : []

    const { price, lastRefresh } = slots.length ? await loadPrices(ctx, [...new Set(slots.map((r) => r.card_name))]) : { price: new Map<string, number | null>(), lastRefresh: null }
    const stale = slots.length ? await isPriceDataStale(lastRefresh) : false

    const lines = new Map<string, { name: string; parts: Map<number, BuyingListDeckPart> }>()
    for (const r of slots) {
      const q = r.quantity ?? 1
      const line = lines.get(key(r.card_name)) ?? { name: r.card_name, parts: new Map<number, BuyingListDeckPart>() }
      const part = line.parts.get(r.deck_id) ?? { deckId: r.deck_id, deckName: deckName.get(r.deck_id) as string, notOwned: 0, proxyUpgrade: 0 }
      if (r.ownership_status === 'proxy') part.proxyUpgrade += q
      else part.notOwned += q
      line.parts.set(r.deck_id, part)
      lines.set(key(r.card_name), line)
    }

    const all: BuyingListItem[] = [...lines.entries()].map(([k, l]) => {
      const decks = [...l.parts.values()].sort((a, b) => (deckRank.get(a.deckId) ?? 0) - (deckRank.get(b.deckId) ?? 0))
      const notOwned = decks.reduce((s, d) => s + d.notOwned, 0)
      const proxyUpgrade = decks.reduce((s, d) => s + d.proxyUpgrade, 0)
      const unit = price.get(k) ?? null
      return { name: l.name, toBuy: notOwned + proxyUpgrade, notOwned, proxyUpgrade, unitPriceUsd: unit, estimatedCostUsd: unit === null ? null : round2(unit * (notOwned + proxyUpgrade)), decks }
    })
    all.sort((a, b) => {
      if (sort === 'price') {
        const ca = a.estimatedCostUsd, cb = b.estimatedCostUsd
        if (ca === null && cb !== null) return 1
        if (cb === null && ca !== null) return -1
        if (ca !== null && cb !== null && ca !== cb) return cb - ca
      }
      return a.name.localeCompare(b.name)
    })

    const totals = { cardsToBuy: 0, notOwnedCopies: 0, proxyUpgradeCopies: 0, estimatedCostUsd: 0, notOwnedCostUsd: 0, proxyUpgradeCostUsd: 0, unpricedCopies: 0, unpricedCards: 0 }
    for (const i of all) {
      totals.cardsToBuy += i.toBuy
      totals.notOwnedCopies += i.notOwned
      totals.proxyUpgradeCopies += i.proxyUpgrade
      if (i.unitPriceUsd === null) {
        totals.unpricedCopies += i.toBuy
        totals.unpricedCards += 1
      } else {
        totals.notOwnedCostUsd += i.unitPriceUsd * i.notOwned
        totals.proxyUpgradeCostUsd += i.unitPriceUsd * i.proxyUpgrade
      }
    }
    totals.notOwnedCostUsd = round2(totals.notOwnedCostUsd)
    totals.proxyUpgradeCostUsd = round2(totals.proxyUpgradeCostUsd)
    totals.estimatedCostUsd = round2(totals.notOwnedCostUsd + totals.proxyUpgradeCostUsd)

    const priceSource = {
      ...PRICE_SOURCE_BASE,
      stale,
      notShopPrices: 'These are Scryfall estimates, not shop prices. Card Kingdom or other shop prices are not available here.',
    }
    const total = all.length
    const page = all.slice(offset, offset + limit)
    const fit = fitRows(page, (kept) => {
      const meta = pageNote(total, offset, kept.length, kept.length < page.length)
      const result: BuyingListResult = { ok: true, includesProxies: includeProxies, includesMaybeboard: includeMaybeboard, sort, priceSource, totals, items: kept, total, returned: kept.length, offset, truncated: meta.truncated, ...(meta.note ? { note: meta.note } : {}) }
      return result
    })
    if (!fit) return tooLarge()
    return fit.result as unknown as ToolOutput
  } catch (e) {
    if (e instanceof LookupFailed) return lookupFailed()
    throw e
  }
}
