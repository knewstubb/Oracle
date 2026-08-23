/**
 * Commander Insights API
 * 
 * GET /api/commanders/[id]/insights?archetype=aristocrats&build_variant=treasure
 * Returns insights for a commander from ref_commander_insights.
 * Optionally filters by archetype or build_variant.
 * 
 * Returns general insights (build_variant IS NULL) plus build-specific
 * insights if archetype/build_variant is provided.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

interface CommanderInsight {
  id: string
  insightType: string
  content: string
  buildVariant: string | null
  archetype: string | null
  confidence: number
  cardMentions: string[]
  sourceType: string
  sourceUrl: string | null
  sourceTitle: string | null
  sourceAuthor: string | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: commanderId } = await params
  const { searchParams } = new URL(request.url)
  
  const archetype = searchParams.get('archetype')?.toLowerCase() || null
  const buildVariant = searchParams.get('build_variant')?.toLowerCase() || null
  
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
      .select('id, display_name')
      .eq('id', commanderId)
      .maybeSingle()
    
    if (cmdErr) {
      console.error('[api/commanders/insights] Commander lookup error:', cmdErr)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    if (!commander) {
      return NextResponse.json({ error: 'Commander not found' }, { status: 404 })
    }
    
    // Build query for insights
    // Always include general insights (build_variant IS NULL)
    // Plus build-specific insights if archetype/buildVariant provided
    let query = supabase
      .from('ref_commander_insights')
      .select(`
        id,
        insight_type,
        content,
        build_variant,
        archetype,
        confidence,
        card_mentions,
        source_type,
        source_url,
        source_title,
        source_author
      `)
      .eq('commander_id', commanderId)
      .order('confidence', { ascending: false })
    
    // If filtering by archetype or build_variant, get:
    // 1. General insights (build_variant IS NULL AND archetype IS NULL)
    // 2. Matching build-specific insights
    if (archetype || buildVariant) {
      // Build OR condition for general + specific
      // PostgREST syntax: and(a,b) for AND, or(a,b) for OR
      const conditions: string[] = [
        // General insights have both null — use and() for the compound condition
        'and(build_variant.is.null,archetype.is.null)'
      ]
      
      if (archetype) {
        conditions.push(`archetype.ilike.%${archetype}%`)
      }
      if (buildVariant) {
        conditions.push(`build_variant.ilike.%${buildVariant}%`)
      }
      
      query = query.or(conditions.join(','))
    }
    
    const { data: insights, error: insightErr } = await query.limit(50)
    
    if (insightErr) {
      console.error('[api/commanders/insights] Query error:', insightErr)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    // Group insights by type for easier consumption
    const result: CommanderInsight[] = (insights || []).map(row => ({
      id: row.id,
      insightType: row.insight_type,
      content: row.content,
      buildVariant: row.build_variant,
      archetype: row.archetype,
      confidence: row.confidence ?? 0.5,
      cardMentions: row.card_mentions ?? [],
      sourceType: row.source_type,
      sourceUrl: row.source_url,
      sourceTitle: row.source_title,
      sourceAuthor: row.source_author,
    }))
    
    // Group by insight type
    const byType: Record<string, CommanderInsight[]> = {}
    for (const insight of result) {
      if (!byType[insight.insightType]) {
        byType[insight.insightType] = []
      }
      byType[insight.insightType].push(insight)
    }
    
    return NextResponse.json({
      commanderId,
      commanderName: commander.display_name,
      insights: result,
      byType,
      filters: { archetype, buildVariant },
    })
  } catch (error) {
    console.error('[api/commanders/insights] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
