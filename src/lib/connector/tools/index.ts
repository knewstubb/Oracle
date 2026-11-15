// The five read-only tools of slice A. Exactly these; adding one fails the snapshot test until the contract changes.
import { z } from 'zod'
import { getCollectionSummary } from './get-collection-summary'
import { searchCollection, searchCollectionInput } from './search-collection'
import { listDecks, listDecksInput } from './list-decks'
import { getDeck, getDeckInput } from './get-deck'
import { getDeckHealth, getDeckHealthInput } from './get-deck-health'
import type { ToolContext, ToolOutput } from './common'

export const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

export interface ConnectorTool {
  name: string
  description: string
  inputSchema: z.ZodType
  annotations: typeof READ_ONLY_ANNOTATIONS
  handler: (ctx: ToolContext, input: never) => Promise<ToolOutput>
}

const noInput = z.strictObject({})

function tool<S extends z.ZodType>(name: string, description: string, inputSchema: S, handler: (ctx: ToolContext, input: z.infer<S>) => Promise<ToolOutput>): ConnectorTool {
  return { name, description, inputSchema, annotations: READ_ONLY_ANNOTATIONS, handler: handler as ConnectorTool['handler'] }
}

export const CONNECTOR_TOOLS: ConnectorTool[] = [
  tool('get_collection_summary', 'Counts for the signed-in owner\'s Magic collection: distinct cards, total copies, original and proxy copies, copies in decks, in storage, and marked missing. Read-only.', noInput, (ctx) => getCollectionSummary(ctx)),
  tool('search_collection', 'Search the owner\'s collection by card name. Shows how many copies are owned, which printing and finish, original or proxy, and where each copy is (which deck or storage place). Read-only.', searchCollectionInput, searchCollection),
  tool('list_decks', 'List the owner\'s decks with commander, format, status, bracket, card count and how many cards have a physical copy attached. Read-only.', listDecksInput, listDecks),
  tool('get_deck', 'Show one deck: its summary and card list (name, quantity, categories, ownership, whether a physical copy is attached, printing, finish). Read-only.', getDeckInput, getDeck),
  tool('get_deck_health', 'Show the last saved health check for a deck. It never runs a new check; if none was saved it says so. Read-only.', getDeckHealthInput, getDeckHealth),
]

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>
  void _ignored
  return rest
}
