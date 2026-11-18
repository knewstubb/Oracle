/**
 * CC-14 backfill of the card library (ref_cards). DRAFT, NOT APPLIED. Needs owner approval. See the README next to this file.
 *
 * Default is a DRY RUN: only reads, prints what would change, writes the change list to
 * supabase/drafts/cc14-backfill-ref-cards.manifest.json (a local file, not the database).
 *
 *   npx tsx supabase/drafts/cc14-backfill-ref-cards.ts --user-id <uuid>
 *   npx tsx supabase/drafts/cc14-backfill-ref-cards.ts --user-id <uuid> --env-file .env.testdb.local --apply   (rehearsal)
 *   npx tsx supabase/drafts/cc14-backfill-ref-cards.ts --rollback <manifest.json> ...                          (same guards)
 *
 * Writing needs ALL of: --apply (or --rollback), CC14_OWNER_APPROVED=yes, and either
 * TEST_DB_CONFIRMED=yes with a throwaway database passed by --env-file, or the --live flag.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import {
  applyPlan,
  buildPlan,
  formatPlan,
  planToManifest,
  rollbackManifest,
  writeRefusal,
  type BackfillDb,
  type FetchScryfallByOracleId,
  type LibraryTextRow,
  type Manifest,
  type OwnedCard,
} from '../../src/lib/ref-card-backfill-plan'
import type { RefCardRow, ScryfallCard } from '../../src/lib/ref-card-backfill'

const MANIFEST_PATH = resolve(__dirname, 'cc14-backfill-ref-cards.manifest.json')
const SCRYFALL_BATCH = 75
const SCRYFALL_DELAY_MS = 100

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}
const has = (name: string) => process.argv.includes(name)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function createDb(sb: SupabaseClient): BackfillDb {
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what}: ${error.message}`)
  }
  return {
    async readOwnedCardsWithoutLibraryRow(userId): Promise<OwnedCard[]> {
      const owned: OwnedCard[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb
          .from('user_cards')
          .select('card_name, oracle_id')
          .eq('user_id', userId)
          .order('card_name')
          .range(from, from + 999)
        fail('read user_cards', error)
        for (const r of data ?? []) owned.push({ name: r.card_name as string, oracleId: (r.oracle_id as string | null) ?? null })
        if (!data || data.length < 1000) break
      }
      const names = Array.from(new Set(owned.map(o => o.name)))
      const present = new Set<string>()
      for (const batch of chunk(names, 100)) {
        const { data, error } = await sb.from('ref_cards').select('name').in('name', batch)
        fail('read ref_cards', error)
        for (const r of data ?? []) present.add(r.name as string)
      }
      const seen = new Set<string>()
      return owned.filter(o => {
        if (present.has(o.name) || seen.has(o.name)) return false
        seen.add(o.name)
        return true
      })
    },
    async readSlashRowsWithoutText(): Promise<LibraryTextRow[]> {
      const { data, error } = await sb
        .from('ref_cards')
        .select('name, type_line, oracle_text')
        .like('name', '% // %')
        .is('oracle_text', null)
        .order('name')
        .limit(1000)
      fail('read slash rows', error)
      return (data ?? []) as LibraryTextRow[]
    },
    async findFrontFaceMatches(fronts) {
      const found = new Set<string>()
      for (const front of fronts) {
        const escaped = front.replace(/[\\%_]/g, c => `\\${c}`)
        const { data, error } = await sb.from('ref_cards').select('name').ilike('name', `${escaped} // %`).limit(5)
        fail('read front-face matches', error)
        for (const r of data ?? []) found.add(r.name as string)
        const exact = await sb.from('ref_cards').select('name').eq('name', front).limit(1)
        fail('read front-face matches', exact.error)
        for (const r of exact.data ?? []) found.add(r.name as string)
      }
      return Array.from(found)
    },
    async readOracleIdsByName(names) {
      const out = new Map<string, string>()
      for (const name of names) {
        const { data, error } = await sb.from('ref_printings').select('oracle_id').eq('name', name).limit(1)
        fail('read ref_printings', error)
        const id = data?.[0]?.oracle_id as string | undefined
        if (id) out.set(name, id)
      }
      return out
    },
    async insertIgnoringExisting(rows: RefCardRow[]) {
      const { data, error } = await sb
        .from('ref_cards')
        .upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
        .select('name')
      fail('insert ref_cards', error)
      return (data ?? []).map(r => r.name as string)
    },
    async updateWhereTextNull(name, patch) {
      const { data, error } = await sb
        .from('ref_cards')
        .update({ oracle_text: patch.oracle_text, type_line: patch.type_line })
        .eq('name', name)
        .is('oracle_text', null)
        .select('name')
      fail('update ref_cards', error)
      return (data ?? []).length > 0
    },
    async deleteByNames(names) {
      for (const batch of chunk(names, 50)) {
        const { error } = await sb.from('ref_cards').delete().in('name', batch)
        fail('delete ref_cards', error)
      }
    },
    async restoreText(name, previous) {
      const { error } = await sb
        .from('ref_cards')
        .update({ oracle_text: previous.oracle_text, type_line: previous.type_line })
        .eq('name', name)
      fail('restore ref_cards', error)
    },
  }
}

const fetchScryfall: FetchScryfallByOracleId = async oracleIds => {
  const found: ScryfallCard[] = []
  const notFound: string[] = []
  for (const batch of chunk(oracleIds, SCRYFALL_BATCH)) {
    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'User-Agent': 'TheOracle/1.0', Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: batch.map(oracle_id => ({ oracle_id })) }),
    })
    if (!res.ok) throw new Error(`Scryfall responded ${res.status}`)
    const body = (await res.json()) as { data: ScryfallCard[]; not_found?: Array<{ oracle_id?: string }> }
    found.push(...body.data)
    for (const nf of body.not_found ?? []) if (nf.oracle_id) notFound.push(nf.oracle_id)
    await sleep(SCRYFALL_DELAY_MS)
  }
  return { found, notFound }
}

/** The manifest of an earlier apply is the undo list: no run may overwrite it. */
function existingFileIsApplyManifest(): boolean {
  if (!existsSync(MANIFEST_PATH)) return false
  try {
    return (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest).mode === 'apply'
  } catch {
    return true // unreadable: treat as precious
  }
}

