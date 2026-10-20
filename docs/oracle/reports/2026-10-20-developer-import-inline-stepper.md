# Report: import-inline-stepper
Role: developer
Status: DONE
Task as received: Replace the floating CopyCountPicker in src/components/manabox-import/ with the in-place stepper per docs/oracle/specs/manabox-import.md (rev 6), the mockup, and the Designer report 2026-10-20-designer-import-inline-stepper.md. Escape/outside click collapses keeping the number (owner confirmed). Bulk bar applies to all copies with no stepper. No floating element. Update/add tests; remove dead CopyCountPicker code and its test.

## Summary for the owner
On the import review list, clicking Proxy (or Unsleeved) on a card with 2 or more copies now turns that card's own control into "Proxy − 1 +" with the remaining Original count beside it. Nothing floats over neighbouring rows any more. Clicking away, Escape or Enter folds it back to something like "Original 1 · Proxy 1" and keeps the number. Cards with one copy, and the bulk Proxy/Unsleeved buttons, behave as before. Not yet checked by eye in the browser.

## Changed files
- src/components/manabox-import/CopyCountStepper.tsx — new in-place stepper (spinbutton, − / +, live Original remainder, outside-click/Escape/Enter/Tab collapse)
- src/components/manabox-import/CopyTypeControl.tsx — swaps segments for the stepper while editing; refocus + collapse announcement; CopyCountPicker removed
- src/components/manabox-import/ImportCardList.tsx — floating picker and its handler removed; passes editing state to the row control
- src/components/manabox-import/types.ts — setSplitCount fixed to spec (raise takes from Original then other type; lower returns to Original)
- src/components/manabox-import/CopyTypeControl.test.tsx — rewritten: open, bounds, whole row, Escape, outside click, collapsed split, 1-copy row, stepper, setSplitCount
- src/components/manabox-import/ManaBoxDeckImportFlow.test.tsx — flow test uses the stepper instead of the popover

## New decisions made (need owner confirmation)
- none beyond those in the Designer report

## Assumptions
- Only one stepper open at a time reuses the existing openPickerId state (prop names kept to avoid touching the dialogs).
- Bulk bar code was already "all copies, no picker"; left unchanged.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- npx vitest run src/components/manabox-import src/components/collection src/components/DeckImportButton.test.tsx — 10 files, 77 tests passed
- npm run typecheck — clean
- eslint on changed files — 0 errors (3 pre-existing warnings)
- Spec states: collapsed, editing, at 1, at qty, split result, aria-live, keyboard implemented. Not tested: visual layout/width (~190 px) in a browser; Tab-away collapse not unit tested.
