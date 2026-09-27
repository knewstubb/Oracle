# Report: O-005 deployment and live verification
Role: Orchestrator
Status: PARTIAL
Task as received: Approved

## Summary for the owner
The database fix is now live. The reconciliation query no longer times out: the latest live checks return 322 unresolved cards across 18 decks, so the importer should now show the real reconciliation list after refresh; the tested Frontend error-message fix is still local and has not been deployed.

## Changed files
- docs/oracle/status.md — records deployment completion and remaining Frontend release step.
- docs/oracle/reports/2026-09-28-orchestrator-o005-deployment-live.md — records this result.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The user's screenshot was captured before the database deployment; the live RPC now succeeds.
- The Frontend release will be handled separately because no commit or push was authorized.

## Challenges to locked decisions
- None.

## Open questions
- The tested Frontend changes still need a normal commit/deployment before the UI can show the detailed backend error when a future load failure occurs.

## Verification
- Preflight `supabase migration list` — only `20260927120000_import_reconciliation_slot_states.sql` was pending.
- `supabase db push --yes` — applied that single migration successfully.
- Post-deploy `supabase migration list` — `20260927120000` matches remotely.
- Read-only all-unsettled RPC — ~4.9s, success, 1,500 total rows, 322 unresolved (223 owned, 99 unowned), 18 decks.
- Read-only latest-batch RPC — ~4.9s, same successful result for batch `26fd945c-ce3f-465f-8740-e3e707c4b041`.
- No additional migration, row deletion, or data replacement was performed.
