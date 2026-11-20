import { z } from 'zod'
import type { CopyView } from '../../../../docs/oracle/contracts/claude-connector-slice-a.types'
import type { SearchRow } from '../../../../docs/oracle/contracts/connector-collection-search.types'
import { fetchCardFacts, factsFor } from './card-facts'
import { COPIES_PER_CARD_MAX, SEARCH_PAGE_MAX, fitRows } from '../limits'
import { LookupFailed, lookupFailed, pageNote, tooLarge, type ToolContext, type ToolOutput } from './common'
import { filterFields, refineFilters } from './collection-filters'
import { ROLE_RULES_VERSION, classifyNames, findMatchingCopies } from './collection-query'
import { tagFields, tagNamesByOracleId, type TagFields } from './card-tags-tool'
import { fetchPrintingFacts, rarityField } from './card-printing-facts'
import { groupByCardAndKind, locationOf, readDetail, sortGroups, type DetailRow } from './collection-view'

export const searchCollectionInput = z
  .strictObject({
    ...filterFields,
    include_rules_text: z.boolean().optional().describe('Include each card\'s rules text. Default false. Send true to read rules text.'),
    sort_by: z.enum(['name', 'mana_value']).optional().describe('Order of the results: name (default) or mana_value. Cards with no card facts always come last. Paging follows this order.'),
    sort_order: z.enum(['asc', 'desc']).optional().describe('asc (default) or desc. Cards with no card facts stay last either way.'),
    limit: z.number().int().min(1).max(SEARCH_PAGE_MAX).optional().describe('Rows per page, 1-25. Default 25.'),
    offset: z.number().int().min(0).optional().describe('Rows to skip, for paging.'),
  })
  .superRefine(refineFilters)

export async function searchCollection(ctx: ToolContext, input: z.infer<typeof searchCollectionInput>): Promise<ToolOutput> {
  const limit = input.limit ?? SEARCH_PAGE_MAX
  const offset = input.offset ?? 0
  const includeRulesText = input.include_rules_text ?? false

  try {
    // One read of every matching copy (narrow columns). The count is exact because every matching row was read.
    const sortBy = input.sort_by ?? 'name'
    const match = await findMatchingCopies(ctx, input, sortBy === 'mana_value' ? { extraCols: ['mana_value'] } : {})
    const groups = sortGroups(groupByCardAndKind(match.rows), sortBy, input.sort_order ?? 'asc')
    const totalCopies = match.rows.length
    const total = groups.length
    const pageGroups = groups.slice(offset, offset + limit)

    // Detail only for the page: up to 20 copies per row.
    const shownIds = pageGroups.flatMap((g) => g.copyIds.slice(0, COPIES_PER_CARD_MAX))
    const detail = new Map<number, DetailRow>((await readDetail(ctx, shownIds)).map((d) => [d.copy_id, d]))
    const facts = await fetchCardFacts(ctx, pageGroups.map((g) => g.name), { includeRulesText })
    // Roles shown on each row come from the same classifier; reuse the role step's result when there was one.
    const roleInfo = match.roleInfo ?? (await classifyNames(ctx, pageGroups.map((g) => g.name)))

    // Tags for every card on the page: one batched read, never one per card. A failed read is marked, never shown as "no Tags".
    const pageOracleIds = pageGroups.map((g) => detail.get(g.copyIds[0])?.oracle_id).filter((x): x is string => !!x)
    const tagsById = await tagNamesByOracleId(ctx, pageOracleIds)
    // Rarity of each shown copy's printing: one batched read for the page. A failed read is marked on the copy, never guessed.
    const rarityById = await fetchPrintingFacts(ctx, [...detail.values()].map((d) => d.printing_id).filter((x): x is string => !!x), { pauper: false })
    const items: (SearchRow & TagFields)[] = pageGroups.map((g) => {
      const copies: CopyView[] = g.copyIds
        .slice(0, COPIES_PER_CARD_MAX)
        .map((id) => detail.get(id))
        .filter((d): d is DetailRow => !!d)
        .map((d) => ({ copyId: d.copy_id, printingId: d.printing_id, ...rarityField(rarityById, d.printing_id), finish: d.finish, isProxy: d.is_proxy, location: locationOf(d), missing: d.missing }))
      if (copies.length !== Math.min(g.copyIds.length, COPIES_PER_CARD_MAX)) throw new LookupFailed() // a copy vanished mid-read: never a short list
      const first = detail.get(g.copyIds[0])!
      const f = factsFor(facts, g.name, includeRulesText)
      const info = roleInfo.get(g.name)
      return {
        oracleId: first.oracle_id,
        name: g.name,
        typeLine: first.type_line || f.typeLine,
        facts: f,
        ...(first.keywords ? { keywords: first.keywords } : {}),
        ...(info?.hasText ? { roles: info.roles } : {}),
        ...tagFields(tagsById, first.oracle_id),
        kind: g.kind,
        copyCount: g.copyIds.length,
        copies,
        copiesTruncated: g.copyIds.length > COPIES_PER_CARD_MAX,
      }
    })

    const build = (kept: (SearchRow & TagFields)[]) => {
      const meta = pageNote(total, offset, kept.length, kept.length < items.length)
      const note = [meta.note, ...match.notes].filter(Boolean).join(' ') || undefined
      return {
        ok: true as const,
        items: kept,
        total,
        totalCopies,
        returned: kept.length,
        offset,
        truncated: meta.truncated,
        ...(note ? { note } : {}),
        ...(match.coverage ? { filterCoverage: match.coverage } : {}),
        ...(match.knownPlaces ? { knownPlaces: match.knownPlaces } : {}),
        ...(input.roles ? { roleRulesVersion: ROLE_RULES_VERSION } : {}),
      }
    }
    const fit = fitRows(items, build)
    if (!fit) return tooLarge()
    return fit.result
  } catch (e) {
    if (e instanceof LookupFailed) return lookupFailed()
    throw e
  }
}
