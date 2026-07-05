import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { reconcileDeck, runSyncCycle, importCollectionAndReallocate } from './sync-engine'
import type { ArchidektFetcher, SyncCycleResult } from './sync-engine'
import type { ArchidektDeckFull } from './archidekt-client'

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
      is_generic_land BOOLEAN NOT NULL DEFAULT FALSE,
      ownership_status TEXT DEFAULT NULL CHECK (ownership_status IN ('original', 'proxy', 'not_owned', 'generic')),
      proxy_of_deck_id INTEGER DEFAULT NULL REFERENCES decks(id) ON DELETE SET NULL
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
  `)

  return db
}

function seedDecks(db: Database.Database, decks: { id: number; name: string }[]) {
  const insert = db.prepare('INSERT INTO decks (id, name) VALUES (?, ?)')
  for (const deck of decks) {
    insert.run(deck.id, deck.name)
  }
}

// ---------------------------------------------------------------------------
// Mock Archidekt Fetcher
// ---------------------------------------------------------------------------

function createMockFetcher(deckData: Map<number, ArchidektDeckFull>): ArchidektFetcher {
  return {
    async fetchDeck(deckId: number): Promise<ArchidektDeckFull> {
      const data = deckData.get(deckId)
      if (!data) throw new Error(`Deck ${deckId} not found`)
      return data
    },
  }
}

function makeDeckFull(id: number, name: string, cards: Partial<ArchidektDeckFull['cards'][0]>[]): ArchidektDeckFull {
  return {
    id,
    name,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deckFormat: 3,
    featured: '',
    customFeatured: '',
    private: false,
    owner: { id: 1, username: 'test', avatar: '' },
    categories: [],
    deckTags: [],
    cards: cards.map((c, i) => ({
      id: i + 1,
      categories: c.categories ?? ['Ramp'],
      label: c.label ?? '',
      modifier: '',
      quantity: c.quantity ?? 1,
      card: {
        id: i + 100,
        uid: c.card?.uid ?? `scryfall-${i}`,
        artist: 'Test Artist',
        collectorNumber: c.card?.collectorNumber ?? `${i + 1}`,
        edition: {
          editioncode: c.card?.edition?.editioncode ?? 'cmm',
          editionname: c.card?.edition?.editionname ?? 'Commander Masters',
          editiondate: '2023-08-04',
          editiontype: 'masters',
        },
        oracleCard: {
          id: i + 200,
          name: c.card?.oracleCard?.name ?? `Card ${i}`,
          cmc: 2,
          colorIdentity: c.card?.oracleCard?.colorIdentity ?? ['G'],
          colors: ['G'],
          edhrecRank: null,
          layout: 'normal',
          uid: c.card?.uid ?? `scryfall-${i}`,
        },
        scryfallImageHash: '',
      },
      ...c,
    })) as ArchidektDeckFull['cards'],
  }
}

// ---------------------------------------------------------------------------
// Tests: reconcileDeck
// ---------------------------------------------------------------------------

describe('reconcileDeck', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, [{ id: 1, name: 'World Breaker' }])
  })

  it('adds cards from Archidekt that are not in local state', async () => {
    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', [
      { card: { uid: 'sol-1', oracleCard: { name: 'Sol Ring', colorIdentity: ['C'], id: 1, cmc: 1, colors: [], edhrecRank: null, layout: 'normal', uid: 'sol-1' }, collectorNumber: '379', edition: { editioncode: 'cmm', editionname: 'Commander Masters', editiondate: '2023-08-04', editiontype: 'masters' }, id: 100, artist: '', scryfallImageHash: '' }, categories: ['Ramp'], quantity: 1, label: '' },
    ]))

    const fetcher = createMockFetcher(deckData)
    const changes = await reconcileDeck(db, 1, fetcher)

    expect(changes).toBe(1)
    const rows = db.prepare('SELECT card_name FROM deck_cards WHERE deck_id = 1').all() as { card_name: string }[]
    expect(rows.map(r => r.card_name)).toContain('Sol Ring')
  })

  it('removes local cards not present in Archidekt (Archidekt wins)', async () => {
    // Pre-seed a local card
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)').run(1, 'Old Card', 'old-1', 1)

    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', [
      { card: { uid: 'sol-1', oracleCard: { name: 'Sol Ring', colorIdentity: ['C'], id: 1, cmc: 1, colors: [], edhrecRank: null, layout: 'normal', uid: 'sol-1' }, collectorNumber: '379', edition: { editioncode: 'cmm', editionname: 'Commander Masters', editiondate: '2023-08-04', editiontype: 'masters' }, id: 100, artist: '', scryfallImageHash: '' }, categories: ['Ramp'], quantity: 1, label: '' },
    ]))

    const fetcher = createMockFetcher(deckData)
    const changes = await reconcileDeck(db, 1, fetcher)

    // 1 add + 1 remove = 2 changes
    expect(changes).toBe(2)
    const rows = db.prepare('SELECT card_name FROM deck_cards WHERE deck_id = 1').all() as { card_name: string }[]
    expect(rows.map(r => r.card_name)).toEqual(['Sol Ring'])
    expect(rows.map(r => r.card_name)).not.toContain('Old Card')
  })

  it('updates local cards when Archidekt has different data (Archidekt wins on conflict)', async () => {
    // Pre-seed local with old set_code
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander) VALUES (?, ?, ?, ?, ?, ?, ?)').run(1, 'Sol Ring', 'sol-old', 'c14', 1, '["Ramp"]', 0)

    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', [
      { card: { uid: 'sol-new', oracleCard: { name: 'Sol Ring', colorIdentity: ['C'], id: 1, cmc: 1, colors: [], edhrecRank: null, layout: 'normal', uid: 'sol-new' }, collectorNumber: '379', edition: { editioncode: 'cmm', editionname: 'Commander Masters', editiondate: '2023-08-04', editiontype: 'masters' }, id: 100, artist: '', scryfallImageHash: '' }, categories: ['Ramp'], quantity: 1, label: '' },
    ]))

    const fetcher = createMockFetcher(deckData)
    const changes = await reconcileDeck(db, 1, fetcher)

    expect(changes).toBe(1)
    const row = db.prepare('SELECT scryfall_id, set_code FROM deck_cards WHERE deck_id = 1 AND card_name = ?').get('Sol Ring') as any
    expect(row.scryfall_id).toBe('sol-new')
    expect(row.set_code).toBe('cmm')
  })

  it('returns 0 when local and Archidekt are in sync', async () => {
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander) VALUES (?, ?, ?, ?, ?, ?, ?)').run(1, 'Sol Ring', 'sol-1', 'cmm', 1, '["Ramp"]', 0)

    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', [
      { card: { uid: 'sol-1', oracleCard: { name: 'Sol Ring', colorIdentity: ['C'], id: 1, cmc: 1, colors: [], edhrecRank: null, layout: 'normal', uid: 'sol-1' }, collectorNumber: '379', edition: { editioncode: 'cmm', editionname: 'Commander Masters', editiondate: '2023-08-04', editiontype: 'masters' }, id: 100, artist: '', scryfallImageHash: '' }, categories: ['Ramp'], quantity: 1, label: '' },
    ]))

    const fetcher = createMockFetcher(deckData)
    const changes = await reconcileDeck(db, 1, fetcher)

    expect(changes).toBe(0)
  })

  it('updates deck metadata (name, commander, colour_identity)', async () => {
    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'Updated Name', [
      { card: { uid: 'cmd-1', oracleCard: { name: 'Korvold', colorIdentity: ['B', 'R', 'G'], id: 1, cmc: 5, colors: ['B', 'R', 'G'], edhrecRank: null, layout: 'normal', uid: 'cmd-1' }, collectorNumber: '1', edition: { editioncode: 'eld', editionname: 'Eldraine', editiondate: '2019-10-04', editiontype: 'expansion' }, id: 100, artist: '', scryfallImageHash: '' }, categories: ['Commander'], quantity: 1, label: '' },
    ]))

    const fetcher = createMockFetcher(deckData)
    await reconcileDeck(db, 1, fetcher)

    const deck = db.prepare('SELECT name, commander_name, colour_identity FROM decks WHERE id = 1').get() as any
    expect(deck.name).toBe('Updated Name')
    expect(deck.commander_name).toBe('Korvold')
    expect(deck.colour_identity).toBe('BRG')
  })

  it('excludes Maybeboard and Sideboard cards', async () => {
    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', [
      { card: { uid: 'sol-1', oracleCard: { name: 'Sol Ring', colorIdentity: ['C'], id: 1, cmc: 1, colors: [], edhrecRank: null, layout: 'normal', uid: 'sol-1' }, collectorNumber: '379', edition: { editioncode: 'cmm', editionname: 'CM', editiondate: '2023-08-04', editiontype: 'masters' }, id: 100, artist: '', scryfallImageHash: '' }, categories: ['Ramp'], quantity: 1, label: '' },
      { card: { uid: 'maybe-1', oracleCard: { name: 'Maybe Card', colorIdentity: ['U'], id: 2, cmc: 3, colors: ['U'], edhrecRank: null, layout: 'normal', uid: 'maybe-1' }, collectorNumber: '50', edition: { editioncode: 'cmm', editionname: 'CM', editiondate: '2023-08-04', editiontype: 'masters' }, id: 101, artist: '', scryfallImageHash: '' }, categories: ['Maybeboard'], quantity: 1, label: '' },
      { card: { uid: 'side-1', oracleCard: { name: 'Side Card', colorIdentity: ['R'], id: 3, cmc: 2, colors: ['R'], edhrecRank: null, layout: 'normal', uid: 'side-1' }, collectorNumber: '60', edition: { editioncode: 'cmm', editionname: 'CM', editiondate: '2023-08-04', editiontype: 'masters' }, id: 102, artist: '', scryfallImageHash: '' }, categories: ['Sideboard'], quantity: 1, label: '' },
    ]))

    const fetcher = createMockFetcher(deckData)
    await reconcileDeck(db, 1, fetcher)

    const rows = db.prepare('SELECT card_name FROM deck_cards WHERE deck_id = 1').all() as { card_name: string }[]
    expect(rows.map(r => r.card_name)).toEqual(['Sol Ring'])
  })
})

// ---------------------------------------------------------------------------
// Tests: runSyncCycle
// ---------------------------------------------------------------------------

describe('runSyncCycle', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, [
      { id: 1, name: 'World Breaker' },
      { id: 2, name: 'Enchantress' },
      { id: 3, name: 'Yedora' },
    ])
    // Seed priorities
    db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)').run(1, 10)
    db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)').run(2, 20)
    db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)').run(3, 30)
  })

  it('in discovery mode (no deckIds), processes new decks (last_synced_at IS NULL)', async () => {
    // All seeded decks have last_synced_at = NULL → they are "new" and should be processed
    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', [
      { card: { uid: 'sol-1', oracleCard: { name: 'Sol Ring', colorIdentity: ['C'], id: 1, cmc: 1, colors: [], edhrecRank: null, layout: 'normal', uid: 'sol-1' }, collectorNumber: '379', edition: { editioncode: 'cmm', editionname: 'CM', editiondate: '', editiontype: '' }, id: 100, artist: '', scryfallImageHash: '' }, categories: ['Ramp'], quantity: 1, label: '' },
    ]))
    deckData.set(2, makeDeckFull(2, 'Enchantress', [
      { card: { uid: 'sol-1', oracleCard: { name: 'Sol Ring', colorIdentity: ['C'], id: 1, cmc: 1, colors: [], edhrecRank: null, layout: 'normal', uid: 'sol-1' }, collectorNumber: '379', edition: { editioncode: 'cmm', editionname: 'CM', editiondate: '', editiontype: '' }, id: 100, artist: '', scryfallImageHash: '' }, categories: ['Ramp'], quantity: 1, label: '' },
    ]))
    deckData.set(3, makeDeckFull(3, 'Yedora', [
      { card: { uid: 'forest-1', oracleCard: { name: 'Forest', colorIdentity: ['G'], id: 2, cmc: 0, colors: [], edhrecRank: null, layout: 'normal', uid: 'forest-1' }, collectorNumber: '1', edition: { editioncode: 'cmm', editionname: 'CM', editiondate: '', editiontype: '' }, id: 101, artist: '', scryfallImageHash: '' }, categories: ['Lands'], quantity: 1, label: '' },
    ]))

    const fetcher = createMockFetcher(deckData)
    const result = await runSyncCycle(db, 'manual', fetcher)

    expect(result.trigger).toBe('manual')
    expect(result.deckResults).toHaveLength(3)
    expect(result.deckResults.every(r => r.success)).toBe(true)
    expect(result.startedAt).toBeTruthy()
    expect(result.completedAt).toBeTruthy()
  })

  it('in discovery mode, skips previously-imported decks (last_synced_at IS NOT NULL) (Req 1.2, 6.2, 6.4)', async () => {
    // Mark decks 1 and 2 as previously imported
    db.prepare('UPDATE decks SET last_synced_at = ? WHERE id IN (1, 2)').run(new Date().toISOString())
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)').run(1, 'Sol Ring', 'sol-1', 1)
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)').run(2, 'Arcane Signet', 'arc-1', 1)

    // Only deck 3 has last_synced_at = NULL → only deck 3 should be processed
    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', []))  // Would delete Sol Ring if reconciled
    deckData.set(3, makeDeckFull(3, 'Yedora', [
      { card: { uid: 'forest-1', oracleCard: { name: 'Forest', colorIdentity: ['G'], id: 2, cmc: 0, colors: [], edhrecRank: null, layout: 'normal', uid: 'forest-1' }, collectorNumber: '1', edition: { editioncode: 'cmm', editionname: 'CM', editiondate: '', editiontype: '' }, id: 101, artist: '', scryfallImageHash: '' }, categories: ['Lands'], quantity: 1, label: '' },
    ]))

    const fetcher = createMockFetcher(deckData)
    const result = await runSyncCycle(db, 'manual', fetcher)

    // Only deck 3 should be processed
    expect(result.deckResults).toHaveLength(1)
    expect(result.deckResults[0].deckId).toBe(3)
    expect(result.deckResults[0].success).toBe(true)

    // Verify previously-imported deck_cards are unchanged
    const deck1Cards = db.prepare('SELECT card_name FROM deck_cards WHERE deck_id = 1').all() as { card_name: string }[]
    expect(deck1Cards.map(r => r.card_name)).toContain('Sol Ring')
    const deck2Cards = db.prepare('SELECT card_name FROM deck_cards WHERE deck_id = 2').all() as { card_name: string }[]
    expect(deck2Cards.map(r => r.card_name)).toContain('Arcane Signet')
  })

  it('processes only specified deckIds when provided (user-triggered re-import)', async () => {
    // Mark all decks as previously imported — explicit deckIds should still reconcile them
    db.prepare('UPDATE decks SET last_synced_at = ? WHERE id IN (1, 2, 3)').run(new Date().toISOString())

    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', []))
    deckData.set(2, makeDeckFull(2, 'Enchantress', []))

    const fetcher = createMockFetcher(deckData)
    const result = await runSyncCycle(db, 'manual', fetcher, [1, 2])

    expect(result.deckResults).toHaveLength(2)
    expect(result.deckResults.map(r => r.deckId).sort()).toEqual([1, 2])
  })

  it('isolates failures — one deck failing does not stop others (Req 5.7)', async () => {
    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', []))
    // Deck 2 will throw
    deckData.set(3, makeDeckFull(3, 'Yedora', []))

    const fetcher: ArchidektFetcher = {
      async fetchDeck(deckId: number) {
        if (deckId === 2) throw new Error('API timeout')
        const data = deckData.get(deckId)
        if (!data) throw new Error(`Deck ${deckId} not found`)
        return data
      },
    }

    const result = await runSyncCycle(db, 'manual', fetcher)

    expect(result.deckResults).toHaveLength(3)

    const deck1Result = result.deckResults.find(r => r.deckId === 1)!
    const deck2Result = result.deckResults.find(r => r.deckId === 2)!
    const deck3Result = result.deckResults.find(r => r.deckId === 3)!

    expect(deck1Result.success).toBe(true)
    expect(deck2Result.success).toBe(false)
    expect(deck2Result.error).toBe('API timeout')
    expect(deck3Result.success).toBe(true)
  })

  it('records sync run in sync_runs table', async () => {
    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', []))
    deckData.set(2, makeDeckFull(2, 'Enchantress', []))
    deckData.set(3, makeDeckFull(3, 'Yedora', []))

    const fetcher = createMockFetcher(deckData)
    await runSyncCycle(db, 'manual', fetcher)

    const runs = db.prepare('SELECT * FROM sync_runs').all() as any[]
    expect(runs).toHaveLength(1)
    expect(runs[0].trigger).toBe('manual')
    expect(runs[0].decks_processed).toBe(3)
    expect(runs[0].decks_succeeded).toBe(3)
    expect(runs[0].decks_failed).toBe(0)
    expect(runs[0].completed_at).toBeTruthy()

    // Details should be JSON of deck results
    const details = JSON.parse(runs[0].details)
    expect(details).toHaveLength(3)
  })

  it('records failed deck count in sync_runs', async () => {
    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', []))
    deckData.set(3, makeDeckFull(3, 'Yedora', []))

    const fetcher: ArchidektFetcher = {
      async fetchDeck(deckId: number) {
        if (deckId === 2) throw new Error('Network error')
        const data = deckData.get(deckId)
        if (!data) throw new Error(`Not found`)
        return data
      },
    }

    await runSyncCycle(db, 'scheduled', fetcher)

    const run = db.prepare('SELECT * FROM sync_runs').get() as any
    expect(run.trigger).toBe('scheduled')
    expect(run.decks_processed).toBe(3)
    expect(run.decks_succeeded).toBe(2)
    expect(run.decks_failed).toBe(1)
  })

  it('runs allocation resolver after reconciliation', async () => {
    // Add collection supply
    db.prepare('INSERT INTO collection (card_name, scryfall_id, set_code, collector_number, quantity, foil) VALUES (?, ?, ?, ?, ?, ?)').run('Sol Ring', 'sol-1', 'cmm', '379', 1, 0)

    const deckData = new Map<number, ArchidektDeckFull>()
    // Both decks have Sol Ring, but only 1 copy owned → one gets proxy
    deckData.set(1, makeDeckFull(1, 'World Breaker', [
      { card: { uid: 'sol-1', oracleCard: { name: 'Sol Ring', colorIdentity: ['C'], id: 1, cmc: 1, colors: [], edhrecRank: null, layout: 'normal', uid: 'sol-1' }, collectorNumber: '379', edition: { editioncode: 'cmm', editionname: 'CM', editiondate: '', editiontype: '' }, id: 100, artist: '', scryfallImageHash: '' }, categories: ['Ramp'], quantity: 1, label: '' },
    ]))
    deckData.set(2, makeDeckFull(2, 'Enchantress', [
      { card: { uid: 'sol-1', oracleCard: { name: 'Sol Ring', colorIdentity: ['C'], id: 1, cmc: 1, colors: [], edhrecRank: null, layout: 'normal', uid: 'sol-1' }, collectorNumber: '379', edition: { editioncode: 'cmm', editionname: 'CM', editiondate: '', editiontype: '' }, id: 100, artist: '', scryfallImageHash: '' }, categories: ['Ramp'], quantity: 1, label: '' },
    ]))
    deckData.set(3, makeDeckFull(3, 'Yedora', []))

    const fetcher = createMockFetcher(deckData)
    const result = await runSyncCycle(db, 'manual', fetcher)

    // Allocation should have been computed
    expect(result.allocationChanges).toBeGreaterThan(0)

    // Check deck_allocations table
    const allocations = db.prepare('SELECT * FROM deck_allocations WHERE card_name = ?').all('Sol Ring') as any[]
    expect(allocations).toHaveLength(2)

    // Deck 1 (higher priority) should get original, Deck 2 gets proxy
    const deck1Alloc = allocations.find((a: any) => a.deck_id === 1)
    const deck2Alloc = allocations.find((a: any) => a.deck_id === 2)
    expect(deck1Alloc.role).toBe('original')
    expect(deck2Alloc.role).toBe('proxy')
  })

  it('supports csv_import trigger type', async () => {
    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', []))
    deckData.set(2, makeDeckFull(2, 'Enchantress', []))
    deckData.set(3, makeDeckFull(3, 'Yedora', []))

    const fetcher = createMockFetcher(deckData)
    const result = await runSyncCycle(db, 'csv_import', fetcher)

    expect(result.trigger).toBe('csv_import')
    const run = db.prepare('SELECT trigger FROM sync_runs').get() as any
    expect(run.trigger).toBe('csv_import')
  })

  it('updates sync_meta with last_sync_at timestamp', async () => {
    const deckData = new Map<number, ArchidektDeckFull>()
    deckData.set(1, makeDeckFull(1, 'World Breaker', []))
    deckData.set(2, makeDeckFull(2, 'Enchantress', []))
    deckData.set(3, makeDeckFull(3, 'Yedora', []))

    const fetcher = createMockFetcher(deckData)
    await runSyncCycle(db, 'manual', fetcher)

    const meta = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_sync_at'").get() as any
    expect(meta).toBeTruthy()
    expect(meta.value).toBeTruthy()
  })

  it('handles empty deck list gracefully', async () => {
    // Remove all decks from DB
    db.prepare('DELETE FROM decks').run()

    const fetcher = createMockFetcher(new Map())
    const result = await runSyncCycle(db, 'manual', fetcher)

    expect(result.deckResults).toHaveLength(0)

    const run = db.prepare('SELECT * FROM sync_runs').get() as any
    expect(run.decks_processed).toBe(0)
    expect(run.decks_succeeded).toBe(0)
    expect(run.decks_failed).toBe(0)
  })
})


// ---------------------------------------------------------------------------
// Tests: importCollectionAndReallocate
// ---------------------------------------------------------------------------

describe('importCollectionAndReallocate', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedDecks(db, [
      { id: 1, name: 'World Breaker' },
      { id: 2, name: 'Enchantress' },
      { id: 3, name: 'Yedora' },
    ])
    db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)').run(1, 10)
    db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)').run(2, 20)
    db.prepare('INSERT INTO deck_priority (deck_id, priority) VALUES (?, ?)').run(3, 30)
  })

  const CSV_HEADER = 'Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number,Identities,Types'

  function makeCSV(...lines: string[]): string {
    return [CSV_HEADER, ...lines].join('\n')
  }

  it('newly owned card promotes proxy → original (Req 6.2)', () => {
    // Setup: Sol Ring in two decks, no collection → both are proxy
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)').run(1, 'Sol Ring', 'sol-1', 1)
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)').run(2, 'Sol Ring', 'sol-1', 1)

    // Pre-allocate both as proxy (no supply)
    db.prepare(`INSERT INTO deck_allocations (card_name, deck_id, role, written_to_archidekt) VALUES (?, ?, ?, ?)`).run('Sol Ring', 1, 'proxy', 0)
    db.prepare(`INSERT INTO deck_allocations (card_name, deck_id, role, written_to_archidekt) VALUES (?, ?, ?, ?)`).run('Sol Ring', 2, 'proxy', 0)

    // Import CSV with 1 Sol Ring → deck 1 (higher priority) gets promoted to original
    const csv = makeCSV(
      '1,Sol Ring,Normal,NM,2025-01-15,EN,5.00,,Commander Masters,cmm,456,sol-1,388,,Artifact'
    )

    const result = importCollectionAndReallocate(db, csv)

    // Deck 1 should now be original (promoted from proxy)
    expect(result.newlyFulfilled).toHaveLength(1)
    expect(result.newlyFulfilled[0].cardName).toBe('Sol Ring')
    expect(result.newlyFulfilled[0].deckId).toBe(1)
    expect(result.newlyFulfilled[0].deckName).toBe('World Breaker')

    // Deck 2 remains proxy
    expect(result.newlyBroken).toHaveLength(0)

    // Verify DB state
    const allocations = db.prepare('SELECT card_name, deck_id, role FROM deck_allocations WHERE card_name = ? ORDER BY deck_id').all('Sol Ring') as any[]
    expect(allocations).toHaveLength(2)
    expect(allocations[0]).toMatchObject({ card_name: 'Sol Ring', deck_id: 1, role: 'original' })
    expect(allocations[1]).toMatchObject({ card_name: 'Sol Ring', deck_id: 2, role: 'proxy' })
  })

  it('removed card demotes original → proxy (Req 6.3)', () => {
    // Setup: Sol Ring in deck 1, owned in collection
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)').run(1, 'Sol Ring', 'sol-1', 1)
    db.prepare('INSERT INTO collection (card_name, scryfall_id, set_code, quantity, foil, collector_number) VALUES (?, ?, ?, ?, ?, ?)').run('Sol Ring', 'sol-1', 'cmm', 1, 0, '388')

    // Pre-allocate as original (has supply)
    db.prepare(`INSERT INTO deck_allocations (card_name, deck_id, role, scryfall_id, set_code, written_to_archidekt) VALUES (?, ?, ?, ?, ?, ?)`).run('Sol Ring', 1, 'original', 'sol-1', 'cmm', 0)

    // Import CSV WITHOUT Sol Ring → supply removed
    const csv = makeCSV(
      '1,Lightning Bolt,Normal,NM,2025-01-15,EN,0.50,,Core Set 2021,m21,123,bolt-1,152,Red,Instant'
    )

    const result = importCollectionAndReallocate(db, csv)

    // Sol Ring lost its supply → newly broken
    expect(result.newlyBroken).toHaveLength(1)
    expect(result.newlyBroken[0].cardName).toBe('Sol Ring')
    expect(result.newlyBroken[0].deckId).toBe(1)
    expect(result.newlyBroken[0].deckName).toBe('World Breaker')
    expect(result.newlyBroken[0].previousScryfallId).toBe('sol-1')

    // Verify DB state: Sol Ring is now proxy
    const alloc = db.prepare('SELECT role FROM deck_allocations WHERE card_name = ? AND deck_id = ?').get('Sol Ring', 1) as any
    expect(alloc.role).toBe('proxy')
  })

  it('returns importDelta with added/removed/changed cards', () => {
    // Pre-seed collection with Lightning Bolt qty=2
    db.prepare('INSERT INTO collection (card_name, scryfall_id, set_code, quantity, foil, finish, collector_number) VALUES (?, ?, ?, ?, ?, ?, ?)').run('Lightning Bolt', 'bolt-1', 'm21', 2, 0, 'Normal', '152')

    // Import CSV: Lightning Bolt qty=3 (changed) + new Sol Ring (added), no removal
    const csv = makeCSV(
      '3,Lightning Bolt,Normal,NM,2025-01-15,EN,0.50,,Core Set 2021,m21,123,bolt-1,152,Red,Instant',
      '1,Sol Ring,Normal,NM,2025-02-10,EN,5.00,,Commander Masters,cmm,456,sol-1,388,,Artifact'
    )

    const result = importCollectionAndReallocate(db, csv)

    expect(result.importDelta.added).toHaveLength(1)
    expect(result.importDelta.added[0].name).toBe('Sol Ring')
    expect(result.importDelta.quantityChanged).toHaveLength(1)
    expect(result.importDelta.quantityChanged[0].entry.name).toBe('Lightning Bolt')
    expect(result.importDelta.quantityChanged[0].previousQuantity).toBe(2)
    expect(result.importDelta.totalEntries).toBe(2)
    expect(result.importDelta.previousEntries).toBe(1)
  })

  it('triggers full reallocation across all decks (Req 6.5)', () => {
    // Setup: Sol Ring in decks 1 and 2, currently 1 copy owned (deck 1 = original, deck 2 = proxy)
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)').run(1, 'Sol Ring', 'sol-1', 1)
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)').run(2, 'Sol Ring', 'sol-1', 1)
    db.prepare('INSERT INTO collection (card_name, scryfall_id, set_code, quantity, foil, collector_number) VALUES (?, ?, ?, ?, ?, ?)').run('Sol Ring', 'sol-1', 'cmm', 1, 0, '388')

    db.prepare(`INSERT INTO deck_allocations (card_name, deck_id, role, scryfall_id, set_code, written_to_archidekt) VALUES (?, ?, ?, ?, ?, ?)`).run('Sol Ring', 1, 'original', 'sol-1', 'cmm', 0)
    db.prepare(`INSERT INTO deck_allocations (card_name, deck_id, role, written_to_archidekt) VALUES (?, ?, ?, ?)`).run('Sol Ring', 2, 'proxy', 0)

    // Import CSV with 2 copies of Sol Ring → deck 2 should also become original
    const csv = makeCSV(
      '2,Sol Ring,Normal,NM,2025-01-15,EN,5.00,,Commander Masters,cmm,456,sol-1,388,,Artifact'
    )

    const result = importCollectionAndReallocate(db, csv)

    // Deck 2 should be newly fulfilled (proxy → original)
    expect(result.newlyFulfilled).toHaveLength(1)
    expect(result.newlyFulfilled[0].cardName).toBe('Sol Ring')
    expect(result.newlyFulfilled[0].deckId).toBe(2)
    expect(result.newlyFulfilled[0].deckName).toBe('Enchantress')

    // Both decks should now be original
    const allocations = db.prepare('SELECT deck_id, role FROM deck_allocations WHERE card_name = ? ORDER BY deck_id').all('Sol Ring') as any[]
    expect(allocations[0]).toMatchObject({ deck_id: 1, role: 'original' })
    expect(allocations[1]).toMatchObject({ deck_id: 2, role: 'original' })
  })

  it('handles empty collection import (all allocations become proxy)', () => {
    // Setup: card in deck with existing supply
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)').run(1, 'Sol Ring', 'sol-1', 1)
    db.prepare('INSERT INTO collection (card_name, scryfall_id, set_code, quantity, foil, collector_number) VALUES (?, ?, ?, ?, ?, ?)').run('Sol Ring', 'sol-1', 'cmm', 1, 0, '388')
    db.prepare(`INSERT INTO deck_allocations (card_name, deck_id, role, scryfall_id, set_code, written_to_archidekt) VALUES (?, ?, ?, ?, ?, ?)`).run('Sol Ring', 1, 'original', 'sol-1', 'cmm', 0)

    // Import empty CSV (header only) — all cards removed from collection
    const csv = CSV_HEADER

    const result = importCollectionAndReallocate(db, csv)

    expect(result.newlyBroken).toHaveLength(1)
    expect(result.newlyBroken[0].cardName).toBe('Sol Ring')
    expect(result.importDelta.removed).toHaveLength(1)
    expect(result.importDelta.removed[0].name).toBe('Sol Ring')
  })

  it('preserves unchanged allocations', () => {
    // Setup: Sol Ring in deck 1, owned, allocated as original
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity) VALUES (?, ?, ?, ?)').run(1, 'Sol Ring', 'sol-1', 1)
    db.prepare('INSERT INTO collection (card_name, scryfall_id, set_code, quantity, foil, finish, collector_number) VALUES (?, ?, ?, ?, ?, ?, ?)').run('Sol Ring', 'sol-1', 'cmm', 1, 0, 'Normal', '388')
    db.prepare(`INSERT INTO deck_allocations (card_name, deck_id, role, scryfall_id, set_code, written_to_archidekt) VALUES (?, ?, ?, ?, ?, ?)`).run('Sol Ring', 1, 'original', 'sol-1', 'cmm', 0)

    // Import same collection — nothing should change
    const csv = makeCSV(
      '1,Sol Ring,Normal,NM,2025-01-15,EN,5.00,,Commander Masters,cmm,456,sol-1,388,,Artifact'
    )

    const result = importCollectionAndReallocate(db, csv)

    expect(result.newlyFulfilled).toHaveLength(0)
    expect(result.newlyBroken).toHaveLength(0)
    expect(result.allocationChanges.unchanged).toHaveLength(1)
  })
})
