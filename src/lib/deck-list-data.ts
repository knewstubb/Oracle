import type { createAdminClient } from '@/lib/supabase'
import { countsAsSleeved } from '@/lib/basic-lands'
import { computeDeckReadiness } from '@/lib/deck-readiness'
import { deckTargetFor } from '@/lib/format-config'

type AdminClient = ReturnType<typeof createAdminClient>

export interface DeckCardRow {
  deck_id: number
  card_name: string
  copy_id: number | null
  categories: string | null
  is_generic?: boolean | null
  generic_sleeved?: boolean | null
}

// The database returns at most 1,000 rows per read.
const ROW_CAP = 1000

/**
 * Read every deck_cards row for the user, past the 1,000-row cap.
 * The first two pages are requested together (a collection of up to 2,000 deck
 * cards costs one round trip); further pages follow only if the second is full.
 */
export async function fetchAllDeckCardRows(
  supabase: AdminClient,
  userId: string
): Promise<{ rows: DeckCardRow[]; error: string | null }> {
  const page = (from: number) =>
    supabase
      .from('deck_cards')
      .select('deck_id, card_name, copy_id, categories, is_generic, generic_sleeved')
      .eq('user_id', userId)
      .order('id')
      .range(from, from + ROW_CAP - 1)

  const rows: DeckCardRow[] = []
  let from = 0
  let batch: Awaited<ReturnType<typeof page>>[] = await Promise.all([page(0), page(ROW_CAP)])
  for (;;) {
    for (const result of batch) {
      if (result.error) return { rows: [], error: result.error.message }
      rows.push(...((result.data ?? []) as DeckCardRow[]))
    }
    if ((batch[batch.length - 1].data ?? []).length < ROW_CAP) return { rows, error: null }
    from += batch.length * ROW_CAP
    batch = [await page(from)]
  }
}

/**
 * Mana costs for a list of card names. Card names travel in the request URL:
 * one request with ~670 names (~17 KB URL) stalls ~10 s and then fails, so each
 * request stays small and the batches run in parallel.
 */
export async function fetchManaCosts(
  supabase: AdminClient,
  cardNames: string[]
): Promise<Map<string, string>> {
  const manaCostMap = new Map<string, string>()
  const PAGE_SIZE = 150
  const batches: string[][] = []
  for (let i = 0; i < cardNames.length; i += PAGE_SIZE) {
    batches.push(cardNames.slice(i, i + PAGE_SIZE))
  }
  const results = await Promise.all(
    batches.map(batch =>
      supabase
        .from('ref_cards')
        .select('name, mana_cost')
        .in('name', batch)
        .then(({ data, error }) => {
          if (error) console.error('[decks] mana cost lookup failed:', error.message)
          return data ?? []
        })
    )
  )
  for (const rows of results) {
    for (const row of rows) {
      if (row.mana_cost) manaCostMap.set(row.name, row.mana_cost)
    }
  }
  return manaCostMap
}

// Primary category from the JSON categories string.
function parsePrimaryCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string')
      return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
  } catch { /* */ }
  return raw.split(',')[0]?.trim().replace(/\(top\)|\(bottom\)/gi, '') || 'Other'
}

/** Cards that count toward deck size (Maybeboard and Sideboard do not). */
export function isCountableCard(categories: string | null | undefined): boolean {
  const primary = parsePrimaryCategory(categories)
  return primary !== 'Maybeboard' && primary !== 'Sideboard'
}

/** Coloured mana symbols per deck, from the countable cards' mana costs. */
export function computePipDistribution(
  rows: DeckCardRow[],
  manaCostMap: Map<string, string>
): Record<number, Record<string, number>> {
  const pipMap: Record<number, Record<string, number>> = {}
  for (const card of rows) {
    if (!isCountableCard(card.categories)) continue
    const manaCost = manaCostMap.get(card.card_name)
    if (!manaCost) continue
    const matches = manaCost.match(/\{([WUBRGC])\}/g) || []
    for (const m of matches) {
      const color = m.replace(/[{}]/g, '')
      if (color === 'C') continue // Skip colorless
      pipMap[card.deck_id] ??= {}
      pipMap[card.deck_id][color] = (pipMap[card.deck_id][color] || 0) + 1
    }
  }
  return pipMap
}

