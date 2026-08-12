/**
 * Commander Build Data Layer
 * 
 * Provides typed access to ref_commander_builds and ref_build_cards tables.
 * Used by the brew flow to get grounded card recommendations instead of
 * asking the AI to generate card names from memory.
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommanderBuild {
  id: string
  commanderId: string
  archetype: string | null
  theme: string | null
  edhrecThemeSlug: string
  deckCount: number
  deckPercentage: number
  avgLands: number | null
  avgCreatures: number | null
  avgInstants: number | null
  avgSorceries: number | null
  avgArtifacts: number | null
  avgEnchantments: number | null
  avgPlaneswalkers: number | null
}

export interface BuildCard {
  cardName: string
  cardType: string
  synergyScore: number
  inclusionRate: number
  position: number
  isSignature: boolean
  isStaple: boolean
}

export interface CommanderInfo {
  id: string
  displayName: string
  colorIdentity: string
  canonicalKey: string
  edhrecRank: number | null
  edhrecDeckCount: number | null
}

// ---------------------------------------------------------------------------
// Commander Lookup
// ---------------------------------------------------------------------------

/**
 * Find a commander by name (case-insensitive).
 * Returns null if not found in ref_commanders.
 */
export async function getCommanderByName(
  commanderName: string
): Promise<CommanderInfo | null> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('ref_commanders')
    .select('id, display_name, color_identity, canonical_key, edhrec_rank, edhrec_deck_count')
    .ilike('display_name', commanderName)
    .limit(1)
    .maybeSingle()
  
  if (error || !data) return null
  
  return {
    id: data.id,
    displayName: data.display_name,
    colorIdentity: data.color_identity ?? '',
    canonicalKey: data.canonical_key,
    edhrecRank: data.edhrec_rank,
    edhrecDeckCount: data.edhrec_deck_count,
  }
}

/**
 * Find a commander by ID.
 */
export async function getCommanderById(
  commanderId: string
): Promise<CommanderInfo | null> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('ref_commanders')
    .select('id, display_name, color_identity, canonical_key, edhrec_rank, edhrec_deck_count')
    .eq('id', commanderId)
    .single()
  
  if (error || !data) return null
  
  return {
    id: data.id,
    displayName: data.display_name,
    colorIdentity: data.color_identity ?? '',
    canonicalKey: data.canonical_key,
    edhrecRank: data.edhrec_rank,
    edhrecDeckCount: data.edhrec_deck_count,
  }
}

// ---------------------------------------------------------------------------
// Build Lookup
// ---------------------------------------------------------------------------

/**
 * Get all available builds for a commander.
 * Builds are archetype+theme combinations (e.g., "aristocrats" + "treasure").
 * Ordered by deck count (most popular first).
 */
export async function getBuildsByCommander(
  commanderId: string
): Promise<CommanderBuild[]> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('ref_commander_builds')
    .select(`
      id,
      commander_id,
      archetype,
      theme,
      edhrec_theme_slug,
      deck_count,
      deck_percentage,
      avg_lands,
      avg_creatures,
      avg_instants,
      avg_sorceries,
      avg_artifacts,
      avg_enchantments,
      avg_planeswalkers
    `)
    .eq('commander_id', commanderId)
    .order('deck_count', { ascending: false })
  
  if (error || !data) return []
  
  return data.map(row => ({
    id: row.id,
    commanderId: row.commander_id,
    archetype: row.archetype,
    theme: row.theme,
    edhrecThemeSlug: row.edhrec_theme_slug,
    deckCount: row.deck_count ?? 0,
    deckPercentage: row.deck_percentage ?? 0,
    avgLands: row.avg_lands,
    avgCreatures: row.avg_creatures,
    avgInstants: row.avg_instants,
    avgSorceries: row.avg_sorceries,
    avgArtifacts: row.avg_artifacts,
    avgEnchantments: row.avg_enchantments,
    avgPlaneswalkers: row.avg_planeswalkers,
  }))
}

/**
 * Get builds for a commander by name.
 * Convenience wrapper that resolves commander name first.
 */
export async function getBuildsByCommanderName(
  commanderName: string
): Promise<{ commander: CommanderInfo; builds: CommanderBuild[] } | null> {
  const commander = await getCommanderByName(commanderName)
  if (!commander) return null
  
  const builds = await getBuildsByCommander(commander.id)
  return { commander, builds }
}

