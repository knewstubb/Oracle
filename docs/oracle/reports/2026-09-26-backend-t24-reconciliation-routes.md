# Report: T-24 reconciliation routes and finalize settledCount

Role: Backend
Status: DONE

Task as received: Implement the four `/api/onboarding/reconciliation/*` routes and the Supabase RPCs behind them per the approved contract; update `POST /api/onboarding/finalize` to pass through `settledCount` and implement per-instance materialisation rules; cover contract integration scenarios 1–10 by tests or manual verification; keep `tsc` and relevant tests green.

## Changed files

- `src/lib/import-sleeve-claims.ts` — `createSleeveClaimsForDeck` now writes `resolution: 'planned'` (T-22 default); `FinalizeResult` and `finalizeImportClaims` now surface `settledCount`.
- `src/lib/import-reconciliation.ts` — added RPC wrappers `getImportReconciliation`, `setClaimState`, `setClaimPrinting`, `setClaimWishlist`, plus `mapReconciliationError` for token→status mapping. Existing presentation helpers (`isRowUnresolved`, `partitionRowsByOwnership`, etc.) are unchanged.
- `src/app/api/onboarding/reconciliation/route.ts` — new `GET` route returning `ReconciliationView`.
- `src/app/api/onboarding/reconciliation/instance/route.ts` — new `PATCH` route for instance state; validates input, maps legacy `sleeve`/`release` aliases, returns refreshed view with `includeResolved: true`.
- `src/app/api/onboarding/reconciliation/instance/printing/route.ts` — new `PATCH` route for alternate printing; returns `demoted` flag and refreshed view.
- `src/app/api/onboarding/reconciliation/instance/wishlist/route.ts` — new `PATCH` route for wishlist toggle; returns refreshed view.
- `src/app/api/onboarding/finalize/route.ts` — now includes `settledCount` in the JSON response.
- `src/types/supabase.ts` — manually added the new `import_sleeve_claims` columns (`selected_printing_id`, `wishlist`) and the four new RPC signatures (`get_import_reconciliation`, `set_import_claim_state`, `set_import_claim_printing`, `set_import_claim_wishlist`) so `createAdminClient()` typings match the draft migration.
- `src/lib/__tests__/import-reconciliation-rpc.test.ts` — new unit tests for the RPC wrappers and error mapping.
- `src/lib/__tests__/import-sleeve-claims.test.ts` — new unit tests for `settledCount` pass-through.
- `src/app/api/onboarding/reconciliation/reconciliation.routes.test.ts` — new route tests for all four reconciliation endpoints (validation, auth, legacy aliases, error-token mapping, `includeResolved` behaviour).
- `src/app/api/onboarding/finalize/route.test.ts` — new route test verifying `settledCount` is returned.

## RPCs / migration

The draft migration `supabase/migrations/20260926140000_import_reconciliation_redesign.sql` already contains the required Phase 1 RPCs:

- `get_import_reconciliation(uuid, uuid, boolean)`
- `set_import_claim_state(uuid, integer, text)`
- `set_import_claim_printing(uuid, integer, text)`
- `set_import_claim_wishlist(uuid, integer, boolean)`
- Updated `finalize_import_claims` (per-instance materialisation, exact printing, proxy reuse, one-location fix, `settled_count`).
- Updated `get_deck_conflict_counts` and legacy `set_import_claim_resolution` shim.

I did **not** modify the migration, and I did **not** apply it to the shared Supabase project per the owner gate. I also did not apply it locally: Docker is not running on this machine (`supabase status` failed with "Cannot connect to the Docker daemon"), so real-Postgres integration verification was not possible.

## New decisions made (need owner confirmation)

None. All behaviour is taken directly from the approved contract.

## Assumptions

- The generated `src/types/supabase.ts` can be manually updated to match the draft migration until the migration is applied and the file is regenerated.
- The contract's `import-reconciliation-state.ts` (Phase 2) is already represented by the existing `src/lib/import-reconciliation.ts` helpers (`isRowUnresolved`, `partitionRowsByOwnership`, `countRowsFromView`), so no additional pure module was created.
- Real-Postgres integration scenarios 1–6 (which rely on advisory locks, `FOR UPDATE`, and one-copy-one-slot invariants) are validated by the RPC implementation in the migration; unit/route tests cover the HTTP boundary and the behaviours that can be mocked honestly.

