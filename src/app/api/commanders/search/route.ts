/**
 * Commander Search API
 * 
 * GET /api/commanders/search?q=name&colors=WUB
 * Searches commanders by name with optional color identity filter.
 * Returns up to 20 results, ordered by EDHREC popularity.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

interface SearchResult {
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
  const { searchParams } = new URL(request.url)
  
  const query = searchParams.get('q')?.trim() || ''
  const colors = searchParams.get('colors')?.toUpperCase() || ''
  const partnerType = searchParams.get('partnerType') || ''
  
  try {
    // Build the query
    // Note: scryfall_id in ref_commanders may not be populated, so we don't filter on it
    // We'll look up scryfall_id from ref_printings after selection
    let dbQuery = supabase
      .from('ref_commanders')
      .select(`
        id,
        canonical_key,
        display_name,
        color_identity,
        edhrec_rank,
        edhrec_deck_count,
        leadership_type
      `)
      .eq('legal_commander', true)
    
    // Filter by name if query provided
    if (query.length > 0) {
      // Use ilike for case-insensitive partial matching
      dbQuery = dbQuery.ilike('display_name', `%${query}%`)
    }
    
    // Filter by color identity if provided
    // Colors param is like "WUB" - commander must be within this identity
    if (colors.length > 0) {
      // Get all valid color combinations within the provided colors
      const validIdentities = getColorCombinations(colors)
      dbQuery = dbQuery.in('color_identity', validIdentities)
    }
    
    // Filter by partner type for partner selection flow
    if (partnerType.length > 0) {
      // Map partner types to compatible leadership types
      let compatibleTypes: string[] = []
      
      if (partnerType === 'partner') {
        // Generic partners can pair with other generic partners
        compatibleTypes = ['partner']
      } else if (partnerType === 'friends_forever') {
        // Friends forever only with other friends forever
        compatibleTypes = ['friends_forever']
      } else if (partnerType === 'partner_with') {
        // partner_with has specific pairings, but for now allow generic partners
        compatibleTypes = ['partner']
      }
      
      if (compatibleTypes.length > 0) {
        dbQuery = dbQuery.in('leadership_type', compatibleTypes)
      }
    }
    
    // Order by popularity and limit results
    const { data: commanders, error } = await dbQuery
      .order('edhrec_deck_count', { ascending: false, nullsFirst: false })
      .limit(20)
    
    if (error) {
      console.error('[api/commanders/search] Query error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!commanders || commanders.length === 0) {
      return NextResponse.json({ commanders: [] })
    }

    // Look up scryfall_ids from ref_printings for the selected commanders
    const commanderNames = commanders.map(c => c.display_name)
    const { data: printings } = await supabase
      .from('ref_printings')
      .select('name, scryfall_id')
      .in('name', commanderNames)
    
    // Create name -> scryfall_id map (use first printing found for each)
    const scryfallIdMap = new Map<string, string>()
    if (printings) {
      for (const p of printings) {
        if (!scryfallIdMap.has(p.name)) {
          scryfallIdMap.set(p.name, p.scryfall_id)
        }
      }
    }

    // Check ownership for authenticated user
    const user = await getAuthUser()
    let ownedNames = new Set<string>()
    
    if (user) {
      const commanderNames = commanders.map(c => c.display_name)
      
      const { data: userCards } = await supabase
        .from('user_cards')
        .select('card_name')
        .eq('user_id', user.id)
        .in('card_name', commanderNames)
      
      if (userCards) {
        ownedNames = new Set(userCards.map(uc => uc.card_name))
      }
    }

    // Build response with scryfall_id from printings lookup
    const result: SearchResult[] = commanders.map(cmd => ({
      id: cmd.id,
      canonical_key: cmd.canonical_key,
      display_name: cmd.display_name,
      color_identity: cmd.color_identity,
      scryfall_id: scryfallIdMap.get(cmd.display_name) ?? null,
      edhrec_rank: cmd.edhrec_rank,
      edhrec_deck_count: cmd.edhrec_deck_count,
      leadership_type: cmd.leadership_type,
      owned: ownedNames.has(cmd.display_name),
    }))

    return NextResponse.json({ commanders: result })
  } catch (error) {
    console.error('[api/commanders/search] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Generate all valid color identity combinations within the given colors.
 * E.g., for "WUB" returns: ["", "W", "U", "B", "WU", "WB", "UB", "WUB"]
 */
function getColorCombinations(colors: string): string[] {
  // Normalize color order: WUBRG
  const colorOrder = ['W', 'U', 'B', 'R', 'G']
  const normalizedColors = colorOrder.filter(c => colors.includes(c))
  
  const combinations: string[] = [''] // Empty string for colorless
  
  // Generate all subsets using bit manipulation
  const n = normalizedColors.length
  for (let mask = 1; mask < (1 << n); mask++) {
    let combo = ''
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        combo += normalizedColors[i]
      }
    }
    combinations.push(combo)
  }
  
  return combinations
}
