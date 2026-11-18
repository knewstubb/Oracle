# Report: cc13-verify
Role: tester
Status: DONE
Task as received: Task CC-13-verify: rehearse the drafted CC-13 database change on a throwaway local Postgres only (never the hosted database, apply nothing), checking limits 120/200/500, moves going straight through, one-click undo of a 120-card group, the Recent changes group cap with three 100-row groups, whether sleeve_copy refuses a copy marked In your hand, and timings for 120 and 200 rows, then run the code checks for the uncommitted CC-13 code and confirm the code numbers equal the draft; inputs: supabase/drafts/20261117100000_cc13_loosen_limits.draft.sql and its rollback, docs/oracle/reports/2026-11-17-architect-cc13-limits.md, docs/oracle/reports/2026-11-17-developer-cc13-limits.md, docs/oracle/contracts/claude-connector-cc13-amendment.md section 7, docs/oracle/test-plan-2026-11-17.md section H.
Done when: docs/oracle/reports/2026-11-17-tester-cc13-verify.md reports PASS/FAIL with evidence for every check and the 120/200 timings, names who must fix each failure (Architect or Developer), and says plainly that nothing was applied to the hosted database.

## Summary for the owner

The database change behaves exactly as promised on a throwaway copy: Claude can change up to 120 cards in one request, 121 to 200 wait for your yes, over 200 is refused, and a card move goes straight through with a working one-click Undo. Recent changes showed three complete groups of 100 cards, Undo worked in one click at every size, and a card you are holding in your hand was not taken into a deck. The code checks are in the same state as before this work (one old test failure and some old style warnings, none from this change); the only thing left is your approval to apply the database change, then the code.

**Nothing was applied to the hosted database.** Every database action in this test ran on a brand-new, throwaway Postgres 17 cluster on this machine (127.0.0.1:55432, temp folder), which has now been stopped. `supabase/migrations/` was not edited, no `supabase db push` or link was used, and no connection to the hosted project was made at any point.

## Changed files
- docs/oracle/reports/2026-11-17-tester-cc13-verify.md — this report (no app code, test or migration file was changed by this task; the throwaway test scripts lived outside the repo, in the system temp folder)

## Method (how the rehearsal was run)

- Fresh local cluster: `initdb` into a temp folder, server on port 55432; throwaway, no data from the real collection.
- The repo's migrations do not include the original base schema (a bare database fails the first 52 baseline migrations: `card_definitions`, `storage_locations`, `decks`, `deck_cards`, `user_cards`, `user_copies` predate the folder). I therefore rebuilt just the base tables the connector needs, with their columns taken from `src/types/supabase.ts`, plus the live "one place" triggers copied from `supabase/migrations/20261113100000_copy_in_hand_and_missing_since.sql`, and stand-ins for the six pre-existing helper routines (`insert_user_copies`, `remove_deck_card_with_release`, `unassign_copy_to_storage`, `replace_proxy_with_original`, `add_proxy_to_slot`, `_ensure_default_storage_location_id`).
- On top of that I applied the real connector migrations **unmodified**: `20261116130000`, `20261116150000`, `20261116150100`, `20261116150200`, `20261116150300`, `20261116190000`. All applied cleanly; `_ai_limits()` read `10 / 40 / 60 / 10` (the live CC-04b baseline) before the draft.
- Then `supabase/drafts/20261117100000_cc13_loosen_limits.draft.sql` applied cleanly in one transaction (BEGIN … COMMIT, no errors).
- Test data: 2 users, 6 decks (TEST A–E), one copy in a deck, one planned slot each side, and one copy flagged In your hand.
- Every check below ran through the real entry points (`ai_submit_change`, `ai_approve_pending`, `ai_undo_group`, `ai_list_recent_changes`, `_ai_gate`, `_ai_plan`) — not reimplementations. Results were collected into a temp table and printed as PASS/FAIL.

## Verdict

**PASS** — 43 of 43 CC-13 database assertions pass (plus 6 timing measurements), 0 FAIL. No database failure attributable to Architect or Developer. The only failing items anywhere in this task are pre-existing and outside CC-13 (details and owner at the end).

