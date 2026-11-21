# Report: custom categories from the deck's own cards
Role: Developer
Status: DONE
Task as received: Deck settings > Deck health > Custom categories on World Breaker (deck 789202706) shows "No categories yet" although the cards carry categories (Land 41, Ramp 21, Land Recursion 12, Sacrifice Engines 12, Removal & Wipes 11, Card Advantage 11, Landfall Payoffs 8, Sacrifice Payoffs 7, Commander 1). Make the list come from the deck's cards, with targets, Claude proposals, Add/remove category, same list in the rail tiles.

## Summary for the owner
Custom categories now lists the categories the deck's cards already carry, each with its card count. For World Breaker that is Land, Ramp, Land Recursion and the rest, without Commander. Each row has a target you can set (or "No target"), and the rail's Deck health uses the same list. No database change was needed.

## Changed files
- src/lib/deck-health-settings.ts — new customRows(): categories from cards joined with stored targets by name; rail tiles use it
- src/components/deck-strategy/DeckHealthTab.tsx — custom list built from customRows; first target on a card-only category creates its stored row; "Claude proposes N to M"; remove/clear buttons
- src/lib/deck-health-settings.test.ts, src/components/deck-strategy/DeckSettingsWindow.test.tsx — tests (including the World Breaker reproduction)

## New decisions made (need owner confirmation)
- Order: most cards first, then A to Z. The Cards tab has no stored category order I could find, so I did not use one.
- Rows: Commander, Maybeboard, Sideboard, Companion and "Other" (card with no category) never appear.
- A category with cards has an "x" that clears only its target. A stored category with no cards can be removed.
- Updates: the list is computed from the deck's cards on every render, so it follows Claude's regrouping while the window is open and on reopen (same cards source as the Cards tab). Autosave, no Save button.

## Assumptions
- Targets are matched to categories by name, ignoring upper/lower case.
- Claude's proposals already exist in the app (stored proposed_min/proposed_max on deck_health_categories, with Confirm/Decline only in this window). Nothing in this task creates them; I did not check whether a connector tool writes them.
- Frames E and H of the Figma states sheet were not opened; the rail uses the existing tile rows ("N / min-max", "N No target"), shown under See all.

## Challenges to locked decisions
- none

## Open questions
1. Land: shown as a normal row "Land" (41 on World Breaker). In Custom mode there is no separate default Lands row, so it is not listed twice. Hide it instead?
2. Renamed or emptied category: its stored target stays stored and keeps showing as a row with 0 cards and the note "No cards in this category right now", with a Remove button. It is never deleted automatically and it does not follow a rename (the new name starts at No target). Should a rename carry the target over?
3. Does Claude's connector write category proposals today? The storage and Confirm/Decline exist; I did not verify a writer.
4. Rail tiles for custom categories still do not open the cards panel (unchanged).

## Verification
- Reproduction: the new World Breaker test failed on the old tab ("No categories yet") and passes now.
- vitest deck-health-settings, deck-strategy, deck-rail — all pass
- npm test — one unrelated card-details test fails intermittently (a different file failed on each of two runs; passes on the base commit's run); otherwise passes
- tsc --noEmit — 4 errors (the known AddToPicklist ones)
- eslint src — 1 error, 245 warnings (the known error)
- Not run in a browser; no live database access.
