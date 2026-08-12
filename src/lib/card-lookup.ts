/**
 * Card Lookup Service
 * 
 * Provides card data lookups that check the local printings table first,
 * falling back to Scryfall API only for cards not in the local database.
 * 
 * This dramatically reduces API calls and improves response times once the
 * printings table is populated via the daily sync.
 */

import { createAdminClient } from '@/lib/supabase'

const SCRYFALL_USER_AGENT = 'TheOracle/0.2.0'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardPrinting {
  scryfall_id: string
  oracle_id: string
  name: string
  set_code: string
  set_name: string
  collector_number: string
  rarity: string
  price_usd: number | null
  price_usd_foil: number | null
  price_eur: number | null
  price_eur_foil: number | null
  image_uri_small: string | null
  image_uri_normal: string | null
  image_uri_large: string | null
  image_uri_art_crop: string | null
  type_line: string | null
  mana_cost: string | null
  cmc: number | null
  colors: string[] | null
  color_identity: string[] | null
  legality_commander: string | null
  layout: string | null
  released_at: string | null
}

export interface CardLookupResult {
  card: CardPrinting | null
  source: 'local' | 'api' | 'not_found'
}

// ---------------------------------------------------------------------------
// Lookup by Scryfall ID
// ---------------------------------------------------------------------------

export async function lookupByScryfallId(scryfallId: string): Promise<CardLookupResult> {
  const supabase = createAdminClient()
  
  // Try local first
  const { data, error } = await supabase
    .from('ref_printings')
    .select('*')
    .eq('scryfall_id', scryfallId)
    .single()
  
  if (data && !error) {
    return { card: data as CardPrinting, source: 'local' }
  }
  
  // Fallback to Scryfall API
  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/${scryfallId}`,
      { headers: { 'User-Agent': SCRYFALL_USER_AGENT } }
    )
    
    if (!response.ok) {
      return { card: null, source: 'not_found' }
    }
    
    const apiCard = await response.json()
    return { card: scryfallApiToCardPrinting(apiCard), source: 'api' }
  } catch {
    return { card: null, source: 'not_found' }
  }
}

// ---------------------------------------------------------------------------
// Lookup by Set Code + Collector Number
// ---------------------------------------------------------------------------

export async function lookupBySetAndNumber(
  setCode: string,
  collectorNumber: string
): Promise<CardLookupResult> {
  const supabase = createAdminClient()
  
  // Try local first
  const { data, error } = await supabase
    .from('ref_printings')
    .select('*')
    .eq('set_code', setCode.toLowerCase())
    .eq('collector_number', collectorNumber)
    .single()
  
  if (data && !error) {
    return { card: data as CardPrinting, source: 'local' }
  }
  
  // Fallback to Scryfall API
  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`,
      { headers: { 'User-Agent': SCRYFALL_USER_AGENT } }
    )
    
    if (!response.ok) {
      return { card: null, source: 'not_found' }
    }
    
    const apiCard = await response.json()
    return { card: scryfallApiToCardPrinting(apiCard), source: 'api' }
  } catch {
    return { card: null, source: 'not_found' }
  }
}

// ---------------------------------------------------------------------------
// Lookup by Card Name (exact match)
// ---------------------------------------------------------------------------

export async function lookupByName(cardName: string): Promise<CardLookupResult> {
  const supabase = createAdminClient()
  
  // Try local first — get the most recent printing
  const { data, error } = await supabase
    .from('ref_printings')
    .select('*')
    .eq('name', cardName)
    .order('released_at', { ascending: false })
    .limit(1)
    .single()
  
  if (data && !error) {
    return { card: data as CardPrinting, source: 'local' }
  }
  
  // Try with front-face name for DFCs
  const frontFace = cardName.split(' // ')[0]
  if (frontFace !== cardName) {
    const { data: dfcData } = await supabase
      .from('ref_printings')
      .select('*')
      .ilike('name', `${frontFace} // %`)
      .order('released_at', { ascending: false })
      .limit(1)
      .single()
    
    if (dfcData) {
      return { card: dfcData as CardPrinting, source: 'local' }
    }
  }
  
  // Fallback to Scryfall API
  try {
    let response = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`,
      { headers: { 'User-Agent': SCRYFALL_USER_AGENT } }
    )
    
    // Try fuzzy if exact fails
    if (!response.ok) {
      response = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`,
        { headers: { 'User-Agent': SCRYFALL_USER_AGENT } }
      )
    }
    
    if (!response.ok) {
      return { card: null, source: 'not_found' }
    }
    
    const apiCard = await response.json()
    return { card: scryfallApiToCardPrinting(apiCard), source: 'api' }
  } catch {
    return { card: null, source: 'not_found' }
  }
}

// ---------------------------------------------------------------------------
// Batch Lookup by Names
// ---------------------------------------------------------------------------

