import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/collection/rollup-v2
 *
 * Returns the instance-level collection rollup from the `collection_rollup` view.
 * One row per oracle_id with owned_count, proxy_count, allocated_count, shortfall.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

export interface RollupV2Row {
  oracleId: string
  cardName: string
  ownedCount: number
  proxyCount: number
  allocatedCount: number
  shortfall: number
  typeLine: string
}

export interface RollupV2Response {
  rows: RollupV2Row[]
}

/** Shape of a row returned by the collection_rollup view */
interface CollectionRollupViewRow {
  oracle_id: string
  card_name: string
  type_line: string | null
  user_id: string
  owned_count: number
  proxy_count: number
  allocated_count: number
  shortfall: number
}

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()

  try {
    // Query the collection_rollup view — paginate to get ALL rows
    // (Supabase defaults to 1000 row limit per request)
    const PAGE_SIZE = 1000
    let allData: CollectionRollupViewRow[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data, error } = await (supabase as any)
        .from('collection_rollup')
        .select('oracle_id, card_name, type_line, owned_count, proxy_count, allocated_count, shortfall')
        .eq('user_id', authResult.id)
        .order('card_name', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) {
        // If the view doesn't exist yet, fall back gracefully
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return Response.json({ rows: [] } as RollupV2Response)
        }
        throw error
      }

      if (data) allData.push(...data)
      hasMore = (data?.length ?? 0) === PAGE_SIZE
      offset += PAGE_SIZE
    }

    // Deduplicate by card_name — different card_definitions can share a name
    // (e.g., same card from different sets). Aggregate counts per unique name.
    const nameMap = new Map<string, RollupV2Row>()
    for (const row of allData) {
      const cardName = row.card_name ?? ''
      const existing = nameMap.get(cardName)
      if (existing) {
        existing.ownedCount += Number(row.owned_count) || 0
        existing.proxyCount += Number(row.proxy_count) || 0
        existing.allocatedCount += Number(row.allocated_count) || 0
        existing.shortfall = Math.max(existing.shortfall, Number(row.shortfall) || 0)
      } else {
        nameMap.set(cardName, {
          oracleId: row.oracle_id ?? '',
          cardName,
          ownedCount: Number(row.owned_count) || 0,
          proxyCount: Number(row.proxy_count) || 0,
          allocatedCount: Number(row.allocated_count) || 0,
          shortfall: Number(row.shortfall) || 0,
          typeLine: row.type_line ?? '',
        })
      }
    }

    const rows: RollupV2Row[] = [...nameMap.values()]

    return Response.json({ rows } as RollupV2Response)
  } catch (error) {
    console.error('Failed to load rollup-v2:', error)
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return Response.json(
      { error: 'Failed to load collection rollup', detail: message },
      { status: 500 }
    )
  }
}
