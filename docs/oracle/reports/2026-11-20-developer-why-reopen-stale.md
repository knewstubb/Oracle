# Report: why-reopen-stale
Role: Developer
Status: DONE
Task as received: Bug: in the card details modal, text typed into "Why it's here" is not shown after closing and reopening the modal; it shows after a page refresh. Reproduce, fix, check Category / Also in.

## Summary for the owner
The Why text was saved correctly, but the card window kept showing a copy it had loaded earlier (kept for 30 seconds), so reopening showed the old, empty Why. Now the window's copy is updated the moment the Why saves, so reopening shows the new text without a refresh. Category and "Also in" were not affected: they read from the deck's own live card list, which already updates on save. The deck list does not display the Why, so nothing else needed changing.

## Changed files
- src/components/card-details/OverviewTab.tsx — after a successful Why save, update the cached Overview for that card [Confirmed: src/components/card-details/useCardDetailsData.ts staleTime 30s]
- src/components/card-details/CardDetails.test.tsx — new test: type Why, close, reopen, expect saved text; fake server now remembers saved Why

## New decisions made (need owner confirmation)
- none

## Assumptions
- Only the card window shows the Why in the app UI (the Claude connector reads it from the database directly).

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- New test failed before the fix, passes after.
- npm test — 365 files passed, 4541 tests passed.
- tsc — only the 4 known AddToPicklist.test.tsx errors; eslint on card-details — clean.
