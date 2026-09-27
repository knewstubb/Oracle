# Report: reconciliation load failure after reimport
Role: Frontend
Status: PARTIAL
Task as received: Diagnose the reconciliation data load failure after deleting and reimporting collection data, apply the smallest safe frontend fix if applicable, validate it, and report remaining baseline issues.

## Changed files
- `src/components/reconciliation/ReconciliationSummary.tsx` — preserves the reconciliation-load error, displays an explicit load-error state instead of the successful empty state, and surfaces the API's returned error detail in the toast and page.
- `src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` — adds a regression test for a failed reconciliation API request and updates the contract fixture fields.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The screenshot's "Failed to load reconciliation data" toast is produced by the reconciliation GET request failing, not by an empty but valid reconciliation response. This is confirmed by the component's fetch path and error handling.
- Showing the returned API error detail is appropriate for this private single-user application and is needed to diagnose the live backend failure.

## Challenges to locked decisions
- None.

## Open questions
- The exact live Supabase/API error remains unknown because this worktree has no live browser session or deployed environment credentials. The current UI discarded that response detail, which this fix corrects.
- Existing project reports identify `supabase/migrations/20260927120000_import_reconciliation_slot_states.sql` as a draft/unapplied forward migration. That may explain a live schema/function mismatch, but it must be confirmed from the API error or deployed migration history before anyone applies or changes database files. No API/schema file was modified here.

## Root cause
- The visible success message was a frontend false positive. When `GET /api/onboarding/reconciliation` failed, `ReconciliationSummary` set `view` to `null`; its render condition treated both `!view` and a valid empty response as "All imported cards are reconciled." The component also replaced the backend's error body with the generic message "Failed to load reconciliation data." [Confirmed: `src/components/reconciliation/ReconciliationSummary.tsx` before this fix.]
- The underlying request failure is in the route/RPC path: `GET /api/onboarding/reconciliation` calls `getImportReconciliation`, which calls the `get_import_reconciliation` Supabase RPC. [Confirmed: `src/app/api/onboarding/reconciliation/route.ts`, `src/lib/import-reconciliation.ts`.] It cannot be reproduced locally without the deployed response.

## Verification
- `./node_modules/.bin/vitest --run src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx src/components/reconciliation/__tests__/ConflictCard.test.tsx src/components/reconciliation/__tests__/StateButtonGroup.test.tsx src/lib/__tests__/import-reconciliation.test.ts src/lib/__tests__/import-reconciliation-rpc.test.ts src/app/api/onboarding/reconciliation/reconciliation.routes.test.ts` — 6 files, 44 tests passed.
- `./node_modules/.bin/eslint src/components/reconciliation/ReconciliationSummary.tsx src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` — passed with no errors or warnings after removing the synchronous effect state reset.
- `./node_modules/.bin/tsc --noEmit` — failed on 195 repository-wide pre-existing errors; no errors in `src/components/reconciliation`, `src/app/api/onboarding/reconciliation`, or `src/lib/import-reconciliation`.
- Browser/network reproduction — unavailable: Playwright has only an `about:blank` tab and this worktree has no live environment credentials.
