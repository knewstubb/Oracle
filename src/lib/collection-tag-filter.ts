/**
 * Collection screen Tag filter (server side). The toolbar sends `tags` (comma-separated stored keys) and `tagsMatch`
 * ('all' default, or 'any'). The server asks the shared Tag read path which oracle ids carry the Tags, then limits the
 * list to those cards. Spec: docs/oracle/specs/deck-rail-strategy-tags.md section 4b.
 */
import { createAuthServerClient } from '@/lib/supabase-server'
import { oracleIdsWithTags, supabaseTagReader, resolveTag, type TagMatch } from '@/lib/card-tags-read'

export interface TagFilter {
  keys: string[]
  match: TagMatch
}
export class InvalidTagFilter extends Error {}

/** null when no Tags were asked for. A name that is not one of the 40 Tags throws InvalidTagFilter (the route answers 400). */
export function parseTagFilter(rawTags: string | null, rawMatch: string | null): TagFilter | null {
  const parts = (rawTags ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const keys: string[] = []
  for (const p of parts) {
    const tag = resolveTag(p)
    if (!tag) throw new InvalidTagFilter(`Unknown Tag: ${p}`)
    if (!keys.includes(tag.key)) keys.push(tag.key)
  }
  return { keys, match: rawMatch === 'any' ? 'any' : 'all' }
}

/** The oracle ids that carry the chosen Tags. Throws when the Tag read fails, so the screen shows its error state, never an empty list. */
export async function loadTagFilterOracleIds(filter: TagFilter): Promise<Set<string>> {
  const reader = supabaseTagReader(await createAuthServerClient())
  const r = await oracleIdsWithTags(reader, filter.keys, filter.match)
  if (r.status !== 'ok') throw new Error('Could not read the Tags')
  return r.ids
}
