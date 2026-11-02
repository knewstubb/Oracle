// ---------------------------------------------------------------------------
// Deck chat facts — which slots of the viewed deck are proxies or gaps.
// Read-only. Pure builder + one read-only loader + prompt formatter.
//
// Slot rules reused from existing code:
//  - proxy / real comes from the sleeved copy: deck_cards.copy_id -> user_copies.is_proxy
//    [Confirmed: src/app/api/decks/[id]/picklist/route.ts, src/lib/card-status.ts]
//  - generic basic land = basic land name + no scryfall_id; always counts as sleeved (D-032)
//    [Confirmed: src/lib/card-status.ts computeDeckCardStatuses]
//  - maybeboard = categories contain "Maybeboard"; not part of the main list (D-005)
//    [Confirmed: src/lib/deck-cards-diff.ts relationOf]
//  - Commander list size is 100 including the commander (D-002). Other formats: unknown here.
// Unknown values stay null/unknown and are never turned into 0 or a fact.
// ---------------------------------------------------------------------------

import { isBasicLand } from './basic-lands'

export const COMMANDER_DECK_SIZE = 100

export interface DeckSlotRow {
  id: number
  card_name: string
  quantity: number | null
  categories: string | null
  copy_id: number | null
  scryfall_id: string | null
  is_commander: boolean | null
  /** user_copies.is_proxy for the sleeved copy; null when it could not be read */
  is_proxy: boolean | null
}

export interface DeckSlotFacts {
  /** Cards in the main list, by quantity (maybeboard excluded) */
  mainListCount: number
  /** 100 for Commander; null when the format's size is not known here */
  targetSize: number | null
  /** targetSize - mainListCount when positive; null when targetSize unknown */
  emptySlots: number | null
  /** Sleeved real (original) copies, by name */
  originals: string[]
  /** Sleeved proxies, by name */
  proxies: string[]
  /** Slots on the list with no copy sleeved in (not generic basics) */
  noCopy: string[]
  /** Generic basic land slots, by quantity (count as sleeved) */
  genericLandCount: number
  /** Slots with a copy whose proxy/real state could not be read */
  unknownType: string[]
  maybeboardCount: number
}

function isMaybeboard(categories: string | null): boolean {
  return !!categories && categories.includes('Maybeboard')
}

export type DeckCardCopyStatus =
  | 'proxy'
  | 'real'
  | 'generic_basic_land'
  | 'no_copy_sleeved'
  | 'unknown'
  | 'maybeboard'

/**
 * Pure: the proxy / sleeved status of one deck row. Shared by the facts block
 * and get_deck_cards so both always agree.
 *  proxy / real = the sleeved copy's is_proxy; unknown = copy sleeved but is_proxy unreadable
 *  generic_basic_land = counts as sleeved (D-032); no_copy_sleeved = on the list, no physical copy yet
 *  maybeboard = not part of the main list (D-005)
 */
export function classifyDeckCardCopy(
  row: Pick<DeckSlotRow, 'card_name' | 'categories' | 'copy_id' | 'scryfall_id' | 'is_proxy'>
): DeckCardCopyStatus {
  if (isMaybeboard(row.categories)) return 'maybeboard'
  if (row.copy_id !== null) {
    if (row.is_proxy === true) return 'proxy'
    if (row.is_proxy === false) return 'real'
    return 'unknown'
  }
  if (isBasicLand(row.card_name) && !row.scryfall_id) return 'generic_basic_land'
  return 'no_copy_sleeved'
}

function qty(row: DeckSlotRow): number {
  return row.quantity && row.quantity > 0 ? row.quantity : 1
}

function label(row: DeckSlotRow): string {
  const n = qty(row)
  return n > 1 ? `${n}x ${row.card_name}` : row.card_name
}

