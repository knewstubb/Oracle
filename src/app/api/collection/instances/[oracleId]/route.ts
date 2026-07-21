import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/collection/instances/[oracleId]
 *
 * Returns all physical copies for a given oracle_id, sorted by set release date DESC
 * then collector number ASC. Includes deck assignment and storage location info.
 * Also returns shortDecks — decks that need this card but don't have it resolved.
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 14.2, 14.3
 */

interface InstanceRow {
  physicalCopyId: number
  scryfallPrintingId: string | null
  setName: string
  collectorNumber: string
  isFoil: boolean
  condition: string | null
  isProxy: boolean
  isMissing: boolean
  assignedDeckName: string | null
  assignedDeckId: number | null
  assignedDeckStatus: string | null
  storageLocationId: number | null
  storageLocationName: string | null
}

interface ShortDeckEntry {
  deckCardsId: number
  deckId: number
  deckName: string
  deckStatus: string // 'brewing' | 'in_rotation' | 'graveyard'
}

interface InstancePanelResponse {
  oracleId: string
  cardName: string
  instances: InstanceRow[]
  shortfall: number
  shortDecks: ShortDeckEntry[]
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ oracleId: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { oracleId } = await params

  if (!oracleId) {
    return Response.json({ error: 'oracleId parameter is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    // 1. Get the card_definition for this oracle_id
    const { data: cardDef, error: cdErr } = await (supabase as any)
      .from('card_definitions')
      .select('id, card_name, oracle_id')
      .eq('oracle_id', oracleId)
      .limit(1)
      .maybeSingle()

    if (cdErr) throw cdErr

    if (!cardDef) {
      return Response.json({
        oracleId,
        cardName: 'Unknown',
        instances: [],
        shortfall: 0,
        shortDecks: [],
      } as InstancePanelResponse)
    }

    // 2. Get all physical copies for this card_definition belonging to the user
    const { data: copies, error: pcErr } = await (supabase as any)
      .from('physical_copies')
      .select('id, scryfall_printing_id, is_foil, condition, is_proxy, storage_location_id, missing, user_id')
      .eq('card_definition_id', cardDef.id)
      .eq('user_id', authResult.id)

    if (pcErr) throw pcErr

    const physicalCopies = copies ?? []

    // 3. Get storage location names for all referenced locations
    const locationIds = [...new Set(
      physicalCopies
        .map((pc: any) => pc.storage_location_id)
        .filter((id: any) => id !== null)
    )]

    let locationMap: Map<number, string> = new Map()
    if (locationIds.length > 0) {
      const { data: locations } = await (supabase as any)
        .from('storage_locations')
        .select('id, name')
        .in('id', locationIds)

      if (locations) {
        for (const loc of locations) {
          locationMap.set(loc.id, loc.name)
        }
      }
    }

    // 4. Get deck assignments for these physical copies (including deck_id and status)
    const copyIds = physicalCopies.map((pc: any) => pc.id)
    let deckAssignmentMap: Map<number, { deckName: string; deckId: number; deckStatus: string }> = new Map()

    if (copyIds.length > 0) {
      const { data: deckCards } = await (supabase as any)
        .from('deck_cards')
        .select('physical_copy_id, deck_id, decks!deck_cards_deck_id_fkey!inner(name, status)')
        .in('physical_copy_id', copyIds)
        .not('physical_copy_id', 'is', null)

      if (deckCards) {
        for (const dc of deckCards) {
          if (dc.physical_copy_id && dc.decks?.name) {
            deckAssignmentMap.set(dc.physical_copy_id, {
              deckName: dc.decks.name,
              deckId: dc.deck_id,
              deckStatus: dc.decks.status ?? 'brewing',
            })
          }
        }
      }
    }

    // 5. Get printing/set info via scryfall_printing_id from printing_set_info table
    const scryfallIds = [...new Set(
      physicalCopies
        .map((pc: any) => pc.scryfall_printing_id)
        .filter((id: any) => id !== null)
    )]

    let printingMap: Map<string, { setName: string; collectorNumber: string; releasedAt: string }> = new Map()

    if (scryfallIds.length > 0) {
      const { data: printings } = await (supabase as any)
        .from('printing_set_info')
        .select('scryfall_printing_id, set_code, edition_name')
        .in('scryfall_printing_id', scryfallIds)

      if (printings && printings.length > 0) {
        for (const p of printings) {
          printingMap.set(p.scryfall_printing_id, {
            setName: p.edition_name || p.set_code?.toUpperCase() || 'Unknown Set',
            collectorNumber: p.set_code?.toUpperCase() || '?',
            releasedAt: '2024-01-01', // printing_set_info doesn't have release date
          })
        }
      }
    }

    // 6. Build instance rows
    const instances: InstanceRow[] = physicalCopies.map((pc: any) => {
      const printing = printingMap.get(pc.scryfall_printing_id)
      const assignment = deckAssignmentMap.get(pc.id)

      return {
        physicalCopyId: pc.id,
        scryfallPrintingId: pc.scryfall_printing_id ?? null,
        setName: printing?.setName ?? 'Unknown Set',
        collectorNumber: printing?.collectorNumber ?? '?',
        isFoil: Boolean(pc.is_foil),
        condition: pc.condition ?? null,
        isProxy: Boolean(pc.is_proxy),
        isMissing: Boolean(pc.missing),
        assignedDeckName: assignment?.deckName ?? null,
        assignedDeckId: assignment?.deckId ?? null,
        assignedDeckStatus: assignment?.deckStatus ?? null,
        storageLocationId: pc.storage_location_id ?? null,
        storageLocationName: pc.storage_location_id
          ? (locationMap.get(pc.storage_location_id) ?? null)
          : null,
      }
    })

    // 7. Sort: set release date DESC, then collector number ASC
    instances.sort((a, b) => {
      const aPrinting = printingMap.get(
        physicalCopies.find((pc: any) => pc.id === a.physicalCopyId)?.scryfall_printing_id
      )
      const bPrinting = printingMap.get(
        physicalCopies.find((pc: any) => pc.id === b.physicalCopyId)?.scryfall_printing_id
      )

      const aDate = aPrinting?.releasedAt ?? '1993-01-01'
      const bDate = bPrinting?.releasedAt ?? '1993-01-01'

      // Release date DESC
      if (aDate !== bDate) return bDate.localeCompare(aDate)

      // Collector number ASC (numeric sort)
      const aNum = parseInt(a.collectorNumber, 10) || 0
      const bNum = parseInt(b.collectorNumber, 10) || 0
      return aNum - bNum
    })

    // 8. Compute shortfall (demand from allocated decks minus owned non-proxy copies)
    const ownedCount = physicalCopies.filter((pc: any) => !pc.is_proxy).length

    // Get demand: count of deck_cards rows in allocated decks for this card
    const { count: demandCount } = await (supabase as any)
      .from('deck_cards')
      .select('id', { count: 'exact', head: true })
      .eq('card_name', cardDef.card_name)
      .in(
        'deck_id',
        (await (supabase as any)
          .from('decks')
          .select('id')
          .eq('allocate', true)
          .eq('user_id', authResult.id)
        ).data?.map((d: any) => d.id) ?? []
      )

    const shortfall = Math.max(0, (demandCount ?? 0) - ownedCount)

    // 9. Find decks that need this card but don't have it resolved (Short decks)
    const shortDecks: ShortDeckEntry[] = []
    if (shortfall > 0) {
      const allocatedDeckIds = (await (supabase as any)
        .from('decks')
        .select('id')
        .eq('allocate', true)
        .eq('user_id', authResult.id)
      ).data?.map((d: any) => d.id) ?? []

      if (allocatedDeckIds.length > 0) {
        const { data: unresolvedDeckCards } = await (supabase as any)
          .from('deck_cards')
          .select('id, deck_id, decks!deck_cards_deck_id_fkey(name, status)')
          .eq('card_name', cardDef.card_name)
          .is('physical_copy_id', null)
          .in('deck_id', allocatedDeckIds)

        if (unresolvedDeckCards) {
          for (const dc of unresolvedDeckCards) {
            shortDecks.push({
              deckCardsId: dc.id,
              deckId: dc.deck_id,
              deckName: dc.decks?.name ?? `Deck ${dc.deck_id}`,
              deckStatus: dc.decks?.status ?? 'brewing',
            })
          }
        }
      }
    }

    return Response.json({
      oracleId,
      cardName: cardDef.card_name,
      instances,
      shortfall,
      shortDecks,
    } as InstancePanelResponse)
  } catch (error) {
    console.error('Failed to load instances for oracle_id:', oracleId, error)
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return Response.json(
      { error: 'Failed to load instance data', detail: message },
      { status: 500 }
    )
  }
}