/**
 * Get a specific build by ID.
 */
export async function getBuildById(
  buildId: string
): Promise<CommanderBuild | null> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('ref_commander_builds')
    .select(`
      id,
      commander_id,
      archetype,
      theme,
      edhrec_theme_slug,
      deck_count,
      deck_percentage,
      avg_lands,
      avg_creatures,
      avg_instants,
      avg_sorceries,
      avg_artifacts,
      avg_enchantments,
      avg_planeswalkers
    `)
    .eq('id', buildId)
    .single()
  
  if (error || !data) return null
  
  return {
    id: data.id,
    commanderId: data.commander_id,
    archetype: data.archetype,
    theme: data.theme,
    edhrecThemeSlug: data.edhrec_theme_slug,
    deckCount: data.deck_count ?? 0,
    deckPercentage: data.deck_percentage ?? 0,
    avgLands: data.avg_lands,
    avgCreatures: data.avg_creatures,
    avgInstants: data.avg_instants,
    avgSorceries: data.avg_sorceries,
    avgArtifacts: data.avg_artifacts,
    avgEnchantments: data.avg_enchantments,
    avgPlaneswalkers: data.avg_planeswalkers,
  }
}

// ---------------------------------------------------------------------------
// Build Cards (Recommendations)
// ---------------------------------------------------------------------------

/**
 * Get recommended cards for a specific build.
 * Returns cards sorted by synergy score (highest first).
 * 
 * Options:
 * - limit: Max cards to return (default: 100)
 * - cardType: Filter by card type (creature, instant, etc.)
 * - minInclusionRate: Minimum inclusion rate (0-100)
 * - maxPrice: Maximum price in USD (requires join to ref_printings)
 */
export async function getBuildCards(
  buildId: string,
  options?: {
    limit?: number
    cardType?: string
    minInclusionRate?: number
  }
): Promise<BuildCard[]> {
  const supabase = createAdminClient()
  
  let query = supabase
    .from('ref_build_cards')
    .select('card_name, card_type, synergy_score, inclusion_rate, position, is_signature, is_staple')
    .eq('build_id', buildId)
    .order('synergy_score', { ascending: false })
  
  if (options?.cardType) {
    query = query.eq('card_type', options.cardType.toLowerCase())
  }
  
  if (options?.minInclusionRate !== undefined) {
    query = query.gte('inclusion_rate', options.minInclusionRate)
  }
  
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  
  const { data, error } = await query
  
  if (error || !data) return []
  
  return data.map(row => ({
    cardName: row.card_name,
    cardType: row.card_type ?? 'unknown',
    synergyScore: row.synergy_score ?? 0,
    inclusionRate: row.inclusion_rate ?? 0,
    position: row.position ?? 0,
    isSignature: row.is_signature ?? false,
    isStaple: row.is_staple ?? false,
  }))
}

/**
 * Get build cards grouped by card type.
 * Useful for building a deck skeleton with proper distribution.
 */
export async function getBuildCardsByType(
  buildId: string,
  options?: { limit?: number; minInclusionRate?: number }
): Promise<Map<string, BuildCard[]>> {
  const cards = await getBuildCards(buildId, { 
    limit: options?.limit ?? 200,
    minInclusionRate: options?.minInclusionRate,
  })
  
  const byType = new Map<string, BuildCard[]>()
  
  for (const card of cards) {
    const type = card.cardType
    if (!byType.has(type)) {
      byType.set(type, [])
    }
    byType.get(type)!.push(card)
  }
  
  return byType
}

/**
 * Get signature cards for a build (high synergy + high inclusion).
 * These are the "must-haves" that define the build.
 */
export async function getSignatureCards(
  buildId: string,
  limit = 20
): Promise<BuildCard[]> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('ref_build_cards')
    .select('card_name, card_type, synergy_score, inclusion_rate, position, is_signature, is_staple')
    .eq('build_id', buildId)
    .eq('is_signature', true)
    .order('synergy_score', { ascending: false })
    .limit(limit)
  
  if (error || !data) return []
  
  return data.map(row => ({
    cardName: row.card_name,
    cardType: row.card_type ?? 'unknown',
    synergyScore: row.synergy_score ?? 0,
    inclusionRate: row.inclusion_rate ?? 0,
    position: row.position ?? 0,
    isSignature: true,
    isStaple: row.is_staple ?? false,
  }))
}

