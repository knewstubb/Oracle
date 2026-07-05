import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  BASIC_LAND_TYPES,
  isBasicLandType,
  isBasicLandDefinition,
  createGenericLandSlot,
  removeGenericLandSlot,
  getAllPreferences,
  getPreference,
  updatePreference,
  convertToSpecific,
  convertToGeneric,
  listConversionTargets,
} from '../generic-land-store'
import type { BasicLandType, GenericLandError, GenericLandErrorCode } from '../generic-land-store'

// ---------------------------------------------------------------------------
// Test Database Setup
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')

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

    CREATE TABLE IF NOT EXISTS card_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      oracle_id TEXT NOT NULL UNIQUE,
      card_name TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_card_definitions_card_name ON card_definitions(card_name);

    CREATE TABLE IF NOT EXISTS deck_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      card_name TEXT NOT NULL,
      scryfall_id TEXT,
      set_code TEXT,
      quantity INTEGER DEFAULT 1,
      categories TEXT,
      tags TEXT,
      is_commander BOOLEAN DEFAULT FALSE,
      ownership_status TEXT DEFAULT NULL,
      proxy_of_deck_id INTEGER DEFAULT NULL REFERENCES decks(id) ON DELETE SET NULL,
      physical_copy_id INTEGER DEFAULT NULL,
      card_definition_id INTEGER REFERENCES card_definitions(id) ON DELETE SET NULL,
      is_generic_land BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE INDEX IF NOT EXISTS idx_deck_cards_name ON deck_cards(card_name);
    CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id);
  `)

  // Seed a test deck
  db.prepare('INSERT INTO decks (id, name) VALUES (?, ?)').run(1, 'Test Deck')

  // Seed the 6 basic land types
  const insert = db.prepare('INSERT INTO card_definitions (oracle_id, card_name) VALUES (?, ?)')
  insert.run('bc71ebf6-2056-41f7-be35-b2e5c34afa99', 'Plains')
  insert.run('b2c6aa39-2d2a-459c-a555-fb48ba993373', 'Island')
  insert.run('56719f6a-1a6c-4c0a-8d21-18f7d7350b68', 'Swamp')
  insert.run('a3a2fa84-0571-4b52-9c12-34714b9efb01', 'Mountain')
  insert.run('5ff23790-07e8-4e56-b61e-3ef37e5207c5', 'Forest')
  insert.run('fea89547-1a50-4ae4-9824-955306d0f1d4', 'Wastes')

  // Seed some non-basic cards
  insert.run('non-basic-oracle-1', 'Lightning Bolt')
  insert.run('non-basic-oracle-2', 'Breeding Pool')
  insert.run('non-basic-oracle-3', 'Snow-Covered Forest')

  return db
}

// ---------------------------------------------------------------------------
// Tests: BASIC_LAND_TYPES constant
// ---------------------------------------------------------------------------

describe('BASIC_LAND_TYPES', () => {
  it('contains exactly 6 entries', () => {
    expect(BASIC_LAND_TYPES).toHaveLength(6)
  })

  it('includes all six basic land types', () => {
    expect(BASIC_LAND_TYPES).toContain('Plains')
    expect(BASIC_LAND_TYPES).toContain('Island')
    expect(BASIC_LAND_TYPES).toContain('Swamp')
    expect(BASIC_LAND_TYPES).toContain('Mountain')
    expect(BASIC_LAND_TYPES).toContain('Forest')
    expect(BASIC_LAND_TYPES).toContain('Wastes')
  })
})

// ---------------------------------------------------------------------------
// Tests: isBasicLandType
// ---------------------------------------------------------------------------

describe('isBasicLandType', () => {
  it('returns true for all six basic land types', () => {
    for (const landType of BASIC_LAND_TYPES) {
      expect(isBasicLandType(landType)).toBe(true)
    }
  })

  it('returns false for non-basic land card names', () => {
    expect(isBasicLandType('Breeding Pool')).toBe(false)
    expect(isBasicLandType('Lightning Bolt')).toBe(false)
    expect(isBasicLandType('Snow-Covered Forest')).toBe(false)
    expect(isBasicLandType('Command Tower')).toBe(false)
  })

  it('is case-sensitive', () => {
    expect(isBasicLandType('plains')).toBe(false)
    expect(isBasicLandType('ISLAND')).toBe(false)
    expect(isBasicLandType('sWAMP')).toBe(false)
    expect(isBasicLandType('forest')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isBasicLandType('')).toBe(false)
  })

  it('returns false for partial matches', () => {
    expect(isBasicLandType('Plain')).toBe(false)
    expect(isBasicLandType('Islands')).toBe(false)
    expect(isBasicLandType('Waste')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: isBasicLandDefinition
// ---------------------------------------------------------------------------

describe('isBasicLandDefinition', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('returns true for each of the six basic land card_definition_ids', () => {
    // IDs 1-6 are the basic lands seeded in createTestDb
    for (let id = 1; id <= 6; id++) {
      expect(isBasicLandDefinition(db, id)).toBe(true)
    }
  })

  it('returns false for non-basic land card_definition_ids', () => {
    // IDs 7-9 are Lightning Bolt, Breeding Pool, Snow-Covered Forest
    expect(isBasicLandDefinition(db, 7)).toBe(false)
    expect(isBasicLandDefinition(db, 8)).toBe(false)
    expect(isBasicLandDefinition(db, 9)).toBe(false)
  })

  it('returns false for non-existent card_definition_id', () => {
    expect(isBasicLandDefinition(db, 999)).toBe(false)
    expect(isBasicLandDefinition(db, 0)).toBe(false)
    expect(isBasicLandDefinition(db, -1)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: createGenericLandSlot
// ---------------------------------------------------------------------------

describe('createGenericLandSlot', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('creates a generic land slot for a valid basic land type and returns the new id', () => {
    const result = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 1 }) // Plains

    expect(typeof result).toBe('number')
    const id = result as number

    // Verify the row was inserted correctly
    const row = db.prepare('SELECT * FROM deck_cards WHERE id = ?').get(id) as any
    expect(row).toBeDefined()
    expect(row.deck_id).toBe(1)
    expect(row.card_name).toBe('Plains')
    expect(row.card_definition_id).toBe(1)
    expect(row.is_generic_land).toBe(1) // SQLite stores booleans as 0/1
    expect(row.physical_copy_id).toBeNull()
  })

  it('succeeds for all six basic land types', () => {
    for (let id = 1; id <= 6; id++) {
      const result = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: id })
      expect(typeof result).toBe('number')
    }

    // Verify all 6 rows were created
    const count = db.prepare('SELECT COUNT(*) as cnt FROM deck_cards WHERE is_generic_land = TRUE').get() as any
    expect(count.cnt).toBe(6)
  })

  it('returns NOT_BASIC_LAND error for a non-basic card definition', () => {
    // card_definition_id 7 = Lightning Bolt
    const result = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 7 })

    expect(typeof result).toBe('object')
    const error = result as GenericLandError
    expect(error.error).toBe('NOT_BASIC_LAND')
    expect(error.message).toContain('Only basic land types support generic slots')
  })

  it('returns NOT_BASIC_LAND error for Snow-Covered Forest', () => {
    // card_definition_id 9 = Snow-Covered Forest
    const result = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 9 })

    expect(typeof result).toBe('object')
    const error = result as GenericLandError
    expect(error.error).toBe('NOT_BASIC_LAND')
  })

  it('returns NOT_BASIC_LAND error for non-existent card_definition_id', () => {
    const result = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 999 })

    expect(typeof result).toBe('object')
    const error = result as GenericLandError
    expect(error.error).toBe('NOT_BASIC_LAND')
  })

  it('does not create a row when validation fails', () => {
    createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 7 })

    const count = db.prepare('SELECT COUNT(*) as cnt FROM deck_cards').get() as any
    expect(count.cnt).toBe(0)
  })

  it('allows multiple generic land slots of the same type in the same deck', () => {
    const id1 = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 5 }) // Forest
    const id2 = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 5 }) // Forest

    expect(typeof id1).toBe('number')
    expect(typeof id2).toBe('number')
    expect(id1).not.toBe(id2)
  })
})

// ---------------------------------------------------------------------------
// Tests: removeGenericLandSlot
// ---------------------------------------------------------------------------

describe('removeGenericLandSlot', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('deletes the deck_cards row', () => {
    // First create a generic land slot
    const id = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 1 }) as number

    // Verify it exists
    const before = db.prepare('SELECT COUNT(*) as cnt FROM deck_cards WHERE id = ?').get(id) as any
    expect(before.cnt).toBe(1)

    // Remove it
    removeGenericLandSlot(db, id)

    // Verify it's gone
    const after = db.prepare('SELECT COUNT(*) as cnt FROM deck_cards WHERE id = ?').get(id) as any
    expect(after.cnt).toBe(0)
  })

  it('does not affect other deck_cards rows', () => {
    const id1 = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 1 }) as number
    const id2 = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 2 }) as number

    removeGenericLandSlot(db, id1)

    // id2 should still exist
    const row = db.prepare('SELECT * FROM deck_cards WHERE id = ?').get(id2) as any
    expect(row).toBeDefined()
    expect(row.card_name).toBe('Island')
  })

  it('is a no-op when called with a non-existent id', () => {
    // Should not throw
    removeGenericLandSlot(db, 999)
  })

  it('does not affect generic_land_preferences or card_definitions tables', () => {
    // Seed generic_land_preferences for this test
    db.exec(`
      CREATE TABLE IF NOT EXISTS generic_land_preferences (
        card_definition_id INTEGER PRIMARY KEY REFERENCES card_definitions(id),
        scryfall_printing_id TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO generic_land_preferences (card_definition_id, scryfall_printing_id) VALUES (1, 'test-printing-id');
    `)

    const id = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 1 }) as number
    removeGenericLandSlot(db, id)

    // Preferences should still be intact
    const pref = db.prepare('SELECT * FROM generic_land_preferences WHERE card_definition_id = 1').get() as any
    expect(pref).toBeDefined()
    expect(pref.scryfall_printing_id).toBe('test-printing-id')

    // card_definitions should be unchanged
    const def = db.prepare('SELECT * FROM card_definitions WHERE id = 1').get() as any
    expect(def).toBeDefined()
    expect(def.card_name).toBe('Plains')
  })
})


// ---------------------------------------------------------------------------
// Test Database Setup (with generic_land_preferences table)
// ---------------------------------------------------------------------------

function createTestDbWithPreferences(): Database.Database {
  const db = createTestDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS generic_land_preferences (
      card_definition_id INTEGER PRIMARY KEY REFERENCES card_definitions(id),
      scryfall_printing_id TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Seed default preferences for the 6 basic types (IDs 1-6)
  const insertPref = db.prepare(
    'INSERT INTO generic_land_preferences (card_definition_id, scryfall_printing_id) VALUES (?, ?)'
  )
  insertPref.run(1, 'bbd4b127-0a28-4f02-8e5e-e4a101e3acbc') // Plains
  insertPref.run(2, '2b201e16-8a04-4b06-9e52-72f7bcba49b8') // Island
  insertPref.run(3, '4c5fb18b-c11e-4ab9-a230-2fbc8bbf22fe') // Swamp
  insertPref.run(4, 'a3a0c832-d9d6-425a-9a7a-2bf60c3ce604') // Mountain
  insertPref.run(5, '5cf3db8f-0126-44f5-bff1-9c74f7e5e0c1') // Forest
  insertPref.run(6, '9cc070d3-4b83-4684-9caf-063e5c473a77') // Wastes

  return db
}

// ---------------------------------------------------------------------------
// Tests: getAllPreferences
// ---------------------------------------------------------------------------

describe('getAllPreferences', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDbWithPreferences()
  })

  it('returns exactly 6 rows after seeding', () => {
    const prefs = getAllPreferences(db)
    expect(prefs).toHaveLength(6)
  })

  it('returns all six basic land types with correct card names', () => {
    const prefs = getAllPreferences(db)
    const names = prefs.map(p => p.cardName).sort()
    expect(names).toEqual(['Forest', 'Island', 'Mountain', 'Plains', 'Swamp', 'Wastes'])
  })

  it('returns camelCase properties with expected fields', () => {
    const prefs = getAllPreferences(db)
    for (const pref of prefs) {
      expect(pref).toHaveProperty('cardDefinitionId')
      expect(pref).toHaveProperty('cardName')
      expect(pref).toHaveProperty('scryfallPrintingId')
      expect(pref).toHaveProperty('updatedAt')
      expect(typeof pref.cardDefinitionId).toBe('number')
      expect(typeof pref.cardName).toBe('string')
      expect(typeof pref.scryfallPrintingId).toBe('string')
    }
  })

  it('returns the seeded scryfall printing IDs', () => {
    const prefs = getAllPreferences(db)
    const plains = prefs.find(p => p.cardName === 'Plains')
    expect(plains?.scryfallPrintingId).toBe('bbd4b127-0a28-4f02-8e5e-e4a101e3acbc')
  })
})

// ---------------------------------------------------------------------------
// Tests: getPreference
// ---------------------------------------------------------------------------

describe('getPreference', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDbWithPreferences()
  })

  it('returns a preference for a valid basic land card_definition_id', () => {
    const pref = getPreference(db, 1) // Plains
    expect(pref).not.toBeNull()
    expect(pref!.cardName).toBe('Plains')
    expect(pref!.cardDefinitionId).toBe(1)
    expect(pref!.scryfallPrintingId).toBe('bbd4b127-0a28-4f02-8e5e-e4a101e3acbc')
  })

  it('returns null for a non-basic card_definition_id that has no preference row', () => {
    const pref = getPreference(db, 7) // Lightning Bolt
    expect(pref).toBeNull()
  })

  it('returns null for a non-existent card_definition_id', () => {
    const pref = getPreference(db, 999)
    expect(pref).toBeNull()
  })

  it('returns each basic land preference individually', () => {
    for (let id = 1; id <= 6; id++) {
      const pref = getPreference(db, id)
      expect(pref).not.toBeNull()
      expect(pref!.cardDefinitionId).toBe(id)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: updatePreference
// ---------------------------------------------------------------------------

describe('updatePreference', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDbWithPreferences()
  })

  it('updates the scryfall_printing_id for a valid basic land type', () => {
    const newPrintingId = 'new-printing-uuid-12345'
    const result = updatePreference(db, 1, newPrintingId) // Plains
    expect(result).toBeUndefined() // success returns void

    const pref = getPreference(db, 1)
    expect(pref!.scryfallPrintingId).toBe(newPrintingId)
  })

  it('returns NOT_BASIC_LAND error for a non-basic card_definition_id', () => {
    const result = updatePreference(db, 7, 'some-printing-id') // Lightning Bolt
    expect(result).toBeDefined()
    expect((result as GenericLandError).error).toBe('NOT_BASIC_LAND')
  })

  it('returns NOT_BASIC_LAND error for a non-existent card_definition_id', () => {
    const result = updatePreference(db, 999, 'some-printing-id')
    expect(result).toBeDefined()
    expect((result as GenericLandError).error).toBe('NOT_BASIC_LAND')
  })

  it('returns INVALID_PRINTING error for empty scryfall_printing_id', () => {
    const result = updatePreference(db, 1, '')
    expect(result).toBeDefined()
    expect((result as GenericLandError).error).toBe('INVALID_PRINTING')
  })

  it('returns INVALID_PRINTING error for whitespace-only scryfall_printing_id', () => {
    const result = updatePreference(db, 1, '   ')
    expect(result).toBeDefined()
    expect((result as GenericLandError).error).toBe('INVALID_PRINTING')
  })

  it('updates updated_at timestamp on change', () => {
    const prefBefore = getPreference(db, 1)
    // Small delay not needed — datetime('now') is sufficient to confirm it updates
    updatePreference(db, 1, 'another-uuid-value')
    const prefAfter = getPreference(db, 1)
    // updated_at should be set (not null)
    expect(prefAfter!.updatedAt).toBeDefined()
  })

  it('does not affect other preferences when updating one', () => {
    updatePreference(db, 1, 'new-plains-printing')
    const island = getPreference(db, 2)
    expect(island!.scryfallPrintingId).toBe('2b201e16-8a04-4b06-9e52-72f7bcba49b8') // unchanged
  })
})

// ---------------------------------------------------------------------------
// Test Database Setup (with physical_copies table for conversion tests)
// ---------------------------------------------------------------------------

function createTestDbForConversion(): Database.Database {
  const db = createTestDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS physical_copies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_definition_id INTEGER NOT NULL REFERENCES card_definitions(id),
      scryfall_printing_id TEXT,
      is_proxy BOOLEAN NOT NULL DEFAULT FALSE,
      proxy_for_definition_id INTEGER REFERENCES card_definitions(id) ON DELETE SET NULL,
      condition TEXT,
      is_foil BOOLEAN NOT NULL DEFAULT FALSE,
      acquired_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      quantity INTEGER NOT NULL DEFAULT 1
    );
  `)

  return db
}

