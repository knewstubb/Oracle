# Report: reconciliation load timeout after reimport
Role: Orchestrator
Status: BLOCKED
Task as received: I deleted all my data and then reimported but the result was still the same with it saying all cards were reconsiled and then this error

## Summary for the owner
The import is not producing a genuine zero-conflict result. The reconciliation database query is timing out, and the screen was incorrectly translating that failure into “All imported cards are reconciled.” Deleting and reimporting cannot fix this; the next fix must make the reconciliation query fast enough for the current collection size before the approved database draft is deployed.

## Changed files
- docs/oracle/status.md — records the confirmed timeout and blocks blind deployment.
- docs/oracle/reports/2026-09-28-orchestrator-reconciliation-timeout.md — records the diagnosis.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The configured Supabase project and user are the project the owner is using in the screenshot.
- The screenshot's generic toast is from `GET /api/onboarding/reconciliation`; this is confirmed by the component and route path.

## Challenges to locked decisions
- None.

## Open questions
- Architect/Backend must identify which part of `get_import_reconciliation` causes the timeout for 1,744 unsettled claims and produce a tested performance-safe correction.
- The local O-005 draft migration is still not remote; `supabase migration list` shows local `20260927120000` with no matching Remote entry. It must not be applied until the timeout risk is addressed.
- The accidental Frontend patch that preserves the load error and stops the false success state is in `evil-tiger`, not main. It should be reviewed separately from the database fix.

## Verification
- `supabase migration list` — remote includes `20260926140000`; local `20260927120000` has no Remote entry.
- Read-only live RPC with the configured collection user — `get_import_reconciliation` returned PostgreSQL `57014: canceling statement due to statement timeout`.
- Read-only live RPC for latest batch `26fd945c-ce3f-465f-8740-e3e707c4b041` — same timeout after approximately 8.5 seconds.
- Read-only claim count — 1,744 unsettled `import_sleeve_claims` rows.
- Frontend accidental-research report — confirms the UI false-positive empty state and local regression test, but cannot identify the live database error without the live call.
- No rows were deleted, changed, or finalized; no migration was deployed.
