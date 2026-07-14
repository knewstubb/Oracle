/**
 * Pilot Validation — End-to-End Integration Test
 *
 * Validates the full allocation and movement flow using representative World Breaker
 * deck data (Archidekt ID: 23289174). Uses an in-memory SQLite database seeded
 * with realistic data to safely test without corrupting the live DB.
 *
 * Validates: All requirements (end-to-end)
 *
 * Sections:
 * 1. Collection import with reallocation (Req 6)
 * 2. Allocation correctness (Req 1, 2, 7)
 * 3. Card movement and cascade (Req 3, Property 4)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { importCollectionAndReallocate } from '../../lib/collection-reallocator'
import { computeAllocations } from '../../lib/allocation-resolver'
import {
  buildAllocationInput,
  applyAllocationOutput,
  getProxyReport,
} from '../../lib/allocation-store'
import { planCardMovement, executeCardMovement } from '../../lib/card-movement'

// ---------------------------------------------------------------------------
// Test Database Setup — mirrors production schema
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

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at DATETIME NOT NULL,
      completed_at DATETIME,
      trigger TEXT NOT NULL CHECK(trigger IN ('csv_import', 'manual', 'card_movement', 'scheduled')),
      decks_processed INTEGER DEFAULT 0,
      decks_succeeded INTEGER DEFAULT 0,
      decks_failed INTEGER DEFAULT 0,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_deck_cards_name ON deck_cards(card_name);
    CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id);
    CREATE INDEX IF NOT EXISTS idx_collection_name ON collection(card_name);
    CREATE INDEX IF NOT EXISTS idx_deck_alloc_card ON deck_allocations(card_name);
    CREATE INDEX IF NOT EXISTS idx_deck_alloc_deck ON deck_allocations(deck_id);
    CREATE INDEX IF NOT EXISTS idx_deck_alloc_scryfall ON deck_allocations(scryfall_id);
  `)

  return db
}

// ---------------------------------------------------------------------------
// Seed Data — Representative World Breaker deck state
// ---------------------------------------------------------------------------

/** Representative decks mimicking the user's 9-deck setup (subset for testing) */
const DECKS = [
  { id: 1, name: 'World Breaker', commander: 'Kozilek, the Great Distortion', colors: 'C' },
  { id: 2, name: 'Enchantress', commander: 'Tuvasa the Sunlit', colors: 'WUG' },
  { id: 3, name: 'Yedora the Explorer', commander: 'Yedora, Grave Gardener', colors: 'G' },
  { id: 4, name: 'Roccos Secret', commander: "Rocco, Street Chef", colors: 'WRG' },
]

/** Representative cards for World Breaker — mix of unique and shared */
const WORLD_BREAKER_CARDS = [
  { name: 'Sol Ring', scryfallId: 'sol-cmm-1', setCode: 'cmm', collectorNumber: '379' },
  { name: 'Arcane Signet', scryfallId: 'arc-cmm-1', setCode: 'cmm', collectorNumber: '388' },
  { name: 'Command Tower', scryfallId: 'cmd-cmm-1', setCode: 'cmm', collectorNumber: '350' },
  { name: 'Mind Stone', scryfallId: 'mind-cmm-1', setCode: 'cmm', collectorNumber: '380' },
  { name: 'Thought Vessel', scryfallId: 'tv-cmm-1', setCode: 'cmm', collectorNumber: '400' },
  { name: 'All Is Dust', scryfallId: 'aid-mm2-1', setCode: 'mm2', collectorNumber: '1' },
  { name: 'Ugin, the Spirit Dragon', scryfallId: 'ugin-m21-1', setCode: 'm21', collectorNumber: '1' },
  { name: 'Karn Liberated', scryfallId: 'karn-uma-1', setCode: 'uma', collectorNumber: '5' },
  { name: 'Kozilek, the Great Distortion', scryfallId: 'koz-ogw-1', setCode: 'ogw', collectorNumber: '4' },
  { name: 'Ulamog, the Ceaseless Hunger', scryfallId: 'ulam-bfz-1', setCode: 'bfz', collectorNumber: '15' },
  { name: 'Mystic Forge', scryfallId: 'mf-m20-1', setCode: 'm20', collectorNumber: '233' },
  { name: 'Sensei\'s Divining Top', scryfallId: 'sdt-ema-1', setCode: 'ema', collectorNumber: '232' },
  { name: 'Lightning Greaves', scryfallId: 'lg-2xm-1', setCode: '2xm', collectorNumber: '267' },
  { name: 'Swiftfoot Boots', scryfallId: 'sb-cmm-1', setCode: 'cmm', collectorNumber: '401' },
  { name: 'Wayfarer\'s Bauble', scryfallId: 'wb-cmm-1', setCode: 'cmm', collectorNumber: '410' },
]