export interface UnresolvedCounts {
  availableCount: number
  claimedCount: number
  unownedCount: number
  /** True when the lookup could not classify some card; never a guessed count. */
  failed: boolean
}

/**
 * Per deck: how many unresolved (no copy assigned) countable cards are
 * available, claimed or unowned. A card missing from the lookup result counts
 * as failed.
 */
export function computeUnresolvedCounts(
  rows: DeckCardRow[],
  statusMap: Map<string, 'available' | 'alternate' | 'claimed' | 'unowned' | 'failed'>
): Record<number, UnresolvedCounts> {
  const counts: Record<number, UnresolvedCounts> = {}
  for (const card of rows) {
    if (card.copy_id != null || !isCountableCard(card.categories)) continue
    const c = (counts[card.deck_id] ??= { availableCount: 0, claimedCount: 0, unownedCount: 0, failed: false })
    const status = statusMap.get(card.card_name) ?? 'failed'
    if (status === 'failed') c.failed = true
    else if (status === 'available' || status === 'alternate') c.availableCount += 1
    else if (status === 'claimed') c.claimedCount += 1
    else c.unownedCount += 1
  }
  return counts
}

/**
 * Per deck: how many countable cards are physically in the deck. The same rule as
 * the deck page header: a real copy (original or proxy) counts, and so does a
 * generic basic that is marked sleeved. Decks with no countable cards are absent.
 */
export function computeSleevedCounts(rows: DeckCardRow[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const card of rows) {
    if (!isCountableCard(card.categories) || !countsAsSleeved(card)) continue
    counts[card.deck_id] = (counts[card.deck_id] ?? 0) + 1
  }
  return counts
}

export type AutoDeckStatus = 'brewing' | 'assembling' | 'playable'
/** Automatic status per deck from its rows and format. Decks with no rows are Brewing. */
export function computeDeckStatuses(
  rows: DeckCardRow[],
  formats: ReadonlyMap<number, string | null>
): Record<number, AutoDeckStatus> {
  const byDeck = new Map<number, DeckCardRow[]>()
  for (const row of rows) {
    if (!formats.has(row.deck_id) || !isCountableCard(row.categories)) continue
    const list = byDeck.get(row.deck_id) ?? []
    list.push(row)
    byDeck.set(row.deck_id, list)
  }
  const out: Record<number, AutoDeckStatus> = {}
  for (const [deckId, format] of formats) {
    const target = deckTargetFor(format)
    out[deckId] = computeDeckReadiness(byDeck.get(deckId) ?? [], target.deckSize, target.countRule).state
  }
  return out
}
/**
 * Status word source for screens that show a deck's status next to its name.
 * Reads the deck formats and the user's deck rows, then applies the shared rule.
 */
export async function fetchDeckStatuses(
  supabase: AdminClient,
  userId: string,
  deckIds: number[]
): Promise<Record<number, AutoDeckStatus>> {
  if (deckIds.length === 0) return {}
  const { data, error } = await supabase.from('decks').select('id, format').eq('user_id', userId).in('id', deckIds)
  if (error) throw new Error(`deck format lookup failed: ${error.message}`)
  const formats = new Map<number, string | null>()
  for (const d of (data ?? []) as Array<{ id: number; format: string | null }>) formats.set(d.id, d.format)
  const { rows, error: rowsError } = await fetchAllDeckCardRows(supabase, userId)
  if (rowsError) throw new Error(`deck card lookup failed: ${rowsError}`)
  return computeDeckStatuses(rows, formats)
}
