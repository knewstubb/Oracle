/**
 * Server-side check of a second commander before set_deck_command_zone runs (contract §6: the pair rule
 * needs card text, so the route checks it; the table constraints are only the backstop).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifySecondCommander, type PairCardFacts } from '@/lib/commander-pairing'
import type { CommandZoneRequest } from '@/lib/command-zone-request'

export type PairCheckResult =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string }

export async function checkSecondCommanderPair(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  deckId: number,
  userId: string,
  req: CommandZoneRequest
): Promise<PairCheckResult> {
  if (req.secondCardId === null || req.primaryCardId === null || req.secondRole === null) return { ok: true }

  const { data: rows, error } = await supabase
    .from('deck_cards')
    .select('id, card_name')
    .eq('deck_id', deckId)
    .eq('user_id', userId)
    .in('id', [req.primaryCardId, req.secondCardId])
  if (error) return { ok: false, status: 500, code: 'unknown', error: 'Could not check the commander pair.' }

  const nameOf = (id: number) => (rows ?? []).find((r: { id: number; card_name: string }) => r.id === id)?.card_name
  const primaryName = nameOf(req.primaryCardId)
  const secondName = nameOf(req.secondCardId)
  if (!primaryName || !secondName) {
    return { ok: false, status: 404, code: 'card_not_in_deck', error: 'One of those cards is not in this deck.' }
  }

  const { data: facts, error: factsErr } = await supabase
    .from('ref_cards')
    .select('name, type_line, oracle_text')
    .in('name', [primaryName, secondName])
  if (factsErr) return { ok: false, status: 500, code: 'unknown', error: 'Could not check the commander pair.' }

  const byName = new Map<string, PairCardFacts>()
  for (const f of facts ?? []) byName.set(f.name, f as PairCardFacts)
  const primary = byName.get(primaryName)
  const second = byName.get(secondName)
  if (!primary || !second) {
    return { ok: false, status: 422, code: 'pair_unverifiable', error: 'Card details for the pair are missing, so it cannot be checked.' }
  }

  const verdict = verifySecondCommander(primary, second, req.secondRole)
  if (!verdict.ok) return { ok: false, status: 422, code: 'illegal_pair', error: verdict.reason }
  return { ok: true }
}
