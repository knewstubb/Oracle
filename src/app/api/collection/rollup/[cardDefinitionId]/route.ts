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
  physicalCopyId: number
  scryfallPrintingId: string
  setCode: string
  setName: string
  isFoil: boolean
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
  const cardDefinitionId = parseInt(rawId, 10)

  if (isNaN(cardDefinitionId)) {
    return Response.json({ error: 'Card not found' }, { status: 404 })
  }

  const supabase = createAdminClient()

  // Verify the card_definition exists
  const { data: cardDef, error: cdErr } = await supabase
    .from('card_definitions')
    .select('id, type_line')
    .eq('id', cardDefinitionId)
    .single()

  if (cdErr || !cardDef) {
    return Response.json({ error: 'Card not found' }, { status: 404 })
  }

  const isBasicLand = cardDef.type_line ? /\bBasic\b/i.test(cardDef.type_line) : false

  // Get all non-proxy physical copies for this card_definition
  const { data: physicalCopies, error: pcErr } = await supabase
    .from('physical_copies')
    .select('id, scryfall_printing_id, is_foil, quantity')
    .eq('card_definition_id', cardDefinitionId)
    .eq('is_proxy', false)

  if (pcErr) {
    return Response.json({ error: pcErr.message }, { status: 500 })
  }

  // Get set info for all printing IDs
  const printingIds = (physicalCopies || [])
    .map(pc => pc.scryfall_printing_id)
    .filter((id): id is string => id != null && id !== '')

  const setInfoMap = new Map<string, { setCode: string; setName: string }>()

  if (printingIds.length > 0) {
    const { data: collRows } = await supabase
      .from('collection')
      .select('scryfall_id, set_code, edition_name')
      .in('scryfall_id', printingIds)

    for (const row of collRows || []) {
      if (row.scryfall_id && !setInfoMap.has(row.scryfall_id)) {
        setInfoMap.set(row.scryfall_id, {
          setCode: row.set_code || '',
          setName: row.edition_name || '',
        })
      }
    }

    // Fallback: look up set names from sets table
    const missingCodes = Array.from(setInfoMap.entries())
      .filter(([, v]) => !v.setName && v.setCode)
      .map(([, v]) => v.setCode)

    if (missingCodes.length > 0) {
      const { data: setsRows } = await supabase
        .from('sets')
        .select('code, name')
        .in('code', missingCodes)

      const setsLookup = new Map((setsRows || []).map(s => [s.code.toLowerCase(), s.name]))
      for (const [, info] of setInfoMap) {
        if (!info.setName && info.setCode) {
          info.setName = setsLookup.get(info.setCode.toLowerCase()) || ''
        }
      }
    }
  }

  // Get deck usage for each physical copy
  const pcIds = (physicalCopies || []).map(pc => pc.id)
  const deckUsageMap = new Map<number, DeckUsageEntry[]>()

  if (pcIds.length > 0) {
    const { data: deckUsageData } = await supabase
      .from('deck_cards')
      .select(`
        physical_copy_id,
        deck_id,
        quantity,
        decks!inner ( id, name )
      `)
      .in('physical_copy_id', pcIds)
      .not('physical_copy_id', 'is', null)

    for (const row of deckUsageData || []) {
      const deckInfo = row.decks as unknown as { id: number; name: string }
      const entries = deckUsageMap.get(row.physical_copy_id!) || []
      entries.push({
        deckId: deckInfo.id,
        deckName: deckInfo.name,
        quantity: row.quantity ?? 1,
      })
      deckUsageMap.set(row.physical_copy_id!, entries)
    }
  }

  // Build subgroup rows
  const rows: PrintingSubgroupRow[] = []

  for (const pc of physicalCopies || []) {
    const isFoil = Boolean(pc.is_foil)
    const scryfallPrintingId = pc.scryfall_printing_id ?? ''
    const deckUsage = deckUsageMap.get(pc.id) || []
    const inUseCount = deckUsage.reduce((sum, d) => sum + d.quantity, 0)
    const setInfo = scryfallPrintingId ? setInfoMap.get(scryfallPrintingId) : undefined

    // Owned valuation: null for basic lands
    let ownedValuation: number | null = null
    if (!isBasicLand && scryfallPrintingId) {
      ownedValuation = await getOwnedValuation(scryfallPrintingId, isFoil)
    }

    rows.push({
      physicalCopyId: pc.id,
      scryfallPrintingId,
      setCode: setInfo?.setCode || '',
      setName: setInfo?.setName || '',
      isFoil,
      quantity: pc.quantity ?? 0,
      inUseCount,
      ownedValuation,
      deckUsage,
    })
  }

  // Count proxy placements
  const { count: proxyPlacementCount } = await supabase
    .from('deck_cards')
    .select('id', { count: 'exact', head: true })
    .not('physical_copy_id', 'is', null)
    .in(
      'physical_copy_id',
      // Get proxy physical_copy IDs for this card_definition
      (await supabase
        .from('physical_copies')
        .select('id')
        .eq('card_definition_id', cardDefinitionId)
        .eq('is_proxy', true)
      ).data?.map(pc => pc.id) || []
    )

  const response: ExpandResponse = {
    subgroups: rows,
    proxyPlacementCount: proxyPlacementCount ?? 0,
  }

  return Response.json(response)
}
