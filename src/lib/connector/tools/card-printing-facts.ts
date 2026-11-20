// Rarity of the printing in use, and "legal in Pauper by any printing", for the cards in a deck (read-only, from ref_printings).
// Pauper rule: a card is Pauper-legal when any printing of it was ever common. A card is never called illegal only because the
// owner's printing is not common. The card library stores no Pauper ban list, so a Pauper ban is not reflected here.
import { fetchAll } from './common'
import type { ToolContext } from './common'

const BATCH = 100

export interface PrintingFacts {
  /** Rarity of the printing in use (common, uncommon, rare, mythic, special, bonus), or null when the printing is not in the card library. */
  rarity: string | null
  /** true when any printing of the card was ever common; false when none was; null when the card could not be identified. */
  pauperLegal: boolean | null
}

export interface PrintingFactFields {
  rarity?: string
  pauperLegal?: boolean
  rarity_unavailable?: true
}

/** Facts keyed by printing id (scryfall_id). Returns null when a read failed: the caller says `rarity_unavailable`, never a guess. */
export async function fetchPrintingFacts(ctx: ToolContext, printingIds: string[], opts: { pauper?: boolean } = {}): Promise<Map<string, PrintingFacts> | null> {
  const unique = [...new Set(printingIds.filter(Boolean))]
  const out = new Map<string, PrintingFacts>()
  if (unique.length === 0) return out
  try {
    const own = new Map<string, { oracle_id: string | null; rarity: string | null }>()
    for (let i = 0; i < unique.length; i += BATCH) {
      const batch = unique.slice(i, i + BATCH)
      const got = await fetchAll<{ scryfall_id: string; oracle_id: string | null; rarity: string | null }>(() =>
        ctx.db.select('ref_printings', 'scryfall_id, oracle_id, rarity').in('scryfall_id', batch).order('scryfall_id'),
      )
      for (const g of got) own.set(g.scryfall_id, g)
    }
    const oracleIds = [...new Set([...own.values()].map((p) => p.oracle_id).filter((x): x is string => !!x))]
    const everCommon = new Set<string>()
    // Callers that show rarity only (search_collection, list_deck_cards_by_ownership) skip the Pauper read.
    for (let i = 0; opts.pauper !== false && i < oracleIds.length; i += BATCH) {
      const batch = oracleIds.slice(i, i + BATCH)
      const got = await fetchAll<{ oracle_id: string }>(() =>
        ctx.db.select('ref_printings', 'oracle_id').in('oracle_id', batch).eq('rarity', 'common').order('scryfall_id'),
      )
      for (const g of got) everCommon.add(g.oracle_id)
    }
    for (const id of unique) {
      const p = own.get(id)
      out.set(id, { rarity: p?.rarity ?? null, pauperLegal: opts.pauper !== false && p?.oracle_id ? everCommon.has(p.oracle_id) : null })
    }
    return out
  } catch {
    return null
  }
}

export function printingFactFields(byId: Map<string, PrintingFacts> | null, printingId: string | null | undefined): PrintingFactFields {
  if (!byId) return { rarity_unavailable: true }
  const f = printingId ? byId.get(printingId) : undefined
  // Unknown values are left out (not sent as null) to keep a 100-card deck in one answer.
  return { ...(f?.rarity ? { rarity: f.rarity } : {}), ...(typeof f?.pauperLegal === 'boolean' ? { pauperLegal: f.pauperLegal } : {}) }
}

/** Rarity only (no Pauper field), for search_collection copies and list_deck_cards_by_ownership rows. */
export function rarityField(byId: Map<string, PrintingFacts> | null, printingId: string | null | undefined): Pick<PrintingFactFields, 'rarity' | 'rarity_unavailable'> {
  if (!byId) return { rarity_unavailable: true }
  const r = printingId ? byId.get(printingId)?.rarity : undefined
  return r ? { rarity: r } : {}
}
