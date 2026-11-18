# Report: card-roles-contract
Role: Architect
Status: DONE
Task as received: write the Architect's database and API contract for the card roles and deck jobs feature, plus draft migrations with rollbacks, nothing applied to any live database, no application code, nothing committed; first record owner answers 7d-1 and 7d-2 (2026-11-18) in the brief and spec. Include in the report a plain-words summary for the owner of what each of the four database changes (DB-1 to DB-4) does, in the order to run them, and what the owner would see after each, and fold in the recorded test results from docs/oracle/reports/2026-11-18-architect-card-roles-contract-test-results.md. Also settle in plain words the 'default category' guess and 285 test-deck cards storage (baseline vs personal layer).

## Summary for the owner
The design for card roles, deck jobs and strategy points is written, along with four small database changes, each with an undo. Nothing was applied to your live database. All four were tried on a throwaway copy built from your real migrations, and all 255 checks passed. Your two answers on health targets and the Notes box are recorded. Five decisions are left for you (below).

## Plain-words summary of the four database changes (run in this order)
Each is applied by you, one at a time. Each can be undone by its own rollback. A rollback refuses to run if it would throw away your saved roles, jobs or points, unless you say so explicitly.
1. **DB-1, card roles.** Adds a shared master list of what cards do (starts empty) and your own personal list on top, where you can add or remove a role on a card. After it you can set the 13 roles on a card in the card window ("Set by you"). Claude does nothing yet.
2. **DB-2, Claude's proposals.** Lets Claude propose roles through the existing change log, so every proposal is labelled, counted in health, and undone with one click for 7 days. Claude's proposals are applied at once up to 120 cards, and 121 to 200 wait for your approval. After it Claude can propose roles for a deck, and you can accept, change or dismiss them, or press Undo all. Jobs and strategy points answer "not switched on yet".
3. **DB-3, deck jobs.** Adds storage for each card's job and "why it is here" in a deck. After it you can set a job and reason on a card and in the Card jobs layer. Claude can propose jobs, and a card's role and job count as one change. You can group the deck list by job.
4. **DB-4, strategy points.** Adds storage for a deck's strategy points (a sentence, the cards or card type it covers, and an optional "counts as ramp" effect). After it you can write strategy points in Your strategy and Claude can propose them. They adjust health counts once the health slice is built. It can run before DB-3.
Deck health stores nothing. It is worked out each time.

## Settled in plain words
- **The old "default category" guess** is not copied anywhere. It allows one label per card, is stored by card name, and has never been checked. Claude can see it as a hint, marked unreliable, but it is never saved as a role. It stays until the later bulk pass removes it.
- **The 285 test-deck cards** go into your personal layer only, as "Proposed by Claude" in pencil. They count in health straight away and one click undoes the whole batch. The shared master list stays empty and locked. A bad guess can never reach shared data or anyone else. Only after you are happy with the quality will a separate, separately approved job promote reviewed roles to the shared list.

## Owner answers recorded
- 7d-1 (Agree): the health target order is the picked build, then the commander's all-builds average, then the common guide. Recorded in the brief (7d, 7c item 1, D-064 text and risks) and in the spec (D-d, roll-up, health order).
- 7d-2 (Agree): the free-text strategy box becomes Notes, and the dated notes move under it as Earlier notes. Recorded in the brief and in the spec (layer table and section 17).

## Test results folded in (from the recorded test file)
Throwaway PostgreSQL 17.12 on this Mac, built from the real migrations through CC-15b. Never the hosted project, and the cluster was deleted after each run.
| Test | Result |
|---|---|
| DB-1 | 51 PASS, 0 FAIL |
| DB-2 (on DB-1) | 84 PASS, 0 FAIL |
| DB-3 (on DB-1, DB-2) | 56 PASS, 0 FAIL |
| DB-4 (on DB-1, DB-2) | 52 PASS, 0 FAIL |
| All four, both apply orders, every rollback order | 12 PASS, 0 FAIL |
What they prove:
- A second signed-in user sees none of the first user's roles, jobs, points or change log, and cannot write or run any new function. This holds even with write access deliberately granted.
- The change log's append-only guard still works, and a deck with new-kind log rows can still be deleted.
- Undo of a batch restores every card. Claude's undo refuses with "changed since" and changes nothing if you touched one card. Your own undo restores the rest and names the card it left alone.
- Each rollback puts the database back exactly as it was (a fingerprint of every function, constraint, table and index matched). It refuses while data exists or out of order, and re-applying works.
- 120 cards each with a role and a job apply at once and are logged as 120 changes. 121 wait. 201 are refused. Nothing is ever partly written.
- Claude never overwrites your value. A different Claude value is stored beside yours.
- The role names and limits in the types file match the database.
Full per-check lists are in the evidence folder.

