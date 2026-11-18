# Test results: card roles and deck jobs database drafts (CC-26)
Role: Architect. Date: 2026-11-18. Status: DONE (drafts and tests written; nothing applied to any database; nothing committed).
Task as received: write the Architect's database and API contract for the card roles and deck jobs feature, plus draft migrations with rollbacks for DB-1 to DB-4, each tested on a local throwaway Postgres with the CC-15 harness.

## Summary for the owner
Four small database changes are written, each with an undo, and each was tried on a throwaway copy of the database built from your real migrations. All 255 checks passed. Nothing was applied to your live database. The tests also show the undo (rollback) puts the database back exactly as it was, and that a second signed-in user cannot see or change the first user's roles, jobs or strategy points. One decision is yours (section "Open questions").

## What was run
Throwaway cluster: PostgreSQL 17.12 (Homebrew), 127.0.0.1:55434, created in a temp folder and deleted when each script ends (no cluster or temp folder left behind; checked after the last run). Never the hosted project. Harness: `docs/oracle/reports/evidence/roles-db/run.sh` (a copy of the CC-15 harness: `00_base.sql` stand-in tables, then the real migrations 20261116130000, 150000, 150100, 150200, 150300, 190000, 20261117100000, 20261023170100, 20261117120000, 20261117200000 (CC-15a) and 20261117200100 (CC-15b) applied unmodified, then `01_seed.sql`, then the draft under test).
Commands (from `docs/oracle/reports/evidence/roles-db/`), each run once more at the end on the final files:
`./run.sh test_db1`, `./run.sh test_db2`, `./run.sh test_db3`, `./run.sh test_db4`, `./run.sh test_chain`.

| Test | Draft under test | Result |
|---|---|---|
| `test_db1.sh` | `20261118120000_roles_db1_card_roles` | **51 PASS, 0 FAIL** |
| `test_db2.sh` | `20261118120100_roles_db2_change_kinds` (on DB-1) | **84 PASS, 0 FAIL** |
| `test_db3.sh` | `20261118120200_roles_db3_deck_card_jobs` (on DB-1, DB-2) | **56 PASS, 0 FAIL** |
| `test_db4.sh` | `20261118120300_roles_db4_strategy_points` (on DB-1, DB-2; DB-3 NOT applied) | **52 PASS, 0 FAIL** |
| `test_chain.sh` | all four, two apply orders, every rollback order | **12 PASS, 0 FAIL** |
Full per-check lists (name, PASS/FAIL, detail): `test_db1.out`, `test_db2.out`, `test_db3.out`, `test_db4.out`, `test_chain.out` in the same folder.

