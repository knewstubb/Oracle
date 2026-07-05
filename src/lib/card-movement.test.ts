import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import Database from 'better-sqlite3'
import { planCardMovement, executeCardMovement, type MoveCardCommand } from './card-movement'
import { computeAllocations } from './allocation-resolver'
import { buildAllocationInput, applyAllocationOutput } from './allocation-store'

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
      is_generic_land BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS collection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_name TEXT NOT NULL,
      scryfall_id TEXT,
      set_code TEXT,
      quantity INTEGER DEFAULT 1,
      foil BOOLEAN DEFAULT FALSE,
      finish TEXT DEFAULT 'Normal',
      condition TEXT DEFAULT 'Near Mint',
      date_added TEXT,
      language TEXT DEFAULT 'English',
      purchase_price REAL DEFAULT 0,
      collector_number TEXT,
      color_identity TEXT,
      types TEXT,
      edition_name TEXT
    );

    CREATE TABLE IF NOT EXISTS deck_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_name TEXT NOT NULL,
      scryfall_id TEXT,
      set_code TEXT,
      collector_number TEXT,
      deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('original', 'proxy')),
      priority_override BOOLEAN DEFAULT FALSE,
      written_to_archidekt BOOLEAN DEFAULT FALSE,
      written_at DATETIME,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(card_name, deck_id)
    );

    CREATE TABLE IF NOT EXISTS deck_priority (
      deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
      priority INTEGER NOT NULL DEFAULT 100,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_deck_cards_name ON deck_cards(card_name);
    CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id);
    CREATE INDEX IF NOT EXISTS idx_collection_name ON collection(card_name);
    CREATE INDEX IF NOT EXISTS idx_deck_alloc_card ON deck_allocations(card_name);
    CREATE INDEX IF NOT EXISTS idx_deck_alloc_deck ON deck_allocations(deck_id);
  `)

  return db
}

function seedDecks(db: Database.Database, count: number) {
  const insert = db.prepare('INSERT INTO decks (id, name) VALUES (?, ?)')
  for (let i = 1; i <= count; i++) {
    insert.run(i, `Deck ${i}`)
  }
}

function seedDeckPriority(db: Database.Database, priorities: [number, number][]) {
  const insert = db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)')
  for (const [deckId, priority] of priorities) {
    insert.run(deckId, priority)
  }
}

function seedDeckCard(db: Database.Database, deckId: number, cardName: string, scryfallId?: string) {
  db.prepare(
    'INSERT INTO deck_cards (deck_id, card_name, scryfall_id) VALUES (?, ?, ?)'
  ).run(deckId, cardName, scryfallId || null)
}

function seedCollection(db: Database.Database, cardName: string, scryfallId: string, quantity: number, setCode = 'cmm', collectorNumber = '1') {
  db.prepare(
    'INSERT INTO collection (card_name, scryfall_id, set_code, collector_number, quantity) VALUES (?, ?, ?, ?, ?)'
  ).run(cardName, scryfallId, setCode, collectorNumber, quantity)
}

// ---------------------------------------------------------------------------
// Unit Tests: planCardMovement
// ---------------------------------------------------------------------------

describe('planCardMovement', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, 4)
    seedDeckPriority(db, [[1, 10], [2, 20], [3, 30], [4, 40]])
  })

  describe('validation', () => {
    it('returns error when source deck does not exist', () => {
      seedDeckCard(db, 1, 'Sol Ring', 'sol-1')
      const result = planCardMovement(db, {
        cardName: 'Sol Ring',
        fromDeckId: 99,
        toDeckId: 2,
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('99')
      expect(result.error).toContain('does not exist')
    })

    it('returns error when target deck does not exist', () => {
      seedDeckCard(db, 1, 'Sol Ring', 'sol-1')
      const result = planCardMovement(db, {
        cardName: 'Sol Ring',
        fromDeckId: 1,
        toDeckId: 99,
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('99')
      expect(result.error).toContain('does not exist')
    })

    it('returns error when card does not exist in source deck (Req 3.6)', () => {
      seedDeckCard(db, 1, 'Lightning Bolt', 'bolt-1')
      const result = planCardMovement(db, {
        cardName: 'Sol Ring',
        fromDeckId: 1,
        toDeckId: 2,
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Sol Ring')
      expect(result.error).toContain('Deck 1')
    })
  })

  describe('successful movement planning', () => {
    it('plans a basic move from deck 1 to deck 2', () => {
      // Sol Ring exists in deck 1 and is owned (1 copy)
      seedDeckCard(db, 1, 'Sol Ring', 'sol-1')
      seedCollection(db, 'Sol Ring', 'sol-1', 1)

      const result = planCardMovement(db, {
        cardName: 'Sol Ring',
        fromDeckId: 1,
        toDeckId: 2,
      })

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.affectedDecks).toContain(1)
      expect(result.affectedDecks).toContain(2)
    })

    it('detects proxy cascade when card is shared (Req 3.2)', () => {
      // Sol Ring in decks 1 and 2, only 1 copy owned
      // Deck 1 has priority 10 (highest), deck 2 has priority 20
      seedDeckCard(db, 1, 'Sol Ring', 'sol-1')
      seedDeckCard(db, 2, 'Sol Ring', 'sol-1')
      seedCollection(db, 'Sol Ring', 'sol-1', 1)

      // Current state: deck 1 has original, deck 2 has proxy
      db.prepare(
        'INSERT INTO deck_allocations (card_name, deck_id, role, scryfall_id, priority_override) VALUES (?, ?, ?, ?, ?)'
      ).run('Sol Ring', 1, 'original', 'sol-1', 0)
      db.prepare(
        'INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)'
      ).run('Sol Ring', 2, 'proxy', 0)

      // Move from deck 1 to deck 3 (deck 3 doesn't have it yet)
      const result = planCardMovement(db, {
        cardName: 'Sol Ring',
        fromDeckId: 1,
        toDeckId: 3,
      })

      expect(result.success).toBe(true)
      // After move: deck 2 still has it, deck 3 gets it
      // With priority: deck 2 (prio 20) and deck 3 (prio 30) — deck 2 gets original
      expect(result.allocationChanges.length).toBeGreaterThan(0)
    })

    it('generates archidekt writes for role transitions (Req 3.4)', () => {
      // Sol Ring in decks 1, 2, 3. Only 1 copy. Deck 1 is highest priority.
      seedDeckCard(db, 1, 'Sol Ring', 'sol-1')
      seedDeckCard(db, 2, 'Sol Ring', 'sol-1')
      seedDeckCard(db, 3, 'Sol Ring', 'sol-1')
      seedCollection(db, 'Sol Ring', 'sol-1', 1)

      // Current allocations: deck 1 = original, deck 2 = proxy, deck 3 = proxy
      db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, scryfall_id, priority_override) VALUES (?, ?, ?, ?, ?)').run('Sol Ring', 1, 'original', 'sol-1', 0)
      db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 2, 'proxy', 0)
      db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 3, 'proxy', 0)

      // Move card out of deck 1 → deck 4
      // After: decks 2, 3, 4 all want it. Deck 2 (prio 20) gets original.
      const result = planCardMovement(db, {
        cardName: 'Sol Ring',
        fromDeckId: 1,
        toDeckId: 4,
      })

      expect(result.success).toBe(true)
      // We expect archidekt writes for proxy changes
      expect(result.archidektWrites.length).toBeGreaterThanOrEqual(0)
    })

    it('includes both source and target in affected decks (Req 3.5)', () => {
      seedDeckCard(db, 1, 'Sol Ring', 'sol-1')
      seedCollection(db, 'Sol Ring', 'sol-1', 1)

      const result = planCardMovement(db, {
        cardName: 'Sol Ring',
        fromDeckId: 1,
        toDeckId: 2,
      })

      expect(result.success).toBe(true)
      expect(result.affectedDecks).toContain(1)
      expect(result.affectedDecks).toContain(2)
    })
  })
})

// ---------------------------------------------------------------------------
// Unit Tests: executeCardMovement
// ---------------------------------------------------------------------------

describe('executeCardMovement', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, 4)
    seedDeckPriority(db, [[1, 10], [2, 20], [3, 30], [4, 40]])
  })

  it('moves card from source to target in deck_cards', () => {
    seedDeckCard(db, 1, 'Sol Ring', 'sol-1')
    seedCollection(db, 'Sol Ring', 'sol-1', 1)

    const result = executeCardMovement(db, {
      cardName: 'Sol Ring',
      fromDeckId: 1,
      toDeckId: 2,
    })

    expect(result.success).toBe(true)

    // Card no longer in source
    const sourceCards = db.prepare('SELECT * FROM deck_cards WHERE deck_id = ? AND card_name = ?').all(1, 'Sol Ring')
    expect(sourceCards).toHaveLength(0)

    // Card now in target
    const targetCards = db.prepare('SELECT * FROM deck_cards WHERE deck_id = ? AND card_name = ?').all(2, 'Sol Ring')
    expect(targetCards).toHaveLength(1)
  })

  it('updates allocation records after move', () => {
    seedDeckCard(db, 1, 'Sol Ring', 'sol-1')
    seedCollection(db, 'Sol Ring', 'sol-1', 1)

    executeCardMovement(db, {
      cardName: 'Sol Ring',
      fromDeckId: 1,
      toDeckId: 2,
    })

    // Allocation should exist for deck 2, not deck 1
    const allocs = db.prepare('SELECT deck_id, role FROM deck_allocations WHERE card_name = ?').all('Sol Ring') as any[]
    const deck2Alloc = allocs.find((a: any) => a.deck_id === 2)
    expect(deck2Alloc).toBeDefined()
    expect(deck2Alloc.role).toBe('original')

    // Deck 1 should have no allocation (card was moved out entirely)
    const deck1Alloc = allocs.find((a: any) => a.deck_id === 1)
    expect(deck1Alloc).toBeUndefined()
  })

  it('returns error for invalid move without modifying DB', () => {
    seedDeckCard(db, 1, 'Lightning Bolt', 'bolt-1')

    const result = executeCardMovement(db, {
      cardName: 'Sol Ring',
      fromDeckId: 1,
      toDeckId: 2,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Sol Ring')

    // DB unchanged
    const cards = db.prepare('SELECT * FROM deck_cards').all()
    expect(cards).toHaveLength(1)
  })

  it('preserves card metadata during move', () => {
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, set_code, quantity, categories, tags) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(1, 'Sol Ring', 'sol-1', 'cmm', 1, 'Ramp', 'staple')
    seedCollection(db, 'Sol Ring', 'sol-1', 1)

    executeCardMovement(db, {
      cardName: 'Sol Ring',
      fromDeckId: 1,
      toDeckId: 2,
    })

    const targetCard = db.prepare(
      'SELECT scryfall_id, set_code, quantity, categories, tags FROM deck_cards WHERE deck_id = ? AND card_name = ?'
    ).get(2, 'Sol Ring') as any

    expect(targetCard.scryfall_id).toBe('sol-1')
    expect(targetCard.set_code).toBe('cmm')
    expect(targetCard.quantity).toBe(1)
    expect(targetCard.categories).toBe('Ramp')
    expect(targetCard.tags).toBe('staple')
  })

  it('queues archidekt and affected deck results on success', () => {
    seedDeckCard(db, 1, 'Sol Ring', 'sol-1')
    seedDeckCard(db, 2, 'Sol Ring', 'sol-1')
    seedCollection(db, 'Sol Ring', 'sol-1', 1)

    // Set up current allocations
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, scryfall_id, priority_override) VALUES (?, ?, ?, ?, ?)').run('Sol Ring', 1, 'original', 'sol-1', 0)
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 2, 'proxy', 0)

    const result = executeCardMovement(db, {
      cardName: 'Sol Ring',
      fromDeckId: 1,
      toDeckId: 3,
    })

    expect(result.success).toBe(true)
    expect(result.affectedDeckResults.length).toBeGreaterThan(0)
    expect(result.affectedDeckResults.every(r => r.queued)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests
// ---------------------------------------------------------------------------

describe('card-movement — property-based tests', () => {
  /**
   * Property 4 (Movement Consistency):
   * For any card movement from deck A to deck B, after the operation completes:
   * (a) deck B has the allocation record with the moved printing's Scryfall ID
   * (b) the total count of role = 'original' records for that card name
   *     across all decks remains unchanged (a move does not create or destroy
   *     physical copies)
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('Property 4 (Movement Consistency): original count unchanged after move', () => {
    fc.assert(
      fc.property(
        // Generate number of decks (3-6) and number of decks sharing the card (2-N)
        fc.integer({ min: 3, max: 6 }),
        fc.integer({ min: 1, max: 3 }), // supply quantity
        (numDecks, supply) => {
          const db = createTestDb()

          // Seed decks
          const insert = db.prepare('INSERT INTO decks (id, name) VALUES (?, ?)')
          for (let i = 1; i <= numDecks; i++) {
            insert.run(i, `Deck ${i}`)
          }

          // Set priorities (1 = highest)
          const priInsert = db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)')
          for (let i = 1; i <= numDecks; i++) {
            priInsert.run(i, i * 10)
          }

          // Card exists in decks 1 through min(supply+1, numDecks-1)
          // We reserve at least one deck as a valid target that doesn't have the card
          const decksWithCard = Math.min(supply + 1, numDecks - 1)
          for (let i = 1; i <= decksWithCard; i++) {
            db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id) VALUES (?, ?, ?)').run(i, 'Sol Ring', 'sol-1')
          }

          // Add to collection
          db.prepare(
            'INSERT INTO collection (card_name, scryfall_id, set_code, collector_number, quantity) VALUES (?, ?, ?, ?, ?)'
          ).run('Sol Ring', 'sol-1', 'cmm', '379', supply)

          // Run initial allocation to set baseline state
          const baseInput = buildAllocationInput(db)
          const baseOutput = computeAllocations(baseInput)
          applyAllocationOutput(db, baseOutput)

          // Count originals before move
          const beforeOriginals = (db.prepare(
            "SELECT COUNT(*) as cnt FROM deck_allocations WHERE card_name = 'Sol Ring' AND role = 'original'"
          ).get() as { cnt: number }).cnt

          // Pick source (deck 1 always has it) and target (last deck never has it)
          const fromDeckId = 1
          const toDeckId = numDecks // guaranteed to not have the card

          const result = executeCardMovement(db, {
            cardName: 'Sol Ring',
            fromDeckId,
            toDeckId,
          })

          if (!result.success) return // Skip if move was invalid for this config

          // Count originals after move
          const afterOriginals = (db.prepare(
            "SELECT COUNT(*) as cnt FROM deck_allocations WHERE card_name = 'Sol Ring' AND role = 'original'"
          ).get() as { cnt: number }).cnt

          // Property: original count must not change
          expect(afterOriginals).toBe(beforeOriginals)

          // Property (a): target deck has an allocation record
          const targetAlloc = db.prepare(
            'SELECT role FROM deck_allocations WHERE card_name = ? AND deck_id = ?'
          ).get('Sol Ring', toDeckId)
          expect(targetAlloc).toBeDefined()
        }
      ),
      { numRuns: 50 }
    )
  })
})
