/**
 * Tags for one card (read-only), from ref_card_tags joined to ref_tag_list. Keyed by oracle_id (D-003).
 * Broad Tags first, then mechanic Tags, each in display order. A card with none returns an empty list.
 * Stand-in until the card-tags-display job lands a shared read path (plan contradiction 15).
 */
import type { RefClient } from '@/lib/ref-card-text'

export interface TagChip {
  key: string
  displayName: string
  kind: 'broad' | 'mechanic'
}

interface TagListRow {
  key: string
  display_name: string
  kind: 'broad' | 'mechanic'
  display_order: number
}

/** Pure ordering: broad before mechanic, then display_order, then key so the order is stable. */
export function orderTags(rows: readonly TagListRow[]): TagChip[] {
  return [...rows]
    .sort((a, b) => {
      const kind = Number(a.kind === 'mechanic') - Number(b.kind === 'mechanic')
      if (kind !== 0) return kind
      return a.display_order - b.display_order || a.key.localeCompare(b.key)
    })
    .map((r) => ({ key: r.key, displayName: r.display_name, kind: r.kind }))
}

/** Throws on a failed read so the caller answers 500, never an empty list. */
export async function getTagsForOracleId(supabase: RefClient, oracleId: string): Promise<TagChip[]> {
  const { data: links, error } = await supabase.from('ref_card_tags').select('tag_key').eq('oracle_id', oracleId)
  if (error) throw new Error(`tags lookup failed: ${error.message}`)
  const keys = [...new Set(((links ?? []) as Array<{ tag_key: string }>).map((l) => l.tag_key))]
  if (keys.length === 0) return []
  const { data: list, error: listErr } = await supabase
    .from('ref_tag_list')
    .select('key, display_name, kind, display_order')
    .in('key', keys)
  if (listErr) throw new Error(`tag list lookup failed: ${listErr.message}`)
  return orderTags((list ?? []) as TagListRow[])
}
