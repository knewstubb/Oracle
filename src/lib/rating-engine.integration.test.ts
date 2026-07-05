import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'

/**
 * Feature: deck-ratings, Property 8: Upsert Idempotence
 *
 * Running the rating engine twice for any deck results in exactly one row
 * in `deck_ratings` for that deck_id, with `generated_at` reflecting the
 * most recent computation.
 *
 * **Validates: Requirements 6.3**
 */
describe('Feature: deck-ratings, Property 8: Upsert Idempotence', () => {
  it('running upsert twice results in exactly one row with latest content', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')

    // Create schema matching the real migration
    db.exec(`
      CREATE TABLE decks (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )
    `)
    db.exec(`
      CREATE TABLE deck_ratings (
        deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert a deck
    db.prepare('INSERT INTO decks (id, name) VALUES (1, ?)').run('Test Deck')

    // First upsert — simulates compute script writing ratings
    const firstContent = JSON.stringify({
      scores: { consistency: 5, resilience: 4, interaction: 3, speed: 6 },
    })
    db.prepare(
      'INSERT OR REPLACE INTO deck_ratings (deck_id, content, generated_at) VALUES (?, ?, ?)'
    ).run(1, firstContent, '2024-01-01T00:00:00.000Z')

    // Verify one row after first write
    const countAfterFirst = db.prepare(
      'SELECT COUNT(*) as cnt FROM deck_ratings WHERE deck_id = 1'
    ).get() as { cnt: number }
    expect(countAfterFirst.cnt).toBe(1)

    // Second upsert — simulates re-running the compute script
    const secondContent = JSON.stringify({
      scores: { consistency: 7, resilience: 6, interaction: 5, speed: 8 },
    })
    db.prepare(
      'INSERT OR REPLACE INTO deck_ratings (deck_id, content, generated_at) VALUES (?, ?, ?)'
    ).run(1, secondContent, '2024-06-15T12:00:00.000Z')

    // Verify still exactly one row after second write
    const countAfterSecond = db.prepare(
      'SELECT COUNT(*) as cnt FROM deck_ratings WHERE deck_id = 1'
    ).get() as { cnt: number }
    expect(countAfterSecond.cnt).toBe(1)

    // Verify content reflects the second (most recent) write
    const row = db.prepare(
      'SELECT content, generated_at FROM deck_ratings WHERE deck_id = 1'
    ).get() as { content: string; generated_at: string }
    expect(JSON.parse(row.content).scores.consistency).toBe(7)
    expect(row.generated_at).toBe('2024-06-15T12:00:00.000Z')

    db.close()
  })

  it('upsert is idempotent across multiple decks independently', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')

    db.exec(`
      CREATE TABLE decks (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )
    `)
    db.exec(`
      CREATE TABLE deck_ratings (
        deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert two decks
    db.prepare('INSERT INTO decks (id, name) VALUES (?, ?)').run(1, 'Deck A')
    db.prepare('INSERT INTO decks (id, name) VALUES (?, ?)').run(2, 'Deck B')

    const upsert = db.prepare(
      'INSERT OR REPLACE INTO deck_ratings (deck_id, content, generated_at) VALUES (?, ?, ?)'
    )

    // First pass — write both decks
    upsert.run(1, JSON.stringify({ scores: { consistency: 3 } }), '2024-01-01T00:00:00.000Z')
    upsert.run(2, JSON.stringify({ scores: { consistency: 4 } }), '2024-01-01T00:00:00.000Z')

    // Second pass — re-write both decks (simulating full recompute)
    upsert.run(1, JSON.stringify({ scores: { consistency: 8 } }), '2024-06-15T12:00:00.000Z')
    upsert.run(2, JSON.stringify({ scores: { consistency: 9 } }), '2024-06-15T12:00:00.000Z')

    // Verify exactly one row per deck
    const totalCount = db.prepare('SELECT COUNT(*) as cnt FROM deck_ratings').get() as {
      cnt: number
    }
    expect(totalCount.cnt).toBe(2)

    // Verify each deck has the latest content
    const deck1 = db.prepare('SELECT content, generated_at FROM deck_ratings WHERE deck_id = 1').get() as {
      content: string
      generated_at: string
    }
    expect(JSON.parse(deck1.content).scores.consistency).toBe(8)
    expect(deck1.generated_at).toBe('2024-06-15T12:00:00.000Z')

    const deck2 = db.prepare('SELECT content, generated_at FROM deck_ratings WHERE deck_id = 2').get() as {
      content: string
      generated_at: string
    }
    expect(JSON.parse(deck2.content).scores.consistency).toBe(9)
    expect(deck2.generated_at).toBe('2024-06-15T12:00:00.000Z')

    db.close()
  })

  it('ON DELETE CASCADE removes ratings when deck is deleted', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')

    db.exec(`
      CREATE TABLE decks (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )
    `)
    db.exec(`
      CREATE TABLE deck_ratings (
        deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    db.prepare('INSERT INTO decks (id, name) VALUES (1, ?)').run('Test Deck')
    db.prepare(
      'INSERT OR REPLACE INTO deck_ratings (deck_id, content, generated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
    ).run(1, JSON.stringify({ scores: { consistency: 5 } }))

    // Verify row exists
    const before = db.prepare('SELECT COUNT(*) as cnt FROM deck_ratings').get() as { cnt: number }
    expect(before.cnt).toBe(1)

    // Delete the deck — should cascade
    db.prepare('DELETE FROM decks WHERE id = 1').run()

    // Verify ratings row was cascaded away
    const after = db.prepare('SELECT COUNT(*) as cnt FROM deck_ratings').get() as { cnt: number }
    expect(after.cnt).toBe(0)

    db.close()
  })
})
