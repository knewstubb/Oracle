/**
 * Batch classify ref_cards with functional categories using Claude.
 * 
 * Reads cards from ref_cards (those with type_line but no default_category),
 * classifies them using Claude Haiku for cost efficiency, and stores results
 * as JSONB in the default_category column.
 * 
 * Run: npx tsx scripts/classify-card-categories.ts
 * 
 * Options:
 *   --dry-run     Show classifications without writing to DB
 *   --limit=N     Process only N cards (for testing)
 *   --force       Re-classify cards that already have default_category
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY env var')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const anthropic = new Anthropic()

// Batch size for LLM calls (balance between efficiency and token limits)
const LLM_BATCH_SIZE = 20
// Batch size for DB upserts
const DB_BATCH_SIZE = 100
// Rate limit delay between LLM calls (ms)
const RATE_LIMIT_DELAY = 500

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RefCard {
  name: string
  type_line: string | null
  mana_cost: string | null
}

interface CategoryResult {
  primary: string
  secondary: string[]
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

// ---------------------------------------------------------------------------
// Category Taxonomy (from docs/category-taxonomy.md)
// ---------------------------------------------------------------------------

const CATEGORIES = [
  'Ramp',
  'Draw',
  'Removal',
  'Removal:Mass',
  'Removal:Tempo',
  'Counterspell',
  'Counterspell:Conditional',
  'Tutor',
  'Protection',
  'Protection:Mass',
  'Recursion',
  'Discard',
  'Engine',
  'Finisher',
  'Utility',
  'Utility:Tokens',
  'Utility:Fixing',
  'Utility:Stax',
  'Utility:Selection',
  'Utility:Sac-Outlet',
  'Utility:Anthem',
  'Utility:Hate',
  'Utility:Lifegain',
  'Mill',
  'Land',
  'Creature',
  'Artifact',
  'Enchantment',
  'Planeswalker',
  'Battle',
] as const

// ---------------------------------------------------------------------------
// Classification Prompt
// ---------------------------------------------------------------------------

function buildClassificationPrompt(cards: RefCard[]): string {
  const cardList = cards.map((c, i) => 
    `${i + 1}. "${c.name}" — Type: ${c.type_line || 'Unknown'}${c.mana_cost ? `, Mana: ${c.mana_cost}` : ''}`
  ).join('\n')

  return `You are a Magic: The Gathering deckbuilding expert. Classify each card into its primary functional category for Commander/EDH deckbuilding.

## Categories (use exactly these names):
- **Ramp**: Increases mana (mana rocks, dorks, land ramp spells)
- **Draw**: Increases cards in hand (draw spells, card advantage engines)
- **Removal**: Neutralizes opponent's permanents (destroy, exile, -X/-X)
- **Removal:Mass**: Board wipes, "destroy all" effects
- **Removal:Tempo**: Bounce, tap-down (temporary removal)
- **Counterspell**: Counters spells on the stack
- **Tutor**: Searches library for specific cards
- **Protection**: Grants hexproof/indestructible, prevents damage, fog effects
- **Recursion**: Returns cards from graveyard to hand/battlefield
- **Discard**: Forces opponents to discard
- **Engine**: Doubles/multiplies effects, scales with game state (Doubling Season, Rhystic Study)
- **Finisher**: Designed to end the game (Craterhoof, Torment of Hailfire)
- **Utility**: Catch-all for tokens, anthems, stax, card selection, sacrifice outlets
- **Mill**: Puts cards from library to graveyard
- **Land/Creature/Artifact/Enchantment/Planeswalker/Battle**: Use as primary only if the card's function is just being that type with no special effect

## Rules:
1. Primary = the reason the card is included in most decks
2. Secondary = real but incidental effects (creature that draws → primary: Creature, secondary: Draw)
3. Confidence: high (obvious), medium (reasonable judgment), low (ambiguous/context-dependent)
4. For lands: basic lands = "Land", but lands with effects get functional categories (Gaea's Cradle = Ramp)

## Cards to classify:
${cardList}

Respond with ONLY a JSON array, no markdown, no explanation:
[
  {"card_name": "...", "primary": "...", "secondary": ["..."], "confidence": "high|medium|low", "notes": "optional brief note"},
  ...
]`
}

// ---------------------------------------------------------------------------
// LLM Classification
// ---------------------------------------------------------------------------

async function classifyBatch(cards: RefCard[]): Promise<Map<string, CategoryResult>> {
  const results = new Map<string, CategoryResult>()
  
  const prompt = buildClassificationPrompt(cards)
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    
    // Extract JSON from response (handle potential markdown wrapping)
    let jsonStr = text.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    
    const parsed = JSON.parse(jsonStr) as Array<{
      card_name: string
      primary: string
      secondary?: string[]
      confidence?: string
      notes?: string
    }>
    
    for (const item of parsed) {
      results.set(item.card_name, {
        primary: item.primary,
        secondary: item.secondary || [],
        confidence: (item.confidence as 'high' | 'medium' | 'low') || 'medium',
        notes: item.notes,
      })
    }
  } catch (err) {
    console.error(`LLM batch failed:`, err)
    // Fall back to type-derived categories for this batch
    for (const card of cards) {
      results.set(card.card_name, deriveFromType(card.type_line))
    }
  }
  
  return results
}

// ---------------------------------------------------------------------------
// Fallback: Derive from type_line
// ---------------------------------------------------------------------------

function deriveFromType(typeLine: string | null): CategoryResult {
  if (!typeLine) return { primary: 'Utility', secondary: [], confidence: 'low' }
  
  const front = typeLine.split(' // ')[0]
  
  if (front.includes('Creature')) return { primary: 'Creature', secondary: [], confidence: 'high' }
  if (front.includes('Planeswalker')) return { primary: 'Planeswalker', secondary: [], confidence: 'high' }
  if (front.includes('Battle')) return { primary: 'Battle', secondary: [], confidence: 'high' }
  if (front.includes('Instant')) return { primary: 'Utility', secondary: [], confidence: 'medium', notes: 'Instant - needs oracle text for accurate category' }
  if (front.includes('Sorcery')) return { primary: 'Utility', secondary: [], confidence: 'medium', notes: 'Sorcery - needs oracle text for accurate category' }
  if (front.includes('Artifact')) return { primary: 'Artifact', secondary: [], confidence: 'medium' }
  if (front.includes('Enchantment')) return { primary: 'Enchantment', secondary: [], confidence: 'medium' }
  if (front.includes('Land')) return { primary: 'Land', secondary: [], confidence: 'high' }
  
  return { primary: 'Utility', secondary: [], confidence: 'low' }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  const limitArg = args.find(a => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined

  console.log('=== Card Category Classification ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  if (limit) console.log(`Limit: ${limit} cards`)
  if (force) console.log('Force: Re-classifying existing categories')
  console.log('')

  // Fetch cards that need classification
  console.log('Fetching cards from ref_cards...')
  
  const allCards: RefCard[] = []
  let offset = 0
  const PAGE = 1000
  
  while (true) {
    let query = supabase
      .from('ref_cards')
      .select('name, type_line, mana_cost')
      .not('type_line', 'is', null)
    
    if (!force) {
      query = query.is('default_category', null)
    }
    
    const { data, error } = await query.range(offset, offset + PAGE - 1)
    
    if (error) {
      console.error('DB fetch error:', error)
      break
    }
    if (!data || data.length === 0) break
    
    allCards.push(...data)
    
    if (limit && allCards.length >= limit) {
      allCards.length = limit
      break
    }
    if (data.length < PAGE) break
    offset += PAGE
  }

  console.log(`Found ${allCards.length} cards to classify`)
  if (allCards.length === 0) {
    console.log('Nothing to do!')
    return
  }

  // Process in batches
  const allResults = new Map<string, CategoryResult>()
  
  for (let i = 0; i < allCards.length; i += LLM_BATCH_SIZE) {
    const batch = allCards.slice(i, i + LLM_BATCH_SIZE)
    console.log(`\nClassifying batch ${Math.floor(i / LLM_BATCH_SIZE) + 1}/${Math.ceil(allCards.length / LLM_BATCH_SIZE)} (${batch.length} cards)...`)
    
    const results = await classifyBatch(batch)
    for (const [name, result] of results) {
      allResults.set(name, result)
    }
    
    // Show a few examples from this batch
    const examples = [...results.entries()].slice(0, 3)
    for (const [name, result] of examples) {
      console.log(`  ${name}: ${result.primary}${result.secondary.length ? ` [+${result.secondary.join(', ')}]` : ''} (${result.confidence})`)
    }
    
    // Rate limit
    if (i + LLM_BATCH_SIZE < allCards.length) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY))
    }
  }

  console.log(`\nClassified ${allResults.size} cards`)

  // Summary stats
  const primaryCounts = new Map<string, number>()
  const confidenceCounts = { high: 0, medium: 0, low: 0 }
  
  for (const result of allResults.values()) {
    primaryCounts.set(result.primary, (primaryCounts.get(result.primary) || 0) + 1)
    confidenceCounts[result.confidence]++
  }
  
  console.log('\n=== Category Distribution ===')
  const sortedCategories = [...primaryCounts.entries()].sort((a, b) => b[1] - a[1])
  for (const [cat, count] of sortedCategories) {
    console.log(`  ${cat}: ${count}`)
  }
  
  console.log('\n=== Confidence Distribution ===')
  console.log(`  High: ${confidenceCounts.high}`)
  console.log(`  Medium: ${confidenceCounts.medium}`)
  console.log(`  Low: ${confidenceCounts.low}`)

  if (dryRun) {
    console.log('\n[DRY RUN] Skipping database write')
    return
  }

  // Write to database
  console.log('\nWriting to ref_cards...')
  
  const rows = [...allResults.entries()].map(([name, result]) => ({
    name,
    default_category: result,
  }))

  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const batch = rows.slice(i, i + DB_BATCH_SIZE)
    const { error } = await supabase
      .from('ref_cards')
      .upsert(batch, { onConflict: 'name' })
    
    if (error) {
      console.error(`Upsert batch ${i} failed:`, error.message)
    } else {
      console.log(`  Upserted ${Math.min(i + DB_BATCH_SIZE, rows.length)}/${rows.length}`)
    }
  }

  console.log('\nDone!')
}

main().catch(console.error)