/** Pure: turn deck rows into proxy / gap facts. */
export function buildDeckSlotFacts(rows: DeckSlotRow[], deckType: string | null): DeckSlotFacts {
  const normalised = (deckType ?? 'commander').toLowerCase()
  const targetSize = normalised === 'commander' ? COMMANDER_DECK_SIZE : null

  const facts: DeckSlotFacts = {
    mainListCount: 0,
    targetSize,
    emptySlots: null,
    originals: [],
    proxies: [],
    noCopy: [],
    genericLandCount: 0,
    unknownType: [],
    maybeboardCount: 0,
  }

  for (const row of rows) {
    const status = classifyDeckCardCopy(row)
    if (status === 'maybeboard') {
      facts.maybeboardCount += qty(row)
      continue
    }
    facts.mainListCount += qty(row)

    if (status === 'proxy') facts.proxies.push(label(row))
    else if (status === 'real') facts.originals.push(label(row))
    else if (status === 'unknown') facts.unknownType.push(label(row))
    else if (status === 'generic_basic_land') facts.genericLandCount += qty(row)
    else facts.noCopy.push(label(row))
  }

  if (targetSize !== null) {
    facts.emptySlots = Math.max(0, targetSize - facts.mainListCount)
  }
  return facts
}

function list(items: string[]): string {
  return items.length ? items.map(i => `  - ${i}`).join('\n') : '  (none)'
}

/**
 * Text block for the deck chat system prompt.
 * `null` facts means the lookup failed: say so, never show zeros.
 */
export function formatDeckSlotFactsForPrompt(facts: DeckSlotFacts | null): string {
  if (!facts) {
    return `=== PROXIES AND GAPS (this deck) ===
UNKNOWN: the proxy and gap information could not be loaded. Do not say which cards are proxies or which slots are empty, and do not guess. Tell the user it is unavailable right now.`
  }

  const size = facts.targetSize === null
    ? `Main list: ${facts.mainListCount} cards. Target size for this format is not known, so say nothing about being short or complete.`
    : `Main list: ${facts.mainListCount} of ${facts.targetSize} cards.${facts.emptySlots ? ` Empty slots: ${facts.emptySlots}.` : ' No empty slots.'}`

  const unknown = facts.unknownType.length
    ? `\nCopy type UNKNOWN (could not be read; do not call these real or proxy):\n${list(facts.unknownType)}`
    : ''

  return `=== PROXIES AND GAPS (this deck) ===
${size}
Maybeboard cards (not counted): ${facts.maybeboardCount}
Basic lands with no specific copy (count as sleeved, not gaps): ${facts.genericLandCount}

Proxies sleeved in this deck (${facts.proxies.length}):
${list(facts.proxies)}

Real copies sleeved in this deck (${facts.originals.length}):
${list(facts.originals)}

On the list but no copy sleeved in yet (${facts.noCopy.length}):
${list(facts.noCopy)}${unknown}

Notes: "No copy sleeved in yet" often just means the physical cards have not been assigned to this deck, not that the deck is badly built. Say that rather than blaming the deck. This list does not show what is spare or in other decks: for any card you suggest, use check_owned_copies before claiming the owner owns it.`
}

/** Minimal read-only client shape (the admin Supabase client satisfies it). */
export interface DeckFactsClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: number) => PromiseLike<{ data: unknown; error: unknown }>
    }
  }
}

/** Read-only: load the viewed deck's slot facts. Returns null on any failure. */
export async function loadDeckSlotFacts(
  client: DeckFactsClient,
  deckId: number,
  deckType: string | null
): Promise<DeckSlotFacts | null> {
  try {
    const { data, error } = await client
      .from('deck_cards')
      .select(
        'id, card_name, quantity, categories, copy_id, scryfall_id, is_commander, user_copies!deck_cards_copy_id_fkey(is_proxy)'
      )
      .eq('deck_id', deckId)
    if (error || !Array.isArray(data)) return null

    const rows: DeckSlotRow[] = (data as Array<Record<string, unknown>>).map(r => {
      const copy = r.user_copies as { is_proxy?: boolean } | null | undefined
      return {
        id: r.id as number,
        card_name: r.card_name as string,
        quantity: (r.quantity as number | null) ?? null,
        categories: (r.categories as string | null) ?? null,
        copy_id: (r.copy_id as number | null) ?? null,
        scryfall_id: (r.scryfall_id as string | null) ?? null,
        is_commander: (r.is_commander as boolean | null) ?? null,
        is_proxy: typeof copy?.is_proxy === 'boolean' ? copy.is_proxy : null,
      }
    })
    return buildDeckSlotFacts(rows, deckType)
  } catch {
    return null
  }
}
