/**
 * Scryfall Tags Data Layer
 * 
 * Provides typed access to Scryfall's community-curated oracle tags.
 * Used by the brew flow to find cards by functional role (sacrifice outlet,
 * tutor, removal, etc.) rather than asking the AI to recall card names.
 * 
 * Data sources:
 * - data/scryfall-tags/oracle-id-tags.json: Card → tags mapping with archetype/theme signals
 * - data/scryfall-tags/oracle-tags.jsonl: Tag definitions with oracle_id lists
 * 
 * The index is loaded lazily and cached in memory for the server lifetime.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardTagEntry {
  tags: string[]
  archetypeSignals: Array<{ archetype: string; weight: number }>
  themeSignals: Array<{ theme: string; weight: number }>
}

export interface TagDefinition {
  id: string
  label: string
  slug: string
  description: string | null
  oracleIds: string[]
}

export interface TaggedCard {
  oracleId: string
  cardName: string
  tags: string[]
  archetypeSignals: Array<{ archetype: string; weight: number }>
  themeSignals: Array<{ theme: string; weight: number }>
}

// ---------------------------------------------------------------------------
// Index Loading (Lazy, Cached)
// ---------------------------------------------------------------------------

type TagIndex = Record<string, CardTagEntry>

let cachedIndex: TagIndex | null = null
let indexLoadPromise: Promise<TagIndex> | null = null

/**
 * Load the oracle-id-tags.json index.
 * Cached after first load.
 */
async function loadTagIndex(): Promise<TagIndex> {
  if (cachedIndex) return cachedIndex
  
  if (indexLoadPromise) return indexLoadPromise
  
  indexLoadPromise = (async () => {
    try {
      const indexPath = resolve(process.cwd(), 'data/scryfall-tags/oracle-id-tags.json')
      const content = readFileSync(indexPath, 'utf-8')
      cachedIndex = JSON.parse(content) as TagIndex
      return cachedIndex
    } catch (error) {
      console.error('[scryfall-tags] Failed to load tag index:', error)
      cachedIndex = {}
      return cachedIndex
    }
  })()
  
  return indexLoadPromise
}

// ---------------------------------------------------------------------------
// Card Tag Lookup
// ---------------------------------------------------------------------------

/**
 * Get tags and signals for a card by oracle_id.
 */
export async function getCardTags(oracleId: string): Promise<CardTagEntry | null> {
  const index = await loadTagIndex()
  return index[oracleId] ?? null
}

/**
 * Get tags for multiple cards at once.
 */
export async function getCardTagsBatch(
  oracleIds: string[]
): Promise<Map<string, CardTagEntry>> {
  const index = await loadTagIndex()
  const result = new Map<string, CardTagEntry>()
  
  for (const id of oracleIds) {
    const entry = index[id]
    if (entry) {
      result.set(id, entry)
    }
  }
  
  return result
}

// ---------------------------------------------------------------------------
// Functional Role Queries
// ---------------------------------------------------------------------------

/**
 * Find all cards with a specific tag.
 * Resolves oracle_ids to card names via ref_printings.
 * 
 * Example tags:
 * - "sacrifice outlet-creature" (894 cards)
 * - "free sacrifice outlet" (183 cards)
 * - "death trigger" 
 * - "reanimate-creature"
 * - "tutor-creature"
 * - "counterspell"
 */
export async function getCardsByTag(
  tag: string,
  options?: {
    colorIdentity?: string  // Filter to cards legal in this color identity
    limit?: number
  }
): Promise<TaggedCard[]> {
  const index = await loadTagIndex()
  
  // Find all oracle_ids with this tag
  const matchingIds: string[] = []
  for (const [oracleId, entry] of Object.entries(index)) {
    if (entry.tags.includes(tag)) {
      matchingIds.push(oracleId)
    }
  }
  
  if (matchingIds.length === 0) return []
  
  // Resolve oracle_ids to card names via database
  const supabase = createAdminClient()
  
  let query = supabase
    .from('ref_printings')
    .select('oracle_id, name, color_identity')
    .in('oracle_id', matchingIds.slice(0, 500)) // Supabase IN limit
  
  const { data: printings, error } = await query
  
  if (error || !printings) {
    console.error('[scryfall-tags] Failed to resolve card names:', error)
    return []
  }
  
  // Deduplicate by oracle_id (printings has multiple rows per card)
  const seen = new Set<string>()
  const results: TaggedCard[] = []
  
  for (const p of printings) {
    if (seen.has(p.oracle_id)) continue
    seen.add(p.oracle_id)
    
    // Filter by color identity if specified
    if (options?.colorIdentity) {
      const cardCI = (p.color_identity ?? []).join('')
      if (!isSubsetColorIdentity(cardCI, options.colorIdentity)) {
        continue
      }
    }
    
    const entry = index[p.oracle_id]
    results.push({
      oracleId: p.oracle_id,
      cardName: p.name,
      tags: entry?.tags ?? [tag],
      archetypeSignals: entry?.archetypeSignals ?? [],
      themeSignals: entry?.themeSignals ?? [],
    })
  }
  
  // Apply limit
  const limit = options?.limit ?? 100
  return results.slice(0, limit)
}

