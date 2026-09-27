# Report: O-005 Frontend follow-up — ConflictCard slotState contract
Role: Frontend
Status: DONE
Task as received: Task O-005 Frontend follow-up: update src/components/reconciliation/ConflictCard.tsx to use the approved slotState contract so planned_claimed and planned_alt_available render the correct existing labels/actions, and update its ReconciliationSummary test fixture with slotState, alternateAvailable, overAllocated, and competingDemand. Do not redesign the interaction, change the deck badge, or modify API/schema files; use docs/oracle/specs/import-reconciliation-redesign.md and docs/oracle/contracts/import-reconciliation-redesign.types.ts as inputs. Done when: ConflictCard no longer conflates claimed-without-alternate with alternate-available, the fixture typechecks, targeted component tests pass, and the report lists any remaining typecheck/lint baseline issues.

## Changed files
- `src/components/reconciliation/ConflictCard.tsx` — replaced the single `instance.alreadyClaimed` boolean check (which only ever rendered "Already claimed" or nothing) with a `slotState`-keyed descriptor map (`SLOT_STATE_DESCRIPTOR`) covering both `planned_claimed` ("Already claimed") and `planned_alt_available` ("Alternate printing available") as distinct, non-conflated states, per contract `ConflictInstance.slotState` (states-doc rows 2/8 vs 3/9) and spec §8.1/§13. Applied at both the per-instance row (`SlotStateDescriptor`) and the card-header `StatusChip`.
- `src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` — added the missing required `ConflictInstance` fields to the mock fixture: `slotState: 'sleeved_owned'`, `alternateAvailable: false`, `overAllocated: false`, `competingDemand: 1`.
- `src/components/reconciliation/__tests__/ConflictCard.test.tsx` (new) — targeted regression tests asserting `planned_claimed` and `planned_alt_available` render their own distinct labels and never each other's, plus a no-descriptor case and a resolved/`sleeved_owned` case with no warning descriptor.

## New decisions made (need owner confirmation)
- Label text for `planned_alt_available`: used "Alternate printing available" (states-doc row label is "Planned (alt printing available)"; spec §20's copy table doesn't define an exact inline string for this specific descriptor, only for "Already claimed" and the disabled-Sleeved tooltip). Reused the existing amber "Warning / conflict" treatment from spec §13 (same colour token `--signal-warning`, `AlertTriangle` icon) since the states doc groups both under the same visual family and the spec does not assign `planned_alt_available` a separate colour. If the UX/UI role wants different exact copy, that's a one-line change to `SLOT_STATE_DESCRIPTOR`.
- Did not consume `alternateAvailable`, `overAllocated`, or `competingDemand` in `ConflictCard.tsx` rendering — the task scoped this to fixing the `planned_claimed`/`planned_alt_available` conflation using `slotState`, and instructed not to redesign the interaction. Existing card-level over-allocation warning banner and per-instance Sleeve-disabled logic already use `canSleeve`/`ownership`/`state` and were left untouched. `alternateAvailable` and `competingDemand` are exposed on the type for other consumers (e.g. future alt-printing affordance) but weren't required by this task's "done when" criteria.

## Assumptions
- `instance.alreadyClaimed` remains in the type (contract-owned) and is still true only for `planned_claimed`; I did not delete it, only stopped branching UI logic on it in favor of `slotState` as instructed. No behavior changes for any consumer that still reads `alreadyClaimed`.
- The duplicate rendering of the descriptor at both the card header (`StatusChip`) and the per-instance row (`SlotStateDescriptor`) is pre-existing structure carried over from before my change (the original code had `anyAlreadyClaimed` at the header and `instance.alreadyClaimed` per-row simultaneously) — not something this task asked me to consolidate, so I preserved that structure and adjusted my test assertions (`getAllByText` instead of `getByText`) to match rather than "fixing" an interaction question that belongs to UX/UI.

## Challenges to locked decisions
- none

## Open questions
- Confirm exact copy for the `planned_alt_available` descriptor label with UX/UI — spec §20 doesn't give a literal string for it (only "Already claimed" is specified verbatim).

## Verification
- `npm ci` — installed missing `node_modules` (was absent in this worktree; needed before any typecheck/lint/test could run). 828 packages added, 0 install errors.
- `./node_modules/.bin/tsc --noEmit` — 195 pre-existing errors, identical set before and after this change (confirmed via diff of sorted `error TS` lines); none in `src/components/reconciliation/**`. Matches README's documented baseline: "tests, typecheck, and lint do not currently pass" repo-wide. No new errors introduced by this task.
- `./node_modules/.bin/eslint src/components/reconciliation/` — 0 errors, 1 pre-existing warning (`@next/next/no-img-element` on the untouched `<img>` tag in `ConflictCard.tsx`, not introduced by this change).
- `./node_modules/.bin/vitest --run` on targeted files (`ConflictCard.test.tsx`, `ReconciliationSummary.test.tsx`, `StateButtonGroup.test.tsx`, `import-reconciliation.test.ts`, `import-reconciliation-rpc.test.ts`) — 4 files (later 3+2), 10/10 and 22/22 tests passed across runs, 0 failures.