## Check results

### 1. Limits: 120 / 200 / 500

| # | Check | Result | Evidence |
|---|---|---|---|
| C1 | `_ai_limits()` after the draft | PASS | `{"split_max":200,"undo_days":7,"direct_max":120,"hourly_max":500,"max_request":200,"max_waiting":20,"pending_hours":24,"claude_undo_max":200,"split_window_minutes":30}` |
| C2 | One request of 120 goes straight through | PASS | `_ai_gate('deck_add', 120)` → `NULL` (no wait) |
| C3 | One request of 121 waits | PASS | `_ai_gate('deck_add', 121)` → `'over_ten'` |
| C4 | `_ai_plan` accepts 200 cards | PASS | plan `n = 200` (no `too_many_cards`) |
| C5 | 201 cards refused | PASS | plan raises `too_many_cards` (P0001) |
| C6a | Same deck, 199 recent + 1 = 200 | PASS | `_ai_gate` → `NULL` |
| C6b | Same deck, 200 recent + 1 = 201 | PASS | `_ai_gate` → `'recent_total'` |
| C7a | Hourly, 499 + 1 = 500 | PASS | `_ai_gate` → `NULL` |
| C7b | Hourly, 500 + 1 = 501 | PASS | `_ai_gate` → `'busy'` |
| C8 | A card move no longer always waits | PASS | `_ai_gate('copy_move', …)` returns `NULL`, never `'card_move'` |

Real-request boundary (not just the gate): C13a (120 → `applied`), C14a (200 → `pending`, reason `over_ten`), C5 (201 → refused). Code side agrees: `AI_LIMITS` = 120 / 200 / 500 / 200 / 200 / 30 / 7 / 24 / 20 `[Confirmed: src/lib/connector/edit-config.ts]`, and the toolkit refuses 201 before lookup (`edit-tools.test.ts` "more than 200 cards … rejected").

### 2. Card moves go straight through, with one-click Undo

| # | Check | Result | Evidence |
|---|---|---|---|
| C9 | Move applies immediately, no pending | PASS | `outcome='applied'`, `group_id` returned, `count=1` |
| C9b | Copy now in the destination; source slot planned again | PASS | dest `copy_id=1`, source `copy_id=NULL` |
| C9c | Log row is `copy_move`, `approved_by_owner=false` | PASS | kind/approved asserted from `ai_change_log` |
| C10a | Claude cannot undo its own move | PASS | `{"success":false,"refused":{"code":"owner_only",…}}` |
| C10b | Owner Undo puts the card back (one call) | PASS | `{"success":true,"undone":1}` |
| C10c | Source slot has the copy again | PASS | source `copy_id=1`, dest `copy_id=NULL` |
| C11 | Move into a deck whose slot is filled is refused | PASS | `no_open_slot` (nothing changed) |
| C12 | A move request queued **before** the change still approves | PASS | `ai_approve_pending` → `approved`, copy landed in destination |
| C12b | The approved legacy move landed in the destination slot | PASS | dest `copy_id=4` |

### 3. One-click Undo of big groups

| # | Check | Result | Evidence |
|---|---|---|---|
| C13a | 120-card request applies in one go | PASS | `outcome='applied' count=120` |
| C13b | Exactly one group of 120 rows | PASS | 120 rows, 1 distinct `group_id` |
| C13c | Claude one-click Undo of 120 | PASS | `{"success":true,"undone":120}` |
| C13d | Deck empty after Undo | PASS | 0 cards |
| C14a | A 200-card request waits (not applied) | PASS | `outcome='pending'`, `reason='over_ten'` |
| C14b | Owner approval applies one group of 200 | PASS | `approved`, 200 rows in one `group_id` |
| C14c | Owner one-click Undo of 200 | PASS | `{"success":true,"undone":200}` |
| C14d | Deck back to its pre-test size | PASS | 1 card (the seeded one) |
| C15 | Claude cannot undo an owner-approved 200-row group | PASS | `owner_only` (unchanged rule wins over the size cap) |
| G1 | Claude Undo allowed at exactly 200 rows | PASS | `{"undone":200}` (cap read from `_ai_limits`) |
| G2 | Claude Undo refused at 201 rows | PASS | `owner_only` (`> claude_undo_max`) |
| G3 | Owner Undo of 201 rows allowed | PASS | `{"undone":201}` (owner has no cap, as today) |

