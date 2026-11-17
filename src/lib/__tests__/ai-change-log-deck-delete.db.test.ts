// Runs the real ai_change_log migrations on a THROWAWAY local Postgres (temp folder, unix socket only).
// Never touches the live database. Skipped when Postgres binaries are not installed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PG_BIN = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin'].find(d =>
  existsSync(join(d, 'initdb'))
)
const migrations = join(process.cwd(), 'supabase', 'migrations')
const USER = '00000000-0000-0000-0000-000000000001'

describe.skipIf(!PG_BIN)('deleting a deck that Claude edited (throwaway database)', () => {
  let dir = ''
  const bin = (n: string) => join(PG_BIN!, n)
  const psql = (sql: string) =>
    spawnSync(bin('psql'), ['-h', dir, '-d', 'postgres', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' })
  const ok = (sql: string) => {
    const r = psql(sql)
    if (r.status !== 0) throw new Error(r.stderr)
    return r.stdout.trim()
  }
  const file = (f: string) => {
    const r = spawnSync(bin('psql'), ['-h', dir, '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', join(migrations, f)], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(r.stderr)
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'oracle-pg-'))
    execFileSync(bin('initdb'), ['-D', join(dir, 'data'), '-U', process.env.USER ?? 'postgres', '-A', 'trust'], { stdio: 'ignore' })
    execFileSync(bin('pg_ctl'), ['-D', join(dir, 'data'), '-o', `-c listen_addresses= -k ${dir}`, '-w', '-l', join(dir, 'log'), 'start'], { stdio: 'ignore' })
    ok(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
        CREATE TABLE public.decks (id serial PRIMARY KEY, user_id uuid NOT NULL, name text);
        CREATE TABLE public.connector_connections (id uuid PRIMARY KEY);
        INSERT INTO auth.users VALUES ('${USER}');`)
    file('20261116150000_ai_change_log_and_pending.sql')
    file('20261117120000_ai_change_log_allow_deck_delete.sql')
  }, 60000)

  afterAll(() => {
    if (!dir) return
    spawnSync(bin('pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', 'stop'], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  })

  const seed = () => {
    ok(`INSERT INTO decks (id, user_id, name) VALUES (101, '${USER}', 'A'), (102, '${USER}', 'B'), (103, '${USER}', 'C');
      INSERT INTO ai_pending_changes (id, user_id, client_name, kind, action, reason, deck_id, other_deck_id, card_count, payload, payload_hash, preview)
        VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '${USER}', 'Claude', 'copy_move', 'copy_move', 'card_move', 101, 102, 1, '{}', 'h1', '{}');
      INSERT INTO ai_change_log (id, user_id, group_id, client_name, kind, deck_id, other_deck_id, card_name, pending_id)
        VALUES ('bbbbbbbb-0000-0000-0000-000000000001', '${USER}', gen_random_uuid(), 'Claude', 'copy_move', 101, 102, 'Sol Ring', 'aaaaaaaa-0000-0000-0000-000000000001'),
               ('bbbbbbbb-0000-0000-0000-000000000002', '${USER}', gen_random_uuid(), 'Claude', 'deck_add', 103, NULL, 'Island', NULL);
      UPDATE ai_change_log SET undone_at = now(), undone_by = 'owner' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';`)
  }

  it('deletes decks used as deck_id and other_deck_id, keeping the log rows with empty deck references', () => {
    seed()
    ok('DELETE FROM decks WHERE id = 101')
    expect(ok(`SELECT deck_id IS NULL, other_deck_id, card_name, deck_name IS NULL FROM ai_change_log WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'`)).toBe('t|102|Sol Ring|t')
    ok('DELETE FROM decks WHERE id = 102')
    expect(ok(`SELECT deck_id IS NULL AND other_deck_id IS NULL FROM ai_change_log WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'`)).toBe('t')
    expect(ok(`SELECT deck_id IS NULL AND other_deck_id IS NULL FROM ai_pending_changes`)).toBe('t')
    // an already-undone row must not block the delete either, and stays undone
    ok('DELETE FROM decks WHERE id = 103')
    expect(ok(`SELECT deck_id IS NULL, undone_by FROM ai_change_log WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'`)).toBe('t|owner')
    expect(ok('SELECT count(*) FROM ai_change_log')).toBe('2')
  })

  it('still refuses edits to any other log field, and manual clearing of a deck that still exists', () => {
    ok(`INSERT INTO decks (id, user_id, name) VALUES (201, '${USER}', 'D');
      INSERT INTO ai_change_log (id, user_id, group_id, client_name, kind, deck_id, card_name)
        VALUES ('bbbbbbbb-0000-0000-0000-000000000003', '${USER}', gen_random_uuid(), 'Claude', 'deck_add', 201, 'Forest')`)
    const id = `'bbbbbbbb-0000-0000-0000-000000000003'`
    for (const set of [`card_name = 'Other'`, `deck_name = 'x'`, `deck_id = NULL`, `deck_id = 999`, `after = '{"a":1}'`, `approved_by_owner = true`]) {
      const r = psql(`UPDATE ai_change_log SET ${set} WHERE id = ${id}`)
      expect(r.status, set).not.toBe(0)
      expect(r.stderr, set).toContain('ai_change_log_is_append_only')
    }
    ok(`UPDATE ai_change_log SET undone_at = now(), undone_by = 'owner' WHERE id = ${id}`)
    expect(psql(`UPDATE ai_change_log SET undone_by = 'claude' WHERE id = ${id}`).stderr).toContain('ai_change_log_already_undone')
    // deleting a deck never changes another field
    ok('DELETE FROM decks WHERE id = 201')
    expect(ok(`SELECT card_name, deck_id IS NULL FROM ai_change_log WHERE id = ${id}`)).toBe('Forest|t')
  })
})
