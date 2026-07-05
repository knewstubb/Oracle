import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  buildAllocationInput,
  applyAllocationOutput,
  getAllocationsForDeck,
  getAllocationsForCard,
  getProxyReport,
  setDeckPriority,
  setPriorityOverride,
} from './allocation-store'
import type { AllocationOutput } from './allocation-resolver'

// ---------------------------------------------------------------------------
// Test Database Setup
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')

  // Create tables matching the migration files
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

// ---------------------------------------------------------------------------
// Tests: buildAllocationInput
// ---------------------------------------------------------------------------

describe('buildAllocationInput', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, 3)
  })

  it('builds demandMap from deck_cards', () => {
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id) VALUES (?, ?, ?)').run(1, 'Sol Ring', 'sol-1')
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id) VALUES (?, ?, ?)').run(2, 'Sol Ring', 'sol-1')
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id) VALUES (?, ?, ?)').run(1, 'Cyclonic Rift', 'rift-1')

    const input = buildAllocationInput(db)

    expect(input.demandMap.get('Sol Ring')).toEqual(expect.arrayContaining([1, 2]))
    expect(input.demandMap.get('Sol Ring')).toHaveLength(2)
    expect(input.demandMap.get('Cyclonic Rift')).toEqual([1])
  })

  it('builds supplyMap from collection', () => {
    db.prepare(
      'INSERT INTO collection (card_name, scryfall_id, set_code, collector_number, quantity, foil) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Sol Ring', 'sol-1', 'cmm', '379', 2, 0)
    db.prepare(
      'INSERT INTO collection (card_name, scryfall_id, set_code, collector_number, quantity, foil) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Sol Ring', 'sol-2', 'c14', '100', 1, 1)

    const input = buildAllocationInput(db)

    const solSupply = input.supplyMap.get('Sol Ring')!
    expect(solSupply).toHaveLength(2)
    expect(solSupply[0]).toMatchObject({ scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', quantity: 2, isFoil: false })
    expect(solSupply[1]).toMatchObject({ scryfallId: 'sol-2', setCode: 'c14', collectorNumber: '100', quantity: 1, isFoil: true })
  })

  it('skips collection entries without scryfall_id', () => {
    db.prepare(
      'INSERT INTO collection (card_name, scryfall_id, set_code, quantity) VALUES (?, ?, ?, ?)'
    ).run('Mystery Card', null, null, 1)

    const input = buildAllocationInput(db)

    expect(input.supplyMap.has('Mystery Card')).toBe(false)
  })

  it('builds deckPriority from deck_priority table', () => {
    db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)').run(1, 10)
    db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)').run(2, 20)

    const input = buildAllocationInput(db)

    expect(input.deckPriority.get(1)).toBe(10)
    expect(input.deckPriority.get(2)).toBe(20)
  })

  it('builds overrides from deck_allocations with priority_override', () => {
    db.prepare(
      'INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)'
    ).run('Sol Ring', 1, 'original', 1)
    db.prepare(
      'INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)'
    ).run('Cyclonic Rift', 2, 'proxy', 1)
    // This one should NOT be an override
    db.prepare(
      'INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)'
    ).run('Lightning Bolt', 1, 'original', 0)

    const input = buildAllocationInput(db)

    expect(input.overrides.get('Sol Ring|1')).toBe('pin_original')
    expect(input.overrides.get('Cyclonic Rift|2')).toBe('pin_proxy')
    expect(input.overrides.has('Lightning Bolt|1')).toBe(false)
  })

  it('builds preferredPrintings from deck_cards.scryfall_id', () => {
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id) VALUES (?, ?, ?)').run(1, 'Sol Ring', 'sol-preferred')
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id) VALUES (?, ?, ?)').run(2, 'Sol Ring', 'sol-other')

    const input = buildAllocationInput(db)

    expect(input.preferredPrintings?.get('Sol Ring|1')).toBe('sol-preferred')
    expect(input.preferredPrintings?.get('Sol Ring|2')).toBe('sol-other')
  })

  it('returns empty maps when no data exists', () => {
    const input = buildAllocationInput(db)

    expect(input.demandMap.size).toBe(0)
    expect(input.supplyMap.size).toBe(0)
    expect(input.deckPriority.size).toBe(0)
    expect(input.overrides.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: applyAllocationOutput
// ---------------------------------------------------------------------------

describe('applyAllocationOutput', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, 3)
  })

  it('inserts new allocations and categorizes as added', () => {
    const output: AllocationOutput = {
      allocations: [
        { cardName: 'Sol Ring', deckId: 1, role: 'original', scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', priorityOverride: false },
        { cardName: 'Sol Ring', deckId: 2, role: 'proxy', scryfallId: null, setCode: null, collectorNumber: null, priorityOverride: false },
      ],
      proxyReport: [],
    }

    const diff = applyAllocationOutput(db, output)

    expect(diff.added).toHaveLength(2)
    expect(diff.removed).toHaveLength(0)
    expect(diff.originalToProxy).toHaveLength(0)
    expect(diff.proxyToOriginal).toHaveLength(0)
    expect(diff.unchanged).toHaveLength(0)

    // Verify data in DB
    const rows = db.prepare('SELECT * FROM deck_allocations').all() as any[]
    expect(rows).toHaveLength(2)
  })

  it('detects originalToProxy transitions', () => {
    // Pre-existing: Sol Ring in deck 1 was original
    db.prepare(
      'INSERT INTO deck_allocations (card_name, deck_id, role, scryfall_id, priority_override) VALUES (?, ?, ?, ?, ?)'
    ).run('Sol Ring', 1, 'original', 'sol-1', 0)

    // New output: Sol Ring in deck 1 is now proxy
    const output: AllocationOutput = {
      allocations: [
        { cardName: 'Sol Ring', deckId: 1, role: 'proxy', scryfallId: null, setCode: null, collectorNumber: null, priorityOverride: false },
      ],
      proxyReport: [],
    }

    const diff = applyAllocationOutput(db, output)

    expect(diff.originalToProxy).toHaveLength(1)
    expect(diff.originalToProxy[0].cardName).toBe('Sol Ring')
    expect(diff.originalToProxy[0].deckId).toBe(1)
  })

  it('detects proxyToOriginal transitions', () => {
    // Pre-existing: Sol Ring in deck 2 was proxy
    db.prepare(
      'INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)'
    ).run('Sol Ring', 2, 'proxy', 0)

    // New output: Sol Ring in deck 2 is now original
    const output: AllocationOutput = {
      allocations: [
        { cardName: 'Sol Ring', deckId: 2, role: 'original', scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', priorityOverride: false },
      ],
      proxyReport: [],
    }

    const diff = applyAllocationOutput(db, output)

    expect(diff.proxyToOriginal).toHaveLength(1)
    expect(diff.proxyToOriginal[0].cardName).toBe('Sol Ring')
    expect(diff.proxyToOriginal[0].deckId).toBe(2)
  })

  it('categorizes unchanged records', () => {
    db.prepare(
      'INSERT INTO deck_allocations (card_name, deck_id, role, scryfall_id, priority_override) VALUES (?, ?, ?, ?, ?)'
    ).run('Sol Ring', 1, 'original', 'sol-1', 0)

    const output: AllocationOutput = {
      allocations: [
        { cardName: 'Sol Ring', deckId: 1, role: 'original', scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', priorityOverride: false },
      ],
      proxyReport: [],
    }

    const diff = applyAllocationOutput(db, output)

    expect(diff.unchanged).toHaveLength(1)
    expect(diff.added).toHaveLength(0)
  })

  it('removes records no longer in the output', () => {
    db.prepare(
      'INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)'
    ).run('Old Card', 1, 'original', 0)

    // New output doesn't include Old Card
    const output: AllocationOutput = {
      allocations: [
        { cardName: 'Sol Ring', deckId: 1, role: 'original', scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', priorityOverride: false },
      ],
      proxyReport: [],
    }

    const diff = applyAllocationOutput(db, output)

    expect(diff.removed).toHaveLength(1)
    expect(diff.removed[0].cardName).toBe('Old Card')

    // Verify removed from DB
    const rows = db.prepare("SELECT * FROM deck_allocations WHERE card_name = 'Old Card'").all()
    expect(rows).toHaveLength(0)
  })

  it('marks changed records as written_to_archidekt = false', () => {
    // Pre-existing with written_to_archidekt = true
    db.prepare(
      'INSERT INTO deck_allocations (card_name, deck_id, role, scryfall_id, priority_override, written_to_archidekt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Sol Ring', 1, 'original', 'sol-1', 0, 1)

    // Change to proxy
    const output: AllocationOutput = {
      allocations: [
        { cardName: 'Sol Ring', deckId: 1, role: 'proxy', scryfallId: null, setCode: null, collectorNumber: null, priorityOverride: false },
      ],
      proxyReport: [],
    }

    applyAllocationOutput(db, output)

    const row = db.prepare('SELECT written_to_archidekt FROM deck_allocations WHERE card_name = ? AND deck_id = ?').get('Sol Ring', 1) as any
    expect(row.written_to_archidekt).toBe(0)
  })

  it('applies atomically — all or nothing', () => {
    const output: AllocationOutput = {
      allocations: [
        { cardName: 'Sol Ring', deckId: 1, role: 'original', scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', priorityOverride: false },
        { cardName: 'Cyclonic Rift', deckId: 2, role: 'proxy', scryfallId: null, setCode: null, collectorNumber: null, priorityOverride: false },
      ],
      proxyReport: [],
    }

    applyAllocationOutput(db, output)

    const count = db.prepare('SELECT COUNT(*) as c FROM deck_allocations').get() as { c: number }
    expect(count.c).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Tests: getAllocationsForDeck
// ---------------------------------------------------------------------------

describe('getAllocationsForDeck', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, 3)
  })

  it('returns all allocations for a specific deck', () => {
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, scryfall_id, set_code, collector_number, priority_override) VALUES (?, ?, ?, ?, ?, ?, ?)').run('Sol Ring', 1, 'original', 'sol-1', 'cmm', '379', 0)
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Cyclonic Rift', 1, 'proxy', 0)
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 2, 'proxy', 0)

    const result = getAllocationsForDeck(db, 1)

    expect(result).toHaveLength(2)
    expect(result.map(r => r.cardName).sort()).toEqual(['Cyclonic Rift', 'Sol Ring'])
  })

  it('returns empty array for deck with no allocations', () => {
    const result = getAllocationsForDeck(db, 99)
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Tests: getAllocationsForCard
// ---------------------------------------------------------------------------

describe('getAllocationsForCard', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, 3)
  })

  it('returns all allocations for a specific card across decks', () => {
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 1, 'original', 0)
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 2, 'proxy', 0)
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 3, 'proxy', 0)

    const result = getAllocationsForCard(db, 'Sol Ring')

    expect(result).toHaveLength(3)
    expect(result.find(r => r.deckId === 1)?.role).toBe('original')
    expect(result.find(r => r.deckId === 2)?.role).toBe('proxy')
  })

  it('returns empty array for card not allocated', () => {
    const result = getAllocationsForCard(db, 'Nonexistent Card')
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Tests: getProxyReport
// ---------------------------------------------------------------------------

describe('getProxyReport', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, 3)
  })

  it('returns proxy report for cards with proxy allocations', () => {
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 1, 'original', 0)
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 2, 'proxy', 0)
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 3, 'proxy', 0)
    db.prepare('INSERT INTO collection (card_name, scryfall_id, quantity) VALUES (?, ?, ?)').run('Sol Ring', 'sol-1', 1)

    const report = getProxyReport(db)

    expect(report).toHaveLength(1)
    expect(report[0]).toMatchObject({
      cardName: 'Sol Ring',
      totalDemand: 3,
      totalSupply: 1,
      deficit: 2,
      proxyDecks: [2, 3],
      originalDecks: [1],
    })
  })

  it('returns empty report when no proxies exist', () => {
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 1, 'original', 0)

    const report = getProxyReport(db)
    expect(report).toEqual([])
  })

  it('handles cards not in collection (zero supply)', () => {
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Ghost Card', 1, 'proxy', 0)

    const report = getProxyReport(db)

    expect(report).toHaveLength(1)
    expect(report[0]).toMatchObject({
      cardName: 'Ghost Card',
      totalDemand: 1,
      totalSupply: 0,
      deficit: 1,
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: setDeckPriority
// ---------------------------------------------------------------------------

describe('setDeckPriority', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, 3)
  })

  it('inserts new priority record', () => {
    setDeckPriority(db, 1, 5)

    const row = db.prepare('SELECT priority FROM deck_priority WHERE deck_id = ?').get(1) as any
    expect(row.priority).toBe(5)
  })

  it('updates existing priority record', () => {
    db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)').run(1, 10)

    setDeckPriority(db, 1, 5)

    const row = db.prepare('SELECT priority FROM deck_priority WHERE deck_id = ?').get(1) as any
    expect(row.priority).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// Tests: setPriorityOverride
// ---------------------------------------------------------------------------

describe('setPriorityOverride', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, 3)
  })

  it('creates a pin_original override', () => {
    setPriorityOverride(db, 'Sol Ring', 1, 'pin_original')

    const row = db.prepare('SELECT role, priority_override FROM deck_allocations WHERE card_name = ? AND deck_id = ?').get('Sol Ring', 1) as any
    expect(row.role).toBe('original')
    expect(row.priority_override).toBe(1)
  })

  it('creates a pin_proxy override', () => {
    setPriorityOverride(db, 'Sol Ring', 1, 'pin_proxy')

    const row = db.prepare('SELECT role, priority_override FROM deck_allocations WHERE card_name = ? AND deck_id = ?').get('Sol Ring', 1) as any
    expect(row.role).toBe('proxy')
    expect(row.priority_override).toBe(1)
  })

  it('updates existing record to become an override', () => {
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)').run('Sol Ring', 1, 'proxy', 0)

    setPriorityOverride(db, 'Sol Ring', 1, 'pin_original')

    const row = db.prepare('SELECT role, priority_override FROM deck_allocations WHERE card_name = ? AND deck_id = ?').get('Sol Ring', 1) as any
    expect(row.role).toBe('original')
    expect(row.priority_override).toBe(1)
  })

  it('marks record as needing archidekt sync', () => {
    db.prepare('INSERT INTO deck_allocations (card_name, deck_id, role, priority_override, written_to_archidekt) VALUES (?, ?, ?, ?, ?)').run('Sol Ring', 1, 'original', 0, 1)

    setPriorityOverride(db, 'Sol Ring', 1, 'pin_proxy')

    const row = db.prepare('SELECT written_to_archidekt FROM deck_allocations WHERE card_name = ? AND deck_id = ?').get('Sol Ring', 1) as any
    expect(row.written_to_archidekt).toBe(0)
  })
})
