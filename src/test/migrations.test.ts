import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

/**
 * Tests that migrations 003, 004, 005 apply cleanly on both fresh
 * and existing (seeded) databases, preserve existing data, and enforce
 * the expected constraints and indexes.
 */

const migrationsDir = path.join(process.cwd(), 'db', 'migrations')

function applyMigrations(db: InstanceType<typeof Database>) {
  db.pragma('foreign_keys = ON')

  // Create migration tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name)
  )

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    db.exec(sql)
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
  }
}

function seedExistingData(db: InstanceType<typeof Database>) {
  // Seed with data that would exist before migrations 003-005
  db.exec(`
    INSERT INTO decks (id, name, commander_name, colour_identity, card_count)
    VALUES (1, 'World Breaker', 'Omnath, Locus of Creation', 'W,U,R,G', 100);

    INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity)
    VALUES (1, 'Sol Ring', 'abc-123', 1);

    INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity)
    VALUES (1, 'Lightning Bolt', 'def-456', 1);

    INSERT INTO collection (card_name, scryfall_id, set_code, quantity, foil)
    VALUES ('Sol Ring', 'abc-123', 'C21', 2, 0);

    INSERT INTO collection (card_name, scryfall_id, set_code, quantity, foil)
    VALUES ('Lightning Bolt', 'def-456', 'STA', 1, 1);
  `)
}

