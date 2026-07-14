/**
 * GET /api/cards/builder-status?cardNames=Sol+Ring,Rhystic+Study
 *
 * Returns the unified card slot status for one or more card names.
 * Used by the deck builder to show Original/Proxy/Unallocated/Claimed/Unowned per card.
 *
 * For 'claimed' results, includes heldBy detail (which deck holds the card).
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { computeUnresolvedStatuses } from '@/lib/card-status'
import { fetchEnrichedSupply } from '@/lib/allocation-candidates'
import { createAdminClient } from '@/lib/supabase'

export interface BuilderStatusResult {
  cardName: string
  status: 'original' | 'proxy' | 'unallocated' | 'claimed' | 'unowned'
  /** For claimed: which deck currently holds the card */
  heldBy: {
    deckId: number
    deckName: string
    deckStatus: string
    allocate: boolean
  } | null
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const cardNamesParam = request.nextUrl.searchParams.get('cardNames')
  if (!cardNamesParam) {
    return Response.json({ error: 'cardNames query parameter is required' }, { status: 400 })
  }

  const cardNames = cardNamesParam.split(',').map(n => n.trim()).filter(Boolean)
  if (cardNames.length === 0) {
    return Response.json({ error: 'At least one card name is required' }, { status: 400 })
  }

  // Cap at 20 cards per request to avoid abuse
  if (cardNames.length > 20) {
    return Response.json({ error: 'Maximum 20 card names per request' }, { status: 400 })
  }

  try {
    // Use the unified engine for batch classification
    const statusMap = await computeUnresolvedStatuses(cardNames, userId)

    // For any card classified as 'claimed', fetch heldBy detail
    const results: BuilderStatusResult[] = []
    const supabase = createAdminClient()

    for (const cardName of cardNames) {
      const status = statusMap.get(cardName) ?? 'unowned'

      if (status === 'claimed') {
        // Get heldBy detail from enriched supply
        let heldBy: BuilderStatusResult['heldBy'] = null
        try {
          const candidates = await fetchEnrichedSupply(cardName, userId)
          const assignedCopy = candidates.find(c => c.assignedTo !== null)
          if (assignedCopy?.assignedTo) {
            // Fetch the holding deck's allocate status
            const { data: deckData } = await supabase
              .from('decks')
              .select('allocate')
              .eq('id', assignedCopy.assignedTo.deckId)
              .maybeSingle()

            heldBy = {
              deckId: assignedCopy.assignedTo.deckId,
              deckName: assignedCopy.assignedTo.deckName,
              deckStatus: assignedCopy.assignedTo.deckStatus,
              allocate: deckData?.allocate ?? true,
            }
          }
        } catch {
          // If enriched supply fails, still return the status without heldBy
        }

        results.push({ cardName, status: 'claimed', heldBy })
      } else if (status === 'unallocated') {
        // Check if the free copy is a proxy or original
        try {
          const candidates = await fetchEnrichedSupply(cardName, userId)
          const freeCopy = candidates.find(c => !c.assignedTo)
          if (freeCopy) {
            results.push({
              cardName,
              status: freeCopy.isProxy ? 'proxy' : 'original',
              heldBy: null,
            })
          } else {
            results.push({ cardName, status: 'unallocated', heldBy: null })
          }
        } catch {
          results.push({ cardName, status: 'unallocated', heldBy: null })
        }
      } else {
        results.push({ cardName, status, heldBy: null })
      }
    }

    return Response.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