/**
 * Find cards matching multiple tags (AND logic).
 * Useful for finding cards that serve multiple roles.
 */
export async function getCardsByTags(
  tags: string[],
  options?: {
    colorIdentity?: string
    limit?: number
    matchAll?: boolean // true = AND, false = OR (default: true)
  }
): Promise<TaggedCard[]> {
  const index = await loadTagIndex()
  const matchAll = options?.matchAll ?? true
  
  // Find matching oracle_ids
  const matchingIds: string[] = []
  for (const [oracleId, entry] of Object.entries(index)) {
    if (matchAll) {
      // AND: must have all tags
      if (tags.every(tag => entry.tags.includes(tag))) {
        matchingIds.push(oracleId)
      }
    } else {
      // OR: must have at least one tag
      if (tags.some(tag => entry.tags.includes(tag))) {
        matchingIds.push(oracleId)
      }
    }
  }
  
  if (matchingIds.length === 0) return []
  
  // Resolve to card names
  const supabase = createAdminClient()
  
  const { data: printings, error } = await supabase
    .from('ref_printings')
    .select('oracle_id, name, color_identity')
    .in('oracle_id', matchingIds.slice(0, 500))
  
  if (error || !printings) return []
  
  const seen = new Set<string>()
  const results: TaggedCard[] = []
  
  for (const p of printings) {
    if (seen.has(p.oracle_id)) continue
    seen.add(p.oracle_id)
    
    if (options?.colorIdentity) {
      const cardCI = (p.color_identity ?? []).join('')
      if (!isSubsetColorIdentity(cardCI, options.colorIdentity)) {
        continue
      }
    }
    
    const entry = index[p.oracle_id]
    results.push({
      oracleId: p.oracle_id,
      cardName: p.name,
      tags: entry?.tags ?? [],
      archetypeSignals: entry?.archetypeSignals ?? [],
      themeSignals: entry?.themeSignals ?? [],
    })
  }
  
  const limit = options?.limit ?? 100
  return results.slice(0, limit)
}

/**
 * Find cards by archetype signal.
 * Returns cards that indicate they work well in that archetype.
 */
export async function getCardsByArchetype(
  archetype: string,
  options?: {
    colorIdentity?: string
    minWeight?: number
    limit?: number
  }
): Promise<TaggedCard[]> {
  const index = await loadTagIndex()
  const minWeight = options?.minWeight ?? 1
  
  const matchingIds: Array<{ oracleId: string; weight: number }> = []
  for (const [oracleId, entry] of Object.entries(index)) {
    const signal = entry.archetypeSignals.find(
      s => s.archetype.toLowerCase() === archetype.toLowerCase()
    )
    if (signal && signal.weight >= minWeight) {
      matchingIds.push({ oracleId, weight: signal.weight })
    }
  }
  
  if (matchingIds.length === 0) return []
  
  // Sort by weight descending
  matchingIds.sort((a, b) => b.weight - a.weight)
  
  const supabase = createAdminClient()
  const ids = matchingIds.slice(0, 500).map(m => m.oracleId)
  
  const { data: printings, error } = await supabase
    .from('ref_printings')
    .select('oracle_id, name, color_identity')
    .in('oracle_id', ids)
  
  if (error || !printings) return []
  
  const printingMap = new Map(printings.map(p => [p.oracle_id, p]))
  const seen = new Set<string>()
  const results: TaggedCard[] = []
  
  for (const { oracleId } of matchingIds) {
    if (seen.has(oracleId)) continue
    
    const p = printingMap.get(oracleId)
    if (!p) continue
    
    seen.add(oracleId)
    
    if (options?.colorIdentity) {
      const cardCI = (p.color_identity ?? []).join('')
      if (!isSubsetColorIdentity(cardCI, options.colorIdentity)) {
        continue
      }
    }
    
    const entry = index[oracleId]
    results.push({
      oracleId,
      cardName: p.name,
      tags: entry?.tags ?? [],
      archetypeSignals: entry?.archetypeSignals ?? [],
      themeSignals: entry?.themeSignals ?? [],
    })
    
    if (results.length >= (options?.limit ?? 100)) break
  }
  
  return results
}

