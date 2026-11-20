/**
 * Fill the shared card Tags (ref_card_tags) from the local Scryfall Oracle tag copy.
 *
 * Reads data/scryfall-tags/oracle-tags.jsonl (dated 7 Aug 2026; NOT refreshed here), maps it to the 40 Tags with
 * src/lib/card-tags.ts (the one mapping), and writes one row per (oracle_id, Tag) for every Commander-legal card in
 * ref_printings. No AI pass. Needs the draft supabase/drafts/20261120100000_tags_fill_tag_tables.draft.sql applied first.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/fill-card-tags.ts --dry-run [--user <uuid>]   counts only, writes nothing
 *   npx tsx scripts/fill-card-tags.ts                             real run: one new run id, rows added, safe to repeat
 *   npx tsx scripts/fill-card-tags.ts --undo-run <run-id>         removes the rows that run added
 * Options: --run-id <uuid> (use a chosen run id), --tags-file <path>, --psql-url <url> (throwaway local Postgres only).
 *
 * Uses NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (never committed).
 */
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildScryfallTagIndex, parseScryfallTagLines, formatDryRunReport, allMappedScryfallSlugs, CARD_TAG_KEYS, type CardTagRow, type CardTagSource } from '../src/lib/card-tags'
import { isUuid, parseFillArgs, runFill, type TagStore } from '../src/lib/card-tags-fill'

config({ path: resolve(process.cwd(), '.env.local') })

const PAGE = 1000

async function withRetry<T>(label: string, fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  let last = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await fn()
    if (!error) return data as T
    last = error.message
    await new Promise(r => setTimeout(r, 500 * attempt))
  }
  throw new Error(`${label} failed: ${last}`)
}

class SupabaseStore implements TagStore {
  constructor(private db: SupabaseClient) {}

  private async pagedOracleIds(table: string, column: string, value: string, order: string): Promise<string[]> {
    const out: string[] = []
    for (let from = 0; ; from += PAGE) {
      const rows = await withRetry<{ oracle_id: string | null }[]>(`read ${table}`, () =>
        this.db.from(table).select('oracle_id').eq(column, value).order(order).range(from, from + PAGE - 1)
      )
      for (const r of rows) if (r.oracle_id) out.push(r.oracle_id)
      if (rows.length < PAGE) return out
    }
  }
  loadLegalOracleIds() {
    return this.pagedOracleIds('ref_printings', 'legality_commander', 'legal', 'scryfall_id')
  }
  loadCollectionOracleIds(userId: string) {
    return this.pagedOracleIds('user_cards', 'user_id', userId, 'id')
  }
  async loadTagListKeys() {
    const rows = await withRetry<{ key: string }[]>('read ref_tag_list', () => this.db.from('ref_tag_list').select('key'))
    return rows.map(r => r.key)
  }
  async insertRows(rows: readonly CardTagRow[], source: CardTagSource, runId: string) {
    const before = await this.runCount(runId)
    const payload = rows.map(r => ({ oracle_id: r.oracle_id, tag_key: r.tag_key, source, run_id: runId }))
    await withRetry('write ref_card_tags', () =>
      this.db.from('ref_card_tags').upsert(payload, { onConflict: 'oracle_id,tag_key,source', ignoreDuplicates: true })
    )
    return (await this.runCount(runId)) - before
  }
  private async runCount(runId: string) {
    const { count, error } = await this.db.from('ref_card_tags').select('*', { count: 'exact', head: true }).eq('run_id', runId)
    if (error) throw new Error(`count failed: ${error.message}`)
    return count ?? 0
  }
  async deleteRun(runId: string) {
    const before = await this.runCount(runId)
    // One delete per Tag keeps each statement small.
    for (const key of CARD_TAG_KEYS) {
      await withRetry('delete ref_card_tags', () => this.db.from('ref_card_tags').delete().eq('run_id', runId).eq('tag_key', key))
    }
    return before - (await this.runCount(runId))
  }
  async countRows() {
    const { count, error } = await this.db.from('ref_card_tags').select('*', { count: 'exact', head: true })
    if (error) throw new Error(`count failed: ${error.message}`)
    return count ?? 0
  }
}

