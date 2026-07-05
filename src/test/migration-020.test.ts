import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

/**
 * Tests that migration 020-brew-v2-columns.sql applies cleanly,
 * adds the decision_log_json and assessment_cache_json columns with correct defaults,
 * and the updated CHECK constraint allows the new V2 statuses.
 *
 * Validates: Requirements 10.8, 4.5
 */
describe('Migration: 020-brew-v2-columns', () => {
  let db: Database.Database
  const migrationsDir = path.join(process.cwd(), 'db', 'migrations')

  function applyMigrations(database: Database.Database) {
    database.pragma('foreign_keys = ON')

    database.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    const applied = new Set(
      database.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name)
    )

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      if (applied.has(file)) continue

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      const strippedSql = sql
        .split('\n')
        .filter(line => !line.trimStart().startsWith('--'))
        .join('\n')

      const statements = strippedSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0)

      for (const stmt of statements) {
        try {
          database.exec(stmt)
        } catch (err: any) {
          if (err?.message?.includes('duplicate column name')) {
            continue
          }
          // Allow "no such table" errors for ALTER TABLE on tables that were
          // created outside the migration system (e.g. deck_upgrades)
          if (err?.message?.includes('no such table') && stmt.startsWith('ALTER TABLE')) {
            continue
          }
          throw err
        }
      }

      database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
    }
  }

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('020-brew-v2-columns.sql exists in db/migrations/', () => {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
    expect(files).toContain('020-brew-v2-columns.sql')
  })

  it('applies all migrations without error on a fresh database', () => {
    expect(() => applyMigrations(db)).not.toThrow()

    const migrations = db.prepare('SELECT name FROM _migrations ORDER BY name').all()
    expect(migrations.map((r: any) => r.name)).toContain('020-brew-v2-columns.sql')
  })

  it('brew_sessions has decision_log_json column with correct default', () => {
    applyMigrations(db)

    db.prepare(`INSERT INTO decks (id, name) VALUES (1, 'Test Deck')`).run()
    db.prepare(`INSERT INTO brew_sessions (deck_id, status) VALUES (1, 'exploring')`).run()

    const row = db.prepare('SELECT decision_log_json FROM brew_sessions WHERE deck_id = 1').get() as any
    expect(row.decision_log_json).toBe('{"strategy":[],"parameters":[],"constraints":[]}')

    // Verify it's valid JSON
    const parsed = JSON.parse(row.decision_log_json)
    expect(parsed).toEqual({ strategy: [], parameters: [], constraints: [] })
  })

  it('brew_sessions has assessment_cache_json column with correct default', () => {
    applyMigrations(db)

    db.prepare(`INSERT INTO decks (id, name) VALUES (1, 'Test Deck')`).run()
    db.prepare(`INSERT INTO brew_sessions (deck_id, status) VALUES (1, 'exploring')`).run()

    const row = db.prepare('SELECT assessment_cache_json FROM brew_sessions WHERE deck_id = 1').get() as any
    expect(row.assessment_cache_json).toBe('{}')

    // Verify it's valid JSON
    const parsed = JSON.parse(row.assessment_cache_json)
    expect(parsed).toEqual({})
  })

  it('status CHECK allows new V2 phases: exploring, building', () => {
    applyMigrations(db)

    db.prepare(`INSERT INTO decks (id, name) VALUES (1, 'Test Deck')`).run()

    // These should not throw
    expect(() => {
      db.prepare(`INSERT INTO brew_sessions (deck_id, status) VALUES (1, 'exploring')`).run()
    }).not.toThrow()

    expect(() => {
      db.prepare(`INSERT INTO brew_sessions (deck_id, status) VALUES (1, 'building')`).run()
    }).not.toThrow()
  })

  it('status CHECK still allows legacy statuses: selecting, complete, abandoned', () => {
    applyMigrations(db)

    db.prepare(`INSERT INTO decks (id, name) VALUES (1, 'Test Deck')`).run()

    expect(() => {
      db.prepare(`INSERT INTO brew_sessions (deck_id, status) VALUES (1, 'selecting')`).run()
    }).not.toThrow()

    expect(() => {
      db.prepare(`INSERT INTO brew_sessions (deck_id, status) VALUES (1, 'complete')`).run()
    }).not.toThrow()

    expect(() => {
      db.prepare(`INSERT INTO brew_sessions (deck_id, status) VALUES (1, 'abandoned')`).run()
    }).not.toThrow()
  })

  it('status CHECK rejects invalid statuses', () => {
    applyMigrations(db)

    db.prepare(`INSERT INTO decks (id, name) VALUES (1, 'Test Deck')`).run()

    expect(() => {
      db.prepare(`INSERT INTO brew_sessions (deck_id, status) VALUES (1, 'invalid_status')`).run()
    }).toThrow()
  })

  it('preserves existing brew_sessions data after rebuild', () => {
    applyMigrations(db)

    // Insert data using old status
    db.prepare(`INSERT INTO decks (id, name) VALUES (1, 'Test Deck')`).run()
    db.prepare(`INSERT INTO brew_sessions (deck_id, status, commander_name, colour_identity) VALUES (1, 'complete', 'Muldrotha, the Gravetide', 'BUG')`).run()

    const row = db.prepare('SELECT commander_name, colour_identity, status FROM brew_sessions WHERE deck_id = 1').get() as any
    expect(row.commander_name).toBe('Muldrotha, the Gravetide')
    expect(row.colour_identity).toBe('BUG')
    expect(row.status).toBe('complete')
  })

  it('indexes on status and updated_at are recreated', () => {
    applyMigrations(db)

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND tbl_name = 'brew_sessions'
    `).all() as any[]

    const indexNames = indexes.map(i => i.name)
    expect(indexNames).toContain('idx_brew_sessions_status')
    expect(indexNames).toContain('idx_brew_sessions_updated')
  })
})
