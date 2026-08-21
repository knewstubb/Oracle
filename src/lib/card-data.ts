/**
 * Card Data Utility
 * 
 * Provides simple, DB-first card lookup functions for common operations.
 * Uses ref_cards for card metadata and ref_printings for printing-specific data.
 * 
 * Unlike card-lookup.ts (which has Scryfall fallback for import operations),
 * these functions are DB-only and return null if the card isn't found locally.
 * This is intentional — we don't want to hit external APIs for UI operations.
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardData {
  name: string
  type_line: string
  mana_cost: string | null
  mana_value: number | null
  color_identity: string
  oracle_text: string | null
  power: string | null
  toughness: string | null
  can_be_commander: boolean
  is_legendary: boolean
  is_creature: boolean
  commander_legal: boolean
  default_category: string | null
  edhrec_rank: number | null
}

export interface PrintingData {
  scryfall_id: string
  oracle_id: string
  name: string
  set_code: string
  set_name: string
  collector_number: string
  rarity: string
  mana_cost: string | null
  type_line: string | null
  color_identity: string[] | null
  price_usd: number | null
  image_uri_small: string | null
  image_uri_normal: string | null
  image_uri_large: string | null
  image_uri_art_crop: string | null
  released_at: string | null
}

export interface CardWithPrinting extends CardData {
  printing: PrintingData | null
}

// ---------------------------------------------------------------------------
// Core Lookup Functions
// ---------------------------------------------------------------------------

/**
 * Get card metadata by exact name from ref_cards.
 * Returns null if not found (no API fallback).
 */
export async function getCardByName(cardName: string): Promise<CardData | null> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('ref_cards')
    .select('*')
    .eq('name', cardName)
    .single()
  
  if (error || !data) {
    // Try front-face match for DFCs (e.g., "Muldrotha" matches "Muldrotha, the Gravetide // ...")
    const frontFace = cardName.split(' // ')[0]
    if (frontFace !== cardName) {
      const { data: dfcData } = await supabase
        .from('ref_cards')
        .select('*')
        .ilike('name', `${frontFace} // %`)
        .single()
      
      if (dfcData) return dfcData as CardData
    }
    
    return null
  }
  
  return data as CardData
}

/**
 * Get card metadata by fuzzy name match.
 * Tries exact match first, then case-insensitive, then partial match.
 */
export async function getCardByFuzzyName(cardName: string): Promise<CardData | null> {
  const supabase = createAdminClient()
  
  // Try exact match first
  const { data: exact } = await supabase
    .from('ref_cards')
    .select('*')
    .eq('name', cardName)
    .single()
  
  if (exact) return exact as CardData
  
  // Try case-insensitive match
  const { data: ilike } = await supabase
    .from('ref_cards')
    .select('*')
    .ilike('name', cardName)
    .single()
  
  if (ilike) return ilike as CardData
  
  // Try partial match (front face for DFCs)
  const frontFace = cardName.split(' // ')[0]
  const { data: partial } = await supabase
    .from('ref_cards')
    .select('*')
    .ilike('name', `${frontFace}%`)
    .limit(1)
    .single()
  
  return partial as CardData | null
}

/**
 * Get the most recent "standard" printing for a card.
 * Excludes promo, Secret Lair, and other special sets that may have alternate names/art.
 * Returns printing data including image URLs.
 * 
 * Uses exact match first for performance, then case-insensitive fallback.
 */
