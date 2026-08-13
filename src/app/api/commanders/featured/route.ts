/**
 * Featured Commanders API
 * 
 * GET /api/commanders/featured
 * Returns 10 random commanders from the top 500 by EDHREC popularity,
 * excluding commanders the user already has decks built for.
 * Includes ownership status for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

interface FeaturedCommander {
  id: string
  canonical_key: string
  display_name: string
  color_identity: string
  scryfall_id: string | null
  edhrec_rank: number | null
  edhrec_deck_count: number | null
  leadership_type: string
  owned: boolean
}

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  
  try {
    // Get user early to fetch existing decks
    const user = await getAuthUser()
    
    // Get commander names the user already has decks for
    let existingDeckCommanders = new Set<string>()
    if (user) {
      const { data: userDecks } = await supabase
        .from('decks')
        .select('commander_name')
        .eq('user_id', user.id)
        .not('commander_name', 'is', null)
      
      if (userDecks) {
        existingDeckCommanders = new Set(
          userDecks
            .map(d => d.commander_name?.toLowerCase())
            .filter((n): n is string => !!n)
        )
      }
    }
    
    // Get top 500 popular commanders
    const { data: commanders, error } = await supabase
      .from('ref_commanders')
      .select(`
        id,
        canonical_key,
        display_name,
        color_identity,
        scryfall_id,
        edhrec_rank,
        edhrec_deck_count,
        leadership_type
      `)
      .eq('legal_commander', true)
      .not('scryfall_id', 'is', null)
      .not('edhrec_deck_count', 'is', null)
      .gt('edhrec_deck_count', 100) // Only commanders with at least 100 decks
      .order('edhrec_deck_count', { ascending: false })
      .limit(500) // Get top 500 popular commanders
    
    if (error) {
      console.error('[api/commanders/featured] Query error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!commanders || commanders.length === 0) {
      return NextResponse.json({ commanders: [] })
    }

    // Filter out commanders user already has decks for
    const availableCommanders = commanders.filter(
      c => !existingDeckCommanders.has(c.display_name.toLowerCase())
    )
    
    // If no commanders left (user has decks for all top 500), fall back to full list
    const pool = availableCommanders.length > 0 ? availableCommanders : commanders

    // Weighted random selection: use sqrt(deck_count) as weight
    const selected = weightedRandomSelect(pool, 10)

    // Check ownership for authenticated user
    let ownedNames = new Set<string>()
    
    if (user) {
      const commanderNames = selected.map(c => c.display_name)
      
      // For each commander, check if user has a copy via user_cards
      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_name')
        .eq('user_id', user.id)
        .in('card_name', commanderNames)
      
      if (userCards) {
        ownedNames = new Set(userCards.map(uc => uc.card_name))
      }
    }

    // Build response with ownership status
    const result: FeaturedCommander[] = selected.map(cmd => ({
      id: cmd.id,
      canonical_key: cmd.canonical_key,
      display_name: cmd.display_name,
      color_identity: cmd.color_identity,
      scryfall_id: cmd.scryfall_id,
      edhrec_rank: cmd.edhrec_rank,
      edhrec_deck_count: cmd.edhrec_deck_count,
      leadership_type: cmd.leadership_type,
      owned: ownedNames.has(cmd.display_name),
    }))

    return NextResponse.json({ commanders: result })
  } catch (error) {
    console.error('[api/commanders/featured] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Weighted random selection using deck count as weight.
 * Higher deck counts = higher probability of selection.
 */
function weightedRandomSelect<T extends { edhrec_deck_count: number | null }>(
  items: T[],
  count: number
): T[] {
  if (items.length <= count) return items

  // Calculate weights - use sqrt to flatten the distribution a bit
  // so top commanders don't completely dominate
  const weights = items.map(item => Math.sqrt(item.edhrec_deck_count || 1))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  
  const selected: T[] = []
  const usedIndices = new Set<number>()
  
  while (selected.length < count && usedIndices.size < items.length) {
    let random = Math.random() * totalWeight
    
    for (let i = 0; i < items.length; i++) {
      if (usedIndices.has(i)) continue
      
      random -= weights[i]
      if (random <= 0) {
        selected.push(items[i])
        usedIndices.add(i)
        break
      }
    }
    
    // Fallback in case of floating point issues
    if (selected.length < usedIndices.size) {
      for (let i = 0; i < items.length; i++) {
        if (!usedIndices.has(i)) {
          selected.push(items[i])
          usedIndices.add(i)
          break
        }
      }
    }
  }
  
  return selected
}
