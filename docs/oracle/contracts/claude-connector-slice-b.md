# Contract: Claude connector, slice B (CC-04b): safe edits with Undo

Status: DRAFT for owner approval. Author: Architect. Branch `cc04b-edits`. Builds on `docs/oracle/contracts/claude-connector-slice-a.md` (merged, read-only) and `src/lib/connector/**`.
Tags: `[Confirmed: path]` = read in the code or migrations. `[Approximate]` = not verified.

## 0. Plain words (for Brad)

- Claude can make **small** changes by itself (up to about 10 cards) and every one has an **Undo** for 7 days.
- **Bigger** changes, and **any** move of a card from one deck to another, are only a request. They wait for your yes, on a page you open while logged in to Oracle. Claude cannot say yes for you. A request that nobody answers disappears after 24 hours.
- Claude **cannot delete** cards or decks from your collection. Those tools do not exist.
- If you switch Claude off, every waiting request is cancelled.
- When a card is moved to another deck, the old deck keeps a slot for it: "Unavailable · In {other deck}", with a line saying who moved it and when.

## 1. Fixed decisions applied

| # | Decision | Where it is enforced |
|---|---|---|
| 1 | Up to 10 cards: direct, with Undo. More, or any cross-deck move: pending | `_ai_gate` (SQL), section 4 |
| 2 | Pending: 24 h expiry. Approve/decline from a cookie session only | routes (section 8) + RPCs have no connector entry point |
| 3 | Undo window 7 days, all-or-nothing per request, refusal names the reason | `ai_undo_group`, section 6 |
| 4 | No delete of cards/copies/decks by Claude. Tools registered from an allow-list; server also refuses blocked names | section 3.2 |
| 5 | Collection-add Undo: owner only, removes only the copy named in the log row | `ai_undo_group` (actor `owner`) |
| 6 | Moved card keeps a planned slot in the source deck | section 5.3 |
| 7 | Off-switch cancels waiting requests | `revoke_connector_connection`, section 7 |
| 8 | Sentence text built server-side in one module | `src/lib/connector/change-sentences.ts`, section 9 |

## 2. Findings that shape the design

1. **Source slot after a move.** `reassign_to_deck` clears `copy_id`, `ownership_status` and `placement_source` on the source slot, so it stays a planned slot. [Confirmed: supabase/migrations/20260925220000_placement_source.sql] No fix needed for that part.
2. **Maybeboard gap.** `reassign_to_deck` and `assign_free_copy` choose the destination slot by name and "no copy" only, so a Maybeboard slot could be picked. [Confirmed: same file] Slice B therefore does NOT call them. `_ai_plan` picks the slot itself, excluding Maybeboard rows, and `_ai_execute` does the same updates. Existing functions are not changed (additive only). Reported as a separate finding.
3. `reassign_to_deck` does not stop a commander slot from being the source. Slice B refuses commander and command-zone slots (`commander_copy`, `commander_slot`).
4. `replace_proxy_with_original` does not check that the original is the same card. `_ai_plan` adds that check (`wrong_card`). [Confirmed: same migration]
5. There is no "mark Original as Proxy" function and D-026 forbids silent conversion. Slice B offers `make_slot_original` and `create_proxy_for_slot` only. The reverse flip from brief S5 is NOT offered (owner to confirm).
6. `apply_ai_deck_delta` returns counts only and logs nothing, so slice B does not use it. It loops the per-slot existing functions inside one transaction. [Confirmed: supabase/migrations/20260912162000_atomic_collection_boundary.sql]
7. Live DB already blocks token writes through the table API (own-row policies plus RESTRICTIVE `*_no_oauth_*`), so every edit goes through the server with the service role and the RPCs below. [Confirmed: docs/oracle/contracts/data-separation.md; docs/oracle/reports/2026-11-16-tester-cc04b-separation.md]

## 3. Tools

### 3.1 List

Exact names. Every write tool: strict zod object, **no user id argument**, optional `dry_run: boolean`. Cards are given by name plus deck; the server resolves ids. `slotId` is added to `DeckCardView` (additive) so Claude can target a slot. Tool annotations: only removal tools set `destructiveHint: true`; all other writers set `readOnlyHint: false, destructiveHint: false`; readers keep `readOnlyHint: true`.

