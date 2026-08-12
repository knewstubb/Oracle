/**
 * GET /api/collection/export
 *
 * Exports the user's entire collection as a CSV file.
 * Format is compatible with re-import into The Oracle, Archidekt, and Moxfield.
 *
 * Columns: Name, Quantity, Edition Code, Edition Name, Collector Number,
 *          Scryfall ID, Scryfall Oracle ID, Finish, Condition, Proxy,
 *          Purchase Price, Date Added
 *
 * Schema notes (post-migration):
 *   - collection table holds all copies
 *   - finish: 'nonfoil' | 'foil' | 'etched' (replaces is_foil boolean)
 *   - card_id references cards table (replaces card_definition_id → card_definitions)
 *   - printing_id references scryfall_printings (replaces scryfall_printing_id)
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

  // Fetch all collection copies with their card info
  const allCopies: any[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('user_copies')
      .select(`
        id,
        printing_id,
        finish,
        is_proxy,
        condition,
        purchase_price,
        created_at,
        user_cards!user_copies_card_id_fkey(card_name, oracle_id)
      `)
      .eq('user_id', userId)
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
  const printingIds = [...new Set(allCopies.map(c => c.printing_id).filter(Boolean))]
  const printingInfoMap = new Map<string, { setCode: string; editionName: string; collectorNumber: string }>()

  // Batch fetch from ref_printings table
  for (let i = 0; i < printingIds.length; i += PAGE_SIZE) {
    const batch = printingIds.slice(i, i + PAGE_SIZE)
    const { data: printingRows } = await supabase
      .from('ref_printings')
      .select('scryfall_id, set_code, set_name, collector_number')
      .in('scryfall_id', batch)

    for (const row of printingRows ?? []) {
      printingInfoMap.set(row.scryfall_id, {
        setCode: row.set_code ?? '',
        editionName: row.set_name ?? '',
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
    const card = copy.user_cards as any
    const cardName = card?.card_name ?? ''
    const oracleId = card?.oracle_id ?? ''
    const printingInfo = printingInfoMap.get(copy.printing_id) ?? { setCode: '', editionName: '', collectorNumber: '' }

    // Map finish string to export format
    const finishLabel = copy.finish === 'foil' ? 'Foil' : copy.finish === 'etched' ? 'Etched' : 'Normal'
    const condition = copy.condition ?? ''
    const isProxy = copy.is_proxy ? 'true' : 'false'
    const purchasePrice = copy.purchase_price != null ? String(copy.purchase_price) : ''
    const dateAdded = copy.created_at ? copy.created_at.split('T')[0] : ''

    const row = [
      csvEscape(cardName),
      '1', // Each collection copy is one instance
      csvEscape(printingInfo.setCode),
      csvEscape(printingInfo.editionName),
      csvEscape(printingInfo.collectorNumber),
      copy.printing_id ?? '',
      oracleId,
      finishLabel,
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
