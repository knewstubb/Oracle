/**
 * POST /api/scan/confirm
 *
 * Processes confirmed scanned cards from a scan session.
 * Creates physical_copies rows and optionally links to deck or storage location.
 *
 * Body: {
 *   mode: 'add'
 *   target: { type: 'collection' | 'deck' | 'storage', deckId?, storageLocationId? }
 *   cards: Array<{
 *     cardName: string
 *     oracleId: string | null
 *     scryfallId: string | null
 *     setCode: string | null
 *     collectorNumber: string | null
 *     isProxy: boolean
 *     isFoil: boolean
 *     condition: string
 *     confidence: string
 *   }>
 * }
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { ensureCardDefinition } from '@/lib/card-identity-store'

interface ScanCard {
  cardName: string
  oracleId: string | null
  scryfallId: string | null
  setCode: string | null
  collectorNumber: string | null
  isProxy: boolean
  isFoil: boolean
  condition: string
  confidence: string
}

interface ScanTarget {
  type: 'collection' | 'deck' | 'storage'
  deckId?: number
  storageLocationId?: number
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { mode: string; target: ScanTarget; cards: ScanCard[] }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { target, cards } = body

  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return Response.json({ error: 'No cards provided' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const results: Array<{ cardName: string; physicalCopyId: number; success: boolean }> = []
  const errors: string[] = []

  for (const card of cards) {
    try {
      // 1. Ensure card_definition exists
      let cardDefinitionId: number | null = null

      if (card.oracleId) {
        cardDefinitionId = await ensureCardDefinition(card.oracleId, card.cardName, userId)
      } else {
        // Fallback: look up existing card_definition by name
        const { data: existing } = await supabase
          .from('card_definitions')
          .select('id')
          .eq('card_name', card.cardName)
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle()

        if (existing) {
          cardDefinitionId = existing.id
        } else {
          // Create without oracle_id (will be resolved later)
          const { data: created, error: createErr } = await supabase
            .from('card_definitions')
            .insert({
              card_name: card.cardName,
              oracle_id: card.oracleId,
              user_id: userId,
            })
            .select('id')
            .single()

          if (createErr) throw new Error(`Failed to create card_definition: ${createErr.message}`)
          cardDefinitionId = created.id
        }
      }

      if (!cardDefinitionId) {
        errors.push(`Failed to resolve card definition for "${card.cardName}"`)
        continue
      }

      // 2. Create physical_copies row
      const { data: copy, error: copyErr } = await supabase
        .from('physical_copies')
        .insert({
          card_definition_id: cardDefinitionId,
          scryfall_printing_id: card.scryfallId,
          user_id: userId,
          is_foil: card.isFoil,
          is_proxy: card.isProxy,
          condition: card.condition,
          storage_location_id: target.type === 'storage' ? target.storageLocationId : null,
          source_tag: 'scan',
        })
        .select('id')
        .single()

      if (copyErr) {
        errors.push(`Failed to create physical copy for "${card.cardName}": ${copyErr.message}`)
        continue
      }

      // 3. If target is a deck, create deck_cards row and link the physical copy
      if (target.type === 'deck' && target.deckId) {
        const { error: deckErr } = await supabase
          .from('deck_cards')
          .insert({
            deck_id: target.deckId,
            card_name: card.cardName,
            scryfall_id: card.scryfallId,
            set_code: card.setCode,
            quantity: 1,
            categories: JSON.stringify(['Other']),
            is_commander: false,
            user_id: userId,
            physical_copy_id: copy.id,
            ownership_status: card.isProxy ? 'proxy' : 'original',
          })

        if (deckErr) {
          errors.push(`Created copy but failed to link to deck for "${card.cardName}": ${deckErr.message}`)
          // Copy still exists — not a critical failure
        }
      }

      results.push({ cardName: card.cardName, physicalCopyId: copy.id, success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${card.cardName}: ${msg}`)
    }
  }

  return Response.json({
    success: true,
    added: results.length,
    errors,
    total: cards.length,
  })
}
