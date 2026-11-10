# Report: v09b
Role: Architect
Status: DONE
Task as received: V-09b — In the clean trial worktree, edit docs/oracle/contracts/drafts/vector-trial/20261106120000_vector_trial_tables.sql as specified under V-09b in docs/oracle/reports/2026-11-06-gene-review-v04-v05-v09.md (plain create policy, no drops, header line about applying that file only, note that a second model needs a new migration); change nothing else, apply nothing. (Draft only; commit on trial/vector-clean; no push, no merge.)

## Summary for the owner
The written storage change already had the small safety tidy-up in it, so I changed nothing in it. It cannot delete anything when it runs, it says it must be applied on its own, and it notes that a second similarity model needs a new change. Nothing was applied and no database was touched. You can be asked for approval A3 next.

## Changed files
- docs/oracle/reports/2026-11-06-architect-v09b.md — this report. The draft SQL and the reverse script are unchanged.

## New decisions made (need owner confirmation)
- none

## Assumptions
- The V-09b spec is the one in the Gene review report (drop-plus-create pairs, header line, second-model note). The amendment report's copy is a shorter paraphrase of it and agrees.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- Read the draft in full [Confirmed: docs/oracle/contracts/drafts/vector-trial/20261106120000_vector_trial_tables.sql]. All six policies are plain `create policy`; there is no `drop policy` or any other drop statement (the word "drop" appears only in comments and table descriptions).
- Header lines present: "APPLY BY RUNNING THIS FILE ONLY, never by a blanket push: T-57's unapplied migration (20261013120000) sorts earlier" (line 30), and "A second embedding model needs a NEW migration" (line 31).
- The draft and reverse files have had one commit on this branch (8174382) and no working-tree changes, so the reverse script is unchanged.
- No SQL run, nothing applied.