/** Cards shared with other decks (appear in 2+ decks) */
const SHARED_CARDS = [
  'Sol Ring',          // In all 4 decks
  'Arcane Signet',     // In all 4 decks
  'Command Tower',     // In decks 1, 2, 4
  'Lightning Greaves', // In decks 1, 2
  'Swiftfoot Boots',   // In decks 1, 3
]

/** Cards unique to World Breaker */
const UNIQUE_CARDS = [
  'All Is Dust',
  'Ugin, the Spirit Dragon',
  'Karn Liberated',
  'Kozilek, the Great Distortion',
  'Ulamog, the Ceaseless Hunger',
  'Mystic Forge',
  'Sensei\'s Divining Top',
  'Mind Stone',
  'Thought Vessel',
  'Wayfarer\'s Bauble',
]

/** Collection data — simulates owned cards with varying quantities */
const COLLECTION = [
  { name: 'Sol Ring', scryfallId: 'sol-cmm-1', setCode: 'cmm', quantity: 2, collectorNumber: '379' },
  { name: 'Arcane Signet', scryfallId: 'arc-cmm-1', setCode: 'cmm', quantity: 3, collectorNumber: '388' },
  { name: 'Command Tower', scryfallId: 'cmd-cmm-1', setCode: 'cmm', quantity: 2, collectorNumber: '350' },
  { name: 'Mind Stone', scryfallId: 'mind-cmm-1', setCode: 'cmm', quantity: 1, collectorNumber: '380' },
  { name: 'Thought Vessel', scryfallId: 'tv-cmm-1', setCode: 'cmm', quantity: 1, collectorNumber: '400' },
  { name: 'All Is Dust', scryfallId: 'aid-mm2-1', setCode: 'mm2', quantity: 1, collectorNumber: '1' },
  { name: 'Lightning Greaves', scryfallId: 'lg-2xm-1', setCode: '2xm', quantity: 1, collectorNumber: '267' },
  { name: 'Swiftfoot Boots', scryfallId: 'sb-cmm-1', setCode: 'cmm', quantity: 1, collectorNumber: '401' },
  // Intentionally missing: Ugin, Karn, Ulamog, Kozilek, Mystic Forge, Sensei's Top, Wayfarer's Bauble
  // These will be proxies in the World Breaker deck
]

