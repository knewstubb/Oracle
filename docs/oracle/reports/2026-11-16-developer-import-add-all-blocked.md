# Report: import-add-all-blocked
Role: Developer
Status: PARTIAL
Task as received: Build 'Add all to the Picklist' on the import result screen (previously deferred; Picklist routines and endpoints are live; Unsorted page already has a 'Send to' dropdown + Add all, reuse that pattern and components). Per contract know-where-cards-are.md and its spec. Cards that can't be added are named with the reason. Buttons disabled until a destination is chosen; prevent double-submit. Stop with PARTIAL and a plain question if a design decision is missing.

## Summary for the owner
Nothing changed in the app. The import result screen is told how many cards went to Unsorted, but not which ones, and "Add all" needs to know exactly which cards. Fixing that needs the Architect to extend what the import reports back (and, for imports into a deck, the stored routine that does the import).

## Changed files
- docs/oracle/status.md — one line recording this block
- docs/oracle/reports/2026-11-16-developer-import-add-all-blocked.md — this report

## New decisions made (need owner confirmation)
- none

## Assumptions
- Spec 21.7 scope: only copies that ended up in Unsorted are offered.

## Challenges to locked decisions
- none

## Open questions
1. For the Architect: the contract's import result (ImportPlacementResult) has counts and card names only, no copy ids. `/api/moves/lists` needs copy ids. Add e.g. `unsortedCopyIds` to the result.
   - Unsorted / default destination: the existing storage insert already returns `inserted_ids` [Confirmed: docs/oracle/contracts/know-where-cards-are.md line 112], so the import code can pass them through (small server change).
   - Deck destination: the `insert_user_copies_to_deck` routine returns per-card outcomes by position (filled/added/unsorted) with no copy id [Confirmed: src/lib/import-deck-result.ts], so it needs a new migration (Architect, needs approval) to return ids for the Unsorted ones.
   - Alternative (no database change): the result screen loads the Unsorted list and offers all of it, but that would include older Unsorted cards, not only this import, contradicting spec 21.7 ("8 cards are in Unsorted").
2. For the owner, plain: should "Add all" after an import cover only the cards from this import (needs the contract extension, recommended), or everything currently in Unsorted (works today, but the count may be larger than the import)?

Once decided, the UI work is small: reuse the existing provider, Send to dropdown and Add all button, with the same disabled-until-chosen and double-submit guard, and name skipped cards with their reason in the toast.

## Verification
- No code changed; no tests run.
