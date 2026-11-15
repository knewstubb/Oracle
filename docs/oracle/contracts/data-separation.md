# Contract: data separation (Gate 4 slice 1, CC-03a)

Status: DRAFT for owner approval. Nothing here has been applied to the live database.
Source: `docs/oracle/reports/2026-11-16-architect-claude-connector-audit.md` (H1, H2, H3, section 3). Live catalog re-read 2026-11-16 (read-only) against project "The Oracle".

Migration drafts (apply in either order, both before any connector goes online):

- `supabase/migrations/20261116100000_rls_own_row_policies.sql` (rollback: `supabase/drafts/20261116100000_rls_own_row_policies.rollback.sql`)
- `supabase/migrations/20261116100100_revoke_anon_user_data_rpcs.sql` (rollback: `supabase/drafts/20261116100100_revoke_anon_user_data_rpcs.rollback.sql`)

## 1. Goal

One person's decks, cards and copies are invisible and untouchable to everyone else, at the database, not only in route code. Two independent layers:

1. Row-level security (RLS): the database itself only returns/changes rows where `user_id = auth.uid()` for any client using a user's session.
2. Function lock-down: only the server (service_role) may run the user-data functions; the public site key (anon) and signed-in browsers may not.

Layer 3 (route-level owner checks, section 5) stays necessary: the server uses service_role, which bypasses RLS by design.

## 2. How the app reaches these tables today (checked before drafting)

- Every data read, write and `.rpc()` in `src/` uses `createAdminClient()` (service_role, bypasses RLS), or a SECURITY DEFINER function owned by postgres (also bypasses RLS). `[Confirmed: src/lib/supabase.ts; grep of src for .rpc( and .from(]`
- Anon-key clients exist in exactly four places and none read data tables: browser login form (`src/app/login/login-form.tsx`, auth only), `src/middleware.ts` (`auth.getUser`), `src/app/auth/callback/route.ts` (code exchange), `createAuthServerClient` in `src/lib/supabase-server.ts` (used only by `requireAuth`/`getAuthUser` and logout, auth only). `[Confirmed: grep createBrowserClient, createAuthServerClient, NEXT_PUBLIC_SUPABASE_ANON_KEY]`
- Scripts that use the anon key (`generate-coverage-report`, `check-insight-status`, `distill-commander` fallback) read only `ref_*` tables, which this slice does not touch. `[Confirmed: scripts/*]`
- Result: **nothing is expected to break.** No route reads these tables with an authenticated client, so no RLS policy is load-bearing for current behaviour. Flagged items:
  - `FORCE ROW LEVEL SECURITY` must NOT be used (would also bind the postgres-owned definer functions and break them).
  - No Supabase Realtime/`.channel(` use found, so nothing relies on anon/authenticated row streaming. `[Confirmed: grep]`
  - `src/lib/__tests__/command-zone-anon-denied.live.test.ts` is an existing live test of the same idea; extend it (section 7).
  - Any future code (including the connector) that uses a user-session client will now see only its own rows, which is the intent.

## 3. RLS: tables and policies (migration 20261116100000)

Live state `[Confirmed: live pg_class/pg_policy 2026-11-16]`: RLS OFF on all 22 below. Policies exist only on `user_copies` (four own-row policies, inert).

Tables (all carry `user_id uuid`, no `ref_*`/shared data): `decks`, `deck_cards`, `user_cards`, `user_copies`, `deck_notes`, `deck_versions`, `deck_combos`, `deck_documentation`, `deck_health`, `deck_mana_analysis`, `deck_overview_content`, `deck_priority`, `deck_ratings`, `deck_strategy`, `deck_upgrades`, `brew_sessions`, `debrief_actions`, `debrief_sessions`, `import_sleeve_claims`, `precon_mod_state`, `sync_runs`, `upgrade_change_log`.

Per table: `ENABLE ROW LEVEL SECURITY`; one policy `<table>_own_all` `FOR ALL TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (same)`. `user_copies` keeps its existing four policies. `(select auth.uid())` form is used so Postgres evaluates it once per query, not per row.

Also in the same migration:

- Table grants: live, `anon` holds every privilege (including TRUNCATE, which ignores RLS) and `authenticated` holds TRUNCATE/TRIGGER/REFERENCES. `[Confirmed: information_schema.role_table_grants for decks, deck_cards, user_cards, user_copies, deck_notes, sync_runs; Approximate for the other 16, assumed identical]`. Draft revokes all from `anon`, and TRUNCATE/TRIGGER/REFERENCES from `authenticated`. SELECT/INSERT/UPDATE/DELETE stay for `authenticated`, gated by the policies.
- View `collection_rollup` is owned by postgres and (without `security_invoker`) ignores RLS, readable by anon and authenticated. Set `security_invoker = true` and revoke anon. Nothing in `src/` reads it. `[Confirmed: grep]`