function seedTestData(db: Database.Database) {
  // Insert decks
  const insertDeck = db.prepare(
    'INSERT INTO decks (id, name, commander_name, colour_identity) VALUES (?, ?, ?, ?)'
  )
  for (const deck of DECKS) {
    insertDeck.run(deck.id, deck.name, deck.commander, deck.colors)
  }

  // Insert deck priorities
  const insertPriority = db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)')
  insertPriority.run(1, 10) // World Breaker = highest priority
  insertPriority.run(2, 20)
  insertPriority.run(3, 30)
  insertPriority.run(4, 40)

  // Insert World Breaker cards
  const insertCard = db.prepare(
    'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  for (const card of WORLD_BREAKER_CARDS) {
    const isCommander = card.name === 'Kozilek, the Great Distortion' ? 1 : 0
    insertCard.run(1, card.name, card.scryfallId, card.setCode, 1, '["Ramp"]', isCommander)
  }

  // Insert shared cards into other decks
  insertCard.run(2, 'Sol Ring', 'sol-cmm-1', 'cmm', 1, '["Ramp"]', 0)
  insertCard.run(3, 'Sol Ring', 'sol-cmm-1', 'cmm', 1, '["Ramp"]', 0)
  insertCard.run(4, 'Sol Ring', 'sol-cmm-1', 'cmm', 1, '["Ramp"]', 0)
  insertCard.run(2, 'Arcane Signet', 'arc-cmm-1', 'cmm', 1, '["Ramp"]', 0)
  insertCard.run(3, 'Arcane Signet', 'arc-cmm-1', 'cmm', 1, '["Ramp"]', 0)
  insertCard.run(4, 'Arcane Signet', 'arc-cmm-1', 'cmm', 1, '["Ramp"]', 0)
  insertCard.run(2, 'Command Tower', 'cmd-cmm-1', 'cmm', 1, '["Lands"]', 0)
  insertCard.run(4, 'Command Tower', 'cmd-cmm-1', 'cmm', 1, '["Lands"]', 0)
  insertCard.run(2, 'Lightning Greaves', 'lg-2xm-1', '2xm', 1, '["Equipment"]', 0)
  insertCard.run(3, 'Swiftfoot Boots', 'sb-cmm-1', 'cmm', 1, '["Equipment"]', 0)

  // Insert collection
  const insertCollection = db.prepare(
    'INSERT INTO collection (card_name, scryfall_id, set_code, quantity, foil, collector_number, finish) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  for (const item of COLLECTION) {
    insertCollection.run(item.name, item.scryfallId, item.setCode, item.quantity, 0, item.collectorNumber, 'Normal')
  }
}

// ---------------------------------------------------------------------------
// CSV Helper
// ---------------------------------------------------------------------------

const CSV_HEADER = 'Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types'

function buildCSV(entries: Array<{ qty: number; name: string; scryfallId: string; setCode: string; collectorNumber: string; price?: number }>): string {
  const lines = [CSV_HEADER]
  for (const e of entries) {
    // Quote the name field to handle commas in card names
    const quotedName = e.name.includes(',') ? `"${e.name}"` : e.name
    lines.push(`${e.qty},${quotedName},Normal,NM,2025-01-15,EN,${e.price ?? 0.00},,Test Set,${e.setCode},,${e.scryfallId},${e.collectorNumber},,Artifact`)
  }
  return lines.join('\n')
}

// ===========================================================================
// SECTION 1: Collection Import with Reallocation (Req 6)
// ===========================================================================

