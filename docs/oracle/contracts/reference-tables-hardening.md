# Contract: reference-tables hardening (CC-03b, plan only)

Status: PLAN. No migration file is written for this; the owner approves the plan first, then the Architect drafts the SQL.
Follows `data-separation.md` (CC-03a), which covered user-owned tables and functions. This one covers the 18 shared card-reference tables.

## 1. Problem (live read-only check 2026-11-16, supplied by Gene)

- The anonymous role (the public site key every browser gets) holds ALL privileges, including TRUNCATE, on 18 tables:
  `_migrations`, `commander_content`, `commander_strategies`, `precon_cards`, `ref_build_cards`, `ref_cards`, `ref_commander_builds`, `ref_commander_cards`, `ref_commander_insights`, `ref_commander_role_targets`, `ref_commander_taxonomy`, `ref_commanders`, `ref_edhrec_recommendations`, `ref_precons`, `ref_printings`, `ref_rulings`, `ref_taxonomy`, `sync_meta`.
- RLS is OFF on 9 of them (`_migrations`, `commander_content`, `commander_strategies`, `precon_cards`, `ref_cards`, `ref_commander_cards`, `ref_commander_insights`, `ref_commanders`, `sync_meta`), so anyone with the public key can read, rewrite or empty them. RLS is ON for the other 9, but with ALL granted to anon the outcome depends on policies that have not been reviewed here (see Open question 2).
- Impact: someone with the public key could wipe `ref_cards` or `ref_printings`, which every search, import and deck screen depends on.

## 2. Who actually uses these tables (grep of `src/` and `scripts/`, 2026-11-16)

Key finding: **the app never reads these tables with the anon key.** `[Confirmed: src/lib/supabase.ts, src/lib/supabase-server.ts]`

- All 158+ data call sites in `src/` use `createAdminClient()` (service_role, bypasses RLS and grants). `[Confirmed: grep "from '@/lib/supabase'"]`
- The only anon-key clients in `src/` are `createBrowserClient()` (used only by `src/app/login/login-form.tsx`) and `createAuthServerClient()` (used only by `src/lib/auth.ts` and `src/app/actions/auth.ts`), plus `src/middleware.ts` and `src/app/auth/callback/route.ts`. These do sign-in/session only; none call `.from()` on these tables. `[Confirmed: grep]`
- Scripts: nearly all use `SUPABASE_SERVICE_ROLE_KEY`. Three use the anon key `[Confirmed: grep]`:
  - `scripts/check-insight-status.js` — reads `ref_commanders`, `ref_commander_insights`
  - `scripts/generate-coverage-report.js` — reads `ref_commanders`, `ref_commander_insights`
  - `scripts/distill-commander.ts` — falls back to the anon key only if the service key is missing; it INSERTs into `ref_commander_insights` (a write; the fallback should be removed, see 5.3).

Writers (all service_role): `ref_cards`/`ref_printings` (cron price refresh, `card-data-sync.ts`), `sync_meta` (`card-data-sync.ts`), `ref_commanders`/`ref_commander_cards` (`commander-resolver.ts`, sync scripts), `ref_commander_insights`, `ref_commander_taxonomy`, `ref_taxonomy`, `ref_build_cards`, `ref_commander_builds`, `ref_precons` (sync scripts). `[Confirmed: grep of .insert/.upsert/.update/.delete]`

Tables with **no reference anywhere** in `src/` or `scripts/` (apart from generated types and one-off SQL): `_migrations`, `commander_content`, `commander_strategies`, `precon_cards`, `ref_edhrec_recommendations`, `ref_commander_role_targets` (the last has only generated-type references), `ref_rulings` (only `scripts/migrations/add-ref-rulings.sql`, `scripts/export-sqlite.ts`, `scripts/load-postgres.ts`, `scripts/db-audit.ts`). `[Confirmed: grep]` These look like legacy or loader-only tables; this plan does not drop them.

## 3. Target state

| Group | Tables | anon | authenticated | service_role |
|---|---|---|---|---|
| A. Card reference data (read-only for clients) | `ref_cards`, `ref_printings`, `ref_rulings`, `ref_taxonomy`, `ref_commander_taxonomy`, `ref_commanders`, `ref_commander_cards`, `ref_commander_builds`, `ref_build_cards`, `ref_commander_insights`, `ref_commander_role_targets`, `ref_edhrec_recommendations`, `ref_precons` | SELECT only | SELECT only | ALL |
| B. Internal / unreferenced | `_migrations`, `sync_meta`, `commander_content`, `commander_strategies`, `precon_cards` | nothing | nothing | ALL |