export async function getCardPrinting(cardName: string): Promise<PrintingData | null> {
  const supabase = createAdminClient()
  
  // Set codes to exclude — these often have alternate card names or special art
  // that shouldn't be the default display
  const excludedSetCodes = ['sld', 'plst', 'plist', 'pmtg1', 'pw21', 'pw22', 'slu', 'slp', 'fca']
  
  const selectFields = 'scryfall_id, oracle_id, name, set_code, set_name, collector_number, rarity, mana_cost, type_line, color_identity, price_usd, image_uri_small, image_uri_normal, image_uri_large, image_uri_art_crop, released_at'
  
  // Helper to find standard printing from candidates
  const findStandardPrinting = (candidates: PrintingData[]): PrintingData | null => {
    const standardPrinting = candidates.find(p => !excludedSetCodes.includes(p.set_code))
    return standardPrinting || candidates[0] || null
  }
  
  // First try: exact match (fast, case-sensitive), paper printings only
  const { data: exactCandidates, error: exactError } = await supabase
    .from('ref_printings')
    .select(selectFields)
    .eq('name', cardName)
    .eq('digital', false)
    .order('released_at', { ascending: false })
    .limit(10)
  
  if (!exactError && exactCandidates && exactCandidates.length > 0) {
    return findStandardPrinting(exactCandidates as PrintingData[])
  }
  
  // Second try: case-insensitive match (handles AI-generated card names with wrong casing)
  const { data: ilikeCandidates, error: ilikeError } = await supabase
    .from('ref_printings')
    .select(selectFields)
    .ilike('name', cardName)
    .eq('digital', false)
    .order('released_at', { ascending: false })
    .limit(10)
  
  if (!ilikeError && ilikeCandidates && ilikeCandidates.length > 0) {
    return findStandardPrinting(ilikeCandidates as PrintingData[])
  }
  
  // Try front-face match for DFCs (when full name given but stored differently)
  const frontFace = cardName.split(' // ')[0]
  if (frontFace !== cardName) {
    const { data: dfcCandidates } = await supabase
      .from('ref_printings')
      .select(selectFields)
      .ilike('name', `${frontFace} // %`)
      .eq('digital', false)
      .order('released_at', { ascending: false })
      .limit(10)
    
    if (dfcCandidates && dfcCandidates.length > 0) {
      return findStandardPrinting(dfcCandidates as PrintingData[])
    }
  }
  
  // Try DFC reverse lookup: single face name → find full DFC name
  // e.g., "Invasion of Innistrad" → "Invasion of Innistrad // Deluge of the Dead"
  if (!cardName.includes(' // ')) {
    const { data: dfcReverseCandidates } = await supabase
      .from('ref_printings')
      .select(selectFields)
      .ilike('name', `${cardName} // %`)
      .eq('digital', false)
      .order('released_at', { ascending: false })
      .limit(10)
    
    if (dfcReverseCandidates && dfcReverseCandidates.length > 0) {
      return findStandardPrinting(dfcReverseCandidates as PrintingData[])
    }
  }
  
  return null
}

/**
 * Get card data with its most recent printing.
 * Combines ref_cards metadata with ref_printings image/price data.
 */
export async function getCardWithPrinting(cardName: string): Promise<CardWithPrinting | null> {
  const [card, printing] = await Promise.all([
    getCardByName(cardName),
    getCardPrinting(cardName),
  ])
  
  if (!card) return null
  
  return { ...card, printing }
}

// ---------------------------------------------------------------------------
// Specific Use-Case Functions
// ---------------------------------------------------------------------------

/**
 * Get art crop URL for a card.
 * Returns null if card/printing not found.
 */
export async function getCardArtUrl(cardName: string): Promise<string | null> {
  const printing = await getCardPrinting(cardName)
  return printing?.image_uri_art_crop ?? null
}

/**
 * Validate if a card can be a commander.
 * Returns { valid: true, card } if valid, { valid: false, reason } if not.
 */
export async function validateCommander(cardName: string): Promise<
  | { valid: true; card: CardData }
  | { valid: false; reason: string }
> {
  const card = await getCardByFuzzyName(cardName)
  
  if (!card) {
    return { valid: false, reason: 'Card not found in database' }
  }
  
  if (!card.can_be_commander) {
    return { valid: false, reason: `${card.name} cannot be used as a commander` }
  }
  
  if (!card.commander_legal) {
    return { valid: false, reason: `${card.name} is not legal in Commander` }
  }
  
  return { valid: true, card }
}

/**
 * Get card enrichment data (CMC, type_line, color_identity).
 * Used to enrich cards added to deck lists.
 */
export async function getCardEnrichment(cardName: string): Promise<{
  name: string
  cmc: number
  type_line: string
  color_identity: string[]
} | null> {
  const card = await getCardByFuzzyName(cardName)
  
  if (!card) return null
  
  return {
    name: card.name,
    cmc: card.mana_value ?? 0,
    type_line: card.type_line,
    color_identity: card.color_identity.split('').filter(c => 'WUBRG'.includes(c)),
  }
}

// ---------------------------------------------------------------------------
// Batch Operations
// ---------------------------------------------------------------------------

/**
 * Get multiple cards by name in a single query.
 * Returns a Map of name -> CardData (null if not found).
 */
export async function getCardsByNames(cardNames: string[]): Promise<Map<string, CardData | null>> {
  const supabase = createAdminClient()
  const results = new Map<string, CardData | null>()
  
  const { data } = await supabase
    .from('ref_cards')
    .select('*')
    .in('name', cardNames)
  
  // Index by name
  const found = new Map<string, CardData>()
  for (const card of data || []) {
    found.set(card.name, card as CardData)
  }
  
  // Build results, marking missing as null
  for (const name of cardNames) {
    results.set(name, found.get(name) ?? null)
  }
  
  return results
}