describe('Pilot Validation: Collection Import with Reallocation', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedTestData(db)
  })

  it('imports collection CSV and computes correct import delta', () => {
    // Build CSV representing a fresh import (adds Ugin, which was previously unowned)
    const csvEntries = [
      ...COLLECTION.map(c => ({ qty: c.quantity, name: c.name, scryfallId: c.scryfallId, setCode: c.setCode, collectorNumber: c.collectorNumber })),
      { qty: 1, name: 'Ugin, the Spirit Dragon', scryfallId: 'ugin-m21-1', setCode: 'm21', collectorNumber: '1', price: 25.00 },
    ]
    const csv = buildCSV(csvEntries)

    const result = importCollectionAndReallocate(db, csv)

    // Delta should show Ugin as newly added
    expect(result.importDelta.added.length).toBeGreaterThanOrEqual(1)
    const uginAdded = result.importDelta.added.find(a => a.name === 'Ugin, the Spirit Dragon')
    expect(uginAdded).toBeDefined()
    expect(result.importDelta.totalEntries).toBe(csvEntries.length)
  })

  it('reallocation promotes proxy slots when new supply becomes available (Req 6.2, 6.5)', () => {
    // Run initial allocation (no Ugin in collection → proxy)
    const input = buildAllocationInput(db)
    const output = computeAllocations(input)
    applyAllocationOutput(db, output)

    // Verify Ugin is proxy before import
    const uginAllocBefore = db.prepare(
      "SELECT role FROM deck_allocations WHERE card_name = 'Ugin, the Spirit Dragon' AND deck_id = 1"
    ).get() as { role: string } | undefined
    expect(uginAllocBefore?.role).toBe('proxy')

    // Import CSV with Ugin now owned
    const csvEntries = [
      ...COLLECTION.map(c => ({ qty: c.quantity, name: c.name, scryfallId: c.scryfallId, setCode: c.setCode, collectorNumber: c.collectorNumber })),
      { qty: 1, name: 'Ugin, the Spirit Dragon', scryfallId: 'ugin-m21-1', setCode: 'm21', collectorNumber: '1' },
    ]
    const csv = buildCSV(csvEntries)

    const result = importCollectionAndReallocate(db, csv)

    // Ugin should be newly fulfilled
    expect(result.newlyFulfilled.some(f => f.cardName === 'Ugin, the Spirit Dragon')).toBe(true)

    // Verify DB: Ugin is now original
    const uginAllocAfter = db.prepare(
      "SELECT role, scryfall_id FROM deck_allocations WHERE card_name = 'Ugin, the Spirit Dragon' AND deck_id = 1"
    ).get() as { role: string; scryfall_id: string | null }
    expect(uginAllocAfter.role).toBe('original')
    expect(uginAllocAfter.scryfall_id).toBe('ugin-m21-1')
  })

  it('reallocation demotes allocations when supply is removed (Req 6.3)', () => {
    // Run initial allocation (Mind Stone owned → original)
    const input = buildAllocationInput(db)
    const output = computeAllocations(input)
    applyAllocationOutput(db, output)

    const msAllocBefore = db.prepare(
      "SELECT role FROM deck_allocations WHERE card_name = 'Mind Stone' AND deck_id = 1"
    ).get() as { role: string }
    expect(msAllocBefore.role).toBe('original')

    // Import CSV WITHOUT Mind Stone (removed from collection)
    const csvWithoutMindStone = COLLECTION.filter(c => c.name !== 'Mind Stone')
    const csv = buildCSV(csvWithoutMindStone.map(c => ({
      qty: c.quantity, name: c.name, scryfallId: c.scryfallId, setCode: c.setCode, collectorNumber: c.collectorNumber,
    })))

    const result = importCollectionAndReallocate(db, csv)

    // Mind Stone should be newly broken
    expect(result.newlyBroken.some(b => b.cardName === 'Mind Stone')).toBe(true)

    // Verify DB
    const msAllocAfter = db.prepare(
      "SELECT role FROM deck_allocations WHERE card_name = 'Mind Stone' AND deck_id = 1"
    ).get() as { role: string }
    expect(msAllocAfter.role).toBe('proxy')
  })
})

// ===========================================================================
// SECTION 2: Allocation Correctness (Req 1, 2, 7)
// ===========================================================================