/**
 * Find cards by theme signal.
 */
export async function getCardsByTheme(
  theme: string,
  options?: {
    colorIdentity?: string
    minWeight?: number
    limit?: number
  }
): Promise<TaggedCard[]> {
  const index = await loadTagIndex()
  const minWeight = options?.minWeight ?? 1
  
  const matchingIds: Array<{ oracleId: string; weight: number }> = []
  for (const [oracleId, entry] of Object.entries(index)) {
    const signal = entry.themeSignals.find(
      s => s.theme.toLowerCase() === theme.toLowerCase()
    )
    if (signal && signal.weight >= minWeight) {
      matchingIds.push({ oracleId, weight: signal.weight })
    }
  }
  
  if (matchingIds.length === 0) return []
  
  matchingIds.sort((a, b) => b.weight - a.weight)
  
  const supabase = createAdminClient()
  const ids = matchingIds.slice(0, 500).map(m => m.oracleId)
  
  const { data: printings, error } = await supabase
    .from('ref_printings')
    .select('oracle_id, name, color_identity')
    .in('oracle_id', ids)
  
  if (error || !printings) return []
  
  const printingMap = new Map(printings.map(p => [p.oracle_id, p]))
  const seen = new Set<string>()
  const results: TaggedCard[] = []
  
  for (const { oracleId } of matchingIds) {
    if (seen.has(oracleId)) continue
    
    const p = printingMap.get(oracleId)
    if (!p) continue
    
    seen.add(oracleId)
    
    if (options?.colorIdentity) {
      const cardCI = (p.color_identity ?? []).join('')
      if (!isSubsetColorIdentity(cardCI, options.colorIdentity)) {
        continue
      }
    }
    
    const entry = index[oracleId]
    results.push({
      oracleId,
      cardName: p.name,
      tags: entry?.tags ?? [],
      archetypeSignals: entry?.archetypeSignals ?? [],
      themeSignals: entry?.themeSignals ?? [],
    })
    
    if (results.length >= (options?.limit ?? 100)) break
  }
  
  return results
}

// ---------------------------------------------------------------------------
// Slot-Based Queries (for Deck Building)
// ---------------------------------------------------------------------------

/**
 * Functional slot definitions for archetypes.
 * Maps archetype to the tags that fill each slot.
 */
export const ARCHETYPE_SLOTS: Record<string, Record<string, string[]>> = {
  aristocrats: {
    'Sacrifice Outlets': ['sacrifice outlet-creature', 'free sacrifice outlet', 'repeatable sacrifice outlet'],
    'Death Triggers': ['death trigger', 'blood artist ability', 'grave pact'],
    'Fodder/Recursion': ['recursion', 'reanimate-creature'],
    'Token Generators': ['repeatable creature tokens', 'multiple bodies'],
  },
  reanimator: {
    'Reanimation': ['reanimate-creature', 'reanimate-any'],
    'Self-Mill/Enablers': ['mill-self', 'discard outlet', 'graveyard fuel'],
    'Big Targets': [], // Can't easily tag these
    'Recursion': ['recursion', 'castable from graveyard'],
  },
  spellslinger: {
    'Spell Payoffs': ['magecraft', 'cast trigger-you', 'prowess anthem'],
    'Copy Effects': ['copy spell'],
    'Cantrips': ['cantrip'],
    'Cost Reducers': ['cost reduction'],
  },
  blink: {
    'Blink Effects': ['blink', 'flicker'],
    'ETB Payoffs': ['etb', 'creaturefall'],
    'Protection': ['protects-creature', 'rescue'],
  },
  voltron: {
    'Equipment': ['synergy-equipment'],
    'Auras': ['synergy-aura', 'aura'],
    'Protection': ['protects-creature', 'gives hexproof', 'gives indestructible'],
    'Evasion': ['evasion', 'gives trample', 'gives double strike'],
  },
  control: {
    'Counterspells': ['counterspell', 'counterspell-free', 'counterspell-soft'],
    'Removal': ['spot removal', 'removal-exile', 'removal-permanent'],
    'Board Wipes': ['sweeper', 'multi removal'],
    'Card Advantage': ['draw engine', 'pure draw'],
  },
  tokens: {
    'Token Generators': ['repeatable creature tokens', 'multiple bodies'],
    'Token Doublers': ['token doubler'],
    'Anthems': ['anthem', 'power boost to all'],
    'Sacrifice Synergy': ['sacrifice outlet-token', 'your sacrifice matters'],
  },
}

