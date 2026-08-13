/**
 * Commander Search API
 * 
 * GET /api/commanders/search?q=name&colors=WUB&archetype=aristocrats&theme=sacrifice&tribe=zombies
 * Searches commanders by name with optional filters for color identity, archetype, theme, and tribe.
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
  const archetype = searchParams.get('archetype')?.toLowerCase() || ''
  const theme = searchParams.get('theme')?.toLowerCase() || ''
  const tribe = searchParams.get('tribe')?.toLowerCase() || ''
  const random = searchParams.get('random') === 'true'
  
  try {
    // If filtering by archetype, theme, or tribe, we need to join with ref_commander_taxonomy
    const hasTaxonomyFilter = archetype || theme || tribe
    
    if (hasTaxonomyFilter) {
      // Get commander IDs that match the taxonomy filters
      let commanderIds: string[] = []
      
      if (archetype) {
        const { data: archetypeMatches } = await supabase
          .from('ref_commander_taxonomy')
          .select('commander_id')
          .eq('tag_type', 'archetype')
          .ilike('tag_value', `%${archetype}%`)
          .order('deck_count', { ascending: false })
        
        if (archetypeMatches && archetypeMatches.length > 0) {
          commanderIds = archetypeMatches.map(m => m.commander_id)
        }
      }
      
      if (theme) {
        const { data: themeMatches } = await supabase
          .from('ref_commander_taxonomy')
          .select('commander_id')
          .eq('tag_type', 'theme')
          .ilike('tag_value', `%${theme}%`)
          .order('deck_count', { ascending: false })
        
        if (themeMatches && themeMatches.length > 0) {
          const themeIds = themeMatches.map(m => m.commander_id)
          // Intersect with existing if archetype was also specified
          if (commanderIds.length > 0) {
            commanderIds = commanderIds.filter(id => themeIds.includes(id))
          } else {
            commanderIds = themeIds
          }
        }
      }
      
      if (tribe) {
        const { data: tribeMatches } = await supabase
          .from('ref_commander_taxonomy')
          .select('commander_id')
          .eq('tag_type', 'tribe')
          .ilike('tag_value', `%${tribe}%`)
          .order('deck_count', { ascending: false })
        
        if (tribeMatches && tribeMatches.length > 0) {
          const tribeIds = tribeMatches.map(m => m.commander_id)
          // Intersect with existing if other filters were specified
          if (commanderIds.length > 0) {
            commanderIds = commanderIds.filter(id => tribeIds.includes(id))
          } else {
            commanderIds = tribeIds
          }
        }
      }
      
      // If no matches found for taxonomy filters, return empty
      if (commanderIds.length === 0) {
        return NextResponse.json({ commanders: [] })
      }
      
      // Build query with commander ID filter
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
        .in('id', commanderIds)
      
      // Additional filters
      if (query.length > 0) {
        dbQuery = dbQuery.ilike('display_name', `%${query}%`)
      }
      
      if (colors.length > 0) {
        const validIdentities = getColorCombinations(colors)
        dbQuery = dbQuery.in('color_identity', validIdentities)
      }
      
      const { data: commanders, error } = await dbQuery
        .order('edhrec_deck_count', { ascending: false, nullsFirst: false })
        .limit(20)
      
      if (error) {
        console.error('[api/commanders/search] Query error:', error)
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }
      
      return await buildResponse(supabase, commanders || [])
    }
    
    // Standard search without taxonomy filters
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
      dbQuery = dbQuery.ilike('display_name', `%${query}%`)
    }
    
    // Filter by color identity if provided
    if (colors.length > 0) {
      const validIdentities = getColorCombinations(colors)
      dbQuery = dbQuery.in('color_identity', validIdentities)
    }
    
    // Filter by partner type for partner selection flow
    if (partnerType.length > 0) {
      let compatibleTypes: string[] = []
      
      if (partnerType === 'partner') {
        compatibleTypes = ['partner']
      } else if (partnerType === 'friends_forever') {
        compatibleTypes = ['friends_forever']
      } else if (partnerType === 'partner_with') {
        compatibleTypes = ['partner']
      }
      
      if (compatibleTypes.length > 0) {
        dbQuery = dbQuery.in('leadership_type', compatibleTypes)
      }
    }
    
    // For random selection, use Postgres random() - useful for generic "build a deck" requests
    if (random) {
      // Get top 500 by popularity, then randomly select from those
      const { data: topCommanders, error: topError } = await dbQuery
        .order('edhrec_deck_count', { ascending: false, nullsFirst: false })
        .limit(500)
      
      if (topError) {
        console.error('[api/commanders/search] Query error:', topError)
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }
      
      // Randomly shuffle and take 20
      const shuffled = (topCommanders || []).sort(() => Math.random() - 0.5)
      const commanders = shuffled.slice(0, 20)
      
      return await buildResponse(supabase, commanders)
    }
    
    // Order by popularity and limit results
    const { data: commanders, error } = await dbQuery
      .order('edhrec_deck_count', { ascending: false, nullsFirst: false })
      .limit(20)
    
    if (error) {
      console.error('[api/commanders/search] Query error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return await buildResponse(supabase, commanders || [])
  } catch (error) {
    console.error('[api/commanders/search] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Build the response with scryfall IDs and ownership status
 */
async function buildResponse(
  supabase: ReturnType<typeof createAdminClient>,
  commanders: Array<{
    id: string
    canonical_key: string
    display_name: string
    color_identity: string
    edhrec_rank: number | null
    edhrec_deck_count: number | null
    leadership_type: string
  }>
): Promise<NextResponse> {
  if (commanders.length === 0) {
    return NextResponse.json({ commanders: [] })
  }

  // Look up scryfall_ids from ref_printings
  const commanderNames = commanders.map(c => c.display_name)
  const { data: printings } = await supabase
    .from('ref_printings')
    .select('name, scryfall_id')
    .in('name', commanderNames)
  
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
    const { data: userCards } = await supabase
      .from('user_cards')
      .select('card_name')
      .eq('user_id', user.id)
      .in('card_name', commanderNames)
    
    if (userCards) {
      ownedNames = new Set(userCards.map(uc => uc.card_name))
    }
  }

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