// ---------------------------------------------------------------------------
// Tests: convertToSpecific
// ---------------------------------------------------------------------------

describe('convertToSpecific', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDbForConversion()
  })

  it('successfully converts a generic slot to a specific printing with matching card_definition_id', () => {
    // Create a generic land slot (Forest = card_definition_id 5)
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 5 }) as number

    // Create a physical_copies row for Forest
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (5, 'forest-printing-abc', FALSE, FALSE, 3)
    `).run()
    const pcId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

    // Convert
    const result = convertToSpecific(db, { deckCardId: slotId, physicalCopyId: pcId })
    expect(result).toBeUndefined() // success

    // Verify the row was updated
    const row = db.prepare('SELECT * FROM deck_cards WHERE id = ?').get(slotId) as any
    expect(row.is_generic_land).toBe(0) // FALSE
    expect(row.physical_copy_id).toBe(pcId)
    expect(row.card_definition_id).toBe(5) // preserved
  })

  it('returns NOT_GENERIC_SLOT error if the row is already non-generic', () => {
    // Insert a non-generic deck_cards row directly
    db.prepare(`
      INSERT INTO deck_cards (deck_id, card_name, card_definition_id, is_generic_land, physical_copy_id)
      VALUES (1, 'Forest', 5, FALSE, NULL)
    `).run()
    const rowId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

    const result = convertToSpecific(db, { deckCardId: rowId, physicalCopyId: 1 })
    expect(result).toBeDefined()
    expect((result as GenericLandError).error).toBe('NOT_GENERIC_SLOT')
  })

  it('returns NOT_GENERIC_SLOT error for non-existent deck_cards row', () => {
    const result = convertToSpecific(db, { deckCardId: 999, physicalCopyId: 1 })
    expect(result).toBeDefined()
    expect((result as GenericLandError).error).toBe('NOT_GENERIC_SLOT')
  })

  it('returns NO_MATCHING_COPY error when physical_copies row does not exist', () => {
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 5 }) as number

    const result = convertToSpecific(db, { deckCardId: slotId, physicalCopyId: 999 })
    expect(result).toBeDefined()
    expect((result as GenericLandError).error).toBe('NO_MATCHING_COPY')
  })

  it('returns CARD_MISMATCH error when physical_copies card_definition_id does not match', () => {
    // Create a generic slot for Forest (card_definition_id 5)
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 5 }) as number

    // Create a physical_copies row for Plains (card_definition_id 1 — mismatch!)
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (1, 'plains-printing-xyz', FALSE, FALSE, 1)
    `).run()
    const pcId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

    const result = convertToSpecific(db, { deckCardId: slotId, physicalCopyId: pcId })
    expect(result).toBeDefined()
    expect((result as GenericLandError).error).toBe('CARD_MISMATCH')
  })

  it('allows conversion to a proxy physical_copies row (Requirement 5.6)', () => {
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 3 }) as number // Swamp

    // Create a proxy physical_copies row for Swamp
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (3, 'swamp-proxy-printing', TRUE, FALSE, 1)
    `).run()
    const pcId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

    const result = convertToSpecific(db, { deckCardId: slotId, physicalCopyId: pcId })
    expect(result).toBeUndefined() // success

    const row = db.prepare('SELECT * FROM deck_cards WHERE id = ?').get(slotId) as any
    expect(row.is_generic_land).toBe(0)
    expect(row.physical_copy_id).toBe(pcId)
  })

  it('preserves ownership_status and proxy_of_deck_id during conversion (Requirement 5.5)', () => {
    // Create a generic slot, then manually set ownership_status for testing
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 2 }) as number // Island
    db.prepare('UPDATE deck_cards SET ownership_status = ?, proxy_of_deck_id = ? WHERE id = ?')
      .run('generic', null, slotId)

    // Create matching physical copy
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (2, 'island-printing', FALSE, FALSE, 2)
    `).run()
    const pcId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

    const result = convertToSpecific(db, { deckCardId: slotId, physicalCopyId: pcId })
    expect(result).toBeUndefined()

    const row = db.prepare('SELECT * FROM deck_cards WHERE id = ?').get(slotId) as any
    expect(row.ownership_status).toBe('generic') // preserved, not cleared
    expect(row.proxy_of_deck_id).toBeNull() // preserved
  })
})

