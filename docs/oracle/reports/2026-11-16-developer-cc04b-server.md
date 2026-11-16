# Report: CC-04b server half (safe edits with Undo)
Role: Developer (server)
Status: DONE (server half; see "Not verified")
Task as received: implement the SERVER half of `docs/oracle/contracts/claude-connector-slice-b.md` (+ `.types.ts`): database migrations applied and verified, RPCs exercised on throwaway rows, connector edit tools, cookie-only API routes for the UI, tests.

## Summary for the owner
The behind-the-scenes part is built and live. Claude can make small edits (up to 10 cards) that you can undo for 7 days, and bigger edits or card moves wait for your yes. It can never delete a card from your collection. The screens that show this are the other Developer's job. Nothing the owner owns was touched while testing (throwaway user, deleted).

## Step 1: database (DONE, live)
- Final migration files (renamed because `20261116140000` collided with an existing version):
  - `supabase/migrations/20261116150000_ai_change_log_and_pending.sql` (2 new tables)
  - `supabase/migrations/20261116150100_ai_connector_edit_rpcs.sql` (23 new functions)
  - Rollbacks: `supabase/drafts/20261116150000_ai_change_log_and_pending.rollback.sql`, `supabase/drafts/20261116150100_ai_connector_edit_rpcs.rollback.sql`.
- Validated first inside a transaction forced to roll back (tables: wrapped in BEGIN...ROLLBACK; functions: a DO block that ran all the SQL and then raised `DRYRUN_OK funcs=23`). Afterwards the objects did not exist. No SQL fixes were needed at this step.
- Applied with `apply_migration` (additive only: two new tables, new functions; no statement touched an existing table or row). Live check: `ai_change_log` and `ai_pending_changes` exist, RLS on, owner SELECT only; anon has no privileges; authenticated has SELECT only (no insert/update/delete). All 23 functions: `service_role` can execute; `anon` and `authenticated` cannot.
- Note on the migration history entry: the 150100 file is too large to paste as one statement through the tool, so it was applied through a temporary staging table (created, executed with `EXECUTE`, then dropped; verified gone). The live migration list therefore shows the names `ai_change_log_and_pending` and `ai_connector_edit_rpcs` with generated version numbers, not 20261116150000/150100. The repo files are the source of truth. The applied SQL equals the repo files except comments were left out.

## Step 2: live RPC checks (DONE)
Run as rolled-back DO blocks (plus real calls) against a throwaway user created with the admin API and deleted afterwards. Afterwards `ai_change_log` and `ai_pending_changes` had 0 rows. The owner's rows were never touched (copy count unchanged).
Passed: add to deck + undo; undo refused after a sleeve (nothing changed); remove from deck (copy back to storage, not deleted, undo restores); to Maybeboard (copy released, undo restores); make original (proxy to storage, undo restores); create proxy (Claude undo refused, owner only); add to collection (exactly one copy; Claude undo refused; owner undo removes only that copy, and the card record only if Claude made it); group undo of 3; all-or-nothing refusal when one slot changed; over-ten goes pending (duplicate returns same id); decline; approve after decline = declined; card move always pending and nothing moves until approved; approve picks the non-Maybeboard slot, leaves the source slot planned, copy on exactly one slot; stale approve = failed with nothing changed; expiry; revoke cancels waiting requests and later submit/approve are refused; anon/authenticated cannot call any RPC or write the log; another user sees none of the owner's rows.
Delete check: a scan of every function body shows the only deletions of copies/cards are the owner-undo inside `ai_undo_group` (removes only the logged Claude add) and three older owner features (`delete_user_copy`, `delete_user_copies`, `apply_collection_sync`), none reachable from a connector tool.
Two real SQL bugs/gaps found and fixed with additive migrations, both applied live and committed:
- `20261116150200_ai_undo_blocker_make_original_fix.sql`: Claude's undo of make-original was always refused as "proxy moved".
- `20261116150300_ai_list_recent_changes_zone_to.sql`: the recent-changes list now also returns `zone_to` so the sentence can say Maybeboard or main.