Note: with `direct_max` 120, a new Claude request can never create a group above 120 rows, so the 200 cap is a ceiling for the future rather than something a normal request reaches. That matches the contract.

### 4. Recent changes: group cap with three 100-row groups

| # | Check | Result | Evidence |
|---|---|---|---|
| C16 setup | Three 100-card requests applied (one per deck) | PASS | `100 / 100 / 100` |
| C16a | Three groups of 100 all listed | PASS | `groups=3 rows=300` |
| C16b | Every group complete, none cut in half | PASS | per-group min = max = 100 |
| C17 | Group cap is the newest 50 | PASS | 55 groups created → `groups=50`, oldest `Cap 6`, newest `Cap 55` (the 5 oldest dropped whole) |
| C18 | Row safety cap 2000, never a half group | PASS | 25 × 100 rows → `rows=2000 groups=20 smallest group=100` |
| F2 | A full 120-card request stays complete next to older undoable groups | PASS | `groups=41`, all 120 rows of the 120-group present |

This is the failure the old `LIMIT 300` rows would have produced (one 100-row group split, older groups hidden). The draft fixes it.

### 5. Free copies, and "In your hand"

| # | Check | Result | Evidence |
|---|---|---|---|
| E1 | `sleeve_copy` refuses a copy marked In your hand | PASS | refused with `copy_in_hand`; slot `copy_id` stays NULL; copy still `in_hand=true` (nothing changed) |
| E2 | The same copy sleeves once the hand flag is cleared | PASS | `outcome='applied'`, slot filled (so E1 was about the hand, not a general failure) |
| E3 | `sleeve_copy` refuses a copy already in another deck | PASS | `copy_already_in_deck` |
| F1 | `add_cards_to_deck` never touches an existing copy | PASS | new slot is planned (`copy_id NULL`); the copy stays in its deck |

Important nuance for E1: the refusal is real but comes from the live database trigger `deck_cards_copy_must_be_available` (raises `copy_in_hand`) at execution time, not from a named check in `_ai_plan`. The plan approves; the execute step aborts and rolls back. Safe, but a client may see a generic database error rather than a plain refusal code. See "Observations" for the small improvement, owner Architect.

### 6. Rollback

Applied `supabase/drafts/20261117100000_cc13_loosen_limits.rollback.sql` on top of the draft: PASS.

- `_ai_limits()` returns `{"direct_max":10,"hourly_max":40,"max_request":60,"claude_undo_max":10,…}` (old values restored, `split_max` gone).
- `_ai_gate('copy_move', …)` returns `'card_move'` again (moves wait).
- `ai_list_recent_changes` body contains `LIMIT 300` again.
- The draft was then re-applied cleanly, so the throwaway database ended in the CC-13 state.

### 7. Timings (throwaway database, 120 and 200 rows)

All are single calls through the real functions, measured with `clock_timestamp()` around the call:

| Operation | Rows | Time |
|---|---|---|
| Request submit (Claude, applies straight through) | 120 | **11 ms** |
| Claude Undo, one group | 120 | **11 ms** |
| Request submit (plan/queue only — 200 waits by design) | 200 | **3 ms** |
| Owner approval + execute | 200 | **10 ms** |
| Owner Undo, one group | 200 | **16 ms** |
| `ai_list_recent_changes` | 300 (3×100) | **46 ms** (23 ms on the first run) |

The `/mcp` route sets no `maxDuration` (`[Confirmed: src/app/mcp/route.ts]`), so the platform default applies; every measured number is far below it. No timeout risk at these sizes on this machine. Caveat: timings are from a warm local Postgres with a synthetic schema, not the hosted pooler, so treat them as a floor, not a promise.

## Code checks (uncommitted CC-13 work)

