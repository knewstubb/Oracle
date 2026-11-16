// Slice A's five read tools (plus the ownership extension) plus slice B's edit tools. Registered explicitly; adding one fails the snapshot test until the contract changes.
import { z } from 'zod'
import { getCollectionSummary } from './get-collection-summary'
import { searchCollection, searchCollectionInput } from './search-collection'
import { listDecks, listDecksInput } from './list-decks'
import { getDeck, getDeckInput } from './get-deck'
import { listDeckCardsByOwnership, listByOwnershipInput } from './list-deck-cards-by-ownership'
import { getDeckHealth, getDeckHealthInput } from './get-deck-health'
import type { ToolContext, ToolOutput } from './common'
import type { EditContext } from '../user-client'
import * as E from './edit-tools'

export const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

export const EDIT_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const
export const DESTRUCTIVE_EDIT_ANNOTATIONS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } as const
type Annotations = typeof READ_ONLY_ANNOTATIONS | typeof EDIT_ANNOTATIONS | typeof DESTRUCTIVE_EDIT_ANNOTATIONS

export interface ConnectorTool {
  name: string
  description: string
  inputSchema: z.ZodType
  annotations: Annotations
  handler: (ctx: EditContext, input: never) => Promise<ToolOutput>
}

const noInput = z.strictObject({})

function tool<S extends z.ZodType>(name: string, description: string, inputSchema: S, handler: (ctx: ToolContext, input: z.infer<S>) => Promise<ToolOutput>): ConnectorTool {
  return { name, description, inputSchema, annotations: READ_ONLY_ANNOTATIONS, handler: handler as ConnectorTool['handler'] }
}

function edit<S extends z.ZodType>(name: string, description: string, inputSchema: S, handler: (ctx: EditContext, input: z.infer<S>) => Promise<ToolOutput>, destructive = false): ConnectorTool {
  return { name, description, inputSchema, annotations: destructive ? DESTRUCTIVE_EDIT_ANNOTATIONS : EDIT_ANNOTATIONS, handler: handler as ConnectorTool['handler'] }
}

function readB<S extends z.ZodType>(name: string, description: string, inputSchema: S, handler: (ctx: EditContext, input: z.infer<S>) => Promise<ToolOutput>): ConnectorTool {
  return { name, description, inputSchema, annotations: READ_ONLY_ANNOTATIONS, handler: handler as ConnectorTool['handler'] }
}

