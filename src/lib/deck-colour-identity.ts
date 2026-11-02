/**
 * A deck's colour identity as stored on `decks.colour_identity`: letters in W U B R G order, no separators
 * ("WBR"; empty when unknown). Worked out from the commander(s)' `ref_cards.color_identity` text ("G, R, W").
 * The legality check reads this column, so it must be kept in step with the commander.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { findCommanderCards, type FlagRow } from '@/lib/commander-card-flag'

const ORDER = 'WUBRG'

/** Union of the given identity texts, as stored on the deck. Pure. */
export function deckColourIdentity(texts: Array<string | null | undefined>): string {
  const seen = new Set<string>()
  for (const text of texts) {
    for (const ch of (text ?? '').toUpperCase()) if (ORDER.includes(ch)) seen.add(ch)
  }
  return [...ORDER].filter((c) => seen.has(c)).join('')
}

/**
 * Looks the named commander(s) up and returns the stored identity string, or null when the lookup failed
 * or a name has no card data (so a caller never overwrites the column with a guess).
 */
export async function lookupDeckColourIdentity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  names: string[]
): Promise<string | null> {
  const wanted = [...new Set(names.filter((n) => n.trim() !== ''))]
  if (wanted.length === 0) return null
  const { data, error } = await supabase.from('ref_cards').select('name, color_identity').in('name', wanted)
  if (error || !data) return null
  const rows = data as Array<{ name: string; color_identity: string | null }>
  if (!wanted.every((n) => rows.some((r) => r.name === n))) return null
  return deckColourIdentity(rows.map((r) => r.color_identity))
}

export interface DeckCommanders {
  /** Every commander (the commander and any partner / background / friends forever / doctor's companion). Never a companion. */
  names: string[]
  /** Their colours together as stored text ("WUB"), or null when it could not be worked out. */
  identity: string | null
}

/** Reads the deck's commanders as equals and their combined colours. Null when the deck could not be read. */
export async function loadDeckCommanders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  deckId: number,
  userId: string
): Promise<DeckCommanders | null> {
  try {
    const { data: deck } = await supabase
      .from('decks')
      .select('commander_name')
      .eq('id', deckId)
      .eq('user_id', userId)
      .maybeSingle()
    const { data: cards, error } = await supabase
      .from('deck_cards')
      .select('id, card_name, categories, is_commander, command_zone_role')
      .eq('deck_id', deckId)
      .eq('user_id', userId)
    if (error || !cards) return null
    const commanderName = (deck as { commander_name?: string | null } | null)?.commander_name ?? null
    const names = [...new Set(findCommanderCards(cards as FlagRow[], commanderName).map((r) => r.card_name))]
    // The named commander counts even when its card is not on the list yet.
    if (commanderName && !names.includes(commanderName)) names.unshift(commanderName)
    return { names, identity: await lookupDeckColourIdentity(supabase, names) }
  } catch {
    return null
  }
}

/**
 * Works out the deck's colour identity from ALL its commanders (never the companion) and stores it on the deck.
 * Every writer that changes who the commanders are calls this after its own change, so none of them can leave one
 * commander's colours behind. Best effort: returns the stored text, or null when nothing was written.
 */
export async function syncDeckColourIdentity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  deckId: number,
  userId: string
): Promise<string | null> {
  try {
    const info = await loadDeckCommanders(supabase, deckId, userId)
    if (!info || info.identity === null) return null
    const { error } = await supabase.from('decks').update({ colour_identity: info.identity }).eq('id', deckId).eq('user_id', userId)
    return error ? null : info.identity
  } catch {
    return null
  }
}