## Changed files
- `docs/oracle/contracts/card-roles-and-deck-jobs.md` (new): the database and API contract, sections 1 to 15.
- `docs/oracle/contracts/card-roles-and-deck-jobs.types.ts` (new): shared types for the contract.
- `supabase/drafts/20261118120000_roles_db1_card_roles.draft.sql` and `.rollback.sql` (new).
- `supabase/drafts/20261118120100_roles_db2_change_kinds.draft.sql` and `.rollback.sql` (new).
- `supabase/drafts/20261118120200_roles_db3_deck_card_jobs.draft.sql` and `.rollback.sql` (new).
- `supabase/drafts/20261118120300_roles_db4_strategy_points.draft.sql` and `.rollback.sql` (new).
- `docs/oracle/reports/evidence/roles-db/` (new): throwaway-database test scripts and their outputs.
- `docs/oracle/reports/2026-11-18-architect-card-roles-contract-test-results.md` (new, kept because the contract points to it).
- `docs/oracle/briefs/card-roles-and-deck-jobs.md` (edited): 7d-1 and 7d-2 recorded.
- `docs/oracle/specs/card-roles-and-deck-jobs.md` (edited): 7d-1 and 7d-2 recorded.
- `docs/oracle/reports/2026-11-18-architect-card-roles-contract.md` (this file).
Not touched: `src/`, `decisions.md`, `status.md`, `supabase/migrations/`, the hosted database. Nothing committed.

## New decisions made (need owner confirmation)
1. **Undo all after you accepted some cards.** Recommendation: undo the cards you have not touched and tell you which were left (for example "Undone 40 cards. 3 you had already accepted were left as they are."). Alternative: refuse the whole undo.
2. **Dismissed role suggestions.** Recommendation: Claude stays quiet about that role for that card in every deck. Jobs and strategy points are remembered per deck.
3. **Should a job change health counts?** Recommendation: no. Only a strategy point does. Jobs only feed the Plan and win conditions line.
4. **Should the "what changed" notice survive a reload?** Recommendation: no for now. It would otherwise need one more small table.
5. **A second Claude batch on the same card** replaces the first batch's value, so Undo of the first batch is refused as "changed since" although you did nothing. Recommendation: leave it. Undoing the second batch restores the first one's value, so nothing is lost.
Also: the common guide numbers (36 lands, 10 ramp, 10 card advantage, 10 interaction) are still not checked against sources and should be before D-064 is locked.

## Assumptions
- `ref_printings` has a uuid printing id and a uuid card id [Confirmed live, table and column list only, read-only].
- The CC-15a and CC-15b migrations in the repo match what is live [Approximate: status.md says applied; not compared with the hosted database].
- The test harness stand-ins for `deck_strategy` and `decks` defaults are approximate. None of the four changes touches them.
- The old unused `deck_health` table is not written by this feature [Approximate: not checked whether anything still reads it].

## Challenges to locked decisions
- none. Gap noted, not a decision: the Strategy tab's read and save routes look up a deck without an owner filter [Confirmed: src/app/api/decks/[id]/strategy/route.ts]. It is harmless with one user and must be fixed in slice 4 before multi-user.

## Open questions
- The five owner decisions above.
- Before any change goes live: a read-only check of the hosted database that the change log's kind list, the pending list and the grants of the four functions DB-2 renames match the test setup. DB-2 refuses to run on a wrong base but cannot see grants.

## Verification
- Throwaway Postgres runs (`run.sh test_db1` to `test_db4`, `test_chain`): 51, 84, 56, 52 and 12 PASS, 0 FAIL.
- `tsc --noEmit --strict --skipLibCheck` on the types file: exit 0.
- `git status` result is recorded in the final section below.

### git status check
`git status` run at the end: modified are only the brief and the spec. New are only files under `docs/oracle` (contract, types, two reports, evidence folder) and `supabase/drafts` (eight files), plus the pre-existing untracked `.agents/tasks`. The `.worktrees` folder did not appear in the status output. Nothing under `src/` changed (0 entries). No throwaway database process is running and no scratch files remain.