| Tool | Args | Annotations | Effect / result |
|---|---|---|---|
| `get_change_status` | `pending_id` | read-only | status of one of Claude's own requests |
| `list_recent_changes` | none | read-only | last 7 days, with who undid what |
| `add_cards_to_deck` | `deck_id`, `cards:[{name, quantity?, category?}]`, `dry_run?` | non-destructive | adds planned slots (`deck_add`) |
| `remove_cards_from_deck` | `deck_id`, `slots:[{slot_id, name}]`, `dry_run?` | **destructiveHint** | removes slots, releases copies to storage (`deck_remove`). Never touches the collection |
| `set_card_zone` | `deck_id`, `slots:[{slot_id,name}]`, `to:'main'\|'maybeboard'`, `dry_run?` | non-destructive | `deck_zone`. To maybeboard releases the copy (D-005, D-039) |
| `add_card_to_collection` | `name`, `finish?`, `printing_id?` | non-destructive | exactly one copy per call (`collection_add`). Direct always; counts toward the hourly cap only |
| `sleeve_free_copy` | `deck_id`, `copy_id`, `name` | non-destructive | puts a free copy in an open slot (`sleeve_copy`) |
| `make_slot_original` | `deck_id`, `slot_id`, `name`, `original_copy_id` | non-destructive | swaps a proxy for a free original (`make_original`); proxy goes to storage |
| `create_proxy_for_slot` | `deck_id`, `slot_id`, `name` | non-destructive | proxy for an open slot, owned card only (`create_proxy`) |
| `request_card_move` | `copy_id`, `name`, `to_deck_id` | non-destructive | **always pending** (`copy_move`). Result `pending_approval` |
| `undo_change` | `group_id` | **destructiveHint** (it can remove slots) | Claude may undo only its own groups of 10 rows or fewer and only kinds `deck_add, deck_remove, deck_zone, sleeve_copy, make_original` |

Results: `applied` (with `group_id`, `count`), `pending_approval` (with `pending_id`, `expires_at`, `reason`), `would_apply` / `would_wait` (dry run), plus `warnings[]`. Failures use the slice-A error shape with a specific code and card/deck name.

### 3.2 No delete

- Tools are registered from a fixed allow-list array in `src/lib/connector/tools/index.ts`; a test snapshots the exact name list.
- A `BLOCKED_TOOL_NAMES` list (`delete_deck`, `remove_from_collection`, `delete_card`, `delete_copy`, `replace_collection`, `clear_deck`, `release_deck_copies`, `import_*`, `sync_*`, `bulk_*`) is checked in the tools/call handler. A match is refused with `tool_not_allowed` even if some future code registers it.
- No RPC in the draft deletes collection data for a connector caller. The only collection deletes are in `ai_undo_group` for kinds `collection_add` and `create_proxy`, only with `p_actor='owner'`, and only the row named by `copy_id` in the log.

### 3.3 Context change

`ToolContext` gains `connectionId`, `clientId`, `clientName` (taken from `checkConnection` in `handle-request.ts`, which already has them [Confirmed: src/lib/connector/handle-request.ts]). A new server-only module `src/lib/connector/write-gateway.ts` is the ONLY connector module that may import `createAdminClient`. It calls RPCs with `p_user_id = ctx.userId` (from the verified token). The slice-A static test is updated to allow exactly that one file.

## 4. Gate rules (all in SQL, `_ai_limits` / `_ai_gate`)

| Rule | Value | Result |
|---|---|---|
| `copy_move` | always | pending, reason `card_move` |
| cards in this request > 10 | `direct_max` 10 | pending, `over_ten` |
| this request + Claude's un-approved changes to the same deck in the last 30 min > 10 | `split_window_minutes` 30 | pending, `recent_total` (stops 10+10+10) |
| this request + Claude's changes in the last hour (all decks, plus ones Claude undid) > 40 | `hourly_max` 40 | pending, `busy` |
| cards in one request > 60 | `max_request` | refused `too_many_cards` |
| waiting requests per user > 20 | `max_waiting` | refused `too_many_waiting` |

Rows approved by the owner do not count toward the splitting or hourly rules. Identical waiting payload returns the existing item (no pile-up). The TS mirror constants live in the types file; a test asserts they equal `_ai_limits()` output.

## 5. Database

Drafts (additive; rollbacks alongside; NOT applied; Gene applies after approval):
- `supabase/drafts/20261116140000_ai_change_log_and_pending.draft.sql` (+ `.rollback.sql`)
- `supabase/drafts/20261116140100_ai_connector_edit_rpcs.draft.sql` (+ `.rollback.sql`)

No final copies in `supabase/migrations`: the SQL has not been run against a database (no local Postgres), so I am not certain enough. Gene applies on a branch/throwaway first, then the live checks in section 10 run.