export async function lookupManyByName(
  cardNames: string[]
): Promise<Map<string, CardPrinting | null>> {
  const supabase = createAdminClient()
  const results = new Map<string, CardPrinting | null>()
  const notFound: string[] = []
  
  // Batch query local DB
  const { data: localCards } = await supabase
    .from('ref_printings')
    .select('*')
    .in('name', cardNames)
  
  // Build a map of name -> card (most recent printing per name)
  const localMap = new Map<string, CardPrinting>()
  for (const card of localCards || []) {
    const existing = localMap.get(card.name)
    if (!existing || (card.released_at && existing.released_at && card.released_at > existing.released_at)) {
      localMap.set(card.name, card as CardPrinting)
    }
  }
  
  // Check which names we found locally
  for (const name of cardNames) {
    const local = localMap.get(name)
    if (local) {
      results.set(name, local)
    } else {
      notFound.push(name)
    }
  }
  
  // For missing cards, batch query Scryfall API (max 75 per request)
  if (notFound.length > 0) {
    const BATCH_SIZE = 75
    
    for (let i = 0; i < notFound.length; i += BATCH_SIZE) {
      const batch = notFound.slice(i, i + BATCH_SIZE)
      const identifiers = batch.map(name => ({ name }))
      
      try {
        const response = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': SCRYFALL_USER_AGENT,
          },
          body: JSON.stringify({ identifiers }),
        })
        
        if (response.ok) {
          const json = await response.json()
          for (const card of json.data || []) {
            results.set(card.name, scryfallApiToCardPrinting(card))
          }
        }
      } catch {
        // Mark all in batch as not found
      }
      
      // Rate limit between batches
      if (i + BATCH_SIZE < notFound.length) {
        await new Promise(r => setTimeout(r, 100))
      }
    }
  }
  
  // Fill in any still-missing as null
  for (const name of cardNames) {
    if (!results.has(name)) {
      results.set(name, null)
    }
  }
  
  return results
}

// ---------------------------------------------------------------------------
// Get All Printings for a Card
// ---------------------------------------------------------------------------

export async function getAllPrintings(cardName: string): Promise<CardPrinting[]> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('ref_printings')
    .select('*')
    .eq('name', cardName)
    .order('released_at', { ascending: false })
  
  if (error || !data) {
    return []
  }
  
  return data as CardPrinting[]
}

// ---------------------------------------------------------------------------
// Get Cheapest Printing
// ---------------------------------------------------------------------------

export async function getCheapestPrinting(cardName: string): Promise<CardPrinting | null> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('ref_printings')
    .select('*')
    .eq('name', cardName)
    .not('price_usd', 'is', null)
    .order('price_usd', { ascending: true })
    .limit(1)
    .single()
  
  if (error || !data) {
    return null
  }
  
  return data as CardPrinting
}

// ---------------------------------------------------------------------------
// Image URL Helpers
// ---------------------------------------------------------------------------

export function getCardImageUrl(
  card: CardPrinting | null,
  size: 'small' | 'normal' | 'large' | 'art_crop' = 'normal'
): string | null {
  if (!card) return null
  
  switch (size) {
    case 'small': return card.image_uri_small
    case 'normal': return card.image_uri_normal
    case 'large': return card.image_uri_large
    case 'art_crop': return card.image_uri_art_crop
    default: return card.image_uri_normal
  }
}

// ---------------------------------------------------------------------------
// Transform Scryfall API response to CardPrinting
// ---------------------------------------------------------------------------

function scryfallApiToCardPrinting(apiCard: any): CardPrinting {
  const images = apiCard.image_uris || apiCard.card_faces?.[0]?.image_uris || {}
  
  return {
    scryfall_id: apiCard.id,
    oracle_id: apiCard.oracle_id,
    name: apiCard.name,
    set_code: apiCard.set,
    set_name: apiCard.set_name,
    collector_number: apiCard.collector_number,
    rarity: apiCard.rarity,
    price_usd: apiCard.prices?.usd ? parseFloat(apiCard.prices.usd) : null,
    price_usd_foil: apiCard.prices?.usd_foil ? parseFloat(apiCard.prices.usd_foil) : null,
    price_eur: apiCard.prices?.eur ? parseFloat(apiCard.prices.eur) : null,
    price_eur_foil: apiCard.prices?.eur_foil ? parseFloat(apiCard.prices.eur_foil) : null,
    image_uri_small: images.small || null,
    image_uri_normal: images.normal || null,
    image_uri_large: images.large || null,
    image_uri_art_crop: images.art_crop || null,
    type_line: apiCard.type_line || null,
    mana_cost: apiCard.mana_cost || apiCard.card_faces?.[0]?.mana_cost || null,
    cmc: apiCard.cmc ?? null,
    colors: apiCard.colors || null,
    color_identity: apiCard.color_identity || null,
    legality_commander: apiCard.legalities?.commander || null,
    layout: apiCard.layout || null,
    released_at: apiCard.released_at || null,
  }
}
