/**
 * Generate mana analysis data for all decks and store in deck_mana_analysis.
 * Uses card_metadata.cmc and card_metadata.mana_cost for curve and pip calculation.
 * 
 * Run: npx tsx scripts/generate-mana-data.ts
 */

import * as path from 'path'
import Database from 'better-sqlite3'

const DB_PATH = path.join(__dirname, '..', 'data', 'oracle.db')
const db = new Database(DB_PATH)

interface DeckCard {
  card_name: string
  quantity: number
  categories: string
}

interface CardMeta {
  cmc: number | null
  mana_cost: string | null
  type_line: string | null
}

function parsePrimaryCategory(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
  } catch { /* */ }
  return raw.split(',')[0]?.trim() || 'Other'
}

function countPips(manaCost: string): Record<string, number> {
  const pips: Record<string, number> = {}
  const matches = manaCost.match(/\{([WUBRGC])\}/g) || []
  for (const m of matches) {
    const color = m.replace(/[{}]/g, '')
    pips[color] = (pips[color] || 0) + 1
  }
  return pips
}

// Get all decks
const decks = db.prepare('SELECT id, name, colour_identity FROM decks').all() as { id: number; name: string; colour_identity: string }[]

const getCards = db.prepare(`
  SELECT card_name, quantity, categories FROM deck_cards 
  WHERE deck_id = ? AND categories NOT LIKE '%Maybeboard%' AND categories NOT LIKE '%Sideboard%'
`)

const getMeta = db.prepare('SELECT cmc, mana_cost, type_line FROM card_metadata WHERE card_name = ?')

const upsert = db.prepare('INSERT OR REPLACE INTO deck_mana_analysis (deck_id, content) VALUES (?, ?)')

let processed = 0

for (const deck of decks) {
  const cards = getCards.all(deck.id) as DeckCard[]
  if (cards.length === 0) continue

  // Compute mana curve (CMC 0-7+)
  const curve = [0, 0, 0, 0, 0, 0, 0, 0] // indices 0-7
  const colorPips: Record<string, number> = {}
  let landCount = 0
  let nonLandCount = 0
  let totalCmc = 0
  let cardsWithCmc = 0

  for (const card of cards) {
    const cat = parsePrimaryCategory(card.categories || '[]')
    const qty = card.quantity || 1

    if (cat === 'Land') {
      landCount += qty
      continue
    }

    const meta = getMeta.get(card.card_name) as CardMeta | undefined
    
    if (meta?.cmc != null) {
      const cmcBucket = Math.min(Math.floor(meta.cmc), 7)
      curve[cmcBucket] += qty
      totalCmc += meta.cmc * qty
      cardsWithCmc += qty
    } else {
      // No metadata — estimate based on card name patterns or skip
      curve[3] += qty // Default to CMC 3 as a rough estimate
      totalCmc += 3 * qty
      cardsWithCmc += qty
    }

    nonLandCount += qty

    // Count color pips
    if (meta?.mana_cost) {
      const pips = countPips(meta.mana_cost)
      for (const [color, count] of Object.entries(pips)) {
        colorPips[color] = (colorPips[color] || 0) + count * qty
      }
    }
  }

  const avgCmc = cardsWithCmc > 0 ? Math.round((totalCmc / cardsWithCmc) * 100) / 100 : 0
  
  // Recommended land count based on avg CMC
  let recommendedLands: number
  if (avgCmc <= 2.0) recommendedLands = 33
  else if (avgCmc <= 2.5) recommendedLands = 35
  else if (avgCmc <= 3.0) recommendedLands = 36
  else if (avgCmc <= 3.5) recommendedLands = 37
  else recommendedLands = 38

  const content = JSON.stringify({
    curve,
    colorDistribution: colorPips,
    landCount,
    recommendedLandCount: recommendedLands,
    avgCmc,
  })

  upsert.run(deck.id, content)
  console.log(`  ✓ ${deck.name}: avg=${avgCmc} lands=${landCount}/${recommendedLands} pips=${JSON.stringify(colorPips)}`)
  processed++
}

console.log(`\nDone: ${processed} decks processed`)
db.close()