### 5.1 Tables
- `ai_pending_changes`: id, user_id, connection_id, client_name, kind (`big_edit|copy_move`), action, reason, deck/other deck id+name, card_count, payload, payload_hash, preview, status (`waiting|approved|declined|expired|cancelled|failed`), created_at, expires_at (+24 h), decided_at, decided_via (only `oracle_session`), result_group_id, failure_reason, cancel_reason. Partial unique index on `(user_id, payload_hash) WHERE status='waiting'`.
- `ai_change_log`: one row per slot or copy, grouped by `group_id`. Columns for deck, other deck, card name, oracle_id (card) and printing_id (printing) kept separate, deck_card_id, other_deck_card_id, copy_id (no FKs to rows that may be deleted), `before`/`after` jsonb snapshots, pending_id, approved_by_owner, created_at, undoable_until (+7 d), undone_at, undone_by. A trigger lets only `undone_at`/`undone_by` change.
- RLS on, owner SELECT only (`user_id = auth.uid()`); all privileges revoked from PUBLIC/anon/authenticated except SELECT; writes service_role only. Sentence text is NOT stored.

### 5.2 RPCs
All `SECURITY DEFINER`, `search_path=public`, `p_user_id` first, executable by service_role only. Errors: `RAISE EXCEPTION '<code>' USING ERRCODE='P0001', DETAIL='<json>'`. Lock order: connection row, decks ascending, copies ascending.

| RPC | Purpose |
|---|---|
| `ai_submit_change(p_user_id, p_connection_id, p_action, p_payload, p_dry_run)` | Locks the connection row `FOR SHARE` (refuses if revoked), plans, gates, then applies via `_ai_execute` or queues a pending row |
| `ai_get_pending(p_user_id, p_connection_id, p_pending_id)` | Claude reads its own request; no payload |
| `ai_list_pending(p_user_id)`, `ai_pending_count(p_user_id)` | cookie routes; lazy expiry |
| `ai_approve_pending(p_user_id, p_pending_id)` | cookie route only. Re-plans under locks. Stale: status `failed` + reason, nothing changed |
| `ai_decline_pending(p_user_id, p_pending_id)` | cookie route only |
| `ai_list_recent_changes(p_user_id)` | rows with `owner_only` and `undo_blocker` |
| `ai_undo_group(p_user_id, p_group_id, p_actor, p_connection_id)` | all-or-nothing; pass 1 finds blockers (no change), pass 2 applies |
| `ai_moved_slots(p_user_id, p_deck_id)` | the "Unavailable" history line |
| `revoke_connector_connection(p_user_id, p_connection_id)` | sets `revoked_at` and cancels waiting requests in one transaction |
| helpers `_ai_limits, _ai_fail, _ai_deck_counts, _ai_is_maybe, _ai_lock_*, _ai_plan, _ai_gate, _ai_execute, _ai_undo_blocker, _ai_expire_pending` | internal |

Checks in `_ai_plan` (run under locks, every time, including at approve): deck belongs to user; slot id AND name match (`slot_not_found`); commander/command-zone refused; maybeboard slots never picked as an open slot; open slot exists (`no_open_slot`); copy belongs to user, not missing, not already in a deck, matches the card name; proxy rules (`wrong_card`, `replacement_is_proxy`, `slot_not_a_proxy`, `slot_already_sleeved`, `no_card_record`); move: source unchanged since the request (`source_changed`), not same deck. D-001/D-003: one copy, one place; a copy is never in two slots and never silently converted; releasing sends it to default storage ("Unsorted"). D-021: no card is deleted from the collection.

### 5.3 Moved card
`_ai_execute` for `copy_move` clears source slot (`copy_id`, `ownership_status`, `placement_source` null), fills the chosen open destination slot with `placement_source='ai'`, sets the copy's location null. The source slot stays a planned slot. The log row stores source deck/slot as `deck_id`/`deck_card_id`, destination as `other_deck_id`/`other_deck_card_id`. The deck page shows "Unavailable · In {deck}" (existing availability logic) plus the history line from `ai_moved_slots`; the line disappears if the move is undone.

## 6. Undo

All-or-nothing per `group_id`; window 7 days (`window_closed` after); a refusal returns `{code, card, deck, on}` and nothing changes.

