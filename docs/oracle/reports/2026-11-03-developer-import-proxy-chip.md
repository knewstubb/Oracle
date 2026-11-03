# Report: import-proxy-chip
Role: Developer
Status: DONE
Task as received: Update the review step of the import modal to add a blue proxy icon chip to the crads that are proxies so they are easier to identify

## Summary for the owner
Proxy cards now have a blue mask icon, without a text label, after the card's set and collector number in the import review list. When a row contains multiple copies but only some are proxies, the icon appears as soon as at least one copy is marked Proxy.

## Changed files
- `src/components/manabox-import/ImportRowEditor.tsx` — show the blue proxy icon after the card ID, with no text label.
- `src/components/manabox-import/ImportIntentReview.test.tsx` — verify the chip appears after marking a card or copy as a proxy.

## New decisions made (need owner confirmation)
- none

## Assumptions
- A row should show the proxy icon if at least one copy on that row will be imported as a proxy.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- `npx vitest run src/components/manabox-import/ImportIntentReview.test.tsx` — 24 tests passed.
- `npx eslint src/components/manabox-import/ImportRowEditor.tsx src/components/manabox-import/ImportIntentReview.test.tsx` — passed.
- `npx tsc --noEmit` — passed.
