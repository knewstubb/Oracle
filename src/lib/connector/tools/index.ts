// Slice A's five read tools plus slice B's edit tools. Registered explicitly; adding one fails the snapshot test until the contract changes.
import { z } from 'zod'
import { getCollectionSummary } from './get-collection-summary'
import { searchCollection, searchCollectionInput } from './search-collection'
import { listDecks, listDecksInput } from './list-decks'
import { getDeck, getDeckInput } from './get-deck'
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
  tool('search_collection', 'Search the owner\'s collection by card name. Shows how many copies are owned, which printing and finish, original or proxy, and where each copy is (which deck or storage place). Read-only.', searchCollectionInput, searchCollection),
  tool('list_decks', 'List the owner\'s decks with commander, format, status, bracket, card count and how many cards have a physical copy attached. Read-only.', listDecksInput, listDecks),
  tool('get_deck', 'Show one deck: its summary and card list (name, quantity, categories, ownership, whether a physical copy is attached, printing, finish). Read-only.', getDeckInput, getDeck),
  tool('get_deck_health', 'Show the last saved health check for a deck. It never runs a new check; if none was saved it says so. Read-only.', getDeckHealthInput, getDeckHealth),
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