/**
 * Get cards for a specific functional slot in an archetype.
 */
export async function getCardsForSlot(
  archetype: string,
  slotName: string,
  options?: {
    colorIdentity?: string
    limit?: number
  }
): Promise<TaggedCard[]> {
  const slots = ARCHETYPE_SLOTS[archetype.toLowerCase()]
  if (!slots) return []
  
  const tags = slots[slotName]
  if (!tags || tags.length === 0) return []
  
  return getCardsByTags(tags, {
    colorIdentity: options?.colorIdentity,
    limit: options?.limit ?? 30,
    matchAll: false, // OR — any of these tags
  })
}

/**
 * Get cards for all slots of an archetype.
 * Returns a map of slot name → cards.
 */
export async function getCardsForAllSlots(
  archetype: string,
  options?: {
    colorIdentity?: string
    limitPerSlot?: number
  }
): Promise<Map<string, TaggedCard[]>> {
  const slots = ARCHETYPE_SLOTS[archetype.toLowerCase()]
  if (!slots) return new Map()
  
  const result = new Map<string, TaggedCard[]>()
  
  for (const [slotName, tags] of Object.entries(slots)) {
    if (tags.length === 0) {
      result.set(slotName, [])
      continue
    }
    
    const cards = await getCardsByTags(tags, {
      colorIdentity: options?.colorIdentity,
      limit: options?.limitPerSlot ?? 20,
      matchAll: false,
    })
    
    result.set(slotName, cards)
  }
  
  return result
}

// ---------------------------------------------------------------------------
// Formatting for Prompts
// ---------------------------------------------------------------------------

/**
 * Format tagged cards as a list for AI prompts.
 */
export function formatTaggedCardsForPrompt(
  cards: TaggedCard[],
  options?: { includeTags?: boolean }
): string {
  const lines: string[] = []
  
  for (const card of cards) {
    if (options?.includeTags && card.tags.length > 0) {
      lines.push(`- ${card.cardName} [${card.tags.slice(0, 3).join(', ')}]`)
    } else {
      lines.push(`- ${card.cardName}`)
    }
  }
  
  return lines.join('\n')
}

/**
 * Format slot-based cards for AI prompts.
 */
export function formatSlotsForPrompt(
  slotCards: Map<string, TaggedCard[]>
): string {
  const lines: string[] = []
  
  for (const [slotName, cards] of slotCards) {
    if (cards.length === 0) continue
    
    lines.push(`\n### ${slotName} (${cards.length} candidates)`)
    for (const card of cards.slice(0, 15)) {
      lines.push(`- ${card.cardName}`)
    }
    if (cards.length > 15) {
      lines.push(`  ... and ${cards.length - 15} more`)
    }
  }
  
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if card's color identity is a subset of the commander's.
 * "WB" is subset of "WUB", "C" (colorless) is subset of anything.
 */
function isSubsetColorIdentity(cardCI: string, commanderCI: string): boolean {
  if (!cardCI || cardCI === '' || cardCI === 'C') return true
  
  const commanderColors = new Set(commanderCI.split(''))
  for (const color of cardCI) {
    if (!commanderColors.has(color)) return false
  }
  return true
}

/**
 * List all available tags in the index.
 * Useful for debugging and exploration.
 */
export async function listAvailableTags(): Promise<Map<string, number>> {
  const index = await loadTagIndex()
  const tagCounts = new Map<string, number>()
  
  for (const entry of Object.values(index)) {
    for (const tag of entry.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  
  return tagCounts
}