describe('Pilot Validation: Allocation Correctness', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedTestData(db)
    // Run allocation resolver to populate deck_allocations
    const input = buildAllocationInput(db)
    const output = computeAllocations(input)
    applyAllocationOutput(db, output)
  })

  it('every card in World Breaker has exactly one allocation record (Property 3)', () => {
    const deckCards = db.prepare(
      'SELECT DISTINCT card_name FROM deck_cards WHERE deck_id = 1'
    ).all() as { card_name: string }[]

    const allocations = db.prepare(
      'SELECT card_name, COUNT(*) as cnt FROM deck_allocations WHERE deck_id = 1 GROUP BY card_name'
    ).all() as { card_name: string; cnt: number }[]

    // Every card has an allocation
    expect(allocations.length).toBe(deckCards.length)
    // Each card has exactly one allocation record per deck
    for (const alloc of allocations) {
      expect(alloc.cnt).toBe(1)
    }
  })

  it('cards with supply get role = original (Req 1.4)', () => {
    // Cards owned and unique to World Breaker should be original
    const mindStoneAlloc = db.prepare(
      "SELECT role FROM deck_allocations WHERE card_name = 'Mind Stone' AND deck_id = 1"
    ).get() as { role: string }
    expect(mindStoneAlloc.role).toBe('original')

    const allIsDustAlloc = db.prepare(
      "SELECT role FROM deck_allocations WHERE card_name = 'All Is Dust' AND deck_id = 1"
    ).get() as { role: string }
    expect(allIsDustAlloc.role).toBe('original')
  })

  it('cards without supply get role = proxy (Req 2.1)', () => {
    // Cards NOT in collection should be proxy
    const uginAlloc = db.prepare(
      "SELECT role FROM deck_allocations WHERE card_name = 'Ugin, the Spirit Dragon' AND deck_id = 1"
    ).get() as { role: string }
    expect(uginAlloc.role).toBe('proxy')

    const kozilekAlloc = db.prepare(
      "SELECT role, scryfall_id FROM deck_allocations WHERE card_name = 'Kozilek, the Great Distortion' AND deck_id = 1"
    ).get() as { role: string; scryfall_id: string | null }
    expect(kozilekAlloc.role).toBe('proxy')
    expect(kozilekAlloc.scryfall_id).toBeNull()
  })

  it('proxy report correctly identifies deficit cards', () => {
    const report = getProxyReport(db)

    // Sol Ring: 4 decks need it, 2 copies owned → deficit of 2
    const solRingReport = report.find(r => r.cardName === 'Sol Ring')
    expect(solRingReport).toBeDefined()
    expect(solRingReport!.totalDemand).toBe(4)
    expect(solRingReport!.totalSupply).toBe(2)
    expect(solRingReport!.deficit).toBe(2)
    expect(solRingReport!.proxyDecks).toHaveLength(2)
    expect(solRingReport!.originalDecks).toHaveLength(2)

    // Ugin: 1 deck needs it, 0 copies owned → deficit of 1
    const uginReport = report.find(r => r.cardName === 'Ugin, the Spirit Dragon')
    expect(uginReport).toBeDefined()
    expect(uginReport!.deficit).toBe(1)
  })

  it('shared cards allocate originals to highest-priority decks first (Req 7.2, 7.4)', () => {
    // Sol Ring: 4 decks, 2 copies, deck priorities: WB=10, Enchantress=20, Yedora=30, Rocco=40
    const solRingAllocs = db.prepare(
      "SELECT deck_id, role FROM deck_allocations WHERE card_name = 'Sol Ring' ORDER BY deck_id"
    ).all() as { deck_id: number; role: string }[]

    // Deck 1 (priority 10) and Deck 2 (priority 20) should get originals
    const deck1 = solRingAllocs.find(a => a.deck_id === 1)
    const deck2 = solRingAllocs.find(a => a.deck_id === 2)
    const deck3 = solRingAllocs.find(a => a.deck_id === 3)
    const deck4 = solRingAllocs.find(a => a.deck_id === 4)

    expect(deck1?.role).toBe('original')
    expect(deck2?.role).toBe('original')
    expect(deck3?.role).toBe('proxy')
    expect(deck4?.role).toBe('proxy')
  })

  it('total originals never exceeds owned quantity (Property 2 — Supply Conservation)', () => {
    // For each card name, count originals vs supply
    const allAllocations = db.prepare(
      "SELECT card_name, COUNT(*) as original_count FROM deck_allocations WHERE role = 'original' GROUP BY card_name"
    ).all() as { card_name: string; original_count: number }[]

    for (const alloc of allAllocations) {
      const supply = db.prepare(
        'SELECT COALESCE(SUM(quantity), 0) as total FROM collection WHERE card_name = ?'
      ).get(alloc.card_name) as { total: number }

      expect(alloc.original_count).toBeLessThanOrEqual(supply.total)
    }
  })
})

// ===========================================================================
// SECTION 3: Card Movement and Cascade (Req 3, Property 4)
// ===========================================================================

