import type { CollectionSummary } from '../../../../docs/oracle/contracts/claude-connector-slice-a.types'
import { LookupFailed, lookupFailed, must, type ToolContext, type ToolOutput } from './common'

async function count(ctx: ToolContext, table: string, refine?: (q: ReturnType<ToolContext['db']['select']>) => ReturnType<ToolContext['db']['select']>): Promise<number> {
  let q = ctx.db.select(table, 'id', { count: 'exact', head: true }).eq('user_id', ctx.userId)
  if (refine) q = refine(q)
  const r = await must(q)
  if (typeof r.count !== 'number') throw new LookupFailed()
  return r.count
}

export async function getCollectionSummary(ctx: ToolContext): Promise<ToolOutput> {
  try {
    const [distinctCards, totalCopies, proxyCopies, originalCopies, missingCopies, copiesInStorage, copiesInDecks] = await Promise.all([
      count(ctx, 'user_cards'),
      count(ctx, 'user_copies'),
      count(ctx, 'user_copies', (q) => q.eq('is_proxy', true)),
      count(ctx, 'user_copies', (q) => q.eq('is_proxy', false)),
      count(ctx, 'user_copies', (q) => q.eq('missing', true)),
      count(ctx, 'user_copies', (q) => q.not('location_id', 'is', null)),
      count(ctx, 'deck_cards', (q) => q.not('copy_id', 'is', null)),
    ])
    const body: CollectionSummary = { ok: true, distinctCards, totalCopies, proxyCopies, originalCopies, copiesInDecks, copiesInStorage, missingCopies }
    return body as unknown as ToolOutput
  } catch (e) {
    if (e instanceof LookupFailed) return lookupFailed()
    throw e
  }
}
