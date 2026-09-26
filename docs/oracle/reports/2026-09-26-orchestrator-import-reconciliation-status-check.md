# Report: Import reconciliation status check (T-22 / T-24)
Role: Orchestrator
Status: DONE
Task as received: "Can you check where we are up to" after merging the T-22 Frontend implementation and cancelling T-23.

## Changed files
- No files changed — this was a read-only status check.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The owner is asking for the current state of the T-22 / T-23 / T-24 workstream specifically.
- The single source of project status is `docs/oracle/status.md`.

## Challenges to locked decisions
- None.

## Open questions
- The contract `docs/oracle/contracts/import-reconciliation-redesign.md` §13 still lists the four owner questions as open. Per the owner, these are now decided: already-sleeved imports stay hidden, finish grouping is deferred, and alternate-printing loading will use whichever approach is most efficient. The contract should be updated to reflect that these questions are closed.

## Verification
- `docs/oracle/status.md` read — T-22 marked DONE, T-23 CANCELLED, T-24 IN PROGRESS [Confirmed: docs/oracle/status.md].
- Frontend implementation present on `main` [Confirmed: src/components/reconciliation/ReconciliationSummary.tsx and related files; git log shows merge commit `01a0720`].
- New API route directory empty [Confirmed: `src/app/api/onboarding/reconciliation/` does not exist].
- Draft migration present and still marked DRAFT [Confirmed: supabase/migrations/20260926140000_import_reconciliation_redesign.sql lines 1–2].
- Recent git log shows status-only commits for T-22/T-23/T-24 [Confirmed: `git log --oneline -5`].

## Where things stand
1. **T-22 (Frontend + contract)** — DONE and merged to `main`. The redesigned reconciliation screen is built and wired to the four new contract routes, but it cannot be exercised end-to-end yet because the routes do not exist.
2. **T-23 (competing contract)** — CANCELLED.
3. **T-24 (Backend routes + RPCs)** — IN PROGRESS per the status board, but no route files or backend code have landed in the repo yet. This is the active blocker for the feature.
4. **Database migration** — Drafted (`20260926140000_import_reconciliation_redesign.sql`) but not deployed. It is pending owner approval after Backend finishes T-24.
5. **Owner clarifications** — Locked in as stated: conflict-free already-sleeved imports remain hidden, finish grouping is deferred, and alternate-printing loading will use the most efficient approach.

Next concrete step: Backend delivers the four `/api/onboarding/reconciliation/*` routes and the RPCs behind them. After that, the migration can be reviewed and applied.