## What the tests prove, against the brief
- **Row security (a second user cannot read or write the first user's rows).** In every test, a signed-in user 2 (database role `authenticated`) sees 0 of user 1's rows in `user_card_roles`, `deck_card_jobs`, `deck_strategy_points`, `ai_change_log` and `ai_pending_changes`, and gets "permission denied" for any insert, update or delete and for every new function. The anonymous role is denied everywhere. The shared list `ref_card_roles` is readable by a signed-in user, writable only by the service role (checks D1-40 to D1-49, E2-95/96, E3-50 to E3-53, E4-60 to E4-63). Defence in depth: with insert/update/delete deliberately granted to signed-in users, user 2 still changes 0 of user 1's rows and cannot insert (row-level security) (D1-46/47/48, E3-52, E4-62), and all data is byte for byte unchanged. Inside the functions, user 2's id against user 1's deck, card, point, group or batch gives `deck_not_found`, `connection_revoked`, `change_not_found` or "accepted 0", and writes nothing (E2-47, E2-71, E2-91/92, E3-54, E4-41, E4-53).
- **The append-only guard still works.** Any change to a log row other than the undo stamp fails with `ai_change_log_is_append_only`, for old kinds (D1-51) and for card_label, with a job, and strategy_point rows (E2-97, E3-55, E4-64). A deck that has new-kind log rows can still be deleted (the log rows keep their data and lose only the deck link): E2-98, E3-56, E4-65.
- **Undo of a batch.** Claude's Undo restores every card of a batch in one go (E2-73, E3-43, E4-46), refuses all-or-nothing with `changed_since` and changes nothing when the owner touched one card (E2-76, E3-40, E4-43), the owner's Undo restores the rest and names the card it left alone (E2-77/78, E3-41, E4-44), and a dismissed row Claude had overwritten comes back exactly (E2-74, E3-42, E4-45). Also: already undone, 7-day window closed, owner-approved batches are owner-only for Claude, switched-off connection, unknown actor, deck gone.
- **Rollback restores the previous state.** `t.fp()` takes an md5 of every function definition and grant, every constraint, every table, index and trigger in `public`. It was taken before each change and compared after its rollback: equal for DB-1 (D1-63, D1-66), DB-2 (E2-B3), DB-3 (E3-64, E3-67), DB-4 (E4-75, E4-78), and for the whole set in either order (C-11, C-21). Every rollback first refuses while it holds the owner's data or new-kind history (D1-61, E2-B1/B2, E3-61/62, E4-71/73), refuses out of order (C-10, E4-72), works with `SET oracle.rollback_allow_data_loss = 'yes'`, and re-apply afterwards works (D1-65, E2-B6, E3-66, E4-77, C-22). The old kinds keep working after each rollback (D1-64, E2-B4, E3-65, C-13).
- **Counting rule and limits.** 120 cards, each with a role and a job (240 values), apply at once and write 120 log rows (E3-30). A role and a job for one card are one log row (E3-21). 121 cards wait as `over_ten`, writing nothing, then approving applies all 121 as owner-approved (E2-62/63, E3-31/32). 120 + 81 for one deck in 30 minutes waits as `recent_total` (E2-61). 201 cards are refused (E2-51/65). A held request whose card has gone since is refused and writes nothing (E2-66). 11 strategy points in a request and a 31st point in a deck are refused (E4-18, E4-35, E4-38). A strategy request waits as `busy` when the hourly total is used up (E4-54/55).
- **Never overwrite the owner.** A Claude value that differs from the owner's is stored beside it and reported `beside_yours`; the owner row is byte for byte unchanged (E2-27, E3-25). Claude never writes an owner row; the shared list stays empty after Claude proposals (E2-23).
- **Nothing partly written.** Every refusal leaves all tables byte for byte unchanged (E2-53, E4-37), including a request with one bad card among good ones (E2-52, E4-36).
- **Race.** Two sessions proposing the same card at once: the second waits on the per-user lock and then writes nothing (E2-A0/A1).
- **Contract agreement.** The 13 role names and the numbers in `card-roles-and-deck-jobs.types.ts` equal the database's CHECK lists and `_ai_limits_roles()` (D1-08/09, E2-03b); the types file still type-checks (`tsc --strict`, exit 0).

## Changed files
- `supabase/drafts/20261118120000_roles_db1_card_roles.draft.sql`, `.rollback.sql` (new)
- `supabase/drafts/20261118120100_roles_db2_change_kinds.draft.sql`, `.rollback.sql` (new)
- `supabase/drafts/20261118120200_roles_db3_deck_card_jobs.draft.sql`, `.rollback.sql` (new)
- `supabase/drafts/20261118120300_roles_db4_strategy_points.draft.sql`, `.rollback.sql` (new)
- `docs/oracle/reports/evidence/roles-db/` (new): `run.sh`, `00_base.sql`, `01_seed.sql`, `results.sql`, `test_db1.sh` to `test_db4.sh`, `test_chain.sh`, their `.out` files, `README.md`
- `docs/oracle/contracts/card-roles-and-deck-jobs.md` (section 15 added; sections 4 and 5.1 amended), `card-roles-and-deck-jobs.types.ts` (owner result shapes, beside shape, refusal codes)
- `docs/oracle/reports/2026-11-18-architect-card-roles-contract-test-results.md` (this file)
Not touched: `src/`, `decisions.md`, `status.md`, any migration in `supabase/migrations/`, the hosted database. Nothing committed.

## What the drafts changed in the contract (all in section 15 of the contract)
- DB-1 has a fifth function, `_roles_fail`, so it needs no `ai_*` object. Three more private helpers exist (`_job_canonical_name`, `_strategy_point_normalize`, `_ai_strategy_point_prepare`).
- Payload shapes: the database takes `id` and `card_name` per card (as `set_card_category` does); the tool maps its `slot_id` and `name`.
- An identical Claude proposal that is already waiting is skipped as `unchanged` (it is not written twice).
- A strategy point's sentence is unique per deck whatever its proposer, so Claude proposing the owner's sentence is skipped (`already_exists`); Accept and Change convert a Claude point to the owner's in place.
- `get_deck_strategy_points` returns dismissed rows too; health and the editor filter them.
- The four renamed `*_pre_roles` functions keep exactly their old grants. This was a real defect found by the fingerprint test (the first draft widened one of them) and fixed.
- A Claude request that skips a role the card does not have (for example "remove tutor" from a card with no tutor role) skips it as `unchanged` and does not log it.

## New decisions made (need owner confirmation)
- Section 15.9: one waiting Claude row per card and role (per deck for jobs). A second Claude batch for the same card replaces the first batch's value; Undo of the first batch is then refused with "changed since". Recommended to leave as is.
- An owner's own role or job change deletes a waiting Claude row with the identical value but keeps a dismissed one (the memory).

## Assumptions
- `ref_printings` has `scryfall_id uuid` primary key and `oracle_id uuid` [Confirmed live per the contract]; the harness stand-in has only those columns plus `name`. The real table's extra columns are not used.
- `deck_strategy` unique key on `deck_id` and `decks` defaults are stand-ins (as in CC-15) [Approximate]; none of the four changes touches them.
- The real CC-15a and CC-15b files in `supabase/migrations/` are the same as what is live (status.md says applied) [Approximate: not compared with the hosted database; that needs a read-only check the owner has not allowed].
- `remove_deck_card_with_release` and `set_deck_command_zone` run as in the CC-15 harness.

## Challenges to locked decisions
- none

## Open questions
- Owner decisions 1 to 5 in section 13 of the contract are unchanged and still open. Section 15.9 above is new.
- Before any of the four is applied live: a read-only check of the hosted database that `ai_change_log`'s kind list, `ai_pending_changes`' action list and the grants of the four functions that get renamed match the harness (the DB-2 draft refuses to run on a wrong base, but it cannot see grants).

## Verification
- `./run.sh test_db1` / `test_db2` / `test_db3` / `test_db4` / `test_chain` (throwaway Postgres 17.12): 51, 84, 56, 52 and 12 PASS, 0 FAIL, no failed psql step.
- `node_modules/.bin/tsc --noEmit --strict --skipLibCheck docs/oracle/contracts/card-roles-and-deck-jobs.types.ts`: exit 0.
- All eight drafts start with "DRAFT. NOT APPLIED. Needs owner approval". `git status`: only new or changed docs and drafts; no commit.
