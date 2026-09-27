// Reproducible performance + equivalence harness for the import
// reconciliation RPCs (get_import_reconciliation, get_deck_conflict_counts,
// finalize_import_claims).
//
// Runs entirely in-process on PGlite (WASM Postgres 17). Never connects to a
// remote database. Seeds a synthetic dataset sized to the live collection
// (docs/oracle/reports/2026-09-28-architect-o005-reconciliation-timeout-fix.md),
// then for each function variant reports:
//   * EXPLAIN ANALYZE of the get_import_reconciliation body (params inlined),
//     printing every ref_printings node and correlated SubPlan
//   * wall-clock time of each RPC call
//   * byte equality of the fixed draft's output against the pre-fix draft
//     (and, for finalize, equality of the resulting deck_cards / user_copies /
//     user_cards / claims state)
//
// WASM Postgres is slower than native; compare variants, not absolute times.
//
// Setup (once, outside the repo):
//   npm install --prefix /tmp/oracle-pglite --save-exact @electric-sql/pglite@0.5.8
// Run:
//   PGLITE_MODULE=/tmp/oracle-pglite/node_modules/@electric-sql/pglite/dist/index.js \
//     node tests/db-perf/reconciliation-perf.mjs
// Optional env:
//   SKIP_SLOW=1   skip the slow (unfixed) variants except where needed for equivalence
//   PLAN_DIR=dir  write each variant's full EXPLAIN ANALYZE text to dir
// Exit code 1 if any equivalence check fails or the fixed read exceeds BUDGET_MS.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite')

const USER = '00000000-0000-0000-0000-00000000aaaa'
const BATCH = '26fd945c-ce3f-465f-8740-e3e707c4b041'
// Well under the ~8 s live statement_timeout even allowing for WASM overhead.
const BUDGET_MS = 2000

// Live volumes, from `supabase inspect db table-stats` on 2026-09-28.
const V = {
  refPrintings: 115_115,
  userCards: 2_614,
  userCopies: 3_855,
  deckCards: 3_812,
  claims: 1_744,
  decks: 39,
}

const FILES = {
  deployed: 'supabase/migrations/20260926140000_import_reconciliation_redesign.sql',
  before: 'tests/db-perf/fixtures/20260927120000.draft-before-perf-fix.sql',
  fixed: 'supabase/migrations/20260927120000_import_reconciliation_slot_states.sql',
}
const src = Object.fromEntries(
  Object.entries(FILES).map(([k, f]) => [k, readFileSync(resolve(repo, f), 'utf8')]),
)

