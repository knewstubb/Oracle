// Slice 1 (T-62): the command-zone migrations are already applied to the live DB and no real data may be
// written, so these tests read the migration SQL and check the rules it enforces. They do not run SQL.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'supabase', 'migrations')
const read = (f: string) => readFileSync(join(dir, f), 'utf8')

describe('command-zone migrations (static)', () => {
  const column = read('20261023170000_deck_cards_command_zone_role.sql')

  it('adds one nullable column without a default (existing rows stay NULL)', () => {
    expect(column).toMatch(/ADD COLUMN IF NOT EXISTS command_zone_role text;/)
    expect(column).not.toMatch(/command_zone_role text\s+(NOT NULL|DEFAULT)/i)
  })

  it('only allows partner, background, companion', () => {
    expect(column).toContain("IN ('partner', 'background', 'companion')")
  })

  it('rejects a companion that is a commander', () => {
    expect(column).toMatch(/deck_cards_companion_not_commander[\s\S]*command_zone_role IS DISTINCT FROM 'companion' OR is_commander IS NOT TRUE/)
  })

  it('requires partner/background rows to be commanders', () => {
    expect(column).toMatch(/deck_cards_partner_bg_are_commanders[\s\S]*command_zone_role = 'companion' OR is_commander IS TRUE/)
  })

  it('allows at most one companion and one partner-or-background per deck', () => {
    expect(column).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_deck_cards_one_companion[\s\S]*WHERE command_zone_role = 'companion'/)
    expect(column).toMatch(/uq_deck_cards_one_partner_or_background[\s\S]*IN \('partner', 'background'\)/)
  })

  it('does not delete or rewrite data', () => {
    expect(column).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE)\b/im)
  })

  it('RPCs are service_role only (no anon execute)', () => {
    for (const f of ['20261023170100_set_deck_command_zone.sql', '20261023170200_import_deck_with_intent_roles.sql']) {
      const sql = read(f)
      expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated;/)
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role;/)
      expect(sql).toContain('SECURITY DEFINER')
    }
  })
})
