/**
 * Import deck content from Notion exports into SQLite tables.
 * Reads markdown files from the export folder and populates:
 * - deck_overview_content (strategy, win conditions, strengths, weaknesses, bracket)
 * - deck_combos (combo lines)
 * 
 * Run: npx tsx scripts/import-notion-content.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'

const DB_PATH = path.join(__dirname, '..', 'data', 'oracle.db')
const EXPORT_DIR = path.join(__dirname, '..', 'docs', 'ExportBlock-eb796edf-1540-486a-83da-8f4dbc7cae59-Part-1', 'Commander Decks')

const db = new Database(DB_PATH)

// Map deck names to deck IDs
const decks = db.prepare('SELECT id, name FROM decks').all() as { id: number; name: string }[]
const deckMap = new Map<string, number>()
for (const d of decks) {
  deckMap.set(d.name.toLowerCase(), d.id)
}

// Get list of markdown files
const files = fs.readdirSync(EXPORT_DIR).filter(f => f.endsWith('.md'))

let processed = 0
let skipped = 0

for (const file of files) {
  // Extract deck name from filename (everything before the UUID)
  const nameMatch = file.match(/^(.+?)\s+[0-9a-f]{32}\.md$/)
  if (!nameMatch) {
    console.log(`  SKIP (no match): ${file}`)
    skipped++
    continue
  }
  
  const deckName = nameMatch[1].trim()
  const deckId = deckMap.get(deckName.toLowerCase())
  
  if (!deckId) {
    console.log(`  SKIP (not in DB): ${deckName}`)
    skipped++
    continue
  }

  const content = fs.readFileSync(path.join(EXPORT_DIR, file), 'utf-8')
  
  // Extract strategy section
  const strategyMatch = content.match(/## Strategy & Playstyle\n\n([\s\S]*?)(?=\n## |\n# |$)/)
  const strategyRaw = strategyMatch ? strategyMatch[1].trim() : ''
  
  // Extract primary game plan
  const primaryMatch = strategyRaw.match(/\*\*Primary Game Plan:\*\*\s*([\s\S]*?)(?=\n\*\*|\n##|$)/)
  const primary = primaryMatch ? primaryMatch[1].trim() : strategyRaw.split('\n')[0] || ''
  
  // Extract win conditions
  const winConditions: string[] = []
  const wcSection = strategyRaw.match(/\*\*Win Conditions:\*\*\n([\s\S]*?)(?=\n\*\*|\n##|$)/)
  if (wcSection) {
    const lines = wcSection[1].split('\n').filter(l => l.trim().startsWith('-'))
    for (const line of lines) {
      winConditions.push(line.replace(/^-\s*/, '').trim())
    }
  }
  
  // Extract strengths
  const strengths: string[] = []
  const strengthsSection = content.match(/### Strengths\n\n([\s\S]*?)(?=\n### |\n## |$)/)
  if (strengthsSection) {
    const lines = strengthsSection[1].split('\n').filter(l => l.trim().startsWith('-'))
    for (const line of lines) {
      strengths.push(line.replace(/^-\s*\*\*.*?\*\*\s*/, '').replace(/^-\s*/, '').trim())
    }
  }
  
  // Extract weaknesses  
  const weaknesses: string[] = []
  const weaknessesSection = content.match(/### Weaknesses\n\n([\s\S]*?)(?=\n### |\n## |$)/)
  if (weaknessesSection) {
    const lines = weaknessesSection[1].split('\n').filter(l => l.trim().startsWith('-'))
    for (const line of lines) {
      weaknesses.push(line.replace(/^-\s*\*\*.*?\*\*\s*/, '').replace(/^-\s*/, '').trim())
    }
  }
  
  // Extract bracket from header metadata
  const bracketMatch = content.match(/^Bracket:\s*(.+)$/m)
  const bracket = bracketMatch ? bracketMatch[1].trim() : ''
  
  // Build overview content
  const strategy = primary || strategyRaw.split('\n').slice(0, 3).join(' ').trim()
  
  const overviewContent = JSON.stringify({
    strategy: strategy || `${deckName} deck`,
    winConditions: winConditions.length > 0 ? winConditions : ['No win conditions documented'],
    strengths: strengths.length > 0 ? strengths : ['No strengths documented'],
    weaknesses: weaknesses.length > 0 ? weaknesses : ['No weaknesses documented'],
    bracket: bracket || 'Unknown',
  })
  
  // Extract combos
  const combos: { cards: string[]; result: string; bracket: string | null }[] = []
  const comboSection = content.match(/## Key Synergy Lines\n\n([\s\S]*?)(?=\n## [^#]|$)/)
  if (comboSection) {
    const comboBlocks = comboSection[1].split(/\n### /).filter(b => b.trim())
    for (const block of comboBlocks) {
      const cardsMatch = block.match(/\*\*Cards:\*\*\s*(.+)/m)
      const resultMatch = block.match(/\*\*Result:\*\*\s*([\s\S]*?)(?=\n###|\n##|$)/)
      if (cardsMatch) {
        const cards = cardsMatch[1].split(/\s*\+\s*/).map(c => c.trim())
        const result = resultMatch ? resultMatch[1].trim().split('\n')[0] : 'See description'
        combos.push({ cards, result, bracket: null })
      }
    }
  }
  
  const combosContent = JSON.stringify({ combos })
  
  // Insert into DB
  db.prepare('INSERT OR REPLACE INTO deck_overview_content (deck_id, content) VALUES (?, ?)')
    .run(deckId, overviewContent)
  
  if (combos.length > 0) {
    db.prepare('INSERT OR REPLACE INTO deck_combos (deck_id, content) VALUES (?, ?)')
      .run(deckId, combosContent)
  }
  
  console.log(`  ✓ ${deckName} (${deckId}): strategy=${strategy.length > 0 ? '✓' : '✗'} wc=${winConditions.length} str=${strengths.length} weak=${weaknesses.length} combos=${combos.length}`)
  processed++
}

console.log(`\nDone: ${processed} processed, ${skipped} skipped`)
db.close()
