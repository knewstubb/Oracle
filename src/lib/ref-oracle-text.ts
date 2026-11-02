import { createAdminClient } from '@/lib/supabase'

/** Oracle text by lower-case card name from ref_cards (read-only). Used to spot a companion in a Commander section. */
export async function loadOracleTextByName(names: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (names.length === 0) return out
  const { data, error } = await createAdminClient().from('ref_cards').select('name, oracle_text').in('name', names)
  if (error) throw new Error(error.message)
  for (const row of data ?? []) out.set(row.name.toLowerCase(), row.oracle_text)
  return out
}
