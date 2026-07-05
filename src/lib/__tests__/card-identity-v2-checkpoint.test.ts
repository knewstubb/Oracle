/**
 * Checkpoint Verification Test: Card Identity v2 Migration & Store
 *
 * Verifies:
 * 1. Migration 026 applies cleanly on top of 023
 * 2. Down-migration 026 reverses cleanly
 * 3. Upsert creates one row per printing group and increments quantity
 * 4. Multiple deck_cards can reference the same physical_copy_id
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import {
  ensureCardDefinition,
  upsertPhysicalCopy,
  linkPhysicalCopyToDeckCard,
  findPrintingGroup,
} from '../card-identity-store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const migrationsDir = path.join(process.cwd(), 'db', 'migrations')
const downDir = path.join(process.cwd(), 'db', 'down')

function readMigration(filename: string): string {
  return fs.readFileSync(path.join(migrationsDir, filename), 'utf-8')
}

function readDownMigration(filename: string): string {
  return fs.readFileSync(path.join(downDir, filename), 'utf-8')
}

/**
 * Set up a minimal schema that matches what exists before migration 023.
 * Includes the tables/columns that 023 depends on (decks, deck_cards, collection).
 */
function applyBaseSchema(db: InstanceType<typeof Database>) {
  db.pragma('foreign_keys = ON')

  // 001 - initial schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      commander_name TEXT,
      commander_scryfall_id TEXT,
      colour_identity TEXT,
      card_count INTEGER,
      last_synced_at DATETIME,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS deck_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      card_name TEXT NOT NULL,
      scryfall_id TEXT,
      set_code TEXT,
      quantity INTEGER DEFAULT 1,
      categories TEXT,
      tags TEXT,
      is_commander BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS collection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_name TEXT NOT NULL,
      scryfall_id TEXT,
      set_code TEXT,
      quantity INTEGER DEFAULT 1,
      foil BOOLEAN DEFAULT FALSE
    );

    CREATE INDEX IF NOT EXISTS idx_deck_cards_name ON deck_cards(card_name);
    CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id);
    CREATE INDEX IF NOT EXISTS idx_collection_name ON collection(card_name);
  `)

  // 012 - ownership columns (required by 023's backfill)
  db.exec(`
    ALTER TABLE deck_cards ADD COLUMN ownership_status TEXT DEFAULT NULL
      CHECK (ownership_status IN ('original', 'proxy', 'not_owned'));
    ALTER TABLE deck_cards ADD COLUMN proxy_of_deck_id INTEGER DEFAULT NULL
      REFERENCES decks(id) ON DELETE SET NULL;
  `)
}

function getTableColumns(db: InstanceType<typeof Database>, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return rows.map(r => r.name)
}

function getIndexNames(db: InstanceType<typeof Database>): string[] {
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`).all() as Array<{ name: string }>
  return rows.map(r => r.name)
}

