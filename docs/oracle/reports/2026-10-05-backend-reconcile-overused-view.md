# Report: Reconcile view — overused cards (v1, read-only)
Role: Backend / Frontend
Status: PARTIAL
Task as received: Lets make a new view called Reconsile that shows card that are overused. First can you check the card management page to see if that is a good starting point. / for reconsile proxies should not count

## Summary for the owner
There is a new Reconcile page in the navigation. It lists cards that more decks want than you own originals of, with the decks that compete for each one on the right and the decks listed on the left. It is read-only for now: you can see the overuse but not yet change Unsleeved / Sleeved / Proxy from here.

## Changed files
- src/lib/reconcile-overuse.ts — works out overused cards from deck slots and owned originals.
- src/lib/reconcile-overuse.test.ts — 7 tests for the rules below.
- src/app/api/reconcile/overused/route.ts — read-only endpoint for the page.
- src/app/reconcile/page.tsx — the Reconcile page (decks left, cards right).
- src/components/reconcile/OverusedCardRow.tsx — card row, matching the import reconciliation layout.
- src/components/reconciliation/ReconciliationNav.tsx — export the shared list item for reuse.
- src/components/Sidebar.tsx, TopNav.tsx, MobileHeader.tsx — add the Reconcile entry.

## New decisions made (need owner confirmation)
- Overuse rule for this view: slots wanting an original (any deck, Active or Brew) greater than originals owned. Proxy-filled slots add no demand; proxy copies add no supply. Differs deliberately from the separate shortage list in D-027, where proxies do not cancel a shortage.
- Basic lands are excluded entirely, including Archidekt basics that carry a printing.
- Cards with no original owned are excluded (those are shortages, not overuse).

## Assumptions
- "Sleeved" for a deck row means the slot has a copy placed (copy_id set); otherwise Unsleeved.
- Maybeboard slots (category Maybeboard) are not demand.

## Challenges to locked decisions
- none

## Open questions
- Which actions should Reconcile offer (Sleeve, Move from [deck], Proxy)? They need the placement write path, not built in v1.

## Verification
- vitest src/lib/reconcile-overuse.test.ts — 7 passed.
- Read-only run against real data: 86 overused cards for the owner's account before the basic-land exclusion (basics topped the list); 0 for the second account.
- eslint on new files — clean. tsc --noEmit — no errors in new files.
- Sidebar.test.tsx has 2 failures that also fail without these changes (expects a "Cards" label).
- Page not opened in a browser (requires login).
