/**
 * Card text (type line and Oracle text) by card name, from the shared card reference table `ref_cards`.
 * Exact name first, then the front face of a double-faced card ("A // B"). Read-only.
 * Shared by Deck health (the deck's own cards) and the commander targets (EDHREC's cards).
 */

/** The small slice of the Supabase client used here (the admin client satisfies it). */
export interface RefClient {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface RefRow {
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
  supabase: RefClient,
  names: string[],
): Promise<{ map: Map<string, RefRow>; error: string | null }> {
  const map = new Map<string, RefRow>()
  const unique = [...new Set(names)]

  const batches: string[][] = []
  for (let i = 0; i < unique.length; i += NAME_BATCH) batches.push(unique.slice(i, i + NAME_BATCH))
  const results = await Promise.all(batches.map((batch) => supabase.from('ref_cards').select('name, type_line, oracle_text').in('name', batch)))
  for (const { data, error } of results) {
    if (error) return { map, error: error.message }
    for (const row of (data ?? []) as RefRow[]) map.set(row.name, row)
  }

  // Deck rows for double-faced cards may hold only the front face name.
  const missing = unique.filter((n) => !map.has(n))
  const fallbacks = await Promise.all(
    missing.map(async (name) => {
      const front = name.split(' // ')[0]
      const { data, error } = await supabase
        .from('ref_cards')
        .select('name, type_line, oracle_text')
        .ilike('name', `${escapeLike(front)} // %`)
        .limit(1)
      return { name, row: ((data ?? []) as RefRow[])[0], error }
    }),
  )
  for (const f of fallbacks) {
    if (f.error) return { map, error: f.error.message }
    if (f.row) map.set(f.name, f.row)
  }

  return { map, error: null }
}