function isIndexUnique(db: InstanceType<typeof Database>, indexName: string): boolean {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?`).get(indexName) as { sql: string } | undefined
  if (!row || !row.sql) return false
  return row.sql.toUpperCase().includes('UNIQUE')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Card Identity v2 Checkpoint', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  })

  afterEach(() => {
    db.close()
  })

  // -------------------------------------------------------------------------
  // Verification 1: Migration 026 applies cleanly on top of 023
  // -------------------------------------------------------------------------
  describe('Migration 026 applies cleanly on top of 023', () => {
    it('applies both migrations without error', () => {
      applyBaseSchema(db)

      const migration023 = readMigration('023-card-identity-physical-copies.sql')
      const migration026 = readMigration('026-physical-copies-v2.sql')

      // Apply 023
      expect(() => db.exec(migration023)).not.toThrow()

      // Apply 026
      expect(() => db.exec(migration026)).not.toThrow()
    })

    it('physical_copies has quantity column after 026', () => {
      applyBaseSchema(db)
      db.exec(readMigration('023-card-identity-physical-copies.sql'))
      db.exec(readMigration('026-physical-copies-v2.sql'))

      const columns = getTableColumns(db, 'physical_copies')
      expect(columns).toContain('quantity')
    })

    it('idx_physical_copies_group unique index exists after 026', () => {
      applyBaseSchema(db)
      db.exec(readMigration('023-card-identity-physical-copies.sql'))
      db.exec(readMigration('026-physical-copies-v2.sql'))

      const indexes = getIndexNames(db)
      expect(indexes).toContain('idx_physical_copies_group')
      expect(isIndexUnique(db, 'idx_physical_copies_group')).toBe(true)
    })

    it('deck_cards.physical_copy_id index is non-unique after 026', () => {
      applyBaseSchema(db)
      db.exec(readMigration('023-card-identity-physical-copies.sql'))
      db.exec(readMigration('026-physical-copies-v2.sql'))

      const indexes = getIndexNames(db)
      expect(indexes).toContain('idx_deck_cards_physical_copy_id')
      expect(isIndexUnique(db, 'idx_deck_cards_physical_copy_id')).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Verification 2: Down-migration 026 reverses cleanly
  // -------------------------------------------------------------------------
  describe('Down-migration 026 reverses cleanly', () => {
    it('removes quantity column after down-migration', () => {
      applyBaseSchema(db)
      db.exec(readMigration('023-card-identity-physical-copies.sql'))
      db.exec(readMigration('026-physical-copies-v2.sql'))

      // Apply down-migration
      db.exec(readDownMigration('026-physical-copies-v2-down.sql'))

      const columns = getTableColumns(db, 'physical_copies')
      expect(columns).not.toContain('quantity')
    })

    it('removes idx_physical_copies_group after down-migration', () => {
      applyBaseSchema(db)
      db.exec(readMigration('023-card-identity-physical-copies.sql'))
      db.exec(readMigration('026-physical-copies-v2.sql'))

      db.exec(readDownMigration('026-physical-copies-v2-down.sql'))

      const indexes = getIndexNames(db)
      expect(indexes).not.toContain('idx_physical_copies_group')
    })

    it('restores UNIQUE index on deck_cards.physical_copy_id after down-migration', () => {
      applyBaseSchema(db)
      db.exec(readMigration('023-card-identity-physical-copies.sql'))
      db.exec(readMigration('026-physical-copies-v2.sql'))

      db.exec(readDownMigration('026-physical-copies-v2-down.sql'))

      const indexes = getIndexNames(db)
      expect(indexes).toContain('idx_deck_cards_physical_copy_id')
      expect(isIndexUnique(db, 'idx_deck_cards_physical_copy_id')).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Verification 3: Upsert creates one row per printing group, increments qty
  // -------------------------------------------------------------------------
  describe('Upsert creates one row per printing group and increments quantity', () => {
    beforeEach(() => {
      applyBaseSchema(db)
      db.exec(readMigration('023-card-identity-physical-copies.sql'))
      db.exec(readMigration('026-physical-copies-v2.sql'))
    })

    it('first upsert creates a row with the given quantity', () => {
      const cardDefId = ensureCardDefinition(db, 'oracle-001', 'Lightning Bolt')

      const result = upsertPhysicalCopy(db, {
        cardDefinitionId: cardDefId,
        scryfallPrintingId: 'print-abc',
        isFoil: false,
        isProxy: false,
        quantity: 3,
      })

      expect(result.quantity).toBe(3)
      expect(result.cardDefinitionId).toBe(cardDefId)
    })

    it('second upsert with same group key increments quantity', () => {
      const cardDefId = ensureCardDefinition(db, 'oracle-001', 'Lightning Bolt')

      // First upsert: quantity 3
      upsertPhysicalCopy(db, {
        cardDefinitionId: cardDefId,
        scryfallPrintingId: 'print-abc',
        isFoil: false,
        isProxy: false,
        quantity: 3,
      })

      // Second upsert: quantity 2
      const result = upsertPhysicalCopy(db, {
        cardDefinitionId: cardDefId,
        scryfallPrintingId: 'print-abc',
        isFoil: false,
        isProxy: false,
        quantity: 2,
      })

      expect(result.quantity).toBe(5) // 3 + 2
    })

    it('exactly one row exists for the printing group after multiple upserts', () => {
      const cardDefId = ensureCardDefinition(db, 'oracle-001', 'Lightning Bolt')

      upsertPhysicalCopy(db, {
        cardDefinitionId: cardDefId,
        scryfallPrintingId: 'print-abc',
        isFoil: false,
        isProxy: false,
        quantity: 1,
      })

      upsertPhysicalCopy(db, {
        cardDefinitionId: cardDefId,
        scryfallPrintingId: 'print-abc',
        isFoil: false,
        isProxy: false,
        quantity: 4,
      })

      // Verify only one row exists
      const found = findPrintingGroup(db, {
        cardDefinitionId: cardDefId,
        scryfallPrintingId: 'print-abc',
        isFoil: false,
        isProxy: false,
      })

      expect(found).not.toBeNull()
      expect(found!.quantity).toBe(5) // 1 + 4

      // Also verify via direct count
      const countRow = db.prepare(
        `SELECT COUNT(*) as cnt FROM physical_copies WHERE card_definition_id = ? AND scryfall_printing_id = ?`
      ).get(cardDefId, 'print-abc') as { cnt: number }

      expect(countRow.cnt).toBe(1)
    })

    it('different group keys create separate rows', () => {
      const cardDefId = ensureCardDefinition(db, 'oracle-001', 'Lightning Bolt')

      // Non-foil
      upsertPhysicalCopy(db, {
        cardDefinitionId: cardDefId,
        scryfallPrintingId: 'print-abc',
        isFoil: false,
        isProxy: false,
        quantity: 2,
      })

      // Foil version (different group key)
      upsertPhysicalCopy(db, {
        cardDefinitionId: cardDefId,
        scryfallPrintingId: 'print-abc',
        isFoil: true,
        isProxy: false,
        quantity: 1,
      })

      const allCopies = db.prepare(
        `SELECT COUNT(*) as cnt FROM physical_copies WHERE card_definition_id = ?`
      ).get(cardDefId) as { cnt: number }

      expect(allCopies.cnt).toBe(2)
    })
  })

  // -------------------------------------------------------------------------
  // Verification 4: Multiple deck_cards can reference the same physical_copy_id
  // -------------------------------------------------------------------------
  describe('Multiple deck_cards can reference the same physical_copy_id', () => {
    beforeEach(() => {
      applyBaseSchema(db)
      db.exec(readMigration('023-card-identity-physical-copies.sql'))
      db.exec(readMigration('026-physical-copies-v2.sql'))

      // Seed a deck
      db.prepare(
        `INSERT INTO decks (id, name, commander_name, colour_identity, card_count) VALUES (?, ?, ?, ?, ?)`
      ).run(1, 'Test Deck', 'Commander', 'W,U', 100)
    })

    it('allows multiple deck_cards rows to reference the same physical_copy_id', () => {
      const cardDefId = ensureCardDefinition(db, 'oracle-sol', 'Sol Ring')

      // Create a physical copy
      const copy = upsertPhysicalCopy(db, {
        cardDefinitionId: cardDefId,
        scryfallPrintingId: 'print-sol-1',
        isFoil: false,
        isProxy: false,
        quantity: 4,
      })

      // Insert multiple deck_cards for the same card
      db.prepare(
        `INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)`
      ).run(1, 'Sol Ring', 'oracle-sol', 1)
      db.prepare(
        `INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)`
      ).run(1, 'Sol Ring', 'oracle-sol', 1)

      // Get the deck_card IDs
      const deckCards = db.prepare(
        `SELECT id FROM deck_cards WHERE card_name = 'Sol Ring' AND deck_id = 1`
      ).all() as Array<{ id: number }>

      expect(deckCards).toHaveLength(2)

      // Link both deck_cards to the same physical_copy_id
      const result1 = linkPhysicalCopyToDeckCard(db, copy.id, deckCards[0].id)
      const result2 = linkPhysicalCopyToDeckCard(db, copy.id, deckCards[1].id)

      // Neither should return an error
      expect(result1).toBeUndefined()
      expect(result2).toBeUndefined()

      // Verify both links exist
      const linked = db.prepare(
        `SELECT id, physical_copy_id FROM deck_cards WHERE physical_copy_id = ?`
      ).all(copy.id) as Array<{ id: number; physical_copy_id: number }>

      expect(linked).toHaveLength(2)
      expect(linked[0].physical_copy_id).toBe(copy.id)
      expect(linked[1].physical_copy_id).toBe(copy.id)
    })

    it('linking the same physical_copy to deck_cards in different decks works', () => {
      // Create a second deck
      db.prepare(
        `INSERT INTO decks (id, name, commander_name, colour_identity, card_count) VALUES (?, ?, ?, ?, ?)`
      ).run(2, 'Second Deck', 'Commander 2', 'B,G', 100)

      const cardDefId = ensureCardDefinition(db, 'oracle-bolt', 'Lightning Bolt')

      const copy = upsertPhysicalCopy(db, {
        cardDefinitionId: cardDefId,
        scryfallPrintingId: 'print-bolt-1',
        isFoil: false,
        isProxy: false,
        quantity: 2,
      })

      // Add deck_cards to both decks
      db.prepare(
        `INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)`
      ).run(1, 'Lightning Bolt', 'oracle-bolt', 1)
      db.prepare(
        `INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)`
      ).run(2, 'Lightning Bolt', 'oracle-bolt', 1)

      const deckCards = db.prepare(
        `SELECT id, deck_id FROM deck_cards WHERE card_name = 'Lightning Bolt'`
      ).all() as Array<{ id: number; deck_id: number }>

      expect(deckCards).toHaveLength(2)

      // Link both to the same physical copy — no constraint violation
      const result1 = linkPhysicalCopyToDeckCard(db, copy.id, deckCards[0].id)
      const result2 = linkPhysicalCopyToDeckCard(db, copy.id, deckCards[1].id)

      expect(result1).toBeUndefined()
      expect(result2).toBeUndefined()

      // Verify both links
      const linked = db.prepare(
        `SELECT COUNT(*) as cnt FROM deck_cards WHERE physical_copy_id = ?`
      ).get(copy.id) as { cnt: number }

      expect(linked.cnt).toBe(2)
    })
  })
})
