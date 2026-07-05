/**
 * Build a local card_metadata table with rarity and price for all cards
 * referenced in deck_cards and precon_cards.
 * 
 * Uses Scryfall bulk data download (Oracle Cards) to populate.
 */
import Database from 'better-sqlite3'
import https from 'https'
import http from 'http'

const db = new Database('./data/oracle.db')

// Create card_metadata table
db.exec(`
  CREATE TABLE IF NOT EXISTS card_metadata (
    card_name TEXT PRIMARY KEY,
    rarity TEXT,
    price_usd REAL,
    set_code TEXT,
    type_line TEXT,
    mana_cost TEXT,
    cmc REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

// Get all unique card names we need metadata for
const allCards = db.prepare(`
  SELECT DISTINCT card_name FROM (
    SELECT card_name FROM deck_cards
    UNION
    SELECT card_name FROM precon_cards
  )
`).all() as { card_name: string }[]

const cardNames = new Set(allCards.map(c => c.card_name))
console.log(`Need metadata for ${cardNames.size} unique cards`)

// Check what we already have
const existing = db.prepare('SELECT card_name FROM card_metadata').all() as { card_name: string }[]
const existingSet = new Set(existing.map(c => c.card_name))
const needed = [...cardNames].filter(n => !existingSet.has(n))
console.log(`Already cached: ${existingSet.size}, need to fetch: ${needed.length}`)

if (needed.length === 0) {
  console.log('All cards already cached!')
  process.exit(0)
}

// Download Scryfall bulk data (Oracle Cards)
console.log('Downloading Scryfall bulk data catalog...')

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    protocol.get(url, { headers: { 'User-Agent': 'The-Oracle/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location!).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function streamJsonArray(url: string, callback: (card: any) => void): Promise<void> {
  // For large files, we'll download and process in chunks
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    protocol.get(url, { headers: { 'User-Agent': 'The-Oracle/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return streamJsonArray(res.headers.location!, callback).then(resolve).catch(reject)
      }
      let buffer = ''
      let depth = 0
      let inString = false
      let escape = false
      let objectStart = -1
      
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        
        // Simple streaming JSON array parser
        for (let i = 0; i < buffer.length; i++) {
          const ch = buffer[i]
          
          if (escape) { escape = false; continue }
          if (ch === '\\' && inString) { escape = true; continue }
          if (ch === '"') { inString = !inString; continue }
          if (inString) continue
          
          if (ch === '{') {
            if (depth === 0) objectStart = i
            depth++
          } else if (ch === '}') {
            depth--
            if (depth === 0 && objectStart >= 0) {
              const obj = buffer.slice(objectStart, i + 1)
              try {
                callback(JSON.parse(obj))
              } catch {}
              objectStart = -1
            }
          }
        }
        
        // Keep only unprocessed part
        if (objectStart >= 0) {
          buffer = buffer.slice(objectStart)
          objectStart = 0
        } else {
          buffer = ''
        }
      })
      
      res.on('end', resolve)
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function main() {
  // Get bulk data URL using fetch (Node 18+)
  const catalogRes = await fetch('https://api.scryfall.com/bulk-data', {
    headers: { 'User-Agent': 'The-Oracle/1.0' }
  })
  const catalog = await catalogRes.json() as { data: { type: string; download_uri: string }[] }
  const oracleCards = catalog.data.find(d => d.type === 'oracle_cards')
  if (!oracleCards) {
    console.error('Could not find oracle_cards bulk data')
    process.exit(1)
  }
  
  console.log(`Downloading oracle cards from: ${oracleCards.download_uri}`)
  console.log('This may take a minute...')
  
  const neededSet = new Set(needed)
  let found = 0
  
  const insert = db.prepare(`
    INSERT OR REPLACE INTO card_metadata (card_name, rarity, price_usd, set_code, type_line, mana_cost, cmc)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  
  const insertMany = db.transaction((cards: any[]) => {
    for (const card of cards) {
      insert.run(card.name, card.rarity, card.price, card.set, card.type_line, card.mana_cost, card.cmc)
    }
  })
  
  // Download the full JSON file
  const dataRes = await fetch(oracleCards.download_uri, {
    headers: { 'User-Agent': 'The-Oracle/1.0' }
  })
  const allCardData = await dataRes.json() as any[]
  
  console.log(`Downloaded ${allCardData.length} cards from Scryfall`)
  
  const batch: any[] = []
  
  for (const card of allCardData) {
    if (neededSet.has(card.name)) {
      const price = card.prices?.usd ? parseFloat(card.prices.usd) : null
      batch.push({
        name: card.name,
        rarity: card.rarity,
        price,
        set: card.set?.toUpperCase(),
        type_line: card.type_line,
        mana_cost: card.mana_cost,
        cmc: card.cmc,
      })
      neededSet.delete(card.name)
      found++
    }
  }
  
  // Batch insert all at once
  insertMany(batch)
  
  console.log(`Done! Cached ${found} cards. ${neededSet.size} not found in Scryfall.`)
  
  if (neededSet.size > 0 && neededSet.size < 20) {
    console.log('Missing cards:', [...neededSet].join(', '))
  }
}

main().catch(console.error)
