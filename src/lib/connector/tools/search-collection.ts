import { z } from 'zod'
import type { CopyView } from '../../../../docs/oracle/contracts/claude-connector-slice-a.types'
import type { SearchRow } from '../../../../docs/oracle/contracts/connector-collection-search.types'
import { fetchCardFacts, factsFor } from './card-facts'
import { COPIES_PER_CARD_MAX, SEARCH_PAGE_MAX, fitRows } from '../limits'
import { LookupFailed, lookupFailed, pageNote, tooLarge, type ToolContext, type ToolOutput } from './common'
import { applyPushdown, refineFilters } from './collection-filters'
import { NARROW_COLS, groupByCardAndKind, locationOf, readDetail, readMatchingCopies, type DetailRow } from './collection-view'

export const searchCollectionInput = z.strictObject({
  query: z.string().min(1).max(100).optional().describe('Part of a card name (not case sensitive).'),
  only_free: z.boolean().optional().describe('Only copies that are free: in no deck, not In your hand, and not Missing.'),
  include_proxies: z.boolean().optional().describe('Include proxy copies. Default true.'),
  only_proxies: z.boolean().optional().describe('Only proxy copies. Cannot be combined with include_proxies=false.'),
  limit: z.number().int().min(1).max(SEARCH_PAGE_MAX).optional().describe('Rows per page, 1-25. Default 25.'),
  offset: z.number().int().min(0).optional().describe('Rows to skip, for paging.'),
}).superRefine(refineFilters)

export async function searchCollection(ctx: ToolContext, input: z.infer<typeof searchCollectionInput>): Promise<ToolOutput> {
  const limit = input.limit ?? SEARCH_PAGE_MAX
  const offset = input.offset ?? 0

  try {
    // One read of every matching copy (narrow columns). The count is exact because every matching row was read.
    const matching = await readMatchingCopies(ctx, NARROW_COLS, (q) => applyPushdown(q, input))
    const groups = groupByCardAndKind(matching)
    const totalCopies = matching.length
    const total = groups.length
    const pageGroups = groups.slice(offset, offset + limit)

    // Detail only for the page: up to 20 copies per row.
    const shownIds = pageGroups.flatMap((g) => g.copyIds.slice(0, COPIES_PER_CARD_MAX))
    const detail = new Map<number, DetailRow>((await readDetail(ctx, shownIds)).map((d) => [d.copy_id, d]))
    const facts = await fetchCardFacts(ctx, pageGroups.map((g) => g.name), { includeRulesText: true })

    const items: SearchRow[] = pageGroups.map((g) => {
      const copies: CopyView[] = g.copyIds
        .slice(0, COPIES_PER_CARD_MAX)
        .map((id) => detail.get(id))
        .filter((d): d is DetailRow => !!d)
        .map((d) => ({ copyId: d.copy_id, printingId: d.printing_id, finish: d.finish, isProxy: d.is_proxy, location: locationOf(d), missing: d.missing }))
      if (copies.length !== Math.min(g.copyIds.length, COPIES_PER_CARD_MAX)) throw new LookupFailed() // a copy vanished mid-read: never a short list
      const first = detail.get(g.copyIds[0])!
      const f = factsFor(facts, g.name, true)
      return {
        oracleId: first.oracle_id,
        name: g.name,
        typeLine: first.type_line || f.typeLine,
        facts: f,
        kind: g.kind,
        copyCount: g.copyIds.length,
        copies,
        copiesTruncated: g.copyIds.length > COPIES_PER_CARD_MAX,
      }
    })

    const build = (kept: SearchRow[]) => {
      const meta = pageNote(total, offset, kept.length, kept.length < items.length)
      return { ok: true as const, items: kept, total, totalCopies, returned: kept.length, offset, truncated: meta.truncated, ...(meta.note ? { note: meta.note } : {}) }
    }
    const fit = fitRows(items, build)
    if (!fit) return tooLarge()
    return fit.result
  } catch (e) {
    if (e instanceof LookupFailed) return lookupFailed()
    throw e
  }
}
