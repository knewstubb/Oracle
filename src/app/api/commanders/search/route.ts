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
  edhrec_rank: number | null      // Rank within color identity (1 = most popular in that color)
  edhrec_deck_count: number | null
  global_rank: number | null      // Rank across all commanders (1 = most popular overall)
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
  const ownership = searchParams.get('ownership') as 'owned' | 'unowned' | null
  
  // Check if we have taxonomy filters (archetype/theme/tribe)
  const hasTaxonomyFilter = archetype || theme || tribe
  
  try {
    // -------------------------------------------------------------------------
    // When ownership filter is set, we need to query owned/unowned commanders
    // directly rather than filtering after the fact (which loses results)
    // -------------------------------------------------------------------------
    if (ownership && !hasTaxonomyFilter) {
      const user = await getAuthUser()
      if (!user) {
        // No user = no ownership data, return empty for owned filter
        if (ownership === 'owned') {
          return NextResponse.json({ commanders: [] })
        }
        // For unowned, fall through to normal query (all are unowned)
      } else {
        // Get user's owned legendary creatures that can be commanders
        const { data: ownedCards } = await supabase
          .from('user_cards')
          .select('card_name')
          .eq('user_id', user.id)
        
        const ownedNames = new Set((ownedCards || []).map(c => c.card_name))
        
        // Build query for commanders
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
        
        // Apply text search if provided
        if (query.length > 0) {
          dbQuery = dbQuery.ilike('display_name', `%${query}%`)
        }
        
        // Apply color filter
        if (colors.length > 0) {
          if (colors === 'C') {
            dbQuery = dbQuery.eq('color_identity', '')
          } else if (colors.length > 1) {
            dbQuery = dbQuery.eq('color_identity', colors)
          } else {
            const validIdentities = getColorCombinations(colors)
            dbQuery = dbQuery.in('color_identity', validIdentities)
          }
        }
        
        // Get results (limit higher to account for ownership filter)
        const { data: allCommanders, error } = await dbQuery
          .order('edhrec_deck_count', { ascending: false, nullsFirst: false })
          .limit(500)
        
        if (error) {
          console.error('[api/commanders/search] Query error:', error)
          return NextResponse.json({ error: 'Database error' }, { status: 500 })
        }
        
        // Filter by ownership
        let filtered = allCommanders || []
        if (ownership === 'owned') {
          filtered = filtered.filter(c => ownedNames.has(c.display_name))
        } else {
          filtered = filtered.filter(c => !ownedNames.has(c.display_name))
        }
        
        // Return top 20 (already sorted by popularity)
        const commanders = filtered.slice(0, 20)
        
        // Build response (skip ownership filtering in buildResponse since we did it here)
        return await buildResponse(supabase, commanders, null)
      }
    }

    // If filtering by archetype, theme, or tribe, we need to join with ref_commander_taxonomy
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
        // Handle colorless specially - .in() doesn't match empty strings
        if (colors === 'C') {
          dbQuery = dbQuery.eq('color_identity', '')
        } else if (colors.length > 1) {
          // Multiple colors selected: filter to exact color identity only
          dbQuery = dbQuery.eq('color_identity', colors)
        } else {
          // Single color: show all commanders within that color identity
          const validIdentities = getColorCombinations(colors)
          dbQuery = dbQuery.in('color_identity', validIdentities)
        }
      }
      
      const { data: commanders, error } = await dbQuery
        .order('edhrec_deck_count', { ascending: false, nullsFirst: false })
        .limit(20)
      
      if (error) {
        console.error('[api/commanders/search] Query error:', error)
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }
      
      return await buildResponse(supabase, commanders || [], ownership)
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
    
    // Filter by name if query provided - check both display_name and canonical_key
    if (query.length > 0) {
      // Check if it looks like a canonical_key (contains hyphens, no commas)
      const isCanonicalKey = query.includes('-') && !query.includes(',')
      if (isCanonicalKey) {
        // Search by canonical_key OR display_name for flexibility
        dbQuery = dbQuery.or(`canonical_key.eq.${query},display_name.ilike.%${query.replace(/-/g, '%')}%`)
      } else {
        dbQuery = dbQuery.ilike('display_name', `%${query}%`)
      }
    }
    
    // Filter by color identity if provided
    if (colors.length > 0) {
      // Handle colorless specially - .in() doesn't match empty strings
      if (colors === 'C') {
        dbQuery = dbQuery.eq('color_identity', '')
      } else if (colors.length > 1) {
        // Multiple colors selected: filter to exact color identity only
        // (e.g., selecting U+B shows only Dimir commanders, not mono-U or mono-B)
        dbQuery = dbQuery.eq('color_identity', colors)
      } else {
        // Single color: show all commanders within that color identity
        const validIdentities = getColorCombinations(colors)
        dbQuery = dbQuery.in('color_identity', validIdentities)
      }
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
      
      return await buildResponse(supabase, commanders, ownership)
    }
    
    // Order by popularity and limit results
    const { data: commanders, error } = await dbQuery
      .order('edhrec_deck_count', { ascending: false, nullsFirst: false })
      .limit(20)
    
    if (error) {
      console.error('[api/commanders/search] Query error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return await buildResponse(supabase, commanders || [], ownership)
  } catch (error) {
    console.error('[api/commanders/search] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Build the response with scryfall IDs, ownership status, and global rank
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
  }>,
  ownership: 'owned' | 'unowned' | null = null
): Promise<NextResponse> {
  if (commanders.length === 0) {
    return NextResponse.json({ commanders: [] })
  }

  // Look up scryfall_ids from ref_printings
  // Prefer standard English paper printings by:
  // 1. Excluding digital cards
  // 2. Excluding problematic sets (Secret Lair, promos, etc.)
  // 3. Preferring lower collector numbers (regular prints vs extended art/showcase variants)
  const excludedSets = ['sld', 'plst', 'plist', 'pmtg1', 'pw21', 'pw22', 'slu', 'slp', 'fca', 'pclb', 'prm', 'phed', 'pmom']
  const commanderNames = commanders.map(c => c.display_name)
  const { data: printings } = await supabase
    .from('ref_printings')
    .select('name, scryfall_id, set_code, collector_number, released_at')
    .in('name', commanderNames)
    .eq('digital', false)
    .order('released_at', { ascending: false })
  
  // Helper: check if collector number is a standard print (numeric, < 400)
  // Extended art/showcase variants typically have higher numbers or letters
  const isStandardPrint = (collectorNumber: string): boolean => {
    const num = parseInt(collectorNumber, 10)
    return !isNaN(num) && num < 400 && collectorNumber === String(num)
  }
  
  // Create name -> scryfall_id map
  // Priority: non-excluded set + standard collector number > non-excluded > any
  const scryfallIdMap = new Map<string, string>()
  if (printings) {
    // First pass: find standard prints from non-excluded sets
    for (const p of printings) {
      if (!scryfallIdMap.has(p.name) && 
          !excludedSets.includes(p.set_code) && 
          isStandardPrint(p.collector_number)) {
        scryfallIdMap.set(p.name, p.scryfall_id)
      }
    }
    // Second pass: any non-excluded set printing
    for (const p of printings) {
      if (!scryfallIdMap.has(p.name) && !excludedSets.includes(p.set_code)) {
        scryfallIdMap.set(p.name, p.scryfall_id)
      }
    }
    // Fallback: if we didn't find a non-excluded printing, use any printing
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

  // Apply ownership filter if specified
  let filteredCommanders = commanders
  if (ownership === 'owned') {
    filteredCommanders = commanders.filter(c => ownedNames.has(c.display_name))
  } else if (ownership === 'unowned') {
    filteredCommanders = commanders.filter(c => !ownedNames.has(c.display_name))
  }

  // Return early if no commanders match the filter
  if (filteredCommanders.length === 0) {
    return NextResponse.json({ commanders: [] })
  }

  // Compute global rank for each commander
  // Global rank = 1 + count of commanders with higher deck count
  const globalRankMap = new Map<string, number>()
  const deckCounts = filteredCommanders
    .map(c => c.edhrec_deck_count)
    .filter((dc): dc is number => dc !== null)
  
  if (deckCounts.length > 0) {
    // For each unique deck count, get the number of commanders with higher counts
    const uniqueDeckCounts = [...new Set(deckCounts)]
    
    // Batch query: count commanders with deck_count > each threshold
    for (const deckCount of uniqueDeckCounts) {
      const { count } = await supabase
        .from('ref_commanders')
        .select('*', { count: 'exact', head: true })
        .eq('legal_commander', true)
        .gt('edhrec_deck_count', deckCount)
      
      // Global rank is count + 1 (1-indexed)
      const rank = (count ?? 0) + 1
      
      // Map this deck count to its global rank
      for (const cmd of filteredCommanders) {
        if (cmd.edhrec_deck_count === deckCount) {
          globalRankMap.set(cmd.id, rank)
        }
      }
    }
  }

  const result: SearchResult[] = filteredCommanders.map(cmd => ({
    id: cmd.id,
    canonical_key: cmd.canonical_key,
    display_name: cmd.display_name,
    color_identity: cmd.color_identity,
    scryfall_id: scryfallIdMap.get(cmd.display_name) ?? null,
    edhrec_rank: cmd.edhrec_rank,
    edhrec_deck_count: cmd.edhrec_deck_count,
    global_rank: globalRankMap.get(cmd.id) ?? null,
    leadership_type: cmd.leadership_type,
    owned: ownedNames.has(cmd.display_name),
  }))

  return NextResponse.json({ commanders: result })
}

/**
 * Generate all valid color identity combinations within the given colors.
 * E.g., for "WUB" returns: ["W", "U", "B", "WU", "WB", "UB", "WUB"]
 * For "C" (colorless) returns: [""] (only colorless commanders)
 * 
 * Note: Colorless ("") is only included when explicitly requested via "C".
 * Regular color filters exclude colorless commanders.
 */
function getColorCombinations(colors: string): string[] {
  // Handle colorless filter explicitly
  if (colors === 'C') {
    return [''] // Only colorless commanders
  }
  
  // Normalize color order: WUBRG (ignore C if mixed with colors)
  const colorOrder = ['W', 'U', 'B', 'R', 'G']
  const normalizedColors = colorOrder.filter(c => colors.includes(c))
  
  // If no valid colors, return empty (no results)
  if (normalizedColors.length === 0) {
    return []
  }
  
  const combinations: string[] = []
  
  // Generate all subsets using bit manipulation (excluding empty set = colorless)
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
