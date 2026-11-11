/**
 * Loads one deck's cards and their card text, and returns the Deck health response.
 * Shared by GET /api/decks/[id]/health and POST /api/decks/[id]/health/recheck.
 *
 * - The deck is looked up by id AND owner. Someone else's deck is "not found".
 * - Card text (type line and Oracle text) comes from ref_cards, so the role function really runs.
 * - Any failure is returned as a real error, never as a passing result (D-030).
 * - Nothing is stored: the verdict is computed on request.
 */

import { isMainListCard } from './commander-card-actions'
import { buildDeckHealth, type DeckHealthResponse, type HealthDeckCard } from './deck-health'
import { fetchRefTextByName, type RefClient } from './ref-card-text'
import { getCommanderTargets } from './commander-targets-server'
import type { CommanderTargets } from './commander-targets'

/** The small slice of the Supabase client used here (the admin client satisfies it). */
export type HealthClient = RefClient

export type LoadHealthResult =
  | { ok: true; health: DeckHealthResponse }
  | { ok: false; status: 404 | 500; error: string }

interface DeckCardRow {
  card_name: string
  quantity: number | null
  categories: string | null
  is_commander: boolean | null
  command_zone_role: string | null
}

export { fetchRefTextByName } from './ref-card-text'

export type LoadCardsResult =
  | { ok: true; cards: HealthDeckCard[]; commanderNames: string[] }
  | { ok: false; status: 404 | 500; error: string }

/** Injectable source of the commander's typical numbers. Tests pass a fake; the default reads the cache and EDHREC. */
export type TargetsProvider = (supabase: HealthClient, commanderNames: string[], opts: { recheck?: boolean }) => Promise<CommanderTargets>

export const defaultTargetsProvider: TargetsProvider = (supabase, names, opts) => getCommanderTargets({ supabase }, names, opts)

export interface LoadHealthOptions {
  recheck?: boolean
  targets?: TargetsProvider
}

/**
 * The deck's commander name(s): commander rows on the deck (partners give two), else the deck's own commander name.
 * The front face is enough for EDHREC; the full name is kept for the stored-builds lookup.
 */
export function commanderNamesFor(rows: DeckCardRow[], deckCommanderName: string | null | undefined): string[] {
  const fromRows = rows
    .filter((r) => r.is_commander && r.command_zone_role !== 'companion')
    .map((r) => r.card_name)
  const unique = [...new Set(fromRows)]
  if (unique.length > 0) return unique
  return deckCommanderName && deckCommanderName.trim() ? [deckCommanderName.trim()] : []
}

/** The deck's cards with real card text. The deck is looked up by id AND owner. */
export async function loadHealthCards(supabase: HealthClient, deckId: number, userId: string): Promise<LoadCardsResult> {
  try {
    const { data: deck, error: deckErr } = await supabase
      .from('decks')
      .select('id, commander_name')
      .eq('id', deckId)
      .eq('user_id', userId)
      .maybeSingle()
    if (deckErr) return { ok: false, status: 500, error: deckErr.message }
    if (!deck) return { ok: false, status: 404, error: 'Deck not found' }

    const { data: rows, error: rowsErr } = await supabase
      .from('deck_cards')
      .select('card_name, quantity, categories, is_commander, command_zone_role')
      .eq('deck_id', deckId)
    if (rowsErr) return { ok: false, status: 500, error: rowsErr.message }

    const deckRows = (rows ?? []) as DeckCardRow[]
    const { map, error: refErr } = await fetchRefTextByName(
      supabase,
      deckRows.map((r) => r.card_name),
    )
    if (refErr) return { ok: false, status: 500, error: refErr }

    const cards: HealthDeckCard[] = deckRows.map((r) => {
      const ref = map.get(r.card_name)
      return {
        cardName: r.card_name,
        quantity: r.quantity ?? 1,
        typeLine: ref?.type_line ?? null,
        oracleText: ref?.oracle_text ?? null,
        inMainDeck:
          !r.is_commander &&
          isMainListCard({
            id: 0,
            card_name: r.card_name,
            categories: r.categories,
            command_zone_role: r.command_zone_role,
          }),
      }
    })

    return { ok: true, cards, commanderNames: commanderNamesFor(deckRows, (deck as { commander_name?: string | null }).commander_name) }
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : 'Could not check deck health' }
  }
}

/** The commander's typical numbers. EDHREC trouble never fails the check (it gives the stale or guide answer). */
export async function loadTargets(supabase: HealthClient, commanderNames: string[], opts: LoadHealthOptions = {}): Promise<CommanderTargets> {
  const provider = opts.targets ?? defaultTargetsProvider
  return provider(supabase, commanderNames, { recheck: opts.recheck })
}

export async function loadDeckHealth(supabase: HealthClient, deckId: number, userId: string, opts: LoadHealthOptions = {}): Promise<LoadHealthResult> {
  const loaded = await loadHealthCards(supabase, deckId, userId)
  if (!loaded.ok) return loaded
  try {
    const targets = await loadTargets(supabase, loaded.commanderNames, opts)
    return { ok: true, health: buildDeckHealth(loaded.cards, targets) }
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : 'Could not check deck health' }
  }
}