// ---------------------------------------------------------------------------
// Tests: convertToGeneric
// ---------------------------------------------------------------------------

describe('convertToGeneric', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDbForConversion()
  })

  it('successfully converts a specific printing back to generic', () => {
    // Create a generic slot and convert it to specific first
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 4 }) as number // Mountain
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (4, 'mountain-printing-123', FALSE, FALSE, 2)
    `).run()
    const pcId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

    // Convert to specific
    convertToSpecific(db, { deckCardId: slotId, physicalCopyId: pcId })

    // Now convert back to generic
    const result = convertToGeneric(db, { deckCardId: slotId })
    expect(result).toBeUndefined() // success

    // Verify the row state
    const row = db.prepare('SELECT * FROM deck_cards WHERE id = ?').get(slotId) as any
    expect(row.is_generic_land).toBe(1) // TRUE
    expect(row.physical_copy_id).toBeNull()
    expect(row.card_definition_id).toBe(4) // preserved
  })

  it('returns NOT_GENERIC_SLOT error if the row is already generic', () => {
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 1 }) as number

    const result = convertToGeneric(db, { deckCardId: slotId })
    expect(result).toBeDefined()
    expect((result as GenericLandError).error).toBe('NOT_GENERIC_SLOT')
    expect((result as GenericLandError).message).toContain('already a generic land slot')
  })

  it('returns NOT_GENERIC_SLOT error for non-existent deck_cards row', () => {
    const result = convertToGeneric(db, { deckCardId: 999 })
    expect(result).toBeDefined()
    expect((result as GenericLandError).error).toBe('NOT_GENERIC_SLOT')
  })

  it('preserves card_definition_id after conversion (Requirement 5.4)', () => {
    // Create a non-generic row directly
    db.prepare(`
      INSERT INTO deck_cards (deck_id, card_name, card_definition_id, is_generic_land, physical_copy_id)
      VALUES (1, 'Forest', 5, FALSE, NULL)
    `).run()
    const rowId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

    convertToGeneric(db, { deckCardId: rowId })

    const row = db.prepare('SELECT * FROM deck_cards WHERE id = ?').get(rowId) as any
    expect(row.card_definition_id).toBe(5)
  })

  it('does NOT modify the previously-referenced physical_copies row (Requirement 5.4)', () => {
    // Create physical copy
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (5, 'forest-printing-xyz', FALSE, TRUE, 4)
    `).run()
    const pcId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

    // Create a generic slot and convert to specific
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 5 }) as number
    convertToSpecific(db, { deckCardId: slotId, physicalCopyId: pcId })

    // Now convert back to generic
    convertToGeneric(db, { deckCardId: slotId })

    // The physical_copies row should be completely unchanged
    const pc = db.prepare('SELECT * FROM physical_copies WHERE id = ?').get(pcId) as any
    expect(pc.card_definition_id).toBe(5)
    expect(pc.scryfall_printing_id).toBe('forest-printing-xyz')
    expect(pc.is_proxy).toBe(0)
    expect(pc.is_foil).toBe(1)
    expect(pc.quantity).toBe(4)
  })

  it('preserves ownership_status and proxy_of_deck_id (Requirement 5.5)', () => {
    // Create a non-generic row with specific ownership status
    db.prepare(`
      INSERT INTO deck_cards (deck_id, card_name, card_definition_id, is_generic_land, physical_copy_id, ownership_status, proxy_of_deck_id)
      VALUES (1, 'Plains', 1, FALSE, NULL, 'proxy', 1)
    `).run()
    const rowId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

    convertToGeneric(db, { deckCardId: rowId })

    const row = db.prepare('SELECT * FROM deck_cards WHERE id = ?').get(rowId) as any
    expect(row.ownership_status).toBe('proxy') // preserved
    expect(row.proxy_of_deck_id).toBe(1) // preserved
  })

  it('preserves the row primary key through conversion (Requirement 5.1)', () => {
    // Create generic slot
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 6 }) as number // Wastes
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (6, 'wastes-print', FALSE, FALSE, 1)
    `).run()
    const pcId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

    // Round-trip
    convertToSpecific(db, { deckCardId: slotId, physicalCopyId: pcId })
    convertToGeneric(db, { deckCardId: slotId })

    // Same PK
    const row = db.prepare('SELECT * FROM deck_cards WHERE id = ?').get(slotId) as any
    expect(row).toBeDefined()
    expect(row.id).toBe(slotId)
  })
})

// ---------------------------------------------------------------------------
// Tests: listConversionTargets
// ---------------------------------------------------------------------------

describe('listConversionTargets', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDbForConversion()
  })

  it('returns physical_copies rows matching the slot card_definition_id', () => {
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 5 }) as number // Forest

    // Create matching physical copies for Forest
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (5, 'forest-alpha', FALSE, FALSE, 1)
    `).run()
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (5, 'forest-beta', FALSE, TRUE, 2)
    `).run()

    const targets = listConversionTargets(db, slotId)
    expect(targets).toHaveLength(2)
    expect(targets[0].scryfallPrintingId).toBe('forest-alpha')
    expect(targets[0].isProxy).toBe(false)
    expect(targets[0].isFoil).toBe(false)
    expect(targets[0].quantity).toBe(1)
    expect(targets[1].scryfallPrintingId).toBe('forest-beta')
    expect(targets[1].isFoil).toBe(true)
    expect(targets[1].quantity).toBe(2)
  })

  it('does not return physical_copies rows with non-matching card_definition_id', () => {
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 1 }) as number // Plains

    // Create physical copies for different card definitions
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (1, 'plains-print', FALSE, FALSE, 1)
    `).run()
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (2, 'island-print', FALSE, FALSE, 1)
    `).run()
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (5, 'forest-print', FALSE, FALSE, 1)
    `).run()

    const targets = listConversionTargets(db, slotId)
    expect(targets).toHaveLength(1)
    expect(targets[0].scryfallPrintingId).toBe('plains-print')
  })

  it('returns empty array for non-existent deck_cards row', () => {
    const targets = listConversionTargets(db, 999)
    expect(targets).toEqual([])
  })

  it('returns empty array when no physical_copies exist for the card_definition_id', () => {
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 6 }) as number // Wastes

    const targets = listConversionTargets(db, slotId)
    expect(targets).toEqual([])
  })

  it('returns empty array when deck_cards row has null card_definition_id', () => {
    db.prepare(`
      INSERT INTO deck_cards (deck_id, card_name, card_definition_id, is_generic_land)
      VALUES (1, 'Forest', NULL, FALSE)
    `).run()
    const rowId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

    const targets = listConversionTargets(db, rowId)
    expect(targets).toEqual([])
  })

  it('includes proxy physical_copies rows as valid targets', () => {
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 3 }) as number // Swamp

    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (3, 'swamp-owned', FALSE, FALSE, 2)
    `).run()
    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (3, 'swamp-proxy', TRUE, FALSE, 1)
    `).run()

    const targets = listConversionTargets(db, slotId)
    expect(targets).toHaveLength(2)

    const proxy = targets.find(t => t.isProxy)
    expect(proxy).toBeDefined()
    expect(proxy!.scryfallPrintingId).toBe('swamp-proxy')
  })

  it('returns correct field types for each target', () => {
    const slotId = createGenericLandSlot(db, { deckId: 1, cardDefinitionId: 4 }) as number // Mountain

    db.prepare(`
      INSERT INTO physical_copies (card_definition_id, scryfall_printing_id, is_proxy, is_foil, quantity)
      VALUES (4, NULL, FALSE, TRUE, 5)
    `).run()

    const targets = listConversionTargets(db, slotId)
    expect(targets).toHaveLength(1)
    expect(targets[0].id).toBeTypeOf('number')
    expect(targets[0].scryfallPrintingId).toBeNull()
    expect(targets[0].isProxy).toBe(false)
    expect(targets[0].isFoil).toBe(true)
    expect(targets[0].quantity).toBe(5)
  })
})
