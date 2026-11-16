// CC-06a: card facts by name, read-only, from the shared card library (ref_cards) plus ref_printings for
// banned-versus-not-legal and the price estimate. Contract: docs/oracle/contracts/connector-card-facts-and-deck-health.md section 3.
// Names match exactly first, then by the front face of a double-faced card (same rule as fetchRefTextByName).
// The card library has no owner column, so these are the only reads here without a user id.
import type { CardFacts, CardLegality } from '../../../../docs/oracle/contracts/connector-card-facts-and-deck-health.types'
import { cutText } from '../limits'
import { escapeLike, fetchAll, must, rows, type ToolContext } from './common'
import { key, loadPrices } from './list-deck-cards-by-ownership'

export const PRICE_LABEL = 'Estimate from Scryfall' as const
export const FACTS_NAME_BATCH = 100 // names per request, kept short so the request address stays small
const FRONT_FACE_PARALLEL = 10

type RefFactRow = {
  name: string
  type_line: string | null
  oracle_text: string | null
  mana_cost: string | null
  mana_value: number | null
  color_identity: string | null
  commander_legal: boolean | null
}
const FACT_COLS = 'name, type_line, oracle_text, mana_cost, mana_value, color_identity, commander_legal'

export interface FactsOptions {
  includeRulesText: boolean
  /** Price estimates already loaded by the caller (keyed by lower-case name). Skips a second price lookup. */
  prices?: Map<string, number | null>
}

export function unavailableFacts(includeRulesText: boolean): CardFacts {
  return {
    available: false,
    typeLine: null,
    manaCost: null,
    manaValue: null,
    colorIdentity: null,
    ...(includeRulesText ? { rulesText: null } : {}),
    legality: 'unknown',
    price: { usd: null, label: PRICE_LABEL },
  }
}

/** true = legal; false and a printing says banned = banned; false otherwise = not legal. */
export function legalityOf(commanderLegal: boolean | null, bannedPrinting: boolean): CardLegality {
  if (commanderLegal === true) return 'legal'
  if (commanderLegal === false) return bannedPrinting ? 'banned' : 'not_legal'
  return 'unknown'
}

/**
 * Facts for each name, keyed by lower-case trimmed name. One batched lookup per call (100 names a request).
 * A card not in the library gets `available: false`. A database error throws LookupFailed (D-030), never "unavailable".
 */
export async function fetchCardFacts(ctx: ToolContext, names: string[], opts: FactsOptions): Promise<Map<string, CardFacts>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  const out = new Map<string, CardFacts>()
  if (unique.length === 0) return out

  const found = new Map<string, RefFactRow>() // by requested name
  for (let i = 0; i < unique.length; i += FACTS_NAME_BATCH) {
    const batch = unique.slice(i, i + FACTS_NAME_BATCH)
    const got = await fetchAll<RefFactRow>(() => ctx.db.select('ref_cards', FACT_COLS).in('name', batch))
    const byName = new Map(got.map((r) => [r.name, r]))
    for (const n of batch) {
      const r = byName.get(n)
      if (r) found.set(n, r)
    }
  }

  // Double-faced cards: a deck row may hold only the front face; the library stores "Front // Back".
  const missing = unique.filter((n) => !found.has(n) && !n.includes(' // '))
  for (let i = 0; i < missing.length; i += FRONT_FACE_PARALLEL) {
    const group = missing.slice(i, i + FRONT_FACE_PARALLEL)
    const results = await Promise.all(group.map((n) => must(ctx.db.select('ref_cards', FACT_COLS).ilike('name', `${escapeLike(n)} // %`).limit(1))))
    results.forEach((r, idx) => {
      const row = rows<RefFactRow>(r)[0]
      if (row) found.set(group[idx], row)
    })
  }

  // Banned versus simply not legal: only cards the library says are not legal need the printings table.
  const notLegalNames = [...new Set([...found.values()].filter((r) => r.commander_legal === false).map((r) => r.name))]
  const banned = new Set<string>()
  for (let i = 0; i < notLegalNames.length; i += FACTS_NAME_BATCH) {
    const batch = notLegalNames.slice(i, i + FACTS_NAME_BATCH)
    const got = await fetchAll<{ name: string }>(() => ctx.db.select('ref_printings', 'name').in('name', batch).eq('legality_commander', 'banned'))
    for (const g of got) banned.add(g.name)
  }

  const priceNames = [...found.keys()]
  const price = opts.prices ?? (priceNames.length ? (await loadPrices(ctx, priceNames)).price : new Map<string, number | null>())

  for (const n of unique) {
    const r = found.get(n)
    if (!r) {
      out.set(key(n), unavailableFacts(opts.includeRulesText))
      continue
    }
    out.set(key(n), {
      available: true,
      typeLine: r.type_line ?? null,
      manaCost: r.mana_cost ?? null,
      manaValue: typeof r.mana_value === 'number' ? r.mana_value : null,
      colorIdentity: r.color_identity ?? null,
      ...(opts.includeRulesText ? { rulesText: cutText(r.oracle_text) } : {}),
      legality: legalityOf(r.commander_legal, banned.has(r.name)),
      price: { usd: price.get(key(n)) ?? null, label: PRICE_LABEL },
    })
  }
  return out
}

/** Facts for one name from a fetchCardFacts result; a name that was never looked up is "unavailable", not guessed. */
export function factsFor(map: Map<string, CardFacts>, name: string, includeRulesText: boolean): CardFacts {
  return map.get(key(name)) ?? unavailableFacts(includeRulesText)
}
