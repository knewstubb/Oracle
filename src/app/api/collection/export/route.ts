/**
 * GET /api/collection/export
 *
 * Exports the user's entire collection as a CSV file.
 * Format is compatible with re-import into The Oracle, Archidekt, and Moxfield.
 *
 * Columns: Name, Quantity, Edition Code, Edition Name, Collector Number,
 *          Scryfall ID, Scryfall Oracle ID, Finish, Condition, Proxy,
 *          Purchase Price, Date Added
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

const PAGE_SIZE = 1000

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const supabase = createAdminClient()

  // Fetch all physical copies with their card definition info
  const allCopies: any[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('physical_copies')
      .select(`
        id,
        scryfall_printing_id,
        is_foil,
        is_proxy,
        condition,
        missing,
        purchase_price_usd,
        created_at,
        card_definitions!physical_copies_card_definition_id_fkey(card_name, oracle_id)
      `)
      .eq('user_id', userId)
      .eq('missing', false)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) break
    allCopies.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // Resolve set codes and collector numbers from Scryfall printing IDs
  // We'll fetch from the collection table which caches this info
  const printingIds = [...new Set(allCopies.map(c => c.scryfall_printing_id).filter(Boolean))]
  const printingInfoMap = new Map<string, { setCode: string; editionName: string; collectorNumber: string }>()

  // Batch fetch from collection table (has set_code, edition_name)
  for (let i = 0; i < printingIds.length; i += PAGE_SIZE) {
    const batch = printingIds.slice(i, i + PAGE_SIZE)
    const { data: collRows } = await supabase
      .from('collection')
      .select('scryfall_id, set_code, edition_name, collector_number')
      .in('scryfall_id', batch)

    for (const row of collRows ?? []) {
      printingInfoMap.set(row.scryfall_id, {
        setCode: row.set_code ?? '',
        editionName: row.edition_name ?? '',
        collectorNumber: row.collector_number ?? '',
      })
    }
  }

  // Build CSV
  const headers = [
    'Name',
    'Quantity',
    'Edition Code',
    'Edition Name',
    'Collector Number',
    'Scryfall ID',
    'Scryfall Oracle ID',
    'Finish',
    'Condition',
    'Proxy',
    'Purchase Price',
    'Date Added',
  ]

  const rows: string[] = [headers.join(',')]

  for (const copy of allCopies) {
    const cardDef = copy.card_definitions as any
    const cardName = cardDef?.card_name ?? ''
    const oracleId = cardDef?.oracle_id ?? ''
    const printingInfo = printingInfoMap.get(copy.scryfall_printing_id) ?? { setCode: '', editionName: '', collectorNumber: '' }

    const finish = copy.is_foil ? 'Foil' : 'Normal'
    const condition = copy.condition ?? ''
    const isProxy = copy.is_proxy ? 'true' : 'false'
    const purchasePrice = copy.purchase_price_usd != null ? String(copy.purchase_price_usd) : ''
    const dateAdded = copy.created_at ? copy.created_at.split('T')[0] : ''

    const row = [
      csvEscape(cardName),
      '1', // Each physical copy is one instance
      csvEscape(printingInfo.setCode),
      csvEscape(printingInfo.editionName),
      csvEscape(printingInfo.collectorNumber),
      copy.scryfall_printing_id ?? '',
      oracleId,
      finish,
      csvEscape(condition),
      isProxy,
      purchasePrice,
      dateAdded,
    ]

    rows.push(row.join(','))
  }

  const csv = rows.join('\n')
  const filename = `oracle-collection-${new Date().toISOString().split('T')[0]}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

/** Escape a CSV field — wraps in quotes if it contains commas, quotes, or newlines */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
