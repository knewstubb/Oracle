# Report: O-005 timeout-fix handoff
Role: Orchestrator
Status: PARTIAL
Task as received: Do it

## Summary for the owner
The safe screen fix is staged: a failed reconciliation request now shows the actual error instead of claiming everything is reconciled. The live database timeout is now handed to the Architect with real workload evidence; no database change has been deployed.

## Changed files
- docs/oracle/status.md — records the owner instruction and active performance-correction stage.
- docs/oracle/reports/2026-09-28-orchestrator-o005-timeout-fix-handoff.md — records this handoff.
- Frontend changes are recorded in `docs/oracle/reports/2026-09-28-frontend-reconciliation-load-error.md` and `docs/oracle/reports/2026-09-28-frontend-o-005-conflictcard-slotstate.md`.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The owner instruction authorizes staging the UI fix and preparing/testing the database correction; production migration deployment remains a separate database gate.
- The Architect may revise the O-005 draft or produce a forward performance migration, but must preserve the approved slot-state and badge rules.

## Challenges to locked decisions
- None.

## Open questions
- Which query shape/index strategy makes the reconciliation RPC complete within the live statement timeout for 1,744 unsettled claims.

## Verification
- Read-only live RPC: `57014 canceling statement due to statement timeout` for the configured user.
- Read-only latest-batch RPC: same timeout after approximately 8.5 seconds.
- `supabase migration list`: remote lacks local draft `20260927120000`.
- Frontend source/test/report copied byte-for-byte from the reviewed `evil-tiger` worktree; independent main-checkout validation is next.
- No rows changed and no migration deployed.
