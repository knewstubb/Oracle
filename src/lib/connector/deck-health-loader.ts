// CC-06d: the Deck health check for the Claude connector. Same pure routine and same card-reading rules as the app
// (buildDeckHealth, commanderNamesFor, healthCardsFromRows), but every owner-table read goes through the connector's
// select-only handle and carries the owner's user id. Nothing is written, including the shared commander-numbers cache.
import { buildDeckHealth, type DeckHealthResponse } from '../deck-health'
import { commanderNamesFor, healthCardsFromRows, type TargetsProvider } from '../deck-health-server'
import { getCommanderTargets } from '../commander-targets-server'
import { fetchRefTextByName } from '../ref-card-text'
import { readOnlyRefClient } from './read-only-ref-client'
import { fetchAll, must, rows, type ToolContext } from './tools/common'

export type ConnectorHealthResult =
  | { ok: true; health: DeckHealthResponse }
  | { ok: false; status: 404 | 500; error: string }

/** The commander's typical numbers, read-only: a fresh saved row, else worked out live and not saved. Quiet about the save it cannot do. */
export const connectorTargetsProvider: TargetsProvider = (client, names, opts) => getCommanderTargets({ supabase: client, log: () => {} }, names, opts)

interface DeckCardRow {
  card_name: string
  quantity: number | null
  categories: string | null
  is_commander: boolean | null
  command_zone_role: string | null
}

export async function loadConnectorDeckHealth(ctx: ToolContext, deckId: number, targets: TargetsProvider = connectorTargetsProvider): Promise<ConnectorHealthResult> {
  try {
    const dr = await must(ctx.db.select('decks', 'id, commander_name').eq('user_id', ctx.userId).eq('id', deckId).limit(1))
    const deck = rows<{ id: number; commander_name: string | null }>(dr)[0]
    if (!deck) return { ok: false, status: 404, error: 'Deck not found' }

    const deckRows = await fetchAll<DeckCardRow>(() =>
      ctx.db
        .select('deck_cards', 'card_name, quantity, categories, is_commander, command_zone_role')
        .eq('user_id', ctx.userId)
        .eq('deck_id', deckId)
        .order('id', { ascending: true }),
    )

    const ref = readOnlyRefClient(ctx.db)
    const { map, error } = await fetchRefTextByName(ref, deckRows.map((r) => r.card_name))
    if (error) return { ok: false, status: 500, error }

    const cards = healthCardsFromRows(deckRows, map)
    const commanderNames = commanderNamesFor(deckRows, deck.commander_name)
    const t = await targets(ref, commanderNames, {})
    return { ok: true, health: buildDeckHealth(cards, t) }
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : 'Could not check deck health' }
  }
}
