/**
 * A deck's colour identity as stored on `decks.colour_identity`: letters in W U B R G order, no separators
 * ("WBR"; empty when unknown). Worked out from the commander(s)' `ref_cards.color_identity` text ("G, R, W").
 * The legality check reads this column, so it must be kept in step with the commander.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

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
