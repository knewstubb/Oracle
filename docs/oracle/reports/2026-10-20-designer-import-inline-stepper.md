# Report: import-inline-stepper
Role: designer
Status: DONE
Task as received: Replace the floating CopyCountPicker in the ManaBox import review list (T-56) with an in-place stepper (owner's option 1), update spec and mockup, specify keyboard/screen-reader and bulk behaviour, report conflicts with locked decisions.

## Summary for the owner
On a card with 2 or more copies, clicking Proxy (or Unsleeved) now turns that row's own control into a small "Proxy − 1 +" with "· Original 1" beside it. Nothing floats over other rows. Clicking elsewhere, Enter or Escape folds it back to "Original 1 · Proxy 1". Please confirm what Escape does (see below) and that selecting several cards and clicking Proxy sets all their copies to Proxy without a stepper.

## Changed files
- docs/oracle/specs/manabox-import.md — revision 6 note; picker component renamed to a stepper; states, interactions, keyboard, screen-reader, copy and contrast rows updated
- docs/oracle/mockups/manabox-import.html — live in-place stepper on every 2+ copy row, plus a static strip showing collapsed, editing and split states

## New decisions made (need owner confirmation)
- Escape (and Enter, Tab, clicking away) collapses and keeps the current number; changes apply live, there is no cancel.
- With several rows selected, bulk Proxy/Unsleeved applies to all copies and opens no stepper.
- At the maximum, the remainder shows "Original 0"; at 1 the − is dimmed, not hidden.
- Keys: ↑/→/+ add, ↓/←/− subtract, Home/End jump; no wrap.

## Assumptions
- The row's control column has room for about 190 px while editing; the Foil and name columns were not resized.
- The old 8+ copies number-input fallback is dropped; the stepper handles any quantity (Home/End help with large ones).

## Challenges to locked decisions
- none (D-047 still allows splitting by count; D-052 is about the commander picker only)

## Open questions
- Should Escape revert to the number from before editing instead of keeping it?

## Verification
- Script syntax check of the mockup (node Function parse) — OK
- Not run in a browser; interactive behaviour not visually checked.