| Command | Result |
|---|---|
| `npm run typecheck` | **4 errors**, all in `src/components/AddToPicklist.test.tsx` (TS2493/TS2339 on `mock.calls` tuples). Not a CC-13 file, not modified. This is TIDY-02. |
| `npm run lint` | **4 errors / 280 warnings**. Errors: `src/components/PicklistV2.tsx:672` (`no-html-link-for-pages`), `src/lib/connector/__tests__/tools.test.ts:165,169` (`no-explicit-any`), `src/lib/connector/tools/list-decks.ts:52` (`prefer-const`). None is a CC-13 file. |
| `npm test` (full) | **3449 passed, 1 failed, 46 skipped** across 298 files. The single failure is `registry-and-isolation.test.ts` "descriptions match CC-06 … estimate wording" (TIDY-01). |
| `npx vitest run src/lib/connector src/components/connector` | 310 passed, 1 failed (same TIDY-01), 4 skipped. |
| `edit-tools.test.ts` (targeted) | **45/45 passed**, including "a 120-card deck build goes to the database as ONE request", "more than 200 cards … rejected", "request_card_move goes straight through", "tool text: … 120 limit, free copies only", "a move … says Claude moved it, with no 'you approved'". |
| Limits equality tests | **2/2 passed**: `AI_LIMITS` equals the last `_ai_limits()` definition (draft, since not applied) and equals `docs/oracle/contracts/claude-connector-cc13-amendment.types.ts`. |

The single test failure is pre-existing and not caused by this work: at `HEAD` the `get_deck` description already had no "estimate" and the failing assertion at `registry-and-isolation.test.ts:32` is unchanged; the CC-13 diff only adds a `get_buying_list` assertion, which passes. The four lint errors and four type errors are in files CC-13 did not touch.

No HTTP endpoint changed by CC-13 (the work is a migration plus tool/screen wording), so there is no endpoint request to make; the equivalent database entry points (`ai_submit_change`, `ai_approve_pending`, `ai_undo_group`, `ai_list_recent_changes`) were called directly and their actual JSON responses are quoted above.

### CC-13 screen wording (implemented; not clicked through)

- `ConnectionTab.tsx` CAN list: "Change up to 120 cards in one request and move cards between decks straight away. You can undo each request here for 7 days, in one click"; CAN'T list: "Do edits over 120 cards in one request without your yes here (over 200 is refused)" — present, correct numbers.
- `SetupGuideTab.tsx`: "Claude can build a whole deck in one request. Each request has a single Undo in Recent changes, for 7 days… Requests over 120 cards wait for your yes." — present.
- `RecentChangesTab.tsx:89`: multi-card Undo says "Undone. N changes reversed." (single card keeps the named sentence) — present. Note: it is inline in the component, not in `change-sentences.ts` as the Developer report states; behaviour matches the spec.
- I could not visually click these screens in this task: doing so needs the app running against a database with a signed-in session, and the task is limited to a throwaway database and text checks. The code paths are covered by component tests (310 passing).

## Code numbers equal the draft

| Constant | SQL draft | `edit-config.ts` | Contract `.types.ts` | Match |
|---|---|---|---|---|
| `direct_max` | 120 | 120 | 120 | yes |
| `split_window_minutes` | 30 | 30 | 30 | yes |
| `split_max` | 200 | 200 | 200 | yes |
| `hourly_max` | 500 | 500 | 500 | yes |
| `undo_days` | 7 | 7 | 7 | yes |
| `pending_hours` | 24 | 24 | 24 | yes |
| `max_waiting` | 20 | 20 | 20 | yes |
| `max_request` | 200 | 200 | 200 | yes |
| `claude_undo_max` | 200 | 200 | 200 | yes |

Sentences build their numbers from `AI_LIMITS` (no stale "10" / "60" literals) `[Confirmed: src/lib/connector/change-sentences.ts]`; no stale "over 10" / "Up to 10" / "60 cards" wording remains in the touched connector tool text or screens.

## Failures and who must fix them

