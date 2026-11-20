// Tags in the connector: the read-only database handle adapted to the shared Tag read path (src/lib/card-tags-read.ts),
// so Claude's search, get_deck and the collection screen filter use the same code and give the same cards.
// Tags are global (no user id), read-only, and never change a Category. Spec: deck-rail-strategy-tags.md section 4c.
import { getCardTags, ALL_TAGS, type TagReadResult, type TagRowReader } from '../../card-tags-read'
import { fetchAll } from './common'
import type { ReadOnlyDb, ReadQuery, ToolContext } from '../user-client'

export function connectorTagReader(db: ReadOnlyDb): TagRowReader {
  const table = (): ReadQuery => db.select('ref_card_tags', 'oracle_id, tag_key')
  const run = async (q: ReadQuery): Promise<TagReadResult> => {
    const r = await q
    return { data: Array.isArray(r.data) ? (r.data as TagReadResult['data']) : null, error: r.error }
  }
  return {
    byOracleIds: (ids, from, to) => run(table().in('oracle_id', ids).order('oracle_id').order('tag_key').range(from, to)),
    byTagKey: (key, from, to) => run(table().eq('tag_key', key).order('oracle_id').range(from, to)),
  }
}

/** Every Tag's name, for the tool's error message. */
export const TAG_NAMES: string[] = ALL_TAGS.map((t) => t.name)

/**
 * Tag names (broad first, then mechanic, in the Tag list's order) for each oracle id, in one batched read.
 * Returns null when the read failed: the caller says `tags_unavailable`, never an empty list.
 */
export async function tagNamesByOracleId(ctx: ToolContext, oracleIds: string[]): Promise<Map<string, string[]> | null> {
  if (oracleIds.length === 0) return new Map()
  const r = await getCardTags(connectorTagReader(ctx.db), oracleIds)
  if (r.status !== 'ok') return null
  return new Map([...r.byOracleId].map(([id, tags]) => [id, tags.map((t) => t.name)]))
}

const PRINTING_BATCH = 100
/** oracle_id for each printing (scryfall_id), batched. Returns null when the read failed. */
export async function oracleIdsByPrinting(ctx: ToolContext, printingIds: string[]): Promise<Map<string, string> | null> {
  const unique = [...new Set(printingIds.filter(Boolean))]
  const out = new Map<string, string>()
  try {
    for (let i = 0; i < unique.length; i += PRINTING_BATCH) {
      const batch = unique.slice(i, i + PRINTING_BATCH)
      const got = await fetchAll<{ scryfall_id: string; oracle_id: string | null }>(() =>
        ctx.db.select('ref_printings', 'scryfall_id, oracle_id').in('scryfall_id', batch).order('scryfall_id'),
      )
      for (const g of got) if (g.oracle_id) out.set(g.scryfall_id, g.oracle_id)
    }
  } catch {
    return null
  }
  return out
}

/** Tags on a result row: every Tag the card has (no cut to five), or `tags_unavailable` when the read failed. */
export interface TagFields {
  tags?: string[]
  tags_unavailable?: true
}
export function tagFields(byId: Map<string, string[]> | null, oracleId: string | null | undefined): TagFields {
  if (!byId || !oracleId) return { tags_unavailable: true }
  return { tags: byId.get(oracleId) ?? [] }
}
