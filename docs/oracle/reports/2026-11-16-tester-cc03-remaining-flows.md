# Report: cc03-remaining-flows
Role: Tester
Status: PARTIAL
Task as received: Check the flows NOT yet exercised against the lockdown (cron routes, card-data refresh, allocation, reconcile, brew, collection import and replace, deck delete): trace client and tables/RPCs, cross-check against live grants, exercise where safe, never touch the owner's data, report PASS/FAIL/UNVERIFIED with fixes.

## Summary for the owner
None of these features broke because of the lockdown: the app reads and writes through the server's private key, which the lockdown deliberately left working. The risky actions (replace collection, delete deck, import commit) were not run on your data; I confirmed the database functions they call still exist with the right inputs and that only the server can run them. One real gap found: your storage location names (e.g. "Trade Binder") can still be read by anyone holding the public site key.

## Key finding on how the app talks to the database
- Every data route and library uses the server (service-role) client, `createAdminClient` in `src/lib/supabase.ts`. [Confirmed]
- The public-key (anon) client is used only for sign-in and session checks (`src/lib/auth.ts`, `src/middleware.ts`, `src/app/auth/callback/route.ts`, `src/app/actions/auth.ts`, login form). No data table or function is read with it. [Confirmed by grep]
- Live check: all 35 database functions the app calls exist, are executable by service_role, and not by anon or signed-in users. `exec_sql` does not exist live but is used only by the one-off script `scripts/load-postgres.ts`. Signatures of `delete_deck_with_release`, `replace_collection`, `apply_collection_sync`, `reconcile_built_deck` match the code's argument names. No service-only function relies on `auth.uid()`, so running as server (no user) is fine.
- Live check: service_role can read and write every table the app uses (bypasses row security). Simulated as server in a rolled-back transaction: user_cards 2650, ref_cards 32533, sync_meta 3, ref_commander_insights 6459 all readable.

## Results
| Flow | Result | Evidence |
|---|---|---|
| Cron refresh-prices | PASS (static + auth check) | Admin client reads `user_cards`, upserts `ref_cards` (service role has write). `GET` without secret returns 401 (live on :3000). No dry-run exists and `CRON_SECRET` is not in `.env.local`, so a full run was not done (it would write reference data). Marked as not run end to end. |
| Cron sync-scryfall | UNVERIFIED / likely FAIL (not lockdown) | 401 without secret. Route calls Supabase Edge Function `scryfall-sync`; `list_edge_functions` shows no edge functions deployed in the live project, so the 10:00 UTC cron would return an error. Pre-existing, unrelated to the lockdown. Fix: deploy the function or drop the cron entry in `vercel.json` and rely on the in-app card-data refresh. |
| Card-data refresh | PASS (status) / UNVERIFIED (run) | `GET /api/card-data/refresh` 200: last sync 2026-10-29, stale 17 days, 119,972 printings (reads `sync_meta` and `ref_printings` via admin, which anon can no longer read, proving the server key works). `POST` not run: it downloads the full Scryfall bulk and rewrites reference printings. Static trace: only `ref_printings` upsert and `sync_meta` upsert via admin; both writable by service_role. |
| Allocation (read) | PASS | `GET /api/allocation/candidates?cardName=Sol Ring` 200 (ranked copies); `GET /api/allocation/valid-decks` 200; `GET /api/collection/allocation` 200. Write routes (`assign`, `assign-free-copy`, `reassign-to-deck`, `claim-from-deck`, `add-proxy`, `replace-with-original`, `undo`, deck `allocate`) all use admin and call RPCs confirmed service-only live; not run (they move physical copies). |
| Reconcile | PASS | `GET /api/reconcile/overused` 200 with real overuse rows (admin reads decks, deck_cards, user_cards, user_copies). `reconcile_built_deck` / `get_import_reconciliation` present, service-only. |
| Brew | PASS (read) / UNVERIFIED (writes) | `GET /api/brew/session?id=175` 200 (reads `brew_sessions`, admin). `brew/save`, `commit`, `skeleton`, `chat`, `assess`, `extract`, `positions` all use admin; AI-calling ones not run (cost, writes). |
| Collection import preview | PASS | `POST /api/collection/import/preview` with a 1-row CSV: 200, resolved Sol Ring printing, nothing written. Resolver uses admin on `ref_printings`/`user_cards`/`user_copies`. |
| Collection import commit and replace | UNVERIFIED by design (static PASS) | Not run on live data. `executeManaBoxCollectionImport` and `import-engine-v2` use admin, call `apply_collection_sync(p_user_id, p_remove_copy_ids, p_insert_rows)` and `replace_collection(p_user_id, p_insert_rows)`; both exist live, executable only by service_role, signatures match. |
| Deck delete | UNVERIFIED by design (static PASS) | `DELETE /api/decks/[id]` uses admin; checks ownership on `decks`, then `delete_deck_with_release(p_deck_id, p_user_id)`; exists, service-only, signature matches. Not run. |
| Other reads sampled | PASS | `/api/collection/export` 200 (562 KB), `/value`, `/rollup`, `/stats`, `/api/precons` and one precon, `/api/import/destinations`, `/api/decks/1599593569` and `/health` all 200. Dev log: zero "permission denied"/42501 entries. |