/** Throwaway local Postgres through psql. Refuses any host that is not this machine. */
class PsqlStore implements TagStore {
  constructor(private url: string) {
    const host = new URL(url).hostname
    if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('--psql-url is for a throwaway database on this machine only')
  }
  private sql(text: string): string {
    const bin = process.env.PSQL_BIN || '/opt/homebrew/opt/postgresql@17/bin/psql'
    const r = spawnSync(bin, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', this.url], { input: text, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    if (r.status !== 0) throw new Error(`psql failed: ${r.stderr}`)
    return r.stdout.trim()
  }
  private lines(text: string) {
    const out = this.sql(text)
    return out ? out.split('\n') : []
  }
  async loadLegalOracleIds() {
    return this.lines(`SELECT DISTINCT oracle_id FROM ref_printings WHERE legality_commander = 'legal' AND oracle_id IS NOT NULL`)
  }
  async loadCollectionOracleIds(userId: string) {
    if (!isUuid(userId)) throw new Error('bad user id')
    return this.lines(`SELECT oracle_id::text FROM user_cards WHERE user_id = '${userId}' AND oracle_id IS NOT NULL`)
  }
  async loadTagListKeys() {
    return this.lines('SELECT key FROM ref_tag_list')
  }
  async insertRows(rows: readonly CardTagRow[], source: CardTagSource, runId: string) {
    if (!isUuid(runId) || !rows.every(r => isUuid(r.oracle_id) && /^[a-z][a-z0-9_]*$/.test(r.tag_key))) throw new Error('bad row')
    const json = JSON.stringify(rows)
    const out = this.sql(
      `WITH ins AS (INSERT INTO ref_card_tags (oracle_id, tag_key, source, run_id)
         SELECT (x->>'oracle_id')::uuid, x->>'tag_key', '${source}', '${runId}'::uuid FROM jsonb_array_elements($rows$${json}$rows$::jsonb) x
         ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*) FROM ins`
    )
    return Number(out)
  }
  async deleteRun(runId: string) {
    if (!isUuid(runId)) throw new Error('bad run id')
    return Number(this.sql(`WITH d AS (DELETE FROM ref_card_tags WHERE run_id = '${runId}' RETURNING 1) SELECT count(*) FROM d`))
  }
  async countRows() {
    return Number(this.sql('SELECT count(*) FROM ref_card_tags'))
  }
}

function makeStore(psqlUrl: string | null): { store: TagStore; target: string } {
  if (psqlUrl) return { store: new PsqlStore(psqlUrl), target: `throwaway Postgres ${new URL(psqlUrl).host}` }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local)')
  return { store: new SupabaseStore(createClient(url, key, { auth: { persistSession: false } })), target: `hosted database ${new URL(url).host}` }
}

async function main() {
  const args = parseFillArgs(process.argv.slice(2))
  const { store, target } = makeStore(args.psqlUrl)
  console.log(`Target: ${target}`)

  if (args.undoRun) {
    const removed = await store.deleteRun(args.undoRun)
    console.log(`Undo run ${args.undoRun}: removed ${removed} rows. Rows left in ref_card_tags: ${await store.countRows()}`)
    return
  }

  const text = readFileSync(resolve(process.cwd(), args.tagsFile), 'utf8')
  const index = buildScryfallTagIndex(parseScryfallTagLines(text))
  const missing = allMappedScryfallSlugs().filter(s => !index.bySlug.has(s))
  if (missing.length) throw new Error(`Scryfall tags missing from the copy: ${missing.join(', ')}`)
  const copyDate = statSync(resolve(process.cwd(), args.tagsFile)).mtime.toISOString().slice(0, 10)

  const runId = args.runId ?? randomUUID()
  const result = await runFill(store, index, { dryRun: args.dryRun, runId, userId: args.userId, scryfallCopyDate: copyDate })
  console.log(formatDryRunReport(result.report))
  if (args.dryRun) {
    console.log('\nDry run: nothing was written.')
    return
  }
  console.log(`\nRun id: ${runId}`)
  console.log(`Rows planned: ${result.rowsPlanned}. New rows written: ${result.rowsInserted}. Rows in ref_card_tags now: ${await store.countRows()}`)
  console.log(`To undo this run:  npx tsx scripts/fill-card-tags.ts --undo-run ${runId}`)
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
