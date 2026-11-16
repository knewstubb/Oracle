# Report: storage-page-freeze
Role: Developer
Status: DONE
Task as received: Owner report: opening Bulk Box (2131 cards) storage page seems frozen. Page the list, fetch valid decks on demand, check for real loops, verify, commit and push.

## Summary for the owner
Large storage boxes now show 100 cards at a time with a "Show more" button; search still looks through every card. The deck list for the Assign button is only loaded when you click Assign, so opening the page no longer fires thousands of requests.

## Changed files
- src/app/storage/[locationId]/page.tsx — 100-per-page rendering with Show more (list and grid), search resets paging; valid-decks query enabled only after first picker open
- src/components/DeckPickerPopover.tsx — optional onOpenChange callback

## New decisions made (need owner confirmation)
- Page size 100.

## Assumptions
- Windowing not needed once paged.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- npm run typecheck — pass
- eslint on touched files — 0 errors (3 pre-existing warnings)
- npm test — 3205 passed, 46 skipped
- Dev-server timing not done (needs live data/auth). Loop check: usePageHeader effects depend on title/subtitleKey only and setConfig is stable; query keys are stable. [Confirmed: src/contexts/PageHeaderContext.tsx] No real loop found; the freeze was the mass mount.
