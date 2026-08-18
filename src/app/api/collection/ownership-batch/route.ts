// ---------------------------------------------------------------------------
// POST /api/collection/ownership-batch
// Returns ownership status for multiple cards in a single request
// Optional: include detailed info (quantity, available, price) for hover previews
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

interface OwnershipResult {
  cardName: string
  status: 'owned' | 'proxy' | 'unowned'
}

interface DetailedOwnershipResult extends OwnershipResult {
  quantity?: number      // Total copies owned (non-proxy)
  available?: number     // Copies not allocated to decks
  priceUsd?: number | null  // Price for unowned cards
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  
  const userId = authResult.id

  try {
    const body = await request.json()
    const cardNames = body.cardNames as string[]
    const includeDetails = body.includeDetails as boolean ?? false
    
    if (!Array.isArray(cardNames) || cardNames.length === 0) {
      return NextResponse.json({ error: 'cardNames array required' }, { status: 400 })
    }
    
    // Limit batch size to prevent abuse
    if (cardNames.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 cards per request' }, { status: 400 })
    }
    
    const supabase = createAdminClient()
    
    // First, find user_cards matching the requested names (case-insensitive)
    // This is much faster than fetching all copies
    const { data: userCards, error: ucError } = await supabase
      .from('user_cards')
      .select('id, card_name')
      .eq('user_id', userId)
      .in('card_name', cardNames) // Try exact match first
    
    // Also try case-insensitive match for any not found
    const foundNames = new Set((userCards ?? []).map(uc => uc.card_name.toLowerCase()))
    const missingNames = cardNames.filter(n => !foundNames.has(n.toLowerCase()))
    
    let allUserCards = userCards ?? []
    
    if (missingNames.length > 0) {
      // Try case-insensitive match for missing names
      for (const name of missingNames) {
        const { data: fuzzyMatch } = await supabase
          .from('user_cards')
          .select('id, card_name')
          .eq('user_id', userId)
          .ilike('card_name', name)
          .limit(1)
        
        if (fuzzyMatch && fuzzyMatch.length > 0) {
          allUserCards.push(fuzzyMatch[0])
        } else if (!name.includes(' // ')) {
          // DFC fallback: try matching front-face-only name against full DFC names
          // e.g., "Fable of the Mirror-Breaker" → "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki"
          const { data: dfcMatch } = await supabase
            .from('user_cards')
            .select('id, card_name')
            .eq('user_id', userId)
            .ilike('card_name', `${name} // %`)
            .limit(1)
          
          if (dfcMatch && dfcMatch.length > 0) {
            allUserCards.push(dfcMatch[0])
          }
        }
      }
    }
    
    // Build map of lowercase name -> user_card
    const userCardMap = new Map<string, { id: number; card_name: string }>()
    for (const uc of allUserCards) {
      userCardMap.set(uc.card_name.toLowerCase(), uc)
    }
    
    // Now fetch copies only for the cards we found
    const cardIds = allUserCards.map(uc => uc.id)
    
    let ownershipMap = new Map<string, { 
      hasOriginal: boolean
      hasProxy: boolean
      originalCopyIds: number[]
    }>()
    
    if (cardIds.length > 0) {
      const { data: copies, error: copyError } = await supabase
        .from('user_copies')
        .select('id, card_id, is_proxy')
        .eq('user_id', userId)
        .in('card_id', cardIds)
      
      if (copyError) {
        console.error('[ownership-batch] Copy query error:', copyError)
      }
      
      // Build ownership map from copies
      for (const copy of copies ?? []) {
        // Find the card name for this copy
        const userCard = allUserCards.find(uc => uc.id === copy.card_id)
        if (!userCard) continue
        
        const cardNameLower = userCard.card_name.toLowerCase()
        const existing = ownershipMap.get(cardNameLower) ?? { 
          hasOriginal: false, 
          hasProxy: false,
          originalCopyIds: []
        }
        
        if (copy.is_proxy) {
          existing.hasProxy = true
        } else {
          existing.hasOriginal = true
          existing.originalCopyIds.push(copy.id)
        }
        
        ownershipMap.set(cardNameLower, existing)
      }
    }
    
    // For detailed mode, check which copies are allocated to decks
    let allocatedCopyIds = new Set<number>()
    if (includeDetails && cardIds.length > 0) {
      const allCopyIds = Array.from(ownershipMap.values()).flatMap(o => o.originalCopyIds)
      if (allCopyIds.length > 0) {
        const { data: allocatedSlots } = await supabase
          .from('deck_cards')
          .select('copy_id')
          .eq('user_id', userId)
          .in('copy_id', allCopyIds)
        
        allocatedCopyIds = new Set((allocatedSlots ?? []).map(s => s.copy_id as number))
      }
    }
    
    // For detailed mode with unowned cards, fetch prices from ref_printings
    let priceMap = new Map<string, number | null>()
    if (includeDetails) {
      const unownedCards = cardNames.filter(name => !ownershipMap.has(name.toLowerCase()))
      if (unownedCards.length > 0) {
        // Try exact match first
        const { data: printings } = await supabase
          .from('ref_printings')
          .select('name, price_usd')
          .in('name', unownedCards)
        
        for (const p of printings ?? []) {
          if (!priceMap.has(p.name.toLowerCase()) && p.price_usd != null) {
            priceMap.set(p.name.toLowerCase(), p.price_usd)
          }
        }
        
        // Try case-insensitive for any still missing
        const stillMissing = unownedCards.filter(n => !priceMap.has(n.toLowerCase()))
        for (const name of stillMissing) {
          const { data: fuzzy } = await supabase
            .from('ref_printings')
            .select('name, price_usd')
            .ilike('name', name)
            .limit(1)
          
          if (fuzzy && fuzzy[0] && fuzzy[0].price_usd != null) {
            priceMap.set(name.toLowerCase(), fuzzy[0].price_usd)
          } else if (!name.includes(' // ')) {
            // DFC fallback: try matching front-face-only name
            const { data: dfcPrinting } = await supabase
              .from('ref_printings')
              .select('name, price_usd')
              .ilike('name', `${name} // %`)
              .limit(1)
            
            if (dfcPrinting && dfcPrinting[0] && dfcPrinting[0].price_usd != null) {
              priceMap.set(name.toLowerCase(), dfcPrinting[0].price_usd)
            }
          }
        }
      }
    }
    
    // Build results for requested card names (case-insensitive)
    const results: DetailedOwnershipResult[] = cardNames.map(name => {
      const ownership = ownershipMap.get(name.toLowerCase())
      
      if (!ownership) {
        const result: DetailedOwnershipResult = { cardName: name, status: 'unowned' as const }
        if (includeDetails) {
          result.priceUsd = priceMap.get(name.toLowerCase()) ?? null
        }
        return result
      }
      
      if (ownership.hasOriginal) {
        const result: DetailedOwnershipResult = { cardName: name, status: 'owned' as const }
        if (includeDetails) {
          const quantity = ownership.originalCopyIds.length
          const available = ownership.originalCopyIds.filter(id => !allocatedCopyIds.has(id)).length
          result.quantity = quantity
          result.available = available
        }
        return result
      }
      
      if (ownership.hasProxy) {
        return { cardName: name, status: 'proxy' as const }
      }
      
      return { cardName: name, status: 'unowned' as const }
    })
    
    return NextResponse.json({ results })
  } catch (err) {
    console.error('[ownership-batch] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
