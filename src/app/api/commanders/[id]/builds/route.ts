/**
 * Commander Builds API
 * 
 * GET /api/commanders/[id]/builds
 * Returns available build archetypes for a commander from ref_commander_builds.
 * Ordered by deck count (most popular first).
 * 
 * Each build includes category averages for deck composition guidance.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

interface CommanderBuild {
  id: string
  archetype: string | null
  theme: string | null
  edhrecThemeSlug: string
  deckCount: number
  deckPercentage: number
  // Category averages for deck composition
  avgLands: number | null
  avgRamp: number | null
  avgDraw: number | null
  avgRemoval: number | null
  avgWipes: number | null
  avgCreatures: number | null
  avgArtifacts: number | null
  avgEnchantments: number | null
  avgInstants: number | null
  avgSorceries: number | null
  avgPlaneswalkers: number | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: commanderId } = await params
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(commanderId)) {
    return NextResponse.json({ error: 'Invalid commander ID' }, { status: 400 })
  }
  
  const supabase = createAdminClient()
  
  try {
    // Verify commander exists
    const { data: commander, error: cmdErr } = await supabase
      .from('ref_commanders')
      .select('id, display_name, color_identity')
      .eq('id', commanderId)
      .maybeSingle()
    
    if (cmdErr) {
      console.error('[api/commanders/builds] Commander lookup error:', cmdErr)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    if (!commander) {
      return NextResponse.json({ error: 'Commander not found' }, { status: 404 })
    }
    
    // Get builds for this commander
    const { data: builds, error: buildErr } = await supabase
      .from('ref_commander_builds')
      .select(`
        id,
        archetype,
        theme,
        edhrec_theme_slug,
        deck_count,
        deck_percentage,
        avg_lands,
        avg_ramp,
        avg_draw,
        avg_removal,
        avg_wipes,
        avg_creatures,
        avg_artifacts,
        avg_enchantments,
        avg_instants,
        avg_sorceries,
        avg_planeswalkers
      `)
      .eq('commander_id', commanderId)
      .order('deck_count', { ascending: false })
    
    if (buildErr) {
      console.error('[api/commanders/builds] Query error:', buildErr)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    const result: CommanderBuild[] = (builds || []).map(row => ({
      id: row.id,
      archetype: row.archetype,
      theme: row.theme,
      edhrecThemeSlug: row.edhrec_theme_slug,
      deckCount: row.deck_count ?? 0,
      deckPercentage: Number(row.deck_percentage ?? 0),
      avgLands: row.avg_lands ? Number(row.avg_lands) : null,
      avgRamp: row.avg_ramp ? Number(row.avg_ramp) : null,
      avgDraw: row.avg_draw ? Number(row.avg_draw) : null,
      avgRemoval: row.avg_removal ? Number(row.avg_removal) : null,
      avgWipes: row.avg_wipes ? Number(row.avg_wipes) : null,
      avgCreatures: row.avg_creatures ? Number(row.avg_creatures) : null,
      avgArtifacts: row.avg_artifacts ? Number(row.avg_artifacts) : null,
      avgEnchantments: row.avg_enchantments ? Number(row.avg_enchantments) : null,
      avgInstants: row.avg_instants ? Number(row.avg_instants) : null,
      avgSorceries: row.avg_sorceries ? Number(row.avg_sorceries) : null,
      avgPlaneswalkers: row.avg_planeswalkers ? Number(row.avg_planeswalkers) : null,
    }))
    
    return NextResponse.json({
      commanderId,
      commanderName: commander.display_name,
      colorIdentity: commander.color_identity,
      builds: result,
      count: result.length,
    })
  } catch (error) {
    console.error('[api/commanders/builds] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