## Issues found
1. **Storage locations readable by the public key (security gap, not a break).** `user_locations` has the policy `locations_service_all` (command ALL, role public, condition `true`) and anon keeps full table grants. Anon REST `GET /rest/v1/user_locations` returned 200 with real rows (13 rows exist, with user_id). Because the policy applies to everyone, anon could also modify them. Fix (Developer/Gene): drop `locations_service_all` (service role bypasses RLS anyway) and revoke anon privileges on `user_locations`.
2. **Five more user tables still give anon full table grants** (RLS on, own-rows policies, anon sees nothing today): `chat_card_proposals`, `deck_card_alerts`, `deck_folders`, `oracle_messages`, `oracle_sessions`. Anon REST returned `[]`. These were outside the 22-table list. Fix: revoke all from anon (and TRUNCATE/TRIGGER/REFERENCES from authenticated) as done for the other 22.
3. **`ref_commander_insights` is closed to anon live** (anon REST 401). Gene's report says it was left readable. Nothing in the app breaks (route and scripts use the service key), but the report and the stated open question are out of date.
4. **Brew session read has no owner check.** `GET /api/brew/session?id=` selects by id only using the admin client, so any signed-in user could read another user's session. Not a lockdown regression; matters for the multi-user plan. Fix: add `.eq('user_id', authResult.id)` (same for the PATCH/DELETE routes; I only checked GET).
5. Not caused by lockdown, repeated from earlier report: table `user_preferences` does not exist live; `card_metadata`, `oracle_to_printings`, `printing_set_info` also do not exist (used only by old scripts).

## Changed files
- docs/oracle/reports/2026-11-16-tester-cc03-remaining-flows.md: this report (no product code touched)

## New decisions made (need owner confirmation)
- none

## Assumptions
- The dev server on :3000 uses the owner's local auto-login and the service-role key from `.env.local`, the same as production on Vercel (not verified for Vercel's env).

## Challenges to locked decisions
- none

## Open questions
- Keep the daily Scryfall sync cron, given there is no edge function to call?
- Apply the extra lockdown on `user_locations` and the five tables above?

## Verification
- grep of client creation across `src` and `scripts`: data access admin-only, anon for auth only.
- Read-only SQL: function existence/ACL/signatures, table grants/RLS/policies, rolled-back service_role read. No writes.
- Anon-key REST probes (select limit 1; empty-body RPC calls): user_cards, decks, sync_meta, ref_commander_insights 401; ref_cards 200; user_locations 200 (gap); RPCs not exposed to anon.
- Dev server GET calls and one preview POST listed above: all 200. No `POST`/`PATCH`/`DELETE` against live data.
- Row counts not changed (no writes made).