| Kind | Undo does | Refuses when | Who |
|---|---|---|---|
| `deck_add` | delete the planned slot | slot now in deck or edited (`slot_sleeved`, `slot_edited`) | Claude or owner |
| `deck_remove` | re-insert slot from snapshot; re-attach the copy if still in the storage place it was released to | card back on list; copy elsewhere/moved/missing; deck gone | Claude or owner |
| `deck_zone` | restore categories; re-attach copy | slot edited or in deck; copy elsewhere | Claude or owner |
| `sleeve_copy` | copy back to its previous storage place | copy moved or slot changed (`copy_moved`) | Claude or owner |
| `make_original` | swap proxy back in | proxy moved (`proxy_moved`) | Claude or owner |
| `create_proxy` | detach and delete that one proxy copy | slot or copy changed | **owner only** (new) |
| `collection_add` | delete exactly the logged copy; also the card record only if Claude created it and it has no copies | copy now in a deck (`copy_in_deck`); copy changed | **owner only** |
| `copy_move` | put the copy back in the source slot | moved again; source slot filled or gone | **owner only** |

Claude may also not undo groups larger than 10 rows or approved-by-owner groups (`owner_only`). The "on {date}" in a refusal comes from the later log row on the same slot or copy, else it says "since it was made".

## 7. Off-switch
`revoke.ts` switches from its plain update to `revoke_connector_connection`, then calls `revokeGrant` as before (still rejects any Authorization header or `client_id` token). Waiting requests become `cancelled` (`switched_off`). In-flight writes serialize on the connection row lock. Approve also re-checks the connection is active (`connection_ended`). Deviation from the spec: an expired login alone does NOT cancel requests (only switch-off and the 24 h expiry do); owner to confirm.

## 8. API routes (cookie session only)
Every route: `createClient()` session user; reject any `Authorization` header or token with `client_id` (reuse `carriesClientId`); POST routes also check `Origin` equals the site URL. Service role then calls the RPC with the session user id. No route is reachable by a connector token.

| Route | Method | RPC |
|---|---|---|
| `/api/connector/changes` | GET | `ai_list_recent_changes` |
| `/api/connector/changes/[groupId]/undo` | POST | `ai_undo_group(actor 'owner')` |
| `/api/connector/pending` | GET | `ai_list_pending` |
| `/api/connector/pending/count` | GET | `ai_pending_count` |
| `/api/connector/pending/[id]/approve` | POST | `ai_approve_pending` |
| `/api/connector/pending/[id]/decline` | POST | `ai_decline_pending` |
| `/api/connector/moved-slots?deckId=` | GET | `ai_moved_slots` |
| `/api/connector/revoke` | POST | `revoke_connector_connection` (existing route, updated) |

## 9. UI and text
- Page "Settings > Claude connector": tabs Connection, Recent changes, Setup guide (stub only, slice D). Connection holds the switch (existing). Recent changes lists the last 7 days with Undo and pending cards on top.
- Header chip "N Claude is waiting for your yes" (count route), links to the pending cards.
- Pending card: sentence, card list, before/after per deck (counts become the deck state label via `computeDeckReadiness`), Approve / Decline, expiry time, failure/cancel reason when it ended.
- Moved-slot line in the source deck.
- Empty state only after a successful empty result; errors are never shown as "none". Plain words, no jargon.
- All sentences come from `change-sentences.ts` (pure functions of the log/pending row; snapshot-tested; sentence table from spec section 4). The client never builds its own text.

## 10. Test plan
Unit (mocks): gate thresholds and splitting; blocked names refused and exact tool-name snapshot; tool modules do not import the service role or owner-actions (except the write gateway); approve/decline/undo routes reject `client_id` tokens, Authorization headers and bad Origin; revoke calls the cancel RPC; sentence snapshots; TS limit constants equal `_ai_limits`; all-or-nothing undo (mock RPC refusal leaves state).
Live (throwaway users, never owner data, with cleanup): cross-user isolation on both tables; a Claude-style token cannot reach approve; switch-off cancels waiting; each undo kind and each refusal; 7-day window and 24 h expiry (back-dated rows); maybeboard slot never picked; stale pending fails without change; move keeps source slot planned; concurrency (two submits, submit vs revoke).

## 11. Developer tasks (ordered)
1. Gene applies the two drafts on a throwaway branch; Tester runs the SQL live checks (any SQL fix comes back to Architect).
2. Add `slotId` to `DeckCardView`; extend `ToolContext`; update slice-A test.
3. `write-gateway.ts` and `change-sentences.ts` with tests.
4. Tools and allow/block lists; wire into `tools/index.ts`.
5. Cookie routes; update revoke route.
6. UI: page, tabs, chip, pending cards, moved-slot line.
7. Unit tests, then Tester live pass, then Gene applies to live.

## 12. Open questions for the owner
See the report. Types: `docs/oracle/contracts/claude-connector-slice-b.types.ts`.