/**
 * Get printings for multiple cards in a single query.
 * Returns most recent paper printing for each card.
 */
export async function getPrintingsByNames(cardNames: string[]): Promise<Map<string, PrintingData | null>> {
  const supabase = createAdminClient()
  const results = new Map<string, PrintingData | null>()
  
  const { data } = await supabase
    .from('ref_printings')
    .select('scryfall_id, name, set_code, set_name, collector_number, rarity, price_usd, image_uri_small, image_uri_normal, image_uri_large, image_uri_art_crop, released_at')
    .in('name', cardNames)
    .eq('digital', false)
    .order('released_at', { ascending: false })
  
  // Keep only the most recent printing per name
  const found = new Map<string, PrintingData>()
  for (const printing of data || []) {
    if (!found.has(printing.name)) {
      found.set(printing.name, printing as PrintingData)
    }
  }
  
  // Build results, marking missing as null
  for (const name of cardNames) {
    results.set(name, found.get(name) ?? null)
  }
  
  return results
}

/**
 * Validate multiple commanders in a single query.
 * Returns a Map of name -> validation result.
 */
export async function validateCommanders(cardNames: string[]): Promise<Map<string, { valid: boolean; reason?: string }>> {
  const cards = await getCardsByNames(cardNames)
  const results = new Map<string, { valid: boolean; reason?: string }>()
  
  for (const name of cardNames) {
    const card = cards.get(name)
    
    if (!card) {
      results.set(name, { valid: false, reason: 'Card not found in database' })
    } else if (!card.can_be_commander) {
      results.set(name, { valid: false, reason: `${card.name} cannot be used as a commander` })
    } else if (!card.commander_legal) {
      results.set(name, { valid: false, reason: `${card.name} is not legal in Commander` })
    } else {
      results.set(name, { valid: true })
    }
  }
  
  return results
}


// ---------------------------------------------------------------------------
// Rulings Lookup (via Scryfall API — DB table dropped to save space)
// ---------------------------------------------------------------------------

export interface CardRuling {
  oracle_id: string
  source: 'wotc' | 'scryfall'
  published_at: string
  comment: string
}

/**
 * Get rulings for a card by name via Scryfall API.
 * Returns empty array if card or rulings not found.
 * 
 * Note: Previously fetched from ref_rulings table, but that was dropped
 * to reduce database size (~46 MB savings). Scryfall API is fast enough
 * for the occasional ruling lookup.
 */
export async function getRulingsByCardName(cardName: string): Promise<CardRuling[]> {
  try {
    // Fetch card to get rulings_uri
    const cardRes = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`,
      { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
    )
    if (!cardRes.ok) return []
    
    const card = await cardRes.json()
    if (!card.rulings_uri) return []
    
    // Fetch rulings
    const rulingsRes = await fetch(card.rulings_uri, {
      headers: { 'User-Agent': 'TheOracle/0.1.0' },
    })
    if (!rulingsRes.ok) return []
    
    const rulingsData = await rulingsRes.json()
    const rulings = rulingsData.data || []
    
    return rulings.map((r: { oracle_id: string; source: string; published_at: string; comment: string }) => ({
      oracle_id: r.oracle_id,
      source: r.source as 'wotc' | 'scryfall',
      published_at: r.published_at,
      comment: r.comment,
    }))
  } catch {
    return []
  }
}

/**
 * Get rulings by oracle_id directly via Scryfall API.
 * @deprecated Use getRulingsByCardName instead — oracle_id lookup requires
 * an extra API call to resolve the card first.
 */
export async function getRulingsByOracleId(oracleId: string): Promise<CardRuling[]> {
  try {
    // Fetch card by oracle_id to get rulings_uri
    const cardRes = await fetch(
      `https://api.scryfall.com/cards/search?q=oracle_id:${oracleId}&unique=cards`,
      { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
    )
    if (!cardRes.ok) return []
    
    const cardData = await cardRes.json()
    const card = cardData.data?.[0]
    if (!card?.rulings_uri) return []
    
    // Fetch rulings
    const rulingsRes = await fetch(card.rulings_uri, {
      headers: { 'User-Agent': 'TheOracle/0.1.0' },
    })
    if (!rulingsRes.ok) return []
    
    const rulingsData = await rulingsRes.json()
    const rulings = rulingsData.data || []
    
    return rulings.map((r: { oracle_id: string; source: string; published_at: string; comment: string }) => ({
      oracle_id: r.oracle_id,
      source: r.source as 'wotc' | 'scryfall',
      published_at: r.published_at,
      comment: r.comment,
    }))
  } catch {
    return []
  }
}