export const CONNECTOR_TOOLS: ConnectorTool[] = [
  tool('get_collection_summary', 'Counts for the signed-in owner\'s Magic collection: distinct cards, total copies, original and proxy copies, copies in decks, in storage, and marked missing. Read-only.', noInput, (ctx) => getCollectionSummary(ctx)),
  tool('search_collection', 'Search the owner\'s collection. Filters (all optional, combined with AND on the same copy): query (part of a name); types (creature, instant, sorcery, artifact, enchantment, planeswalker, land, battle; any of them, either face of a two-faced card); colours with colour_match (within, the default, means cards that fit a deck of only those colours, so colourless cards are included; exact means exactly those colours, so ["G"] is mono-green; includes means at least those colours) or colourless; subtypes (creature types and the like: Elf, Kithkin, Equipment; any of them; whole word); keywords (printed abilities like flying, haste, deathtouch; all of them by default, or any with keywords_match; these are printed keyword abilities, not words that merely appear in rules text, and Kinship is a keyword, not a creature type); roles (ramp, draw, removal, wipes; any of them by default, or all with roles_match). Roles are worked out live from rules text by the same rules Deck health uses: a best guess, front face only, lands never have a role, cost reducers count as ramp, and they are not EDHREC categories. A role count here is copies of cards that have the role, not what Deck health counts (it reads one main deck and skips the commander). mana_value_min and mana_value_max (inclusive); location (a deck name, a box or binder name, or In your hand or Missing; whole name); only_free (copies in no deck that are not In your hand and not Missing); include_proxies or only_proxies. One row is one card in one kind (original or proxy), so a card with both comes back as two rows; total is the number of rows and totalCopies the number of copies, both exact. A card is counted under its single main type in group counts but a type filter matches either face. Each row shows copies (printing, finish, and where it is: a deck, a storage place, In your hand or Missing), keywords and roles. Every card also carries a facts block from the shared card library: type line, mana cost, mana value, colour identity, rules text (send include_rules_text false to leave it out), Commander legality (legal, banned, not legal, or unknown) and a price. If facts say available is false, the card is not in the library: say "facts unavailable", do not guess. When a type, colour, mana value, subtype, keyword or role filter is used, filterCoverage says how many owned cards have no card facts (or no rules text) and so could not be matched: tell the owner that number. An unknown place or word gives zero results and a note (knownPlaces lists real places). Prices are estimates from Scryfall, not shop prices; null means no known price, not free. Read-only.', searchCollectionInput, searchCollection),
  tool('list_decks', 'List the owner\'s decks with commander, format, status, bracket (bracketInfo says where it came from, or, when none is set, that the owner sets it on the Deck strategy screen and Claude cannot), card count and how many cards have a physical copy attached, and how many main-deck cards are original, proxy or not owned. Read-only.', listDecksInput, listDecks),
  tool('get_deck', 'Show one deck: its summary (including bracket, set by the owner on the Deck strategy screen; Claude cannot set it) and card list (name, quantity, categories, ownership, whether a physical copy is attached, printing, finish). Every card carries facts: type line, mana cost, mana value, colour identity, Commander legality and a price estimate (an estimate from Scryfall, null means unknown, not free). Rules text is left out unless include_rules_text is true. Big decks may take two pages; the answer says when more remain. Read-only.', getDeckInput, getDeck),
  tool('get_deck_health', 'Run the same Deck health check the Deck health screen shows, fresh on every call: ramp, draw, removal and board wipes against the commander\'s typical numbers (or the general guide), with a verdict and a source line saying where the numbers came from. Read-only: it saves nothing. If the check cannot be completed it returns an error, which is not the same as healthy. The first check for a commander nobody has checked before can be slower.', getDeckHealthInput, getDeckHealth),
  tool('list_deck_cards_by_ownership', 'List deck cards that are proxies and/or not owned (state: proxy, not_owned or both), optionally for one deck. Each card shows deck, name, quantity, state, price, "current value" (always $0: proxies and unowned cards add nothing to collection value) and "value if bought" (Scryfall estimate in USD; null means no known price, not free). Per-deck totals come first, most cards first, plus a grand total of what buying them all would cost. Each card also carries facts (type, cost, colours, Commander legality). Pages; says so when more remain. Read-only.', listByOwnershipInput, listDeckCardsByOwnership),
  edit('add_cards_to_deck', 'Add cards to one of the owner\'s decks as new Unsleeved slots (no physical copy is moved). Up to 10 cards go through at once and can be undone by the owner for 7 days; more than 10 waits for the owner to say yes in Oracle. Set dry_run to preview.', E.addCardsInput, E.addCardsToDeck),
  edit('remove_cards_from_deck', 'Take cards off a deck list by slot. The physical copy goes back to storage; it is never deleted from the collection. Up to 10 go through at once and can be undone for 7 days; more waits for the owner\'s yes. Cannot remove a commander.', E.removeCardsInput, E.removeCardsFromDeck, true),
  edit('set_card_zone', 'Move cards on a deck between the main list and the Maybeboard. A card moved to the Maybeboard releases its physical copy to storage. Up to 10 at once; more waits for the owner\'s yes. Can be undone for 7 days.', E.setZoneInput, E.setCardZone),
  edit('add_card_to_collection', 'Add one copy of a card to the owner\'s collection (one at a time). Only the owner can undo this, in Oracle. It never removes anything.', E.addToCollectionInput, E.addCardToCollection),
  edit('sleeve_free_copy', 'Put a free (unused) copy from the collection into a deck slot that has no copy. Up to 10 at once; undo is refused if the deck has changed since.', E.sleeveCopyInput, E.sleeveFreeCopy),
  edit('make_slot_original', 'Swap a proxy in a deck slot for a free original copy. The proxy goes back to storage. Undo is refused if the deck has changed since.', E.makeOriginalInput, E.makeSlotOriginal),
  edit('create_proxy_for_slot', 'Make one proxy copy for a deck slot that has no copy. Only the owner can undo this, in Oracle.', E.createProxyInput, E.createProxyForSlot),
  edit('request_card_move', 'Ask to move a sleeved copy from the deck it is in to another deck. This always waits for the owner to say yes in Oracle; nothing moves until they do.', E.requestMoveInput, E.requestCardMove),
  edit('undo_change', 'Undo an earlier change made through this connection, by group_id, within 7 days. Refused when the deck changed since, or for adds to the collection, proxies and moves (only the owner can undo those), or for changes over 10 cards. Nothing is partly undone.', E.undoInput, E.undoChange, true),
  readB('get_change_status', 'Check whether a change that was waiting for the owner\'s yes has been approved, declined, expired or cancelled. Read-only.', E.changeStatusInput, E.getChangeStatus),
  readB('list_recent_changes', 'List the changes made through Oracle in the last 7 days and whether Claude can undo each. Read-only.', E.listRecentInput, (ctx) => E.listRecentChanges(ctx)),
]

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>
  void _ignored
  return rest
}
