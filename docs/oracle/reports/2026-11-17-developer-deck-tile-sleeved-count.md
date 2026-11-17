# Report: deck-tile-sleeved-count
Role: Developer
Status: DONE
Task as received: On the deck cards show the count as "55/100 (14 sleeved)" (decks page, each deck's details card). Meaning confirmed by the owner: first number = cards on the deck's list, second = target size for the format, bracket = cards physically in the deck (same rule as the deck page header). Use the word "sleeved" exactly.

## Summary for the owner
Each deck tile on the Decks page now reads like "55/100 (14 sleeved)". The "(14 sleeved)" part appears a moment after the tile, when the slower details load, and the tile does not change height. Decks with no target size read "40 cards (7 sleeved)".

## Changed files
- src/components/DeckTile.tsx — count line is now list count / target, plus " (N sleeved)" when known; single line, no wrap
- src/components/DeckTile.test.tsx — tests: Commander, other format target, no-target format, zero, details arriving later
- src/lib/deck-list-data.ts — new per-deck "in deck" count using the existing rule (basic-lands counts-as-sleeved); deck card read also fetches the two generic-basic flags
- src/lib/deck-list-data.test.ts — tests for that count (proxies, generic basics, maybeboard/sideboard, per deck)
- src/app/api/decks/details/route.ts — adds the per-deck sleeved counts to the details response only
- src/app/page.tsx — merges the counts into the tiles when details arrive

## New decisions made (need owner confirmation)
- Wording: the tile says "sleeved" at the owner's request, while the app renamed Sleeved to "In deck" on 2026-11-17. Other screens still say "in deck". Owner to decide whether to log this as an exception or rename later.
- The count line no longer says "cards"/"slots" after the number, and no longer shows resolved cards as the first number for not-ready active decks. It always shows the list count, as the owner described.

## Assumptions
- In-deck rule: a card counts when it has an assigned copy (original or proxy), or is a generic basic marked sleeved (missing flag = sleeved). Maybeboard and Sideboard are excluded. This is the same rule the deck page header uses (card-statuses counts: original + proxy + sleeved generics).
- Draft tiles (DraftDeckTile) show no card count today and are not used on the Decks page, so they are left as is.
- A deck absent from the details sleeved list shows "(0 sleeved)" once details have loaded.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- Matched the deck page header rule on 12 decks, read only (e.g. Sliver me timbers list 100 / tile 100 / header 100; Tidus 98/98/98; Yedora the Explorer 102/102/102; Test C 61/0/0). The header side was recomputed from the same rows using the card-statuses rules, not by opening the page.
- npm test: 2 failures, both known (ImportIntentFlow env flag, connector description); everything else passes
- npm run typecheck: 4 errors, all in AddToPicklist.test.tsx, same on main without my change
- npm run lint: 4 errors in files not touched (list-decks.ts, tools.test.ts, a storage link), same as before
