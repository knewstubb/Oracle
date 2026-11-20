/**
 * Pure shaping of the user's physical copies of one card for the collection window (matched on oracle_id, any printing).
 * State: Open (in storage), In deck (sleeved in a deck slot), Missing. Proxy is a flag, not a state.
 */
import type { MoveHereDeckState } from '@/lib/move-here'
import { priceForFinish, type Finish, type PrintingRow } from './printings'
import type { DeckInfo } from './copies'

export interface CollectionCopyRow {
  id: number
  is_proxy: boolean
  missing: boolean | null
  condition: string | null
  finish: string | null
  printing_id: string | null
  location_id: number | null
  deck_cards: Array<{ id: number; deck_id: number }> | null
}

export interface CollectionCopyView {
  copyId: number
  isProxy: boolean
  finish: string | null
  condition: string | null
  printingId: string | null
  printing: { setCode: string; setName: string; collectorNumber: string } | null
  priceUsd: number | null
  storage: { id: number | null; name: string | null }
  assigned: { deckId: number; deckName: string; deckState: MoveHereDeckState; deckCardsId: number } | null
  state: 'open' | 'in_deck' | 'missing'
}

export function shapeCollectionCopies(
  rows: readonly CollectionCopyRow[],
  opts: {
    decks: ReadonlyMap<number, DeckInfo>
    printings: ReadonlyMap<string, Pick<PrintingRow, 'set_code' | 'set_name' | 'collector_number' | 'price_usd' | 'price_usd_foil'>>
    locationNames: ReadonlyMap<number, string>
  },
): CollectionCopyView[] {
  const out = rows.map((row): CollectionCopyView => {
    const dc = row.deck_cards?.[0] ?? null
    const p = row.printing_id ? opts.printings.get(row.printing_id) ?? null : null
    const info = dc ? opts.decks.get(dc.deck_id) : undefined
    const finish = (row.finish ?? 'nonfoil') as Finish
    return {
      copyId: row.id,
      isProxy: row.is_proxy,
      finish: row.finish,
      condition: row.condition,
      printingId: row.printing_id,
      printing: p ? { setCode: p.set_code, setName: p.set_name, collectorNumber: p.collector_number } : null,
      priceUsd: p && !row.is_proxy ? priceForFinish(p, finish) : null,
      storage: { id: row.location_id, name: row.location_id != null ? opts.locationNames.get(row.location_id) ?? null : null },
      assigned: dc ? { deckId: dc.deck_id, deckName: info?.name ?? `Deck ${dc.deck_id}`, deckState: info?.state ?? 'brewing', deckCardsId: dc.id } : null,
      state: row.missing ? 'missing' : dc ? 'in_deck' : 'open',
    }
  })
  const rank = (c: CollectionCopyView) => (c.state === 'in_deck' ? 0 : c.state === 'open' ? 1 : 2)
  return out.sort((a, b) => rank(a) - rank(b) || a.copyId - b.copyId)
}

/** Sum of known prices of Original copies that are not Missing; null when none is priced. */
export function collectionValue(copies: readonly CollectionCopyView[]): number | null {
  const priced = copies.filter((c) => !c.isProxy && c.state !== 'missing' && c.priceUsd != null)
  return priced.length === 0 ? null : priced.reduce((sum, c) => sum + (c.priceUsd as number), 0)
}

/** Lowest known price across the card's printings (nonfoil and foil). */
export function cheapestPrice(rows: ReadonlyArray<Pick<PrintingRow, 'price_usd'>>): number | null {
  const prices = rows.map((r) => (r.price_usd === null || r.price_usd === undefined || r.price_usd === '' ? NaN : Number(r.price_usd))).filter((n) => Number.isFinite(n))
  return prices.length === 0 ? null : Math.min(...prices)
}
