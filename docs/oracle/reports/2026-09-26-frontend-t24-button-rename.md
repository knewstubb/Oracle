# Report: t24-button-rename
Role: Frontend
Status: DONE
Task as received: The owner decided to rename the finish button from "Go to Decks" to "Allocate Cards". Update the component and any related tests that assert the label text. Do not change any other behavior. Verification: run the affected tests (e.g., `npm test -- src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx`). They should pass. Run `npx tsc --noEmit`. The current baseline is 158 primary `error TS` messages. Do not increase it.

## Changed files
- `src/components/reconciliation/ReconciliationSummary.tsx` — replaced every user-facing "Go to Decks" label with "Allocate Cards": the empty-state finish button, the explanatory text that names the button, and the fixed finish-bar CTA (including the unresolved-count variant).

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The rename applies to all places in this component where the finish action is labeled "Go to Decks", including the empty-state button and the helper text, because they all refer to the same finish action.
- No other component currently renders this button label; tests asserting the text did not exist outside this component.

## Challenges to locked decisions
- None.

## Open questions
- None.

## Verification
- `npm test -- src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` — 1 test passed.
- `npx tsc --noEmit` — 158 `error TS` messages (matches baseline, no increase).
- `npm run lint` — no new lint errors or warnings in `ReconciliationSummary.tsx`; existing project-level lint issues are unchanged.