function fnSql(variant, name) {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$;`)
  const m = src[variant].match(re)
  if (!m) throw new Error(`${name} not found in ${FILES[variant]}`)
  return m[0]
}

// The plpgsql body as a plain SELECT with parameters inlined, for EXPLAIN.
function inlineBody(fn, batch) {
  const body = fn.slice(fn.indexOf('BEGIN') + 5, fn.indexOf('RETURN v_result;'))
  return body
    .replace(/\bINTO v_result;/, '')
    .replace(/\bp_user_id\b/g, `'${USER}'::uuid`)
    .replace(/\bp_batch_id\b/g, batch ? `'${batch}'::uuid` : 'NULL::uuid')
    .replace(/\bp_include_resolved\b/g, 'false')
}

const SCHEMA = `
CREATE TABLE decks (id serial PRIMARY KEY, user_id uuid NOT NULL, name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true);
CREATE TABLE ref_printings (scryfall_id uuid PRIMARY KEY, oracle_id uuid NOT NULL,
  name text NOT NULL, set_code text NOT NULL, set_name text NOT NULL,
  collector_number text NOT NULL, image_uri_small text, image_uri_normal text,
  image_uri_large text, image_uri_art_crop text, pad text);
CREATE TABLE user_cards (id serial PRIMARY KEY, user_id uuid NOT NULL, oracle_id uuid NOT NULL,
  card_name text NOT NULL, UNIQUE (oracle_id, user_id));
CREATE TABLE user_copies (id serial PRIMARY KEY, user_id uuid NOT NULL,
  card_id integer NOT NULL REFERENCES user_cards(id), printing_id text,
  is_proxy boolean NOT NULL DEFAULT false, missing boolean NOT NULL DEFAULT false,
  finish text, location_id integer, source_tag text);
CREATE TABLE deck_cards (id serial PRIMARY KEY, user_id uuid NOT NULL,
  deck_id integer NOT NULL REFERENCES decks(id), card_name text NOT NULL,
  copy_id integer REFERENCES user_copies(id), scryfall_id text,
  ownership_status text, placement_source text);
CREATE TABLE import_sleeve_claims (id serial PRIMARY KEY, user_id uuid NOT NULL,
  batch_id uuid, deck_id integer NOT NULL, deck_cards_id integer NOT NULL,
  card_name text NOT NULL, printing_id text, selected_printing_id text,
  resolution text NOT NULL DEFAULT 'planned', wishlist boolean NOT NULL DEFAULT true,
  settled_at timestamptz, UNIQUE (deck_cards_id));

-- Indexes present on live (supabase inspect db index-stats, 2026-09-28).
CREATE INDEX idx_ref_printings_name ON ref_printings(name);
CREATE INDEX idx_ref_printings_oracle_id ON ref_printings(oracle_id);
CREATE INDEX idx_user_cards_card_name ON user_cards(card_name);
CREATE INDEX idx_user_cards_user_id ON user_cards(user_id);
CREATE INDEX idx_user_copies_card_id ON user_copies(card_id);
CREATE INDEX idx_user_copies_user_id ON user_copies(user_id);
CREATE INDEX idx_deck_cards_copy_id ON deck_cards(copy_id);
CREATE UNIQUE INDEX idx_deck_cards_unique_physical_copy ON deck_cards(copy_id) WHERE copy_id IS NOT NULL;
CREATE INDEX idx_deck_cards_deck ON deck_cards(deck_id);
CREATE INDEX idx_deck_cards_user_id ON deck_cards(user_id);
CREATE INDEX idx_deck_cards_name ON deck_cards(card_name);
CREATE INDEX idx_import_sleeve_claims_user_card ON import_sleeve_claims(user_id, card_name);
CREATE INDEX idx_import_sleeve_claims_user_batch ON import_sleeve_claims(user_id, batch_id);
CREATE INDEX idx_import_sleeve_claims_user_batch_printing
  ON import_sleeve_claims(user_id, batch_id, card_name, printing_id);
`

// Deterministic synthetic data at live volume. Every card has 3 catalogue
// printings (A, B, C). Copies are mostly printing A, some B; C is never owned
// (printing-mismatch rows). ~15% of claims are for cards the user owns no copy
// of (unowned rows). ~54% of copies are already held by a deck slot.
const SEED = `
SELECT setseed(0.42);
INSERT INTO decks (user_id, name) SELECT '${USER}', 'Deck ' || lpad(g::text, 2, '0')
  FROM generate_series(1, ${V.decks}) g;

-- 3 printings for each of (userCards + 400 unowned) cards, plus filler.
CREATE TEMP TABLE card_ids AS
  SELECT g AS n, md5('o' || g)::uuid AS oracle_id,
         md5('a' || g)::uuid AS pa, md5('b' || g)::uuid AS pb, md5('c' || g)::uuid AS pc
  FROM generate_series(1, ${V.userCards + 400}) g;
-- Filler first, so the real printings sit at the END of the heap: a
-- sequential scan that stops at the first match still reads most of the table,
-- as it would on live where physical order is arbitrary.
INSERT INTO ref_printings
  SELECT md5('f' || g)::uuid, md5('fo' || g)::uuid, 'Filler ' || g, 'F' || (g % 900), 'Filler set',
         g::text, 'https://x/s/' || g, 'https://x/n/' || g, 'https://x/l/' || g,
         'https://x/a/' || g, repeat(md5(g::text), 17)
  FROM generate_series(1, ${V.refPrintings - 3 * (V.userCards + 400)}) g;
INSERT INTO ref_printings
  SELECT p, c.oracle_id, 'Card ' || c.n, 'S' || (c.n % 90), 'Set ' || (c.n % 90), k::text,
         'https://cards.scryfall.io/small/front/' || p || '.jpg',
         'https://cards.scryfall.io/normal/front/' || p || '.jpg',
         'https://cards.scryfall.io/large/front/' || p || '.jpg',
         'https://cards.scryfall.io/art_crop/front/' || p || '.jpg',
         md5(p::text) || repeat(md5(c.n::text), 16)
  FROM card_ids c, LATERAL (VALUES (c.pa, 1), (c.pb, 2), (c.pc, 3)) v(p, k);

INSERT INTO user_cards (user_id, oracle_id, card_name)
  SELECT '${USER}', oracle_id, 'Card ' || n FROM card_ids WHERE n <= ${V.userCards} ORDER BY n;

-- One copy of printing A per card, then extra copies (A or B), a few proxies.
INSERT INTO user_copies (user_id, card_id, printing_id, finish)
  SELECT '${USER}', uc.id, c.pa::text, 'nonfoil'
  FROM user_cards uc JOIN card_ids c ON c.oracle_id = uc.oracle_id ORDER BY uc.id;
INSERT INTO user_copies (user_id, card_id, printing_id, finish)
  SELECT '${USER}', uc.id,
         CASE WHEN g % 3 = 0 THEN c.pb::text ELSE c.pa::text END,
         CASE WHEN g % 5 = 0 THEN 'foil' ELSE 'nonfoil' END
  FROM generate_series(1, ${V.userCopies - V.userCards - 60}) g
  JOIN card_ids c ON c.n = 1 + (g * 7) % ${900}
  JOIN user_cards uc ON uc.oracle_id = c.oracle_id;
INSERT INTO user_copies (user_id, card_id, printing_id, is_proxy, finish)
  SELECT '${USER}', uc.id, c.pa::text, true, 'nonfoil'
  FROM generate_series(1, 60) g
  JOIN card_ids c ON c.n = g * 11
  JOIN user_cards uc ON uc.oracle_id = c.oracle_id;

-- Held slots: the first N real copies are sleeved into decks.
INSERT INTO deck_cards (user_id, deck_id, card_name, copy_id, scryfall_id, ownership_status)
  SELECT '${USER}', 1 + (cp.id % ${V.decks}), ucard.card_name, cp.id, cp.printing_id, 'original'
  FROM user_copies cp JOIN user_cards ucard ON ucard.id = cp.card_id
  WHERE cp.is_proxy = false
  ORDER BY cp.id
  LIMIT ${V.deckCards - V.claims};

-- Open slots + one claim each. Card chosen so many cards get 2+ claims.
CREATE TEMP TABLE open_slots AS
  SELECT g,
         CASE WHEN g % 7 = 0 THEN ${V.userCards} + 1 + (g % 400)   -- unowned card
              ELSE 1 + (g * 13) % ${1400} END AS n,
         CASE WHEN g % 10 = 0 THEN 'c' WHEN g % 4 = 0 THEN 'b' ELSE 'a' END AS which,
         1 + (g * 17) % ${V.decks} AS deck_id
  FROM generate_series(1, ${V.claims}) g;
INSERT INTO deck_cards (user_id, deck_id, card_name, scryfall_id)
  SELECT '${USER}', s.deck_id, 'Card ' || s.n,
         (CASE s.which WHEN 'a' THEN c.pa WHEN 'b' THEN c.pb ELSE c.pc END)::text
  FROM open_slots s JOIN card_ids c ON c.n = s.n ORDER BY s.g;
INSERT INTO import_sleeve_claims (user_id, batch_id, deck_id, deck_cards_id, card_name,
                                  printing_id, resolution)
  SELECT '${USER}', '${BATCH}', dc.deck_id, dc.id, dc.card_name, dc.scryfall_id,
         CASE WHEN dc.id % 9 = 0 THEN 'sleeved' WHEN dc.id % 23 = 0 THEN 'proxy'
              ELSE 'planned' END
  FROM deck_cards dc WHERE dc.copy_id IS NULL ORDER BY dc.id;
-- A few alternate-printing overrides (A -> B) on owned cards.
UPDATE import_sleeve_claims c SET selected_printing_id = ci.pb::text
  FROM card_ids ci
  WHERE c.card_name = 'Card ' || ci.n AND c.printing_id = ci.pa::text AND c.id % 31 = 0;
-- Proxy decisions on cards the user owns no copy of: finalize must resolve the
-- card identity from ref_printings for each of these.
UPDATE import_sleeve_claims c SET resolution = 'proxy'
  WHERE c.id % 3 = 0
    AND NOT EXISTS (SELECT 1 FROM user_cards u WHERE u.card_name = c.card_name);
-- Edge cases for the uuid-cast guard: non-canonical and non-uuid printing ids
-- must not raise, and must match exactly what the old text join matched.
UPDATE import_sleeve_claims SET printing_id = upper(printing_id) WHERE id IN (5, 105);
UPDATE import_sleeve_claims SET printing_id = 'legacy-not-a-uuid' WHERE id IN (6, 106);
UPDATE import_sleeve_claims SET printing_id = ' ' || printing_id WHERE id = 7;
UPDATE import_sleeve_claims SET resolution = 'proxy' WHERE id IN (105, 106);
UPDATE user_copies SET printing_id = upper(printing_id) WHERE id IN (3001, 3002);
UPDATE user_copies SET printing_id = 'bad-printing' WHERE id = 3003;
ANALYZE;
`

async function freshDb() {
  const db = await PGlite.create()
  // Worst case for LIMIT-1 sequential lookups: without this, a scan resumes
  // where the previous one stopped, which flatters the unfixed finalize when
  // cards happen to be processed in heap order.
  await db.exec('SET synchronize_seqscans = off')
  await db.exec(SCHEMA)
  await db.exec(SEED)
  return db
}

async function timed(db, sql, params) {
  const t0 = performance.now()
  const r = await db.query(sql, params)
  return { ms: performance.now() - t0, row: r.rows[0] }
}

let failed = false
const fail = (msg) => { failed = true; console.log(`FAIL: ${msg}`) }

// ---------------------------------------------------------------------------
// 1. get_import_reconciliation — plans, timing, equivalence
// ---------------------------------------------------------------------------
{
  const db = await freshDb()
  const c = await db.query(`SELECT
    (SELECT count(*) FROM ref_printings)::int AS ref_printings,
    (SELECT count(*) FROM user_cards)::int AS user_cards,
    (SELECT count(*) FROM user_copies)::int AS user_copies,
    (SELECT count(*) FROM deck_cards)::int AS deck_cards,
    (SELECT count(*) FROM import_sleeve_claims WHERE settled_at IS NULL)::int AS unsettled_claims,
    (SELECT count(DISTINCT (card_name, printing_id)) FROM import_sleeve_claims)::int AS row_keys,
    (SELECT count(*) FROM import_sleeve_claims WHERE resolution = 'proxy')::int AS proxy_claims,
    (SELECT count(*) FROM decks)::int AS decks`)
  console.log('dataset', c.rows[0])

  const outputs = {}
  for (const v of ['deployed', 'before', 'fixed']) {
    const slow = v !== 'fixed'
    if (slow && process.env.SKIP_SLOW === '1' && v === 'deployed') continue
    const fn = fnSql(v, 'get_import_reconciliation')
    await db.exec(fn)
    console.log(`\n=== get_import_reconciliation: ${v} (${FILES[v]})`)

    if (!(slow && process.env.SKIP_SLOW === '1')) {
      const plan = (await db.query(`EXPLAIN (ANALYZE, COSTS OFF) ${inlineBody(fn, null)}`))
        .rows.map((r) => r['QUERY PLAN'])
      if (process.env.PLAN_DIR) {
        writeFileSync(resolve(process.env.PLAN_DIR, `get_import_reconciliation.${v}.plan.txt`), plan.join('\n') + '\n')
      }
      for (const l of plan) {
        if (/ref_printings|SubPlan|Execution Time/.test(l)) console.log('  plan:', l.trim())
      }
    }

    for (const batch of [null, BATCH]) {
      for (const inc of [false, true]) {
        const { ms, row } = await timed(db,
          'SELECT public.get_import_reconciliation($1::uuid, $2::uuid, $3)::text AS t',
          [USER, batch, inc])
        outputs[`${v}|${batch}|${inc}`] = row.t
        const j = JSON.parse(row.t)
        console.log(`  rpc scope=${batch ? 'batch' : 'all-claims'} include_resolved=${inc}: ${ms.toFixed(0)} ms, rows=${j.rows.length}, counts=${JSON.stringify(j.counts)}`)
        if (v === 'fixed' && ms > BUDGET_MS) fail(`fixed read took ${ms.toFixed(0)} ms > ${BUDGET_MS} ms`)
      }
    }
  }
  for (const batch of [null, BATCH]) {
    for (const inc of [false, true]) {
      const a = outputs[`before|${batch}|${inc}`]
      const b = outputs[`fixed|${batch}|${inc}`]
      const same = a === b
      console.log(`equivalence reconciliation scope=${batch ? 'batch' : 'all-claims'} include_resolved=${inc}: ${same ? 'IDENTICAL' : 'DIFFERENT'} (${a.length} chars)`)
      if (!same) fail('reconciliation output differs from pre-fix draft')
    }
  }

  // get_deck_conflict_counts — not changed by the perf fix; timed to confirm
  // it is not a second timeout at this volume.
  for (const v of ['before', 'fixed']) {
    await db.exec(fnSql(v, 'get_deck_conflict_counts'))
    const { ms, row } = await timed(db, 'SELECT public.get_deck_conflict_counts($1::uuid)::text AS t', [USER])
    outputs[`badge|${v}`] = row.t
    console.log(`\n=== get_deck_conflict_counts: ${v}: ${ms.toFixed(0)} ms, decks=${JSON.parse(row.t).decks.length}`)
  }
  if (outputs['badge|before'] !== outputs['badge|fixed']) fail('badge output differs')
  else console.log('equivalence get_deck_conflict_counts: IDENTICAL')
  await db.close()
}

// ---------------------------------------------------------------------------
// 2. finalize_import_claims — timing and resulting-state equivalence.
//    Each variant runs on its own freshly seeded (identical) database.
// ---------------------------------------------------------------------------
const STATE_SQL = `SELECT md5(string_agg(x, '|' ORDER BY x)) AS h, count(*)::int AS n FROM (
  SELECT 'dc:' || id || ':' || coalesce(copy_id::text,'-') || ':' || coalesce(ownership_status,'-')
         || ':' || coalesce(placement_source,'-') || ':' || coalesce(scryfall_id,'-') AS x FROM deck_cards
  UNION ALL SELECT 'uc:' || id || ':' || card_id || ':' || coalesce(printing_id,'-') || ':' || is_proxy
         || ':' || coalesce(location_id::text,'-') || ':' || coalesce(source_tag,'-') FROM user_copies
  UNION ALL SELECT 'ucard:' || id || ':' || oracle_id || ':' || card_name FROM user_cards
  UNION ALL SELECT 'claim:' || id || ':' || resolution || ':' || (settled_at IS NOT NULL) FROM import_sleeve_claims
) s`
const finalState = {}
for (const v of ['before', 'fixed']) {
  const db = await freshDb()
  await db.exec(fnSql(v, 'finalize_import_claims'))
  const { ms, row } = await timed(db, 'SELECT public.finalize_import_claims($1::uuid, $2::uuid)::text AS t', [USER, BATCH])
  const st = (await db.query(STATE_SQL)).rows[0]
  const created = (await db.query('SELECT count(*)::int AS n FROM user_cards')).rows[0].n - V.userCards
  finalState[v] = { result: row.t, hash: st.h }
  console.log(`\n=== finalize_import_claims: ${v}: ${ms.toFixed(0)} ms, result=${row.t}, user_cards created via ref_printings lookup=${created}, state hash=${st.h}`)
  await db.close()
}
if (finalState.before.result !== finalState.fixed.result || finalState.before.hash !== finalState.fixed.hash) {
  fail('finalize result or resulting state differs')
} else {
  console.log('equivalence finalize_import_claims (result + resulting state): IDENTICAL')
}

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS')
if (failed) process.exitCode = 1
