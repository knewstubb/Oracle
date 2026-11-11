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

/** The small slice of the Supabase client used here (the admin client satisfies it). */
export interface HealthClient {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

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

interface RefRow {
  name: string
  type_line: string | null
  oracle_text: string | null
}

const NAME_BATCH = 200

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Card text for each name: exact name first, then the front face of a double-faced card ("A // B"). */
export async function fetchRefTextByName(
  supabase: HealthClient,
  names: string[],
): Promise<{ map: Map<string, RefRow>; error: string | null }> {
  const map = new Map<string, RefRow>()
  const unique = [...new Set(names)]

  for (let i = 0; i < unique.length; i += NAME_BATCH) {
    const batch = unique.slice(i, i + NAME_BATCH)
    const { data, error } = await supabase.from('ref_cards').select('name, type_line, oracle_text').in('name', batch)
    if (error) return { map, error: error.message }
    for (const row of (data ?? []) as RefRow[]) map.set(row.name, row)
  }

  // Deck rows for double-faced cards may hold only the front face name.
  const missing = unique.filter((n) => !map.has(n))
  for (const name of missing) {
    const front = name.split(' // ')[0]
    const { data, error } = await supabase
      .from('ref_cards')
      .select('name, type_line, oracle_text')
      .ilike('name', `${escapeLike(front)} // %`)
      .limit(1)
    if (error) return { map, error: error.message }
    const row = ((data ?? []) as RefRow[])[0]
    if (row) map.set(name, row)
  }

  return { map, error: null }
}

export async function loadDeckHealth(supabase: HealthClient, deckId: number, userId: string): Promise<LoadHealthResult> {
  try {
    const { data: deck, error: deckErr } = await supabase
      .from('decks')
      .select('id')
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

    return { ok: true, health: buildDeckHealth(cards) }
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : 'Could not check deck health' }
  }
}