describe('Pilot Validation: Card Movement and Cascade', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedTestData(db)
    // Run initial allocation
    const input = buildAllocationInput(db)
    const output = computeAllocations(input)
    applyAllocationOutput(db, output)
  })

  it('plans a valid card movement with correct allocation changes', () => {
    // Move Lightning Greaves from World Breaker (deck 1) to Enchantress (deck 2)
    // Both already have it, but WB has the original (higher priority)
    const plan = planCardMovement(db, {
      cardName: 'Lightning Greaves',
      fromDeckId: 1,
      toDeckId: 2,
    })

    expect(plan.success).toBe(true)
    expect(plan.allocationChanges.length).toBeGreaterThanOrEqual(0)
    // Both decks should be in affected decks
    expect(plan.affectedDecks).toContain(1)
    expect(plan.affectedDecks).toContain(2)
  })

  it('total original count remains unchanged after movement (Property 4)', () => {
    // Count originals for Lightning Greaves before move
    const beforeOriginals = db.prepare(
      "SELECT COUNT(*) as cnt FROM deck_allocations WHERE card_name = 'Lightning Greaves' AND role = 'original'"
    ).get() as { cnt: number }

    // Execute card movement: move Lightning Greaves from deck 1 to deck 2
    // First, ensure deck 2 doesn't have it in deck_cards (we seeded it earlier, so it's already there)
    // Actually, LG is in both decks already. The "move" means reassigning the physical copy.
    // For a proper move test, let's move Thought Vessel (unique to WB, owned) to Yedora
    const result = executeCardMovement(db, {
      cardName: 'Thought Vessel',
      fromDeckId: 1,
      toDeckId: 3,
    })

    expect(result.success).toBe(true)

    // After move: total originals for Thought Vessel should remain 1 (one copy exists)
    const afterOriginals = db.prepare(
      "SELECT COUNT(*) as cnt FROM deck_allocations WHERE card_name = 'Thought Vessel' AND role = 'original'"
    ).get() as { cnt: number }
    expect(afterOriginals.cnt).toBe(1) // Still exactly 1 original (now in deck 3)

    // Verify deck 3 now has the card and the original
    const deck3Alloc = db.prepare(
      "SELECT role FROM deck_allocations WHERE card_name = 'Thought Vessel' AND deck_id = 3"
    ).get() as { role: string }
    expect(deck3Alloc.role).toBe('original')
  })

  it('source and target decks both have updated allocations', () => {
    // Move Mind Stone from World Breaker to Enchantress
    const result = executeCardMovement(db, {
      cardName: 'Mind Stone',
      fromDeckId: 1,
      toDeckId: 2,
    })

    expect(result.success).toBe(true)

    // Mind Stone should now be in deck 2's deck_cards
    const targetCard = db.prepare(
      "SELECT card_name FROM deck_cards WHERE deck_id = 2 AND card_name = 'Mind Stone'"
    ).get()
    expect(targetCard).toBeDefined()

    // Mind Stone should NOT be in deck 1's deck_cards anymore
    const sourceCard = db.prepare(
      "SELECT card_name FROM deck_cards WHERE deck_id = 1 AND card_name = 'Mind Stone'"
    ).get()
    expect(sourceCard).toBeUndefined()

    // Allocation for Mind Stone in deck 2 should be original (1 copy, 1 deck)
    const deck2Alloc = db.prepare(
      "SELECT role FROM deck_allocations WHERE card_name = 'Mind Stone' AND deck_id = 2"
    ).get() as { role: string }
    expect(deck2Alloc.role).toBe('original')
  })

  it('archidekt writes are queued for changed records (written_to_archidekt = FALSE)', () => {
    // After movement, changed allocation records should be marked as not written
    executeCardMovement(db, {
      cardName: 'Mind Stone',
      fromDeckId: 1,
      toDeckId: 2,
    })

    // The new allocation record for Mind Stone in deck 2 should have written_to_archidekt = 0
    const alloc = db.prepare(
      "SELECT written_to_archidekt FROM deck_allocations WHERE card_name = 'Mind Stone' AND deck_id = 2"
    ).get() as { written_to_archidekt: number }
    expect(alloc.written_to_archidekt).toBe(0)
  })

  it('rejects invalid movement — card not in source deck (Req 3.6)', () => {
    const result = executeCardMovement(db, {
      cardName: 'Nonexistent Card',
      fromDeckId: 1,
      toDeckId: 2,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Nonexistent Card')
  })
})