function safeManifestPath(): string {
  return existingFileIsApplyManifest()
    ? MANIFEST_PATH.replace('.json', `.${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    : MANIFEST_PATH
}

async function main() {
  const envFile = arg('--env-file')
  config({ path: envFile ? resolve(process.cwd(), envFile) : resolve(__dirname, '../../.env.local') })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const db = createDb(createClient(url, key))
  const guardBase = { live: has('--live'), envFileGiven: Boolean(envFile), env: process.env }

  const rollbackPath = arg('--rollback')
  if (rollbackPath) {
    const refusal = writeRefusal({ ...guardBase, apply: true }, '--rollback')
    if (refusal) {
      console.error(refusal)
      process.exit(1)
    }
    await rollbackManifest(db, JSON.parse(readFileSync(resolve(process.cwd(), rollbackPath), 'utf8')) as Manifest)
    console.log('Rollback finished.')
    return
  }

  const userId = arg('--user-id')
  if (!userId) {
    console.error('--user-id <uuid> is required')
    process.exit(1)
  }
  const wantsApply = has('--apply')
  if (wantsApply) {
    const refusal = writeRefusal({ ...guardBase, apply: true })
    if (refusal) {
      console.error(refusal)
      process.exit(1)
    }
  }

  const plan = await buildPlan(db, fetchScryfall, userId)
  console.log(formatPlan(plan))

  if (!wantsApply) {
    const dryPath = safeManifestPath()
    writeFileSync(dryPath, JSON.stringify(planToManifest(plan, 'dry-run'), null, 2) + '\n')
    console.log(`\nDry run only. Planned change list written to ${dryPath}`)
    return
  }
  const manifest = await applyPlan(db, plan)
  const path = safeManifestPath()
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\nApplied: ${manifest.inserted.length} inserted, ${manifest.updated.length} updated. Undo list: ${path}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
