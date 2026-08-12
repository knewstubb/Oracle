import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/collection/instances/[oracleId]
 *
 * Returns all collection copies for a given oracle_id, sorted by set release date DESC
 * then collector number ASC. Includes deck assignment and location info.
 * Also returns shortDecks — decks that need this card but don't have it resolved.
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 14.2, 14.3
 */

interface InstanceRow {
  copyId: number
  /** @deprecated Use copyId */
  physicalCopyId: number
  scryfallPrintingId: string | null
  setName: string
  collectorNumber: string
  finish: string // 'nonfoil' | 'foil' | 'etched'
  /** @deprecated Use finish */
  isFoil: boolean
  condition: string | null
  isProxy: boolean
  isMissing: boolean
  assignedDeckName: string | null
  assignedDeckId: number | null
  assignedDeckIsActive: boolean | null
  locationId: number | null
  locationName: string | null
  /** @deprecated Use locationId */
  storageLocationId: number | null
  /** @deprecated Use locationName */
  storageLocationName: string | null
}

interface ShortDeckEntry {
  deckCardsId: number
  deckId: number
  deckName: string
  isActive: boolean
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
    // 1. Get the card for this oracle_id
    const { data: cardDef, error: cdErr } = await (supabase as any)
      .from('user_cards')
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

    // 2. Get all collection copies for this card belonging to the user
    const { data: copies, error: pcErr } = await (supabase as any)
      .from('user_copies')
      .select('id, printing_id, finish, condition, is_proxy, location_id, user_id')
      .eq('card_id', cardDef.id)
      .eq('user_id', authResult.id)

    if (pcErr) throw pcErr

    const collectionCopies = copies ?? []

    // 3. Get location names for all referenced locations
    const locationIds = [...new Set(
      collectionCopies
        .map((pc: any) => pc.location_id)
        .filter((id: any) => id !== null)
    )]

    let locationMap: Map<number, string> = new Map()
    if (locationIds.length > 0) {
      const { data: locations } = await (supabase as any)
        .from('user_locations')
        .select('id, name')
        .in('id', locationIds)

      if (locations) {
        for (const loc of locations) {
          locationMap.set(loc.id, loc.name)
        }
      }
    }

    // 4. Get deck assignments for these collection copies (including deck_id and is_active)
    const copyIds = collectionCopies.map((pc: any) => pc.id)
    let deckAssignmentMap: Map<number, { deckName: string; deckId: number; isActive: boolean }> = new Map()

    if (copyIds.length > 0) {
      const { data: deckCards } = await (supabase as any)
        .from('deck_cards')
        .select('copy_id, deck_id, decks!deck_cards_deck_id_fkey!inner(name, is_active)')
        .in('copy_id', copyIds)
        .not('copy_id', 'is', null)

      if (deckCards) {
        for (const dc of deckCards) {
          if (dc.copy_id && dc.decks?.name) {
            deckAssignmentMap.set(dc.copy_id, {
              deckName: dc.decks.name,
              deckId: dc.deck_id,
              isActive: dc.decks.is_active ?? true,
            })
          }
        }
      }
    }

    // 5. Get printing/set info via printing_id from ref_printings table
    const printingIds = [...new Set(
      collectionCopies
        .map((pc: any) => pc.printing_id)
        .filter((id: any) => id !== null)
    )]

    let printingMap: Map<string, { setName: string; collectorNumber: string; releasedAt: string }> = new Map()

    if (printingIds.length > 0) {
      const { data: printings } = await supabase
        .from('ref_printings')
        .select('scryfall_id, set_code, set_name, collector_number, released_at')
        .in('scryfall_id', printingIds as string[])

      if (printings && printings.length > 0) {
        for (const p of printings) {
          printingMap.set(p.scryfall_id, {
            setName: p.set_name || p.set_code?.toUpperCase() || 'Unknown Set',
            collectorNumber: p.collector_number || p.set_code?.toUpperCase() || '?',
            releasedAt: p.released_at || '2024-01-01',
          })
        }
      }
    }

    // 6. Build instance rows
    const instances: InstanceRow[] = collectionCopies.map((pc: any) => {
      const printing = printingMap.get(pc.printing_id)
      const assignment = deckAssignmentMap.get(pc.id)
      const finish = pc.finish ?? 'nonfoil'

      return {
        copyId: pc.id,
        physicalCopyId: pc.id, // deprecated alias
        scryfallPrintingId: pc.printing_id ?? null,
        setName: printing?.setName ?? 'Unknown Set',
        collectorNumber: printing?.collectorNumber ?? '?',
        finish,
        isFoil: finish === 'foil' || finish === 'etched', // deprecated alias
        condition: pc.condition ?? null,
        isProxy: Boolean(pc.is_proxy),
        isMissing: false, // missing column removed
        assignedDeckName: assignment?.deckName ?? null,
        assignedDeckId: assignment?.deckId ?? null,
        assignedDeckIsActive: assignment?.isActive ?? null,
        locationId: pc.location_id ?? null,
        locationName: pc.location_id
          ? (locationMap.get(pc.location_id) ?? null)
          : null,
        storageLocationId: pc.location_id ?? null, // deprecated alias
        storageLocationName: pc.location_id
          ? (locationMap.get(pc.location_id) ?? null)
          : null, // deprecated alias
      }
    })

    // 7. Sort: set release date DESC, then collector number ASC
    instances.sort((a, b) => {
      const aPrinting = printingMap.get(
        collectionCopies.find((pc: any) => pc.id === a.copyId)?.printing_id
      )
      const bPrinting = printingMap.get(
        collectionCopies.find((pc: any) => pc.id === b.copyId)?.printing_id
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

    // 8. Compute shortfall (demand from all decks minus owned non-proxy copies)
    const ownedCount = collectionCopies.filter((pc: any) => !pc.is_proxy).length

    // Get demand: count of deck_cards rows for this card across all user's decks
    const { count: demandCount } = await (supabase as any)
      .from('deck_cards')
      .select('id', { count: 'exact', head: true })
      .eq('card_name', cardDef.card_name)
      .eq('user_id', authResult.id)

    const shortfall = Math.max(0, (demandCount ?? 0) - ownedCount)

    // 9. Find decks that need this card but don't have it resolved (Short decks)
    const shortDecks: ShortDeckEntry[] = []
    if (shortfall > 0) {
      const { data: unresolvedDeckCards } = await (supabase as any)
        .from('deck_cards')
        .select('id, deck_id, decks!deck_cards_deck_id_fkey(name, is_active)')
        .eq('card_name', cardDef.card_name)
        .eq('user_id', authResult.id)
        .is('copy_id', null)

      if (unresolvedDeckCards) {
        for (const dc of unresolvedDeckCards) {
          shortDecks.push({
            deckCardsId: dc.id,
            deckId: dc.deck_id,
            deckName: dc.decks?.name ?? `Deck ${dc.deck_id}`,
            isActive: dc.decks?.is_active ?? true,
          })
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
