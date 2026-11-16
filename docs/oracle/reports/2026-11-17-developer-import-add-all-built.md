# Report: import-add-all-built
Role: Developer
Status: DONE
Task as received: Build 'Add all to the Picklist' on the import result screen. Owner chose (2026-11-16) that Add all covers ONLY cards from that import. Architect confirmed no database change is needed (import copy ids). Pass the ids through the import API/result to the result screen; reuse the Unsorted page's 'Send to' dropdown + Add all pattern; disabled until a destination is chosen; prevent double-submit; cards that can't be added are named with the reason; no button if nothing landed in Unsorted. Do NOT touch Sleeved/Unsleeved wording.

## Summary for the owner
After an import, the result screen now shows the same "Send to" dropdown and "Add all n to the Picklist" button as the Unsorted page, covering only the cards that import put in Unsorted. The button stays off until you choose a box or deck, ignores a second click while saving, and names any card it could not add with the reason. If nothing went to Unsorted (for example everything went into a box), there is no button.

## Changed files
- src/lib/import-deck-result.ts — keeps each saved copy's id from the deck import answer (rejects an answer without them) and lists the ones sent to Unsorted
- src/lib/manabox-collection-import.ts — Unsorted destination reports every saved copy id; box/binder reports an empty list
- src/components/manabox-import/ImportWhereTheyWent.tsx — shows the Send to + Add all bar when there are Unsorted copies
- src/components/AddToPicklist.tsx — added a guard against a fast double click
- docs/oracle/contracts/know-where-cards-are.types.ts — added `unsortedCardNames` (see decisions)
- src/lib/import-deck-result.test.ts, src/lib/manabox-import-deck-destination.test.ts, src/lib/manabox-import-write.test.ts — fixtures and checks for the ids
- src/components/manabox-import/ImportWhereTheyWent.test.tsx — new: no button when empty, disabled until chosen, only this import's ids, double click sends once
- docs/oracle/status.md — one update line

## New decisions made (need owner confirmation)
- Contract addition (Architect to confirm): `placement.unsortedCardNames`, names parallel to `unsortedCopyIds`, so a card that cannot be added can be named. The ids alone would have shown "That card". Additive and optional.

## Assumptions
- The result screen is already inside the app's data provider (it uses the same hooks as other import screens); the component test mounts it that way.
- Existing "Left off:" toast wording of the Unsorted page is reused for the reasons.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- npx tsc --noEmit — clean for changed files; 4 errors remain in AddToPicklist.test.tsx, present before my change (checked by stashing)
- eslint on changed files — clean
- vitest on import-deck-result, AddToPicklist, manabox-import components and manabox libs — 233 passed
- Not exercised: a live import against the hosted database; the Sleeved/Unsleeved wording was not touched.