## Step 3: TypeScript (DONE)
- Tools (names registered explicitly, strict input, no user argument): `add_cards_to_deck`, `remove_cards_from_deck`, `set_card_zone`, `add_card_to_collection`, `sleeve_free_copy`, `make_slot_original`, `create_proxy_for_slot`, `request_card_move`, `undo_change`, plus readers `get_change_status`, `list_recent_changes`. `destructiveHint` is true only on `remove_cards_from_deck` and `undo_change`; other writers are `readOnlyHint:false, destructiveHint:false`; readers keep the read-only hints. `get_deck` now also returns `slotId`.
- Server refuses destructive names (`delete_*`, `remove_from_collection`, `import_*`, `sync_*`, `bulk_*` and a few more) with code `tool_not_allowed` before lookup.
- User id and connection id come only from the verified token and the per-request connection check. The only files that use the service key are the connection store and the write gateway.
- Sentences are made on the server by one generator (`change-sentences.ts`); the UI shows them and builds none.
- The slice A static test now asserts the new name list and annotations and allows the write gateway.
- Revoke now calls one database function that also cancels the connection's waiting requests.
- Tests: 3173 pass (`npx vitest --run`), `npx next build --webpack` green, `tsc --noEmit` clean.
- No new environment variables.

## API shapes for the UI developer (final)
All routes: cookie session only, JSON, `Cache-Control: no-store`. An `Authorization` header, or a session token carrying `client_id`, gets 403. POST routes need an `Origin` equal to the site. Success has `ok: true`. Failure is `{ ok:false, error:"<plain words>", code? }`. 400 bad id, 401 signed out, 403 not allowed, 404 gone, 409 refused/ended, 503 could not reach the database (never show as "none").
Types live in `src/lib/connector/api-types.ts`.

| Route | Method | Success |
|---|---|---|
| `/api/connector/changes` | GET | `{ ok, changes: ChangeGroupView[] }` one entry per request, newest first, last 7 days. Fields: the first log row (`group_id, kind, client_name, deck_name, card_name, created_at, undoable_until, undone_at, undone_by, owner_only, undo_blocker, approved_by_owner…`) plus `summary`, `consequence`, `card_count`, `cards[]`, `refusal_text` (non-null when Undo is blocked) |
| `/api/connector/changes/{groupId}/undo` | POST | 200 `{ ok, success:true, undone, summary }`. Refused: 409 `{ ok:false, success:false, refused:{code,card?,deck?,on?}, error, code:'undo_refused' }` |
| `/api/connector/pending` | GET | `{ ok, pending: PendingItemView[] }` waiting plus ended in last 7 days. Fields incl. `id, kind, action, reason, deck_name, other_deck_name, card_count, preview, status, client_name, created_at, expires_at, decided_at, failure_reason, cancel_reason, title, summary` (the last four are plain-words sentences) |
| `/api/connector/pending/count` | GET | `{ ok, count }` (header chip; waiting and not expired) |
| `/api/connector/pending/{id}/approve` | POST | 200 `{ ok, outcome:'approved', summary, group_id, count }`. Ended/stale: 409 `{ ok:false, outcome:'expired'|'declined'|'cancelled'|'failed'|'approved', reason, error, code:'pending_ended' }` (`reason` and `error` are the same sentence) |
| `/api/connector/pending/{id}/decline` | POST | 200 `{ ok, outcome:'declined', summary }`; else 409 as above |
| `/api/connector/status` | GET | `{ ok, connected, connection:{id,client_name,created_at,last_used_at}\|null, email }` |
| `/api/connector/revoke` | POST `{connectionId}` | existing `{ ok, warning? }`; now also cancels waiting requests |
| `/api/connector/moved-slots?deckId=` | GET | `{ ok, moved:[{slot_id,card_name,moved_to_deck_id,moved_to_deck_name,at,client_name,approved_by_owner,sentence}] }` |

## Deviations from the contract
- An expired Oracle login (not a switch-off) does not cancel waiting requests; only switch-off and the 24-hour expiry do.
- `/status` reports only connected true/false. It cannot tell an expired login, so the UI "expired" state is never produced by the server.
- Original to Proxy flip and the Maybeboard gap in the older `reassign_to_deck` are not offered or changed.

## Not verified
- No live end-to-end call from Claude through `/mcp` with the new tools.
- No live HTTP call to the cookie routes (logic covered by unit tests with a mock gateway, and the RPCs by the live checks above).
- Card lookup by name (`resolveCard`) against Scryfall was not exercised live.
- Nothing pushed or merged.
