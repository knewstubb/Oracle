# Report: T-24 contract update and Backend handoff

Role: Orchestrator
Status: PARTIAL
Task as received: "Read AGENTS.md, .paseo/agents/orchestrator.md, docs/oracle/decisions.md, and docs/oracle/status.md before anything else. Update docs/oracle/contracts/import-reconciliation-redesign.md with the following owner decisions before Backend starts T-24. Once the contract is updated, hand off T-24 to Backend per the existing plan."

## Changed files

- `docs/oracle/contracts/import-reconciliation-redesign.md` —
  - Closed §13 Q3 and Q4 with owner decisions: `planned` is unresolved only while an action is still possible; losing the allocation race is resolved.
  - Rewrote §5 to define **slot-level resolved** (per instance) and **printing-level resolved** (per row), requiring the server to check every printing option (imported + alternates) for room.
  - Renamed the finalize trigger from "Go to Decks" to "Allocate Cards" throughout.
  - Added §14 confirmation that the full-batch PATCH response updates every deck's rows in place, not just the edited deck.
  - Added a debt-table entry for a future persistent "who is contesting the same cards" view, reusing `GET /api/onboarding/reconciliation?includeResolved=true`.
  - Updated §7.6 so `get_deck_conflict_counts` uses the same slot-level resolved predicate.
- `docs/oracle/contracts/import-reconciliation-redesign.types.ts` — added `resolved: boolean` to `ConflictInstance`; updated row `resolved` comment.
- `src/types/import-reconciliation.ts` — mirrored the type change.
- `src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` — added the new required `resolved` field to the test fixture.
- `docs/oracle/status.md` — updated T-24 to `BLOCKED` with reason; added open-item follow-ups for Architect (migration) and Frontend (button label).

## New decisions made (need owner confirmation)

None. All decisions were supplied by the owner and recorded verbatim.

## Assumptions

- The owner intends the new §5 semantics to be implemented server-side, including the per-instance `resolved` flag.
- The draft migration `supabase/migrations/20260926140000_import_reconciliation_redesign.sql` is the source of truth for the reconciliation RPCs and will be revised to match the updated contract.
- The button rename to "Allocate Cards" is a contract/UX decision; the actual UI label change is a separate Frontend micro-task.

## Challenges to locked decisions

None.

## Open questions

- The draft migration's `get_import_reconciliation` currently computes `resolved` using the old rule (`planned_count = 0` and no unsatisfiable sleeve). It does not compute per-instance `resolved` or check alternate-printing room for `planned` slots. The Backend implementation returned for T-24 calls this RPC directly, so it does not yet satisfy contract §5. Who should revise the migration: Architect (normal owner) or Backend as part of T-24? I recommend Architect revises the draft migration and the owner approves it, then Backend re-verifies.
- The actual UI button still reads "Go to Decks". A Frontend micro-task is needed to apply the "Allocate Cards" label in `src/components/reconciliation/ReconciliationSummary.tsx`.

## Verification

- `npx tsc --noEmit` current post-fix working tree: **158 primary `error TS` messages** (using reused `node_modules`).
- Pre-merge commit `b2011d8` checked out in a temporary worktree sharing the same `node_modules`: **195 primary `error TS` messages**.
- The earlier "252 errors" figure was a count of total log lines (including TypeScript detail continuations), not a count of primary errors. The discrepancy is therefore a counting-method difference, not a `npm ci` vs reused `node_modules` lockfile difference. Backend should use **~158 primary errors** as the baseline and must not increase it.
- After the Backend route implementation and the fixture fix: `npx tsc --noEmit` still reports **158 primary errors**; no new errors in touched files.
- `npm test -- src/lib/__tests__/import-reconciliation.test.ts src/lib/__tests__/import-reconciliation-rpc.test.ts src/lib/__tests__/import-sleeve-claims.test.ts src/app/api/onboarding/reconciliation/reconciliation.routes.test.ts src/app/api/onboarding/finalize/route.test.ts src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` — **42 tests passed**.
- Client cross-deck update verified: `src/components/reconciliation/ReconciliationSummary.tsx` replaces the entire `view` from each PATCH response (`setView(data.view)` at lines 160, 195, 225), so all decks' rows update together.

## What happens next

1. **Architect** revises `supabase/migrations/20260926140000_import_reconciliation_redesign.sql` so `get_import_reconciliation` returns per-instance `resolved` and row-level `resolved` per contract §5 (owner approval required because this is a migration).
2. **Backend** re-verifies T-24 against the revised migration.
3. **Frontend** applies the button rename from "Go to Decks" to "Allocate Cards".