- **CC-13: none.** Nothing for Architect and nothing for Developer in the drafted database change or the CC-13 code.
- **Pre-existing, not CC-13:** TIDY-01 (the one failing connector test) and TIDY-02 (four `AddToPicklist.test.tsx` type errors) → **Developer**, per test-plan section H. The 4 lint errors → **Developer** (housekeeping; note the developer report listed 3 and missed `PicklistV2.tsx:672`).

## Observations (no action required for CC-13; for Gene/Architect to file if wanted)

1. **In your hand refusal is functional but unfriendly.** `sleeve_copy` is refused by the trigger at execute time, not by `_ai_plan`, so the client gets a database error rather than a plain refusal code. Recommendation: Architect adds `NOT uc.in_hand` to the sleeve/move plan checks so the refusal is named (the amendment's "gap 1"). Behaviour today is safe: nothing changes.
2. **Claude's 200-row undo cap is unreachable for new requests.** Because 121+ cards wait (and approved rows are owner-only for Claude), Claude-made groups top out at 120. The cap is correct for later; just do not expect to see it exercised in normal use.
3. **The limits equality test can fall back to the draft after apply.** If the migration is applied but its values ever drift from `AI_LIMITS`, the test silently compares the draft and passes. Low risk; Developer could make the fallback conditional on no migration defining `split_max`.
4. **No `maxDuration` on the MCP route.** Fine at the measured sizes; worth a deliberate number if a 200-row approval ever gets slow on the hosted pooler.

## New decisions made (need owner confirmation)

- None.

## Assumptions

- "Throwaway" means a brand-new local cluster with no real data; production column semantics for the base tables were taken from `src/types/supabase.ts`, which is the generated live schema.
- The six pre-existing helper routines were replaced by simple stand-ins; the paths they cover are not where CC-13 changes behaviour (`deck_add`, moves, undo of `deck_add`, list). The `sleeve_copy` undo path (`_ensure_default_storage_location_id`) used a stand-in that returns the user's default location.
- A 200-card request is expected to wait (over `direct_max` 120), so the 200-row timings were measured on the approval/execute and owner-undo path; the pending submit (plan only) was timed separately.
- Local environment: `brew install postgresql@17` (17.12) was installed on this machine for the rehearsal; the default Homebrew cluster was not used and was not started.

## Challenges to locked decisions

- None. (D-034a wording is Gene's to record after approval; the behaviour tested matches the Architect's proposed wording.)

## Open questions

- Owner: approve applying `supabase/drafts/20261117100000_cc13_loosen_limits.draft.sql` to the hosted database, then shipping the code in the same window? Until then code and database disagree (see the Developer report), so it should not ship alone.
- Gene: file observation 1 (plain refusal for In your hand) as an Architect follow-up, or accept the generic error?

## Verification

- Throwaway local Postgres 17.12, port 55432; applied real migrations `20261116130000`…`20261116190000` unmodified, then the draft — all clean; baseline `_ai_limits()` 10 / 40 / 60 / 10 before, 120 / 200 / 500 / 200 / 200 after — PASS.
- 43 database assertions via `ai_submit_change` / `ai_approve_pending` / `ai_undo_group` / `ai_list_recent_changes` / `_ai_gate` / `_ai_plan` — 43 PASS, 0 FAIL (see sections 1–5, G, F), plus 6 timing measurements.
- Rollback applied then draft re-applied — old values, `card_move` and `LIMIT 300` restored; new values back — PASS.
- `npm run typecheck` — 4 errors, all pre-existing in `AddToPicklist.test.tsx` (TIDY-02).
- `npm run lint` — 4 errors, all pre-existing / outside CC-13 files.
- `npm test` — 3449 passed, 1 failed (pre-existing TIDY-01), 46 skipped.
- `npx vitest run src/lib/connector src/components/connector` — 310 passed, 1 failed (TIDY-01), 4 skipped.
- `npx vitest run src/lib/connector/__tests__/edit-tools.test.ts` — 45 passed (includes the 120-card / 201-refusal / move / tool-text / limits-equality cases).
- Hosted database: **untouched**. No `supabase link`, no `db push`, no hosted connection string used; `supabase/migrations/` unmodified.