describe('Database Migrations (003-005)', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  })

  afterEach(() => {
    db.close()
  })

  it('applies all migrations without error on a fresh database', () => {
    expect(() => applyMigrations(db)).not.toThrow()

    // Verify all 6 migrations tracked
    const migrations = db.prepare('SELECT name FROM _migrations ORDER BY name').all()
    expect(migrations.map((r: any) => r.name)).toEqual([
      '001-initial.sql',
      '002-sets-table.sql',
      '003-collection-extended.sql',
      '004-proxy-allocations.sql',
      '005-notion-mapping.sql',
      '006-allocation-v2.sql',
    ])
  })

  it('applies migrations on an existing database with data (preserves decks, deck_cards, collection)', () => {
    // Apply 001 + 002 first
    const initialFiles = ['001-initial.sql', '002-sets-table.sql']
    db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    for (const file of initialFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      db.exec(sql)
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
    }

    // Seed existing data
    seedExistingData(db)

    // Apply remaining migrations
    expect(() => applyMigrations(db)).not.toThrow()

    // Verify existing data preserved
    const decks = db.prepare('SELECT * FROM decks').all() as any[]
    expect(decks).toHaveLength(1)
    expect(decks[0].name).toBe('World Breaker')

    const deckCards = db.prepare('SELECT * FROM deck_cards').all() as any[]
    expect(deckCards).toHaveLength(2)

    const collection = db.prepare('SELECT * FROM collection').all() as any[]
    expect(collection).toHaveLength(2)
    expect(collection[0].card_name).toBe('Sol Ring')
    expect(collection[0].quantity).toBe(2)
    expect(collection[1].card_name).toBe('Lightning Bolt')
    expect(collection[1].foil).toBe(1)
  })

  it('collection table has new columns with correct defaults', () => {
    applyMigrations(db)

    db.prepare(`
      INSERT INTO collection (card_name, scryfall_id, set_code, quantity, foil)
      VALUES ('Sol Ring', 'abc-123', 'C21', 2, 0)
    `).run()

    const row = db.prepare('SELECT * FROM collection WHERE card_name = ?').get('Sol Ring') as any
    expect(row.finish).toBe('Normal')
    expect(row.condition).toBe('Near Mint')
    expect(row.date_added).toBeNull()
    expect(row.language).toBe('English')
    expect(row.purchase_price).toBe(0)
    expect(row.collector_number).toBeNull()
    expect(row.color_identity).toBeNull()
    expect(row.types).toBeNull()
    expect(row.edition_name).toBeNull()
  })

  it('collection table has indexes on color_identity and types', () => {
    applyMigrations(db)

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'index' AND tbl_name = 'collection'
    `).all() as any[]

    const indexNames = indexes.map((r: any) => r.name)
    expect(indexNames).toContain('idx_collection_identity')
    expect(indexNames).toContain('idx_collection_types')
  })

  it('proxy_allocations table exists with correct schema', () => {
    applyMigrations(db)

    // Insert a deck first (needed for FK)
    db.prepare(`INSERT INTO decks (id, name) VALUES (1, 'Test Deck')`).run()

    // Insert an allocation
    db.prepare(`
      INSERT INTO proxy_allocations (card_name, deck_id, role)
      VALUES ('Sol Ring', 1, 'original')
    `).run()

    const row = db.prepare('SELECT * FROM proxy_allocations WHERE card_name = ?').get('Sol Ring') as any
    expect(row.card_name).toBe('Sol Ring')
    expect(row.deck_id).toBe(1)
    expect(row.role).toBe('original')
    expect(row.written_to_archidekt).toBe(0) // FALSE
    expect(row.written_at).toBeNull()
    expect(row.assigned_at).not.toBeNull()
  })

  it('proxy_allocations enforces UNIQUE(card_name, deck_id)', () => {
    applyMigrations(db)

    db.prepare(`INSERT INTO decks (id, name) VALUES (1, 'Test Deck')`).run()

    db.prepare(`
      INSERT INTO proxy_allocations (card_name, deck_id, role)
      VALUES ('Sol Ring', 1, 'original')
    `).run()

    // Attempt duplicate should fail
    expect(() => {
      db.prepare(`
        INSERT INTO proxy_allocations (card_name, deck_id, role)
        VALUES ('Sol Ring', 1, 'proxy')
      `).run()
    }).toThrow(/UNIQUE constraint failed/)
  })

  it('proxy_allocations enforces role CHECK constraint', () => {
    applyMigrations(db)

    db.prepare(`INSERT INTO decks (id, name) VALUES (1, 'Test Deck')`).run()

    expect(() => {
      db.prepare(`
        INSERT INTO proxy_allocations (card_name, deck_id, role)
        VALUES ('Sol Ring', 1, 'invalid_role')
      `).run()
    }).toThrow(/CHECK constraint failed/)
  })

  it('proxy_allocations has indexes on card_name and deck_id', () => {
    applyMigrations(db)

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'index' AND tbl_name = 'proxy_allocations'
    `).all() as any[]

    const indexNames = indexes.map((r: any) => r.name)
    expect(indexNames).toContain('idx_proxy_alloc_card')
    expect(indexNames).toContain('idx_proxy_alloc_deck')
  })

  it('sync_meta table exists with correct schema', () => {
    applyMigrations(db)

    db.prepare(`
      INSERT INTO sync_meta (key, value)
      VALUES ('last_collection_import', '2025-01-01T00:00:00Z')
    `).run()

    const row = db.prepare('SELECT * FROM sync_meta WHERE key = ?').get('last_collection_import') as any
    expect(row.key).toBe('last_collection_import')
    expect(row.value).toBe('2025-01-01T00:00:00Z')
    expect(row.updated_at).not.toBeNull()
  })

  it('proxy_allocations cascades on deck delete', () => {
    applyMigrations(db)

    db.prepare(`INSERT INTO decks (id, name) VALUES (1, 'Test Deck')`).run()
    db.prepare(`
      INSERT INTO proxy_allocations (card_name, deck_id, role)
      VALUES ('Sol Ring', 1, 'original')
    `).run()

    db.prepare('DELETE FROM decks WHERE id = 1').run()

    const rows = db.prepare('SELECT * FROM proxy_allocations WHERE deck_id = ?').all(1)
    expect(rows).toHaveLength(0)
  })

  it('migrations are idempotent — running applyMigrations twice does not error', () => {
    applyMigrations(db)
    expect(() => applyMigrations(db)).not.toThrow()
  })
})
