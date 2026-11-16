# Report: CC-04b server half (safe edits with Undo)
Role: Developer (server)
Status: PARTIAL (step 1 done and live; later sections are filled in as each step lands)
Task as received: implement the SERVER half of `docs/oracle/contracts/claude-connector-slice-b.md` (+ `.types.ts`): database migrations applied and verified, RPCs exercised on throwaway rows, connector edit tools, cookie-only API routes for the UI, tests.

## Summary for the owner
The behind-the-scenes storage for Claude's edits is now live: a record of every change Claude makes, and a list of requests waiting for your yes. Nothing in the app looks different yet. No cards, decks or copies were touched.

## Step 1: database (DONE, live)
- Final migration files (renamed because `20261116140000` collided with an existing version):
  - `supabase/migrations/20261116150000_ai_change_log_and_pending.sql` (2 new tables)
  - `supabase/migrations/20261116150100_ai_connector_edit_rpcs.sql` (23 new functions)
  - Rollbacks: `supabase/drafts/20261116150000_ai_change_log_and_pending.rollback.sql`, `supabase/drafts/20261116150100_ai_connector_edit_rpcs.rollback.sql`.
- Validated first inside a transaction forced to roll back (tables: wrapped in BEGIN...ROLLBACK; functions: a DO block that ran all the SQL and then raised `DRYRUN_OK funcs=23`). Afterwards the objects did not exist. No SQL fixes were needed.
- Applied with `apply_migration` (additive only: two new tables, new functions; no statement touched an existing table or row). Live check: `ai_change_log` and `ai_pending_changes` exist, RLS on, owner SELECT only; anon has no privileges; authenticated has SELECT only (no insert/update/delete). All 23 functions: `service_role` can execute; `anon` and `authenticated` cannot.
- Note on the migration history entry: the 150100 file is too large to paste as one statement through the tool, so it was applied through a temporary staging table (created, executed with `EXECUTE`, then dropped; verified gone). The live migration list therefore shows the names `ai_change_log_and_pending` and `ai_connector_edit_rpcs` with generated version numbers, not 20261116150000/150100. The repo files are the source of truth. The applied SQL equals the repo files except comments were left out.

## API shapes for the UI developer (first version; final list is in the last section)
All routes: cookie session only, JSON. A request with an `Authorization` header, or a session token that carries `client_id`, gets 403. POST routes need an `Origin` equal to the site (a normal same-site `fetch` already sends it). Success is `{ ok: true, ... }`. Failure is `{ ok: false, error: "<plain words>", code?: "<machine code>" }`. 401 = not signed in, 403 = not allowed, 404 = not found, 409 = refused (the reason is in `refused` or `outcome`), 503 = could not read (never show as "none").

| Route | Method | Body | Success |
|---|---|---|---|
| `/api/connector/changes` | GET | none | `{ ok, groups: ChangeGroup[] }` newest first, last 7 days |
| `/api/connector/changes/{groupId}/undo` | POST | none | `{ ok: true, undone: number }`; refusal is 409 `{ ok:false, refused: { code, card?, deck?, on? }, error: "<sentence>" }` |
| `/api/connector/pending` | GET | none | `{ ok, pending: PendingItem[] }` waiting first, plus ones that ended in the last 7 days |
| `/api/connector/pending/count` | GET | none | `{ ok, count: number }` (header chip) |
| `/api/connector/pending/{id}/approve` | POST | none | `{ ok: true, outcome: 'approved', group_id, count }`; otherwise 409 `{ ok:false, outcome: 'expired'\|'declined'\|'cancelled'\|'failed'\|..., reason?: {code,...}, error }` |
| `/api/connector/pending/{id}/decline` | POST | none | `{ ok: true, outcome: 'declined' }`; otherwise 409 with `outcome` |
| `/api/connector/status` | GET | none | `{ ok, connected: boolean, connection: { id, client_name, created_at, last_used_at } \| null }` |
| `/api/connector/revoke` | POST | `{ connectionId }` | existing shape; now also cancels waiting requests |
| `/api/connector/moved-slots?deckId=` | GET | none | `{ ok, moved: MovedSlot[] }` |

Full field lists for `ChangeGroup` and `PendingItem` are in `src/lib/connector/api-types.ts` (written in step 3).