Primary/foreign keys, unique constraints and indexes: unchanged (no schema change). Policy predicates use `user_id`; the existing `user_id` indexes are assumed present on the hot tables `[Approximate]`. The Developer should confirm with `EXPLAIN` on `decks` and `user_copies` after applying that own-row queries still use an index; add `CREATE INDEX ... (user_id)` in a follow-up if not (not drafted, would be additive).

Atomicity: the migration is one transaction; either all 22 tables change or none.

Not covered, listed for later: `ref_cards`, `ref_commanders`, `ref_commander_cards`, `ref_commander_insights`, `precon_cards`, `sync_meta`, `commander_content`, `commander_strategies`, `_migrations` have RLS off. They are shared reference data, but anon likely has write grants on them (not checked here). Separate hardening item, no user-data impact.

## 4. Function lock-down (migration 20261116100100)

Live state `[Confirmed: live pg_proc.proacl 2026-11-16]`: all 50 functions below are executable by `anon`; 13 also by PUBLIC; 18 also by `authenticated`. Draft: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` then `GRANT EXECUTE ... TO service_role` on each.

The 50 functions are named in the migration file (full signatures, so overloads such as the two `finalize_import_claims` are handled). Highlights: destructive `delete_deck_with_release`, `replace_collection`, `replace_deck_with_new_cards`, `delete_user_copies`, `delete_user_copy`, `release_deck_copies`, `remove_deck_card_with_release`, `apply_ai_deck_delta`, `apply_collection_sync`, `apply_deck_cards_diff`, `reconcile_built_deck`, `delete_storage_location`; reads `get_deck_conflict_counts`, `get_import_*`, `get_active_oracle_session`, `get_collection_rollup`, `get_shared_cards`.

Already service_role-only and left alone: `confirm_chat_card_proposals`, `undo_chat_card_proposals`, `import_deck_with_intent`, `import_deck_with_intent_roles`, `set_deck_command_zone`. The trigger function `validate_deck_card_copy_identity` is left alone (triggers do not need caller EXECUTE).

Browser-side callers: **none.** Every `.rpc()` call site is in `src/app/api/**/route.ts` or `src/lib/*.ts` called from routes, using `createAdminClient()`; the browser client and `createAuthServerClient` are never used for `.rpc`. `[Confirmed: grep of .rpc( across src, client-construction check of src/lib/chat-proposal-route.ts, import-command-zone-save.ts, oracle/sessions/active/route.ts]`. The only live test that calls these as anon expects denial (`command-zone-anon-denied.live.test.ts`).

Safeguards in the migration: it raises an error if any listed signature no longer exists (so a drifted catalog is noticed, not silently skipped). It also sets default privileges so new functions created by postgres in `public` are not granted to PUBLIC/anon/authenticated (the cause of the 2026-11-13 patch).

Finding for the register: `get_collection_rollup(uuid)` and `get_shared_cards(uuid)` reference tables `card_definitions` / `physical_copies` / `oracle_to_printings` that no longer exist in the live catalog (live tables are `user_cards`, `user_copies`), and nothing in `src/` calls them. `[Confirmed: live catalog and function body; grep]`. They are dead and would fail if run. This contradicts the AGENTS.md line "get_collection_rollup RPC is live and confirmed working" (see report "Challenges"). They are revoked here regardless; dropping is a separate owner decision.

## 5. Owner-check fixes: Developer task list (route code, not drafted by Architect)

Rule: user id comes only from `requireAuth()` (`authResult.id`); a deck the caller does not own returns **404 `Deck not found`** (same as a missing deck, so existence is not leaked). All queries through `createAdminClient()` must include the owner filter.

### 5a. `src/app/api/decks/[id]/status/route.ts` (PATCH) `[Confirmed]`
1. Read `const userId = authResult.id` after the auth check.
2. Deck lookup (`from('decks').select('id, name, status').eq('id', deckId)`): add `.eq('user_id', userId)`.
3. Update (`from('decks').update({ status }).eq('id', deckId)`): add `.eq('user_id', userId)` (do not rely on the earlier check alone).
4. Keep 404 `Deck not found` when the lookup is empty.
5. Add a test: user B PATCHing user A's deck gets 404 and the row is unchanged.

### 5b. `src/app/api/decks/[id]/notes/route.ts` (GET) `[Confirmed]`
1. Read `userId` from `authResult.id`.
2. Before the notes query, `from('decks').select('id').eq('id', deckId).eq('user_id', userId).maybeSingle()`; if no row, return 404 `Deck not found`.
3. Add `.eq('user_id', userId)` to the `deck_notes` query as well.
4. Add a test: user B reading user A's deck notes gets 404, not the notes.

### 5c. `src/app/api/collection/stats/route.ts` `[Confirmed]`
`user_copies` and `user_cards` counts have no user filter (counts every user's rows). Add `.eq('user_id', userId)` to both. (`sync_meta` is shared reference data.)

### 5d. Other routes found lacking owner checks that touch these tables (LIST ONLY; not fixed here)
Criterion: route file touches a table in section 3 or an `.rpc(`, calls `requireAuth`, but contains no `user_id`/`userId`/`user.id`/`authResult.id` text. `[Confirmed by grep for the missing text; whether each really lacks an owner check needs a read of the file: Approximate]`. The Developer must read each file and either add the owner filter or note why a helper covers it.

Deck-scoped (deck id from URL, deck looked up by id only):
- `src/app/api/decks/[id]/upgrade/route.ts` (decks, deck_upgrades, upgrade_change_log, user_cards, user_copies, deck_cards)
- `src/app/api/decks/[id]/combos/route.ts` (decks, deck_combos)
- `src/app/api/decks/[id]/cards/[cardId]/categories/route.ts` (deck_cards)
- `src/app/api/decks/[id]/ratings/route.ts` (decks, deck_ratings)
- `src/app/api/decks/[id]/mana/route.ts` (decks, deck_mana_analysis)
- `src/app/api/decks/[id]/overview/route.ts` (decks, deck_overview_content)
- `src/app/api/decks/[id]/dead-weight/route.ts` and `.../dead-weight/dismiss/route.ts` (decks, deck_cards; two handlers in dismiss)

Collection and cross-deck (reads every user's rows):
- `src/app/api/collection/rollup/[cardDefinitionId]/route.ts` (user_cards, user_copies, deck_cards)
- `src/app/api/collection/allocation/route.ts` (decks, deck_cards, user_copies)
- `src/app/api/cards/[name]/decks/route.ts` (deck_cards)

AI and brew (session or deck by id, user copies read unscoped):
- `src/app/api/ai/mana-analysis/route.ts`, `ai/recommend/route.ts` (decks, deck_cards, user_copies)
- `src/app/api/ai/brew/generate/route.ts`, `ai/brew/refine/route.ts`, `ai/brew/confirm/route.ts`, `ai/brew/session/route.ts` (brew_sessions, user_copies, decks, deck_cards)
- `src/app/api/brew/commit/route.ts`, `brew/assess/route.ts`, `brew/positions/route.ts`, `brew/extract/route.ts` (brew_sessions)

Intentionally all-user, no change needed except a note when multi-user ships: `src/app/api/cron/refresh-prices/route.ts` (reads all `user_cards.card_name` to refresh shared price data; secret-header cron). Not exposed to users.

Not in the list because they do reference a user id (so not found by this method, but not individually verified): everything else under `src/app/api`. The audit's "about 40 files" re-audit remains open beyond this list.

## 6. Plain-language effects (for the owner)

What changes: the database starts enforcing "you only see your own decks, cards and copies" and stops answering to the public site key for anything personal. The app should look and behave exactly the same for you.

Can it be undone: yes. Each of the two changes has a ready-made undo script. Undoing re-opens the same gap that exists today.

What could go wrong:
- A screen or background job that secretly relied on the public key would show empty data or errors. The code check found none, and the plan below tests this on a copy first.
- If a function was missed from the list and is called from somewhere unexpected, that action fails with "permission denied". Fix: re-grant that one function to the server.
- Anything that later uses a signed-in browser session to read data (the connector might) sees only the signed-in person's rows, which is the point.
- Applying is quick; no data is changed or moved.

## 7. Verification plan (before and after apply; Tester/Developer)

1. Apply both migrations to a branch/test database first (not live) and run the full test suite and `npm run build`.
2. Live-style test (extend `command-zone-anon-denied.live.test.ts`): with the anon key, `select` from each of the 22 tables returns 0 rows or permission denied; `rpc('delete_deck_with_release', ...)` returns permission denied; `rpc('replace_collection', ...)` likewise.
3. Two-user test: user B's authenticated session cannot select/update/delete user A's `decks`, `deck_cards`, `user_cards`, `user_copies`; service-role routes still work for each user.
4. Route tests for 5a and 5b (cross-user returns 404, row unchanged).
5. Smoke on the live app after apply: open collection, open a deck, change a deck status, import preview, Oracle chat add + undo.
6. Re-run the catalog query: no `anon`/PUBLIC entry on the 50 functions, `relrowsecurity` true on the 22 tables.

Approval needed from the owner before apply (AGENTS.md rule 5 does not strictly cover these as destructive, but the project rule is owner approval for migrations).
