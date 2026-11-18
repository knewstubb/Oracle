# Report: cc13-rehearsal
Role: Gene (Orchestrator)
Status: DONE
Task as received: "start" (after: next is the CC-13 database change, which needs a throwaway test before you approve it — shall I start the Tester on that?)

## Summary for the owner
The Tester rehearsed the CC-13 database change on a brand-new throwaway database and all 43 checks passed; the real database was not touched. Recommended next step: approve applying it, then save the matching code, because the code and the database change must go live together.

## What was handed off
- Tester agent `6108c296-0153-45a9-9c7d-67f1d27789e1` (main workspace, no worktree; the CC-13 code and draft are uncommitted there), model `opencode-go/deepseek-v4.1-flash`.
- Scope: rehearse `supabase/drafts/20261117100000_cc13_loosen_limits.draft.sql` and its rollback on a throwaway Postgres, check 120/200/500 limits, moves applying straight through, one-click undo of a 120-card group, Recent changes with three 100-row groups, the In-your-hand refusal, 120/200-row timings; then code checks and code/database number equality. Never touch the hosted database.

## Result (from `reports/2026-11-17-tester-cc13-verify.md`)
- 43/43 database assertions PASS, 0 FAIL; 6 timings.
- Limits: 120 applies, 121 waits, 200 accepted, 201 refused; hourly 500; same-deck 30-minute total 200; moves no longer always wait.
- Moves: applied with a group; Claude cannot undo its own move; owner undo restores the copy; a move queued before the change still approves.
- Undo: 120-row group in one call; 200-row group after owner approval; Claude cap 200, owner has no cap; owner-approved groups remain owner-only.
- Recent changes: three 100-row groups all complete, newest 50 groups, 2000-row safety cap never cuts a group; the old `LIMIT 300` defect is fixed.
- In your hand: `sleeve_copy` refuses (trigger `copy_in_hand`) and nothing changes; the refusal is safe but generic (see CC-20). Copy already in another deck refused; `add_cards_to_deck` never touches an existing copy.
- Rollback: restores 10/40/60/10, `card_move` waiting and `LIMIT 300`; draft re-applies cleanly.
- Timings (local, synthetic schema): 120 submit 11 ms, 120 undo 11 ms, 200 submit 3 ms, 200 approve+execute 10 ms, 200 owner undo 16 ms, list 300 rows 46 ms. Floor, not a promise for the hosted pooler.
- Code: `npm test` 3449 passed, 1 failed (pre-existing TIDY-01); 4 type errors (TIDY-02); 4 lint errors (none in CC-13 files; the Developer report listed 3 and missed `PicklistV2.tsx:672`). Code and database numbers match on all nine values.
- Hosted database untouched: no link, no push, no hosted connection; `supabase/migrations/` unmodified.

## New decisions made (need owner confirmation)
- Owner gate 1: approve applying the draft migration to the hosted database, and gate 5: save the matching code to main in the same window (code and database disagree if only one ships).
- CC-20 proposed (not started): name the In-your-hand refusal in the sleeve/move plan checks. Recommendation: take it immediately after CC-13 is applied.

## Assumptions
- The rehearsal's stand-in base tables and six helper routines are adequate because the changed paths (deck_add, move, undo of deck_add, list) do not rely on them; the Tester stated this and the trigger tests used the real live trigger SQL.
- The Tester installed Homebrew `postgresql@17` on this machine for the throwaway cluster; the default cluster was not started. This is local tooling only and does not affect Oracle or its data.
- The Developer's CC-13 code sits uncommitted in the main working tree; nothing was committed or pushed by this task.

## Challenges to locked decisions
- D-034a — the second sentence (edits over about 10 and every move wait for approval) is superseded by the owner's CC-13 approval (120, moves straight through). Amendment wording is in `reports/2026-11-17-architect-cc13-limits.md`; to be recorded by Gene with 120/121–200 in place of 100/101–200, only after the owner approves the gate. Not edited.

## Open questions
- Approve applying the migration and saving the matching code?
- Take CC-20 (named In-your-hand refusal) now or later?

## Verification
- `paseo run` → agent `6108c296-0153-45a9-9c7d-67f1d27789e1`, model `opencode-go/deepseek-v4.1-flash`, cwd the project (no worktree) — DONE.
- Tester report reviewed: verdict PASS, all checks evidenced, hosted database declared untouched.
- `git status` — no product code, test or migration file changed by this task; only `docs/oracle/status.md` and the two reports.
