import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'

// Mock the db module with an in-memory database
vi.mock('./db', () => {
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')

  // Apply the full schema (from migrations)
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

    CREATE TABLE IF NOT EXISTS proxy_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_name TEXT NOT NULL,
      deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('original', 'proxy')),
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      written_to_archidekt BOOLEAN DEFAULT FALSE,
      written_at DATETIME,
      UNIQUE(card_name, deck_id)
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_deck_cards_name ON deck_cards(card_name);
    CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id);
    CREATE INDEX IF NOT EXISTS idx_collection_name ON collection(card_name);
    CREATE INDEX IF NOT EXISTS idx_collection_identity ON collection(color_identity);
    CREATE INDEX IF NOT EXISTS idx_collection_types ON collection(types);
    CREATE INDEX IF NOT EXISTS idx_proxy_alloc_card ON proxy_allocations(card_name);
    CREATE INDEX IF NOT EXISTS idx_proxy_alloc_deck ON proxy_allocations(deck_id);
  `)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  return { default: db }
})

import db from './db'
import { getSharedCards, previewAllocation, commitAllocation } from './allocation'

// ---------------------------------------------------------------------------
// Test data seeding helpers
// ---------------------------------------------------------------------------

function seedDecks() {
  db.prepare('DELETE FROM decks').run()
  db.prepare('DELETE FROM deck_cards').run()
  db.prepare('DELETE FROM collection').run()
  db.prepare('DELETE FROM proxy_allocations').run()

  // Insert decks
  const insertDeck = db.prepare('INSERT INTO decks (id, name, commander_name) VALUES (?, ?, ?)')
  insertDeck.run(1, 'World Breaker', 'Omnath, Locus of Creation')
  insertDeck.run(2, 'Ice Queen', 'Elsa, Winter Queen')
  insertDeck.run(3, 'Arti-facts', 'Urza, Lord High Artificer')

  // Insert deck_cards — shared cards across decks
  const insertCard = db.prepare(
    'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, set_code, quantity) VALUES (?, ?, ?, ?, ?)'
  )

  // Sol Ring in all 3 decks
  insertCard.run(1, 'Sol Ring', 'sol-1', 'cmm', 1)
  insertCard.run(2, 'Sol Ring', 'sol-1', 'cmm', 1)
  insertCard.run(3, 'Sol Ring', 'sol-1', 'cmm', 1)

  // Cyclonic Rift in 2 decks
  insertCard.run(1, 'Cyclonic Rift', 'rift-1', 'mm3', 1)
  insertCard.run(2, 'Cyclonic Rift', 'rift-1', 'mm3', 1)

  // Swords to Plowshares in 2 decks
  insertCard.run(1, 'Swords to Plowshares', 'stp-1', 'cmm', 1)
  insertCard.run(3, 'Swords to Plowshares', 'stp-1', 'cmm', 1)

  // Basic land (should be excluded) — Island in 2 decks
  insertCard.run(1, 'Island', 'island-1', 'm21', 1)
  insertCard.run(2, 'Island', 'island-1', 'm21', 1)

  // Plains in 2 decks (also excluded)
  insertCard.run(1, 'Plains', 'plains-1', 'm21', 1)
  insertCard.run(3, 'Plains', 'plains-1', 'm21', 1)

  // Snow-Covered Forest in 2 decks (also excluded)
  insertCard.run(1, 'Snow-Covered Forest', 'scf-1', 'khm', 1)
  insertCard.run(2, 'Snow-Covered Forest', 'scf-1', 'khm', 1)

  // A unique card in only 1 deck (should NOT appear)
  insertCard.run(3, 'Lightning Greaves', 'greaves-1', 'cmm', 1)

  // Insert collection
  const insertColl = db.prepare(
    'INSERT INTO collection (card_name, scryfall_id, set_code, quantity, color_identity, types) VALUES (?, ?, ?, ?, ?, ?)'
  )
  insertColl.run('Sol Ring', 'sol-1', 'cmm', 1, '', 'Artifact')
  insertColl.run('Cyclonic Rift', 'rift-1', 'mm3', 1, 'Blue', 'Instant')
  insertColl.run('Swords to Plowshares', 'stp-1', 'cmm', 2, 'White', 'Instant')
  insertColl.run('Lightning Greaves', 'greaves-1', 'cmm', 1, '', 'Artifact')
}

// ---------------------------------------------------------------------------
// Tests: getSharedCards
// ---------------------------------------------------------------------------

describe('getSharedCards', () => {
  beforeEach(() => {
    seedDecks()
  })

  it('returns cards appearing in 2+ decks', () => {
    const results = getSharedCards()

    expect(results.length).toBe(3) // Sol Ring, Cyclonic Rift, Swords to Plowshares
    const cardNames = results.map((r) => r.cardName).sort()
    expect(cardNames).toEqual(['Cyclonic Rift', 'Sol Ring', 'Swords to Plowshares'])
  })

  it('excludes basic lands', () => {
    const results = getSharedCards()
    const cardNames = results.map((r) => r.cardName)

    expect(cardNames).not.toContain('Island')
    expect(cardNames).not.toContain('Plains')
    expect(cardNames).not.toContain('Snow-Covered Forest')
  })

  it('returns correct deficit (max(0, deckCount - ownedCopies))', () => {
    const results = getSharedCards()

    // Sol Ring: in 3 decks, own 1 → deficit = 2
    const solRing = results.find((r) => r.cardName === 'Sol Ring')!
    expect(solRing.deckCount).toBe(3)
    expect(solRing.ownedCopies).toBe(1)
    expect(solRing.deficit).toBe(2)

    // Cyclonic Rift: in 2 decks, own 1 → deficit = 1
    const rift = results.find((r) => r.cardName === 'Cyclonic Rift')!
    expect(rift.deckCount).toBe(2)
    expect(rift.ownedCopies).toBe(1)
    expect(rift.deficit).toBe(1)

    // Swords to Plowshares: in 2 decks, own 2 → deficit = 0
    const stp = results.find((r) => r.cardName === 'Swords to Plowshares')!
    expect(stp.deckCount).toBe(2)
    expect(stp.ownedCopies).toBe(2)
    expect(stp.deficit).toBe(0)
  })

  it('returns correct deck details with unassigned role by default', () => {
    const results = getSharedCards()
    const solRing = results.find((r) => r.cardName === 'Sol Ring')!

    expect(solRing.decks).toHaveLength(3)
    for (const deck of solRing.decks) {
      expect(deck.currentRole).toBe('unassigned')
      expect(deck.deckName).toBeTruthy()
    }
  })

  it('returns correct current role from proxy_allocations', () => {
    // Assign Sol Ring: deck 1 = original, deck 2 = proxy
    db.prepare(
      "INSERT INTO proxy_allocations (card_name, deck_id, role) VALUES ('Sol Ring', 1, 'original')"
    ).run()
    db.prepare(
      "INSERT INTO proxy_allocations (card_name, deck_id, role) VALUES ('Sol Ring', 2, 'proxy')"
    ).run()

    const results = getSharedCards()
    const solRing = results.find((r) => r.cardName === 'Sol Ring')!

    const deck1 = solRing.decks.find((d) => d.deckId === 1)!
    expect(deck1.currentRole).toBe('original')

    const deck2 = solRing.decks.find((d) => d.deckId === 2)!
    expect(deck2.currentRole).toBe('proxy')

    const deck3 = solRing.decks.find((d) => d.deckId === 3)!
    expect(deck3.currentRole).toBe('unassigned')
  })

  it('respects minDecks filter', () => {
    const results = getSharedCards({ minDecks: 3 })

    // Only Sol Ring is in 3 decks
    expect(results).toHaveLength(1)
    expect(results[0].cardName).toBe('Sol Ring')
  })

  it('respects colorIdentity filter', () => {
    const results = getSharedCards({ colorIdentity: 'Blue' })

    // Only Cyclonic Rift has Blue color identity in collection
    expect(results).toHaveLength(1)
    expect(results[0].cardName).toBe('Cyclonic Rift')
  })

  it('respects cardType filter', () => {
    const results = getSharedCards({ cardType: 'Artifact' })

    // Sol Ring is the only shared Artifact
    expect(results).toHaveLength(1)
    expect(results[0].cardName).toBe('Sol Ring')
  })

  it('returns empty array when no cards match filters', () => {
    const results = getSharedCards({ colorIdentity: 'Red' })
    expect(results).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: previewAllocation
// ---------------------------------------------------------------------------

describe('previewAllocation', () => {
  beforeEach(() => {
    seedDecks()
  })

  it('returns correct from/to transitions from unassigned state', () => {
    const preview = previewAllocation({
      cardName: 'Sol Ring',
      allocations: [
        { deckId: 1, role: 'original' },
        { deckId: 2, role: 'proxy' },
        { deckId: 3, role: 'proxy' },
      ],
    })

    expect(preview.cardName).toBe('Sol Ring')
    expect(preview.changes).toHaveLength(3)

    const change1 = preview.changes.find((c) => c.deckId === 1)!
    expect(change1.from).toBe('unassigned')
    expect(change1.to).toBe('original')

    const change2 = preview.changes.find((c) => c.deckId === 2)!
    expect(change2.from).toBe('unassigned')
    expect(change2.to).toBe('proxy')

    const change3 = preview.changes.find((c) => c.deckId === 3)!
    expect(change3.from).toBe('unassigned')
    expect(change3.to).toBe('proxy')
  })

  it('returns correct archidektWrites for proxy additions', () => {
    const preview = previewAllocation({
      cardName: 'Sol Ring',
      allocations: [
        { deckId: 1, role: 'original' },
        { deckId: 2, role: 'proxy' },
        { deckId: 3, role: 'proxy' },
      ],
    })

    // Proxy assignments need add_proxy_tag
    expect(preview.archidektWrites).toHaveLength(2)
    const writes = preview.archidektWrites.sort((a, b) => a.deckId - b.deckId)
    expect(writes[0].deckId).toBe(2)
    expect(writes[0].action).toBe('add_proxy_tag')
    expect(writes[1].deckId).toBe(3)
    expect(writes[1].action).toBe('add_proxy_tag')
  })

  it('returns remove_proxy_tag when transitioning from proxy to original', () => {
    // Set up existing allocation: deck 1 = proxy
    db.prepare(
      "INSERT INTO proxy_allocations (card_name, deck_id, role) VALUES ('Sol Ring', 1, 'proxy')"
    ).run()

    const preview = previewAllocation({
      cardName: 'Sol Ring',
      allocations: [{ deckId: 1, role: 'original' }],
    })

    expect(preview.changes).toHaveLength(1)
    expect(preview.changes[0].from).toBe('proxy')
    expect(preview.changes[0].to).toBe('original')

    expect(preview.archidektWrites).toHaveLength(1)
    expect(preview.archidektWrites[0].action).toBe('remove_proxy_tag')
  })

  it('no archidekt write needed when going from unassigned to original', () => {
    const preview = previewAllocation({
      cardName: 'Sol Ring',
      allocations: [{ deckId: 1, role: 'original' }],
    })

    // Should have the change but no archidekt write
    expect(preview.changes).toHaveLength(1)
    expect(preview.changes[0].from).toBe('unassigned')
    expect(preview.changes[0].to).toBe('original')

    // No write needed — the card already has no proxy tag in Archidekt
    expect(preview.archidektWrites).toHaveLength(0)
  })

  it('omits changes where from === to', () => {
    // Set up existing allocation
    db.prepare(
      "INSERT INTO proxy_allocations (card_name, deck_id, role) VALUES ('Sol Ring', 1, 'original')"
    ).run()

    const preview = previewAllocation({
      cardName: 'Sol Ring',
      allocations: [{ deckId: 1, role: 'original' }], // Same as current
    })

    expect(preview.changes).toHaveLength(0)
    expect(preview.archidektWrites).toHaveLength(0)
  })

  it('warns when originals exceed owned copies (does not block)', () => {
    // Sol Ring: own 1 copy, marking 2 as original
    const preview = previewAllocation({
      cardName: 'Sol Ring',
      allocations: [
        { deckId: 1, role: 'original' },
        { deckId: 2, role: 'original' },
      ],
    })

    expect(preview.warnings).toHaveLength(1)
    expect(preview.warnings[0]).toContain('2 deck(s) marked as original')
    expect(preview.warnings[0]).toContain('only own 1 copy')
  })

  it('no warning when originals do not exceed owned copies', () => {
    // Swords to Plowshares: own 2 copies, marking 2 as original
    const preview = previewAllocation({
      cardName: 'Swords to Plowshares',
      allocations: [
        { deckId: 1, role: 'original' },
        { deckId: 3, role: 'original' },
      ],
    })

    expect(preview.warnings).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: commitAllocation
// ---------------------------------------------------------------------------

describe('commitAllocation', () => {
  beforeEach(() => {
    seedDecks()
  })

  it('records allocation decisions in the database', async () => {
    const result = await commitAllocation({
      cardName: 'Sol Ring',
      allocations: [
        { deckId: 1, role: 'original' },
        { deckId: 2, role: 'proxy' },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toEqual({ deckId: 1, success: true })
    expect(result.results[1]).toEqual({ deckId: 2, success: true })

    // Check DB state — written_to_archidekt is always false (Playwright dormant)
    const allocs = db
      .prepare('SELECT * FROM proxy_allocations WHERE card_name = ?')
      .all('Sol Ring') as any[]
    expect(allocs).toHaveLength(2)

    const deck1Alloc = allocs.find((a: any) => a.deck_id === 1)
    expect(deck1Alloc.role).toBe('original')
    expect(deck1Alloc.written_to_archidekt).toBe(0)
    expect(deck1Alloc.written_at).toBeNull()

    const deck2Alloc = allocs.find((a: any) => a.deck_id === 2)
    expect(deck2Alloc.role).toBe('proxy')
    expect(deck2Alloc.written_to_archidekt).toBe(0)
    expect(deck2Alloc.written_at).toBeNull()
  })

  it('processes each deck independently', async () => {
    const result = await commitAllocation({
      cardName: 'Sol Ring',
      allocations: [
        { deckId: 1, role: 'original' },
        { deckId: 2, role: 'proxy' },
        { deckId: 3, role: 'proxy' },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(3)
    expect(result.results.every(r => r.success)).toBe(true)
  })

  it('warns when originals exceed owned copies (does not block)', async () => {
    // Sol Ring: own 1 copy, marking 3 as original
    const result = await commitAllocation({
      cardName: 'Sol Ring',
      allocations: [
        { deckId: 1, role: 'original' },
        { deckId: 2, role: 'original' },
        { deckId: 3, role: 'original' },
      ],
    })

    // Should still succeed (warning, not blocking)
    expect(result.success).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('3 deck(s) marked as original')
    expect(result.warnings[0]).toContain('only own 1 copy')
  })
})