/**
 * Get staple cards for a build (high inclusion, may or may not be high synergy).
 * These are the "common includes" that most decks of this build run.
 */
export async function getStapleCards(
  buildId: string,
  limit = 30
): Promise<BuildCard[]> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('ref_build_cards')
    .select('card_name, card_type, synergy_score, inclusion_rate, position, is_signature, is_staple')
    .eq('build_id', buildId)
    .eq('is_staple', true)
    .order('inclusion_rate', { ascending: false })
    .limit(limit)
  
  if (error || !data) return []
  
  return data.map(row => ({
    cardName: row.card_name,
    cardType: row.card_type ?? 'unknown',
    synergyScore: row.synergy_score ?? 0,
    inclusionRate: row.inclusion_rate ?? 0,
    position: row.position ?? 0,
    isSignature: row.is_signature ?? false,
    isStaple: true,
  }))
}

// ---------------------------------------------------------------------------
// Combined Helpers
// ---------------------------------------------------------------------------

/**
 * Get a complete card pool for deck building.
 * Returns cards organized for the AI to select from.
 */
export async function getCardPoolForBuild(
  buildId: string
): Promise<{
  build: CommanderBuild | null
  signatureCards: BuildCard[]
  stapleCards: BuildCard[]
  allCards: BuildCard[]
  byType: Map<string, BuildCard[]>
}> {
  const [build, signatureCards, stapleCards, allCards] = await Promise.all([
    getBuildById(buildId),
    getSignatureCards(buildId),
    getStapleCards(buildId),
    getBuildCards(buildId, { limit: 150 }),
  ])
  
  const byType = new Map<string, BuildCard[]>()
  for (const card of allCards) {
    const type = card.cardType
    if (!byType.has(type)) {
      byType.set(type, [])
    }
    byType.get(type)!.push(card)
  }
  
  return { build, signatureCards, stapleCards, allCards, byType }
}

/**
 * Find the best build for a commander based on archetype preference.
 * If no archetype specified, returns the most popular build.
 */
export async function findBestBuild(
  commanderId: string,
  preferredArchetype?: string
): Promise<CommanderBuild | null> {
  const builds = await getBuildsByCommander(commanderId)
  
  if (builds.length === 0) return null
  
  if (preferredArchetype) {
    const match = builds.find(b => 
      b.archetype?.toLowerCase() === preferredArchetype.toLowerCase()
    )
    if (match) return match
  }
  
  // Return most popular build
  return builds[0]
}

/**
 * Format build cards as a text list for AI prompts.
 * Groups by card type and includes synergy/inclusion data.
 */
export function formatBuildCardsForPrompt(
  cards: BuildCard[],
  options?: { maxPerType?: number; includeStats?: boolean }
): string {
  const byType = new Map<string, BuildCard[]>()
  
  for (const card of cards) {
    const type = card.cardType
    if (!byType.has(type)) {
      byType.set(type, [])
    }
    byType.get(type)!.push(card)
  }
  
  const lines: string[] = []
  const maxPerType = options?.maxPerType ?? 15
  const includeStats = options?.includeStats ?? true
  
  const typeOrder = ['creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land']
  
  for (const type of typeOrder) {
    const typeCards = byType.get(type)
    if (!typeCards || typeCards.length === 0) continue
    
    lines.push(`\n## ${type.charAt(0).toUpperCase() + type.slice(1)}s (${typeCards.length} cards)`)
    
    const toShow = typeCards.slice(0, maxPerType)
    for (const card of toShow) {
      if (includeStats) {
        const synPct = Math.round(card.synergyScore * 100)
        const synLabel = synPct >= 0 ? `+${synPct}%` : `${synPct}%`
        const sig = card.isSignature ? ' [SIGNATURE]' : ''
        lines.push(`- ${card.cardName} | ${card.inclusionRate}% inclusion | ${synLabel} synergy${sig}`)
      } else {
        lines.push(`- ${card.cardName}`)
      }
    }
    
    if (typeCards.length > maxPerType) {
      lines.push(`  ... and ${typeCards.length - maxPerType} more`)
    }
  }
  
  return lines.join('\n')
}