Reasons:
- Group A is public MTG data (no user content), so SELECT stays for anon and authenticated. This keeps the three anon-key scripts working and does not block a future multi-user app that reads reference data with a user session. Nothing writes with those roles, so INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES are revoked.
- Group B holds sync bookkeeping or unreferenced data. No client needs it; revoke everything from anon and authenticated.
- RLS: enable RLS on every table where it is OFF. Group A gets one policy `ref_public_read` `FOR SELECT TO anon, authenticated USING (true)` (only on tables lacking a SELECT policy). Group B gets RLS on and no policy (deny by default). service_role bypasses RLS, so the app is unaffected. This is defence in depth: a future accidental `GRANT` cannot expose writes.
- `ALTER DEFAULT PRIVILEGES` is already handled for functions in CC-03a; add the same for tables so new tables created by postgres in `public` are not auto-granted to anon: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;`. Note this also affects future user tables, which already get explicit grants + RLS in their own migrations; call this out when approving.

Not in scope: user-owned tables (CC-03a), views, storage buckets, dropping the unreferenced tables.

## 4. Migration plan (forward-only, with undo)

Single transaction, one file, name to be chosen when drafted (next number after `20261116110000`). Steps:

1. **Pre-flight capture (read-only, before applying).** Save the current state so the undo is exact, not guessed:
   ```sql
   -- grants
   SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
   FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
     AND table_name IN ('_migrations','commander_content','commander_strategies','precon_cards','ref_build_cards','ref_cards','ref_commander_builds','ref_commander_cards','ref_commander_insights','ref_commander_role_targets','ref_commander_taxonomy','ref_commanders','ref_edhrec_recommendations','ref_precons','ref_printings','ref_rulings','ref_taxonomy','sync_meta')
   GROUP BY 1,2 ORDER BY 1,2;
   -- rls flag and policies
   SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname = ANY(ARRAY[<same 18 names>]);
   SELECT tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename = ANY(ARRAY[<same 18 names>]);
   ```
   Store the output in the report for the apply. The undo file is generated from it.
2. `REVOKE ALL ON <table> FROM anon, authenticated, PUBLIC;` for all 18.
3. Group A: `GRANT SELECT ON <table> TO anon, authenticated;`
4. `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;` for the 9 with RLS off, and for Group B.
5. Group A: create `ref_public_read` SELECT policy where no permissive SELECT policy exists (guard with `IF NOT EXISTS (SELECT 1 FROM pg_policies ...)`), plus drop any existing policy that permits write for `anon`/`authenticated` (list from the capture; expected none to rely on).
6. Default privileges revoke (see section 3).
7. Fail-loud guard like CC-03a: a `DO` block that raises if any listed table is missing.

Undo (`.rollback.sql`): re-GRANT ALL to anon and authenticated on the 18 tables, `DISABLE ROW LEVEL SECURITY` on the 9 that were off, drop `ref_public_read` where the migration created it, and reverse the default-privileges change. Reversible: yes, because this changes only privileges and flags, not data. The undo restores exposure, so use it only if the app breaks. Re-check the capture from step 1 against the rollback result.

Ordering: independent of CC-03a migrations and of the dead-objects drop (`supabase/drafts/20261116110000_drop_dead_collection_rollup.sql`). Apply before any connector or multi-user work goes online.

## 5. Tests

5.1 **Anon denial (live test, mirror `src/lib/__tests__/command-zone-anon-denied.live.test.ts`)** against the test copy and then production read-only: with the anon key, for each of the 18 tables: `.insert`, `.update`, `.delete` return a permission error and change zero rows; Group B `.select` returns a permission error; Group A `.select` returns rows.
5.2 **TRUNCATE check** via catalog, not by truncating: `SELECT has_table_privilege('anon','public.<t>','TRUNCATE')` is false for all 18 for anon and authenticated.
5.3 **App regression:** run the existing unit suite (`vitest`) and the Playwright smoke path (search a card, open a commander page, open a precon, import preview) against the test copy with service_role. Expect no change. Separately run `scripts/check-insight-status.js` and `scripts/generate-coverage-report.js` with the anon key: they must still read. Before apply, remove the anon-key fallback in `scripts/distill-commander.ts` (Developer task) so a missing service key fails loudly instead of attempting a write that will now be denied.
5.4 **Catalog diff:** re-run the step 1 capture after apply and compare to the target table in section 3.
5.5 **Sync jobs:** run one cron price refresh and one `sync_meta` write through service_role on the test copy and confirm success.

## 6. Test-copy requirement

Supabase branching is unavailable on this plan and a true copy of the database is not currently possible. `[Approximate: per Gene/owner brief]`. Because this migration changes only privileges, the risk is access errors, not data loss, so the requirement is:

- **Minimum (required before applying to production):** a throwaway Supabase project (free tier is fine) loaded with the schema only (`supabase db dump --schema-only` or replaying `supabase/migrations/` plus reference data from `scripts/load-postgres.ts`), with the same roles and the same grants from the step 1 capture applied first so it starts in the "wide open" state. Run sections 4 and 5 there. The project needs its own anon/service keys; production keys must not be used in test.
- **If that cannot be built:** do not apply to production on the strength of reading alone. The fallback is applying inside a transaction in production with an immediate scripted check (5.1, 5.2) and `ROLLBACK` if anything fails, plus the owner accepting that the app's service_role paths are untested against the new state. This is a weaker guarantee and needs explicit owner approval.
- The test project is not a substitute for a data backup. Before applying, the owner confirms a recent Supabase backup/point-in-time restore point exists (not verified here).

## 7. Risks

- A hidden anon-key consumer outside this repo (another tool, a Supabase dashboard integration, a saved connector) would lose read access to Group B and all writes. Mitigation: review Supabase API logs for anon-role requests to these tables for the past 30 days before applying (`query_logs`, read-only) and carry the result in the apply report.
- `_migrations` is not tracked in `supabase/migrations/` (the Supabase ledger is `supabase_migrations`); confirm nothing reads it before group B revoke. No code references it. `[Confirmed: grep]`
- Group A open SELECT to anon means reference data is publicly readable with the key; it is public MTG data, but `ref_commander_insights` includes generated analysis text. If that is considered proprietary, move it to Group B and give the three scripts the service key. See Open question 1.

## 8. Open questions (owner)

1. Is the AI-generated commander analysis (stored in `ref_commander_insights`) fine to be readable by anyone with the site key, or should it be private? Recommendation: private is safer; the cost is the two helper scripts need the server key.
2. Which existing policies exist on the 9 RLS-on tables? Gene or the Tester should read `pg_policies` (step 1 capture) before the SQL is drafted. Not read here by design.
3. Are `commander_content`, `commander_strategies`, `precon_cards`, `ref_edhrec_recommendations`, `ref_commander_role_targets`, `ref_rulings` still wanted? Nothing in code uses them. Dropping needs separate owner approval.
