/**
 * MTGJSON Local Database — SQLite-backed card reference data.
 *
 * Provides instant, offline access to:
 * - Commander validation (Legendary Creature + Commander-legal)
 * - Card search by colour identity, type, keywords
 * - EDHREC rank for popularity ordering
 * - Card legality checks
 *
 * Data source: AllPrintings.sqlite from https://mtgjson.com
 * Stored locally at data/AllPrintings.sqlite (~620MB)
 * Refresh: weekly via download script
 */

import Database from 'better-sqlite3'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MTGJSONCard {
  name: string
  supertypes: string
  types: string
  subtypes: string
  colorIdentity: string
  manaCost: string
  manaValue: number
  text: string
  power: string | null
  toughness: string | null
  edhrecRank: number | null
}

export interface CommanderResult {
  name: string
  colorIdentity: string[]
  typeLine: string
  manaCost: string
  edhrecRank: number | null
  valid: boolean
  reason?: string
}

// ---------------------------------------------------------------------------
// Database singleton
// ---------------------------------------------------------------------------

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(process.cwd(), 'data', 'AllPrintings.sqlite')
    db = new Database(dbPath, { readonly: true })
    // Performance: WAL mode not needed for readonly, but set busy timeout
    db.pragma('journal_mode = WAL')
  }
  return db
}

// ---------------------------------------------------------------------------
// Commander Queries
// ---------------------------------------------------------------------------

/**
 * Validate whether a card is a legal Commander.
 * Instant local lookup — no network calls.
 */
export function validateCommanderLocal(cardName: string): CommanderResult {
  const db = getDb()

  const row = db.prepare(`
    SELECT DISTINCT c.name, c.supertypes, c.types, c.subtypes, c.colorIdentity, c.manaCost, c.text, c.edhrecRank
    FROM cards c
    JOIN cardLegalities cl ON c.uuid = cl.uuid
    WHERE c.name = ? AND cl.commander = 'Legal'
    LIMIT 1
  `).get(cardName) as any

  if (!row) {
    // Try case-insensitive
    const fuzzy = db.prepare(`
      SELECT DISTINCT c.name, c.supertypes, c.types, c.subtypes, c.colorIdentity, c.manaCost, c.text, c.edhrecRank
      FROM cards c
      JOIN cardLegalities cl ON c.uuid = cl.uuid
      WHERE LOWER(c.name) = LOWER(?) AND cl.commander = 'Legal'
      LIMIT 1
    `).get(cardName) as any

    if (!fuzzy) {
      return {
        name: cardName,
        colorIdentity: [],
        typeLine: '',
        manaCost: '',
        edhrecRank: null,
        valid: false,
        reason: `Card "${cardName}" not found or not Commander-legal`,
      }
    }

    return validateRow(fuzzy)
  }

  return validateRow(row)
}

function validateRow(row: any): CommanderResult {
  const supertypes = row.supertypes || ''
  const types = row.types || ''
  const text = row.text || ''

  const isLegendary = supertypes.includes('Legendary')
  const isCreature = types.includes('Creature')
  const hasCommanderText = text.toLowerCase().includes('can be your commander')

  const canBeCommander = (isLegendary && isCreature) || hasCommanderText
  const typeLine = [supertypes, types, row.subtypes].filter(Boolean).join(' — ')
  const colorIdentity = row.colorIdentity ? row.colorIdentity.split(',').map((c: string) => c.trim()) : []

  if (!canBeCommander) {
    return {
      name: row.name,
      colorIdentity,
      typeLine,
      manaCost: row.manaCost || '',
      edhrecRank: row.edhrecRank,
      valid: false,
      reason: `${row.name} is not a Legendary Creature and doesn't have "can be your commander" text`,
    }
  }

  return {
    name: row.name,
    colorIdentity,
    typeLine,
    manaCost: row.manaCost || '',
    edhrecRank: row.edhrecRank,
    valid: true,
  }
}

/**
 * Get top commanders by colour identity, ordered by EDHREC rank.
 * Instant local lookup.
 */
export function getTopCommanders(
  colorIdentity: string,
  options?: { limit?: number }
): CommanderResult[] {
  const db = getDb()
  const limit = options?.limit ?? 10

  const rows = db.prepare(`
    SELECT DISTINCT c.name, c.supertypes, c.types, c.subtypes, c.colorIdentity, c.manaCost, c.edhrecRank
    FROM cards c
    JOIN cardLegalities cl ON c.uuid = cl.uuid
    WHERE c.supertypes LIKE '%Legendary%'
      AND c.types LIKE '%Creature%'
      AND c.colorIdentity = ?
      AND cl.commander = 'Legal'
      AND c.edhrecRank IS NOT NULL
      AND (c.isFunny = 0 OR c.isFunny IS NULL)
      AND c.name NOT LIKE '%//%'
    ORDER BY c.edhrecRank ASC
    LIMIT ?
  `).all(colorIdentity, limit) as any[]

  return rows.map(row => ({
    name: row.name,
    colorIdentity: row.colorIdentity ? row.colorIdentity.split(',').map((c: string) => c.trim()) : [],
    typeLine: [row.supertypes, row.types, row.subtypes].filter(Boolean).join(' — '),
    manaCost: row.manaCost || '',
    edhrecRank: row.edhrecRank,
    valid: true,
  }))
}

/**
 * Search cards by query terms. Searches name and type line.
 */
export function searchCardsLocal(
  query: string,
  options?: { limit?: number; colorIdentity?: string; commanderLegal?: boolean }
): MTGJSONCard[] {
  const db = getDb()
  const limit = options?.limit ?? 20

  let sql = `
    SELECT DISTINCT c.name, c.supertypes, c.types, c.subtypes, c.colorIdentity, c.manaCost, c.manaValue, c.text, c.power, c.toughness, c.edhrecRank
    FROM cards c
    JOIN cardLegalities cl ON c.uuid = cl.uuid
    WHERE (c.name LIKE ? OR c.types LIKE ? OR c.text LIKE ?)
      AND (c.isFunny = 0 OR c.isFunny IS NULL)
  `
  const params: any[] = [`%${query}%`, `%${query}%`, `%${query}%`]

  if (options?.colorIdentity) {
    sql += ` AND c.colorIdentity = ?`
    params.push(options.colorIdentity)
  }

  if (options?.commanderLegal) {
    sql += ` AND cl.commander = 'Legal'`
  }

  sql += ` ORDER BY c.edhrecRank ASC NULLS LAST LIMIT ?`
  params.push(limit)

  return db.prepare(sql).all(...params) as MTGJSONCard[]
}

/**
 * Get a card's full details by exact name.
 */
export function getCardLocal(cardName: string): MTGJSONCard | null {
  const db = getDb()

  const row = db.prepare(`
    SELECT DISTINCT c.name, c.supertypes, c.types, c.subtypes, c.colorIdentity, c.manaCost, c.manaValue, c.text, c.power, c.toughness, c.edhrecRank
    FROM cards c
    WHERE c.name = ?
    LIMIT 1
  `).get(cardName) as MTGJSONCard | undefined

  return row ?? null
}
