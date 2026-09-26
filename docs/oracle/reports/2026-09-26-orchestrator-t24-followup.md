# Report: T-24 follow-up — resolved semantics and button rename

Role: Orchestrator
Status: DONE
Task as received: "Lets proceed" after the T-24 contract update and Backend handoff revealed a migration mismatch.

## Changed files

- `supabase/migrations/20260926140000_import_reconciliation_redesign.sql` —
  Architect revision: each instance now returns `resolved`; row-level `resolved`
  requires every instance to be resolved; `planned` slots are resolved only when
  no owned printing (imported or alternate) has room; `get_deck_conflict_counts`
  uses the same slot-level predicate (contract §5 / §7.6).
- `src/components/reconciliation/ReconciliationSummary.tsx` — Frontend revision:
  the finish button and explanatory text now read "Allocate Cards" instead of
  "Go to Decks".
- `src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` —
  added the contract-required `resolved` field to the `ConflictInstance` fixture.
- `docs/oracle/status.md` — T-24 moved to `DONE`; migration gate added to Open
  items.

## New decisions made (need owner confirmation)

None.

## Assumptions

- The owner intends the new §5 semantics to be enforced in the migration before
  the reconciliation flow goes live.
- The migration remains DRAFT until the owner explicitly approves deployment.

## Challenges to locked decisions

None.

## Open questions

- Migration deployment gate: `supabase/migrations/20260926140000_import_reconciliation_redesign.sql`
  is aligned with the contract but still carries a DRAFT header. When should it
  be approved and applied?

## Verification

- `npx tsc --noEmit` — **158 primary `error TS` messages**, matching baseline, no
  increase.
- `npm test -- src/lib/__tests__/import-reconciliation.test.ts src/lib/__tests__/import-reconciliation-rpc.test.ts src/lib/__tests__/import-sleeve-claims.test.ts src/app/api/onboarding/reconciliation/reconciliation.routes.test.ts src/app/api/onboarding/finalize/route.test.ts src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` —
  **42 tests passed**.
- Reports from the two specialist agents:
  - `docs/oracle/reports/2026-09-26-architect-t24-resolved-semantics.md`
  - `docs/oracle/reports/2026-09-26-frontend-t24-button-rename.md`
