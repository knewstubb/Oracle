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
//  - Commander list size is 100 including the commander (D-002). A deck with a commander set counts as
//    Commander even when typed Custom. No commander and no Commander type: size unknown.
// Unknown values stay null/unknown and are never turned into 0 or a fact.
// ---------------------------------------------------------------------------

import { isBasicLand } from './basic-lands'
import { isCommanderRow } from './command-zone'
import { findCommanderCards } from './commander-card-flag'

export const COMMANDER_DECK_SIZE = 100

export interface DeckSlotRow {
  id: number
  card_name: string
  quantity: number | null
  categories: string | null
  copy_id: number | null
  scryfall_id: string | null
  is_commander: boolean | null
  /** deck_cards.command_zone_role (a companion is not a commander) */
  command_zone_role?: string | null
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
  /**
   * Commander card(s) found on the main list (flagged, else matched by the deck's commander name).
   * They are INCLUDED in mainListCount, exactly once.
   */
  commanderNames: string[]
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

/**
 * Pure: is this a commander deck? Yes when the deck type says Commander (or is
 * not set), or when a commander is set: a commander row on the list or a
 * commander name on the deck. The owner's decks are typed "Custom", so the
 * commander is what decides (D-002: 100 cards including the commander).
 */
export function isCommanderDeck(
  deckType: string | null,
  rows: Array<Pick<DeckSlotRow, 'is_commander' | 'command_zone_role'>>,
  commanderName?: string | null
): boolean {
  if ((deckType ?? 'commander').toLowerCase() === 'commander') return true
  if (typeof commanderName === 'string' && commanderName.trim() !== '') return true
  return rows.some(r => isCommanderRow(r))
}

/** Pure: turn deck rows into proxy / gap facts. */
export function buildDeckSlotFacts(
  rows: DeckSlotRow[],
  deckType: string | null,
  commanderName?: string | null
): DeckSlotFacts {
  const targetSize = isCommanderDeck(deckType, rows, commanderName) ? COMMANDER_DECK_SIZE : null

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
    commanderNames: findCommanderCards(rows, commanderName).map(r => r.card_name),
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
    ? `Main list: ${facts.mainListCount} cards. No commander is set on this deck and its type does not give a size, so the target size is unknown: say that plainly if asked how many slots are empty, and do not guess a number.`
    : `Main list: ${facts.mainListCount} of ${facts.targetSize} cards.${facts.commanderNames.length ? ` This count already INCLUDES the ${facts.commanderNames.length > 1 ? 'commanders, which count equally' : 'commander'} (${facts.commanderNames.join(' and ')}): never add ${facts.commanderNames.length > 1 ? 'them' : 'the commander'} on top of it.` : ''}${facts.emptySlots ? ` Empty slots: ${facts.emptySlots}.` : ' No empty slots.'}`

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
  deckType: string | null,
  commanderName?: string | null
): Promise<DeckSlotFacts | null> {
  try {
    const { data, error } = await client
      .from('deck_cards')
      .select(
        'id, card_name, quantity, categories, copy_id, scryfall_id, is_commander, command_zone_role, user_copies!deck_cards_copy_id_fkey(is_proxy)'
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
        command_zone_role: (r.command_zone_role as string | null) ?? null,
        is_proxy: typeof copy?.is_proxy === 'boolean' ? copy.is_proxy : null,
      }
    })
    return buildDeckSlotFacts(rows, deckType, commanderName)
  } catch {
    return null
  }
}