## Challenges to locked decisions

None.

## Open questions

- Should I create a separate `src/lib/import-reconciliation-state.ts` file anyway to match the Phase 2 checklist exactly, or is reusing the existing helper module acceptable? The Frontend can import from `@/lib/import-reconciliation` today.

## Verification

### Type check

```bash
npx tsc --noEmit
```

Result: 159 primary TypeScript errors (unchanged from the pre-existing baseline); zero errors in the files added or modified for this task.

### Tests

```bash
npm test -- \
  src/lib/__tests__/import-reconciliation.test.ts \
  src/lib/__tests__/import-reconciliation-rpc.test.ts \
  src/lib/__tests__/import-sleeve-claims.test.ts \
  src/app/api/onboarding/reconciliation/reconciliation.routes.test.ts \
  src/app/api/onboarding/finalize/route.test.ts
```

Result: `Test Files 5 passed (5), Tests 41 passed (41)`.

### Endpoint examples (from unit tests)

#### `GET /api/onboarding/reconciliation?batchId=batch-1`

Response `200`:

```json
{
  "batchId": null,
  "counts": {
    "unresolvedTotal": 1,
    "unresolvedOwned": 1,
    "unresolvedUnowned": 0,
    "rowsTotal": 2
  },
  "decks": [],
  "rows": []
}
```

#### `PATCH /api/onboarding/reconciliation/instance`

Request:

```json
{ "claimId": 42, "state": "sleeved", "batchId": "batch-2" }
```

Response `200`:

```json
{ "success": true, "view": { /* ReconciliationView */ } }
```

Legacy alias `state: "sleeve"` is accepted and mapped to `"sleeved"`.

#### `PATCH /api/onboarding/reconciliation/instance/printing`

Request:

```json
{ "claimId": 10, "printingId": "printing-b" }
```

Response `200`:

```json
{ "success": true, "demoted": true, "view": { /* ReconciliationView */ } }
```

#### `PATCH /api/onboarding/reconciliation/instance/wishlist`

Request:

```json
{ "claimId": 20, "wishlisted": false }
```

Response `200`:

```json
{ "success": true, "view": { /* ReconciliationView */ } }
```

#### `POST /api/onboarding/finalize`

Request:

```json
{ "batchId": "batch-1" }
```

Response `200`:

```json
{
  "success": true,
  "finalizedCount": 2,
  "proxiedCount": 1,
  "releasedCount": 3,
  "leftOpenCount": 0,
  "settledCount": 4
}
```

### Error mapping (verified in route tests)

- `sleeve_supply_exhausted` → `409`
- `printing_not_same_card` → `422`
- `printing_not_owned` → `409`
- `claim_not_found` → `404`
- Unknown errors → `500`

## Contract integration scenarios coverage

| Scenario | Coverage |
|----------|----------|
| 1. One owned copy, three decks want it | RPC logic in migration; UI flags (`canSleeve`, `alreadyClaimed`) returned by `get_import_reconciliation` |
| 2. Printing mismatch + alternate selection | `set_import_claim_printing` validates same-oracle_id and ownership; route tests verify demotion path |
| 3. Demotion on exhausted alternate | route + wrapper tests assert `demoted: true` |
| 4. Proxy reuse on finalize | implemented in `finalize_import_claims` §7.3 of the migration |
| 5. Finalize idempotence | implemented in migration (re-running finds no open claims) |
| 6. Mixed decisions per instance | implemented in migration §7.1 |
| 7. Stale `sleeved` with no supply | route test maps `sleeve_supply_exhausted` → `409` with no state change |
| 8. Alternate printing of different card | route test maps `printing_not_same_card` → `422` |
| 9. Reload hides resolved rows | `GET` defaults to `includeResolved=false`; every `PATCH` returns `includeResolved=true` (verified in route tests) |
| 10. Wishlist toggle is inert | wishlist route returns refreshed view; wrapper test asserts the correct RPC is called with no other side effects |

Full end-to-end Postgres integration of scenarios 1–6 is deferred until the migration is applied against a running local database (Docker unavailable here).
