/**
 * Test Distillation Script
 * 
 * Runs distillation on a small set of commanders to evaluate output quality.
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(__dirname, '../../.env.local') })

import Anthropic from '@anthropic-ai/sdk'
import Database from 'better-sqlite3'

const SQLITE_PATH = process.env.COMMANDER_CONTENT_DB_PATH
  ?? resolve(__dirname, '../../../research/commander-content/content-raw.sqlite')
const db = new Database(SQLITE_PATH)

const anthropic = new Anthropic()

interface RawContent {
  card_name: string
  source: string
  title: string
  full_content: string
}

interface DistilledStrategy {
  commander: string
  color_identity: string[]
  archetypes: {
    name: string
    description: string
    key_cards: string[]
    budget_alternatives?: string[]
  }[]
  staples: string[]
  synergy_packages: {
    name: string
    cards: string[]
  }[]
  common_mistakes: string[]
  power_level_notes: string
}

const DISTILLATION_PROMPT = `You are an expert Magic: The Gathering commander analyst. Given raw content from deck techs, articles, and videos about a commander, extract structured strategy knowledge.

Output valid JSON matching this schema:
{
  "commander": "Card Name",
  "color_identity": ["W", "U", "B", "R", "G"],
  "archetypes": [
    {
      "name": "Archetype Name",
      "description": "1-2 sentence description of the strategy",
      "key_cards": ["Card 1", "Card 2", "Card 3"],
      "budget_alternatives": ["Cheap Card 1", "Cheap Card 2"]
    }
  ],
  "staples": ["Cards that go in almost every build"],
  "synergy_packages": [
    {
      "name": "Package Name",
      "cards": ["Card 1", "Card 2", "Card 3"]
    }
  ],
  "common_mistakes": ["Mistakes new pilots make"],
  "power_level_notes": "Brief note on where different builds land on the power spectrum"
}

Rules:
- Extract 2-4 distinct archetypes if the commander supports multiple builds
- List 5-10 staples that appear across all builds
- Include 2-4 synergy packages (groups of cards that work together)
- Note 2-4 common mistakes or traps
- Be specific with card names (use exact names)
- Budget alternatives should be under $5 where possible
- If content is thin, acknowledge gaps rather than hallucinating

Output ONLY the JSON, no markdown code blocks or explanation.`

async function getContentForCommander(commanderName: string): Promise<RawContent[]> {
  const rows = db.prepare(`
    SELECT card_name, source, title, full_content
    FROM raw_content
    WHERE card_name = ? AND full_content IS NOT NULL
    ORDER BY source, title
  `).all(commanderName) as RawContent[]
  
  return rows
}

async function distillCommander(commanderName: string, content: RawContent[]): Promise<DistilledStrategy | null> {
  // Build context from all sources
  const contextParts = content.map((c, i) => {
    const truncated = c.full_content.length > 8000 
      ? c.full_content.substring(0, 8000) + '... [truncated]'
      : c.full_content
    return `--- Source ${i + 1}: ${c.source} - "${c.title}" ---\n${truncated}`
  })
  
  const fullContext = contextParts.join('\n\n')
  
  console.log(`  Sending ${content.length} sources (${Math.round(fullContext.length / 1000)}k chars) to Claude...`)
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `${DISTILLATION_PROMPT}\n\nCommander: ${commanderName}\n\nSource Content:\n${fullContext}`
        }
      ]
    })
    
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    
    // Parse JSON (handle potential markdown wrapping)
    let jsonStr = text.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '')
    }
    
    return JSON.parse(jsonStr) as DistilledStrategy
  } catch (error) {
    console.error(`  Error distilling ${commanderName}:`, error)
    return null
  }
}

async function main() {
  const testCommanders = [
    'The Goose Mother',
    'Aesi, Tyrant of Gyre Strait', 
    'Vihaan, Goldwaker',
    'Lady Octopus, Inspired Inventor',
    'Ms. Bumbleflower',
    'Slicer, Hired Muscle',
    'The Lord of Pain',
    'Elsha, Threefold Master',
    'Lumra, Bellow of the Woods',
    'Cazur, Ruthless Stalker // Ukkima, Stalking Shadow'
  ]
  
  console.log('=== Test Distillation ===\n')
  console.log(`Processing ${testCommanders.length} commanders...\n`)
  
  const results: { commander: string; result: DistilledStrategy | null }[] = []
  
  for (const commander of testCommanders) {
    console.log(`[${results.length + 1}/${testCommanders.length}] ${commander}`)
    
    const content = await getContentForCommander(commander)
    console.log(`  Found ${content.length} sources with full content`)
    
    if (content.length === 0) {
      console.log(`  Skipping - no content available`)
      results.push({ commander, result: null })
      continue
    }
    
    const distilled = await distillCommander(commander, content)
    results.push({ commander, result: distilled })
    
    if (distilled) {
      console.log(`  ✓ Distilled: ${distilled.archetypes.length} archetypes, ${distilled.staples.length} staples`)
    } else {
      console.log(`  ✗ Failed to distill`)
    }
    
    console.log('')
  }
  
  // Output results
  console.log('\n=== RESULTS ===\n')
  
  for (const { commander, result } of results) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`COMMANDER: ${commander}`)
    console.log('='.repeat(60))
    
    if (!result) {
      console.log('No distillation result')
      continue
    }
    
    console.log(`\nColor Identity: ${result.color_identity.join('')}`)
    
    console.log(`\nARCHETYPES (${result.archetypes.length}):`)
    for (const arch of result.archetypes) {
      console.log(`  • ${arch.name}`)
      console.log(`    ${arch.description}`)
      console.log(`    Key: ${arch.key_cards.slice(0, 5).join(', ')}`)
      if (arch.budget_alternatives?.length) {
        console.log(`    Budget: ${arch.budget_alternatives.join(', ')}`)
      }
    }
    
    console.log(`\nSTAPLES: ${result.staples.slice(0, 8).join(', ')}`)
    
    console.log(`\nSYNERGY PACKAGES:`)
    for (const pkg of result.synergy_packages.slice(0, 3)) {
      console.log(`  • ${pkg.name}: ${pkg.cards.slice(0, 4).join(', ')}`)
    }
    
    console.log(`\nCOMMON MISTAKES:`)
    for (const mistake of result.common_mistakes.slice(0, 3)) {
      console.log(`  • ${mistake}`)
    }
    
    console.log(`\nPOWER LEVEL: ${result.power_level_notes}`)
  }
  
  // Save raw JSON for inspection
  const outputPath = resolve(__dirname, '../data/test-distillation-results.json')
  require('fs').writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\n\nFull JSON saved to: ${outputPath}`)
  
  db.close()
}

main().catch(console.error)
