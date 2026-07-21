/**
 * GET /api/decks/[id]/card-actions/[cardName]
 *
 * Returns contextual action data for a specific card in a deck.
 * Called on-demand when a status chip popover opens.
 *
 * Returns:
 * - For Open slots: available copies with set/condition/location
 * - For Claimed slots: which deck(s) hold copies
 * - For all: valid decks for reassignment (filtered by color identity)
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { fetchEnrichedSupply } from '@/lib/allocation-candidates'
import type { CardSlotStatus } from '@/lib/card-status'

export interface CardActionContext {
  status: CardSlotStatus
  cardName: string
  /** The card_definitions.id for this card (used by Add Proxy) */
  cardDefinitionId: number | null
  /** For Open: available (free) copies */
  availableCopies: Array<{
    physicalCopyId: number
    scryfallPrintingId: string | null
    setName: string
    condition: string | null
    storageLocationName: string | null
    isProxy: boolean
    isFoil: boolean
  }>
  /** For Claimed: decks currently holding copies */
  holders: Array<{
    deckId: number
    deckName: string
    deckStatus: string
    physicalCopyId: number
    scryfallPrintingId: string | null
    condition: string | null
    isProxy: boolean
    setCode: string | null
    editionName: string | null
  }>
  /** Valid decks this card could be assigned to (color identity filter) */
  validDecks: Array<{
    deckId: number
    deckName: string
    deckStatus: string
  }>
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; cardName: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id, cardName: rawCardName } = await params
  const deckId = parseInt(id, 10)
  const cardName = decodeURIComponent(rawCardName)

  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    // Fetch enriched supply for this card (all copies with assignment status)
    const supply = await fetchEnrichedSupply(cardName, userId)

    // Separate into free (available) and assigned (holders)
    const availableCopies: CardActionContext['availableCopies'] = []
    const holders: CardActionContext['holders'] = []

    for (const entry of supply) {
      if (!entry.assignedTo) {
        // Free copy
        availableCopies.push({
          physicalCopyId: entry.physicalCopyId,
          scryfallPrintingId: entry.scryfallPrintingId,
          setName: entry.storageLocationName ?? 'Unknown',
          condition: entry.condition,
          storageLocationName: entry.storageLocationName,
          isProxy: entry.isProxy,
          isFoil: entry.isFoil,
        })
      } else if (entry.assignedTo.deckId !== deckId) {
        // Held by another deck (not the current one)
        holders.push({
          deckId: entry.assignedTo.deckId,
          deckName: entry.assignedTo.deckName,
          deckStatus: entry.assignedTo.deckStatus,
          physicalCopyId: entry.physicalCopyId,
          scryfallPrintingId: entry.scryfallPrintingId,
          condition: entry.condition,
          isProxy: entry.isProxy,
          setCode: null,
          editionName: null,
        })
      }
    }

    // Resolve printing set info for holders (set_code + edition_name)
    const holderPrintingIds = holders
      .map(h => h.scryfallPrintingId)
      .filter((id): id is string => id !== null)

    if (holderPrintingIds.length > 0) {
      const { data: printingRows } = await supabase
        .from('printing_set_info')
        .select('scryfall_printing_id, set_code, edition_name')
        .in('scryfall_printing_id', holderPrintingIds)

      if (printingRows) {
        const printingMap = new Map(
          printingRows.map((r: any) => [r.scryfall_printing_id, { setCode: r.set_code, editionName: r.edition_name }])
        )
        for (const holder of holders) {
          if (holder.scryfallPrintingId) {
            const info = printingMap.get(holder.scryfallPrintingId)
            if (info) {
              holder.setCode = info.setCode
              holder.editionName = info.editionName
            }
          }
        }
      }
    }

    // Get the card's color identity for valid-deck filtering
    const { data: cardDef } = await supabase
      .from('card_definitions')
      .select('id, color_identity')
      .eq('card_name', cardName)
      .eq('user_id', userId)
      .maybeSingle()

    const cardCI = cardDef?.color_identity
      ? cardDef.color_identity.split(',').map((c: string) => c.trim()).filter(Boolean)
      : []

    // Fetch all active decks (brew + boxed) for valid-deck list
    const { data: allDecks } = await supabase
      .from('decks')
      .select('id, name, status, colour_identity')
      .eq('user_id', userId)
      .in('status', ['brewing', 'in_rotation'])
      .neq('id', deckId) // Exclude the current deck

    // Filter to decks whose commander CI is a superset of the card's CI
    const validDecks: CardActionContext['validDecks'] = (allDecks ?? [])
      .filter((deck) => {
        if (cardCI.length === 0) return true // Colorless cards go anywhere
        const deckCI = deck.colour_identity
          ? deck.colour_identity.split(',').map((c: string) => c.trim()).filter(Boolean)
          : []
        // Deck CI must contain every color in card CI
        return cardCI.every((color: string) => deckCI.includes(color))
      })
      .map((deck) => ({
        deckId: deck.id,
        deckName: deck.name,
        deckStatus: deck.status,
      }))

    // Determine current status for context
    let status: CardSlotStatus = 'unowned'
    if (availableCopies.length > 0) {
      status = 'available'
    } else if (holders.length > 0) {
      status = 'claimed'
    }
    // If this card's slot is already resolved (original/proxy), the caller knows that
    // from the card-statuses response — this endpoint is primarily for unresolved slots

    const response: CardActionContext = {
      status,
      cardName,
      cardDefinitionId: cardDef?.id ?? null,
      availableCopies,
      holders,
      validDecks,
    }

    return Response.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
