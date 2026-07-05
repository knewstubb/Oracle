/**
 * Tests for Archidekt proxy tag interpretation on import.
 *
 * Validates: Requirements 9.5
 *
 * When reading deck state from Archidekt, cards with Proxy tags or Proxy categories
 * should be interpreted as pin_proxy overrides in the allocation input's overrides map.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { extractProxyOverridesFromDecks, buildAllocationInput } from './allocation-store'

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
  `)

  return db
}

// ---------------------------------------------------------------------------
// Tests: extractProxyOverridesFromDecks
// ---------------------------------------------------------------------------

describe('extractProxyOverridesFromDecks', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    db.prepare('INSERT INTO decks (id, name) VALUES (?, ?)').run(1, 'Deck A')
    db.prepare('INSERT INTO decks (id, name) VALUES (?, ?)').run(2, 'Deck B')
  })

  it('detects proxy tag in tags JSON array', () => {
    // Tag stored as JSON array with Proxy tag name (from Archidekt API format)
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, tags, categories) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 'Sol Ring', 'sol-1', JSON.stringify([{ name: 'Proxy', color: '#e158ff' }]), '["Ramp"]')

    const overrides = extractProxyOverridesFromDecks(db)

    expect(overrides.get('Sol Ring|1')).toBe('pin_proxy')
  })

  it('detects Proxy in categories JSON array', () => {
    // Category stored as JSON array containing "Proxy" (the [Proxy] format)
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, tags, categories) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 'Lightning Bolt', 'bolt-1', '[]', JSON.stringify(['Removal', 'Proxy']))

    const overrides = extractProxyOverridesFromDecks(db)

    expect(overrides.get('Lightning Bolt|1')).toBe('pin_proxy')
  })

  it('does not flag cards without proxy markers', () => {
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, tags, categories) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 'Mana Crypt', 'crypt-1', '[]', '["Ramp"]')

    const overrides = extractProxyOverridesFromDecks(db)

    expect(overrides.has('Mana Crypt|1')).toBe(false)
  })

  it('handles NULL tags and categories gracefully', () => {
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, tags, categories) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 'Forest', 'forest-1', null, null)

    const overrides = extractProxyOverridesFromDecks(db)

    expect(overrides.has('Forest|1')).toBe(false)
    expect(overrides.size).toBe(0)
  })

  it('detects proxy from raw tag string with #!Proxy pattern', () => {
    // Fallback: raw string format that might appear if JSON parsing fails
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, tags, categories) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 'Demonic Tutor', 'tutor-1', '#!Proxy', '["Tutor"]')

    const overrides = extractProxyOverridesFromDecks(db)

    expect(overrides.get('Demonic Tutor|1')).toBe('pin_proxy')
  })

  it('detects proxy from raw tag string with ^Proxy pattern', () => {
    // The format used in archidekt-playwright.ts: ^Proxy,#e158ff^
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, tags, categories) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 'Rhystic Study', 'rhystic-1', '^Proxy,#e158ff^', '["Draw"]')

    const overrides = extractProxyOverridesFromDecks(db)

    expect(overrides.get('Rhystic Study|1')).toBe('pin_proxy')
  })

  it('handles multiple cards across multiple decks', () => {
    // Card with proxy tag in deck 1
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, tags, categories) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 'Sol Ring', 'sol-1', JSON.stringify([{ name: 'Proxy', color: '#e158ff' }]), '["Ramp"]')

    // Same card without proxy tag in deck 2
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, tags, categories) VALUES (?, ?, ?, ?, ?)'
    ).run(2, 'Sol Ring', 'sol-2', '[]', '["Ramp"]')

    // Another card with Proxy category in deck 2
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, tags, categories) VALUES (?, ?, ?, ?, ?)'
    ).run(2, 'Mana Vault', 'vault-1', '[]', JSON.stringify(['Ramp', 'Proxy']))

    const overrides = extractProxyOverridesFromDecks(db)

    expect(overrides.get('Sol Ring|1')).toBe('pin_proxy')
    expect(overrides.has('Sol Ring|2')).toBe(false)
    expect(overrides.get('Mana Vault|2')).toBe('pin_proxy')
    expect(overrides.size).toBe(2)
  })

  it('is case-insensitive for tag name matching', () => {
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, tags, categories) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 'Arcane Signet', 'signet-1', JSON.stringify([{ name: 'proxy', color: '#e158ff' }]), '[]')

    const overrides = extractProxyOverridesFromDecks(db)

    expect(overrides.get('Arcane Signet|1')).toBe('pin_proxy')
  })

  it('is case-insensitive for category matching', () => {
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_name, scryfall_id, tags, categories) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 'Command Tower', 'tower-1', '[]', JSON.stringify(['Lands', 'proxy']))

    const overrides = extractProxyOverridesFromDecks(db)

    expect(overrides.get('Command Tower|1')).toBe('pin_proxy')
  })
})

// ---------------------------------------------------------------------------
// Tests: buildAllocationInput with external overrides
// ---------------------------------------------------------------------------

describe('buildAllocationInput with externalOverrides', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    db.prepare('INSERT INTO decks (id, name) VALUES (?, ?)').run(1, 'Deck A')
    db.prepare('INSERT INTO decks (id, name) VALUES (?, ?)').run(2, 'Deck B')
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id) VALUES (?, ?, ?)').run(1, 'Sol Ring', 'sol-1')
    db.prepare('INSERT INTO deck_cards (deck_id, card_name, scryfall_id) VALUES (?, ?, ?)').run(2, 'Sol Ring', 'sol-2')
  })

  it('merges external overrides into the overrides map', () => {
    const external = new Map<string, 'pin_original' | 'pin_proxy'>()
    external.set('Sol Ring|1', 'pin_proxy')

    const input = buildAllocationInput(db, external)

    expect(input.overrides.get('Sol Ring|1')).toBe('pin_proxy')
  })

  it('DB-persisted overrides take precedence over external ones', () => {
    // Insert a DB override that says pin_original
    db.prepare(
      'INSERT INTO deck_allocations (card_name, deck_id, role, priority_override) VALUES (?, ?, ?, ?)'
    ).run('Sol Ring', 1, 'original', 1)

    // External override says pin_proxy
    const external = new Map<string, 'pin_original' | 'pin_proxy'>()
    external.set('Sol Ring|1', 'pin_proxy')

    const input = buildAllocationInput(db, external)

    // DB override wins
    expect(input.overrides.get('Sol Ring|1')).toBe('pin_original')
  })

  it('works without external overrides (backward compatible)', () => {
    const input = buildAllocationInput(db)

    expect(input.overrides.size).toBe(0)
  })
})
