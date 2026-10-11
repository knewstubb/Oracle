import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * T-49 regression coverage for the proxy-printing migration (D-038 / D-041).
 *
 * There is no Postgres in the unit-test environment, so this test reads the
 * forward migration and asserts the rules it encodes. The borderless-printing
 * regression (a slot asking for Borderless Sol Ring must not get a regular
 * Sol Ring proxy) is asserted structurally: the requested printing is assigned
 * to the recorded printing before the newest-printing fallback is ever used.
 *
 * The live round-trip of the requested printing through the bulk route is also
 * covered behaviourally in
 * src/app/api/decks/[id]/cards/bulk/route.test.ts.
 */

const MIGRATION_FILE = '20261011120000_proxy_requested_printing_finish.sql'

function readMigration(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'supabase', 'migrations', MIGRATION_FILE),
    'utf-8'
  )
}

/** Extract the plpgsql body between the opening and closing $function$ tags. */
function extractFunctionBody(sql: string, name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}(`)
  expect(start, `function ${name} should exist`).toBeGreaterThan(-1)
  const open = sql.indexOf('$function$', start)
  expect(open, `function ${name} should have a body`).toBeGreaterThan(-1)
  const close = sql.indexOf('$function$', open + 1)
  expect(close, `function ${name} should close its body`).toBeGreaterThan(-1)
  return sql.slice(open + '$function$'.length, close)
}

describe('migration: proxy_requested_printing_finish', () => {
  const sql = readMigration()

  it('adds a nullable requested_finish column restricted to the copy finishes', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS requested_finish text/)
    expect(sql).toMatch(
      /CHECK \(requested_finish IS NULL OR requested_finish IN \('nonfoil', 'foil', 'etched'\)\)/
    )
  })

  it('is safe to re-run and non-destructive', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION')

    // Ignore comments, then confirm no destructive data operation is present.
    const executable = sql
      .split('\n')
      .filter(line => !line.trimStart().startsWith('--'))
      .join('\n')
    expect(executable).not.toMatch(/\bDROP\b/i)
    expect(executable).not.toMatch(/\bTRUNCATE\b/i)
    expect(executable).not.toMatch(/\bDELETE\b/i)
  })

  describe('add_proxy_to_slot', () => {
    const body = extractFunctionBody(sql, 'add_proxy_to_slot')

    it('reads the slot\u2019s requested printing and finish', () => {
      expect(body).toMatch(/SELECT dc\.copy_id, dc\.scryfall_id, dc\.requested_finish/)
      expect(body).toMatch(/v_slot_requested_finish/)
    })

    it('records the requested printing before falling back to the newest printing (borderless)', () => {
      const requestedIndex = body.indexOf('v_printing_id := v_slot_scryfall_id')
      const fallbackIndex = body.indexOf('ORDER BY rp.released_at DESC NULLS LAST')

      expect(requestedIndex, 'requested printing assignment should exist').toBeGreaterThan(-1)
      expect(fallbackIndex, 'newest-printing fallback should exist').toBeGreaterThan(-1)
      // The requested printing wins; the newest printing is only the ELSE branch.
      expect(requestedIndex).toBeLessThan(fallbackIndex)
      expect(body).toMatch(/IF v_slot_scryfall_id IS NOT NULL THEN/)
    })

    it('records the slot\u2019s requested finish, defaulting to nonfoil', () => {
      expect(body).toMatch(/COALESCE\(NULLIF\(btrim\(COALESCE\(v_slot_requested_finish/)
      expect(body).toMatch(/'nonfoil'/)
    })
  })

  describe('add_proxies_to_slots', () => {
    const body = extractFunctionBody(sql, 'add_proxies_to_slots')

    it('accepts a per-assignment printing and finish', () => {
      expect(body).toMatch(/v_assignment->>'printing_id'/)
      expect(body).toMatch(/v_assignment->>'finish'/)
    })

    it('falls back to the slot\u2019s own printing and finish when the assignment omits them', () => {
      expect(body).toMatch(/SELECT dc\.copy_id, dc\.card_name, dc\.scryfall_id, dc\.requested_finish/)
      expect(body).toMatch(/v_printing_id := COALESCE\(v_requested_printing_id, v_default_printing_id\)/)
    })

    it('uses the newest printing for the card name only when no printing is requested', () => {
      expect(body).toMatch(/IF v_requested_printing_id IS NOT NULL THEN/)
      expect(body).toMatch(/ORDER BY rp\.released_at DESC NULLS LAST, rp\.scryfall_id/)
    })
  })
})
