import { createAdminClient } from '@/lib/supabase'
import { getOwnedValuation } from '@/lib/price-store'
import { requireAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

export interface DeckUsageEntry {
  deckId: number
  deckName: string
  quantity: number
}

export interface PrintingSubgroupRow {
  /** @deprecated Use copyId instead */
  physicalCopyId: number
  copyId: number
  /** @deprecated Use printingId instead */
  scryfallPrintingId: string
  printingId: string
  setCode: string
  setName: string
  /** @deprecated Use finish instead */
  isFoil: boolean
  finish: string
  quantity: number
  inUseCount: number
  ownedValuation: number | null
  deckUsage: DeckUsageEntry[]
}

export interface ExpandResponse {
  subgroups: PrintingSubgroupRow[]
  proxyPlacementCount: number
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cardDefinitionId: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { cardDefinitionId: rawId } = await params
  // Support both cardDefinitionId (deprecated) and cardId naming
  const cardId = parseInt(rawId, 10)

  if (isNaN(cardId)) {
    return Response.json({ error: 'Card not found' }, { status: 404 })
  }

  const supabase = createAdminClient()

  // Verify the card exists
  const { data: cardDef, error: cdErr } = await supabase
    .from('user_cards')
    .select('id, type_line')
    .eq('id', cardId)
    .single()

  if (cdErr || !cardDef) {
    return Response.json({ error: 'Card not found' }, { status: 404 })
  }

  const isBasicLand = cardDef.type_line ? /\bBasic\b/i.test(cardDef.type_line) : false

  // Get all non-proxy collection copies for this card
  const { data: copies, error: pcErr } = await supabase
    .from('user_copies')
    .select('id, printing_id, finish')
    .eq('card_id', cardId)
    .eq('is_proxy', false)

  if (pcErr) {
    return Response.json({ error: pcErr.message }, { status: 500 })
  }

  // Get set info for all printing IDs
  const printingIds = (copies || [])
    .map(pc => pc.printing_id)
    .filter((id): id is string => id != null && id !== '')

  const setInfoMap = new Map<string, { setCode: string; setName: string }>()

  if (printingIds.length > 0) {
    // Get set info directly from printings (authoritative source)
    const { data: printingRows } = await supabase
      .from('ref_printings')
      .select('scryfall_id, set_code, set_name')
      .in('scryfall_id', printingIds)

    for (const row of printingRows || []) {
      if (row.scryfall_id && !setInfoMap.has(row.scryfall_id)) {
        setInfoMap.set(row.scryfall_id, {
          setCode: row.set_code || '',
          setName: row.set_name || '',
        })
      }
    }
  }

  // Get deck usage for each copy
  const copyIds = (copies || []).map(pc => pc.id)
  const deckUsageMap = new Map<number, DeckUsageEntry[]>()

  if (copyIds.length > 0) {
    const { data: deckUsageData } = await supabase
      .from('deck_cards')
      .select(`
        copy_id,
        deck_id,
        quantity,
        decks!deck_cards_deck_id_fkey!inner ( id, name )
      `)
      .in('copy_id', copyIds)
      .not('copy_id', 'is', null)

    for (const row of deckUsageData || []) {
      const deckInfo = row.decks as unknown as { id: number; name: string }
      const entries = deckUsageMap.get(row.copy_id!) || []
      entries.push({
        deckId: deckInfo.id,
        deckName: deckInfo.name,
        quantity: row.quantity ?? 1,
      })
      deckUsageMap.set(row.copy_id!, entries)
    }
  }

  // Build subgroup rows
  const rows: PrintingSubgroupRow[] = []

  for (const pc of copies || []) {
    const finish = pc.finish ?? 'nonfoil'
    const isFoil = finish === 'foil' || finish === 'etched'
    const printingId = pc.printing_id ?? ''
    const deckUsage = deckUsageMap.get(pc.id) || []
    const inUseCount = deckUsage.reduce((sum, d) => sum + d.quantity, 0)
    const setInfo = printingId ? setInfoMap.get(printingId) : undefined

    // Owned valuation: null for basic lands
    let ownedValuation: number | null = null
    if (!isBasicLand && printingId) {
      ownedValuation = await getOwnedValuation(printingId, isFoil)
    }

    rows.push({
      // New field names
      copyId: pc.id,
      printingId,
      finish,
      // Deprecated aliases for backwards compatibility
      physicalCopyId: pc.id,
      scryfallPrintingId: printingId,
      isFoil,
      setCode: setInfo?.setCode || '',
      setName: setInfo?.setName || '',
      quantity: 1, // Instance-level model: one row = one physical card
      inUseCount,
      ownedValuation,
      deckUsage,
    })
  }

  // Count proxy placements
  const { count: proxyPlacementCount } = await supabase
    .from('deck_cards')
    .select('id', { count: 'exact', head: true })
    .not('copy_id', 'is', null)
    .in(
      'copy_id',
      // Get proxy copy IDs for this card
      (await supabase
        .from('user_copies')
        .select('id')
        .eq('card_id', cardId)
        .eq('is_proxy', true)
      ).data?.map(pc => pc.id) || []
    )

  const response: ExpandResponse = {
    subgroups: rows,
    proxyPlacementCount: proxyPlacementCount ?? 0,
  }

  return Response.json(response)
}
