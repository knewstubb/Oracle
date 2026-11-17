# Report: deck-category-min-width
Role: Developer
Status: DONE
Task as received: Set a minimum width on the category sections of the deck page card list so card names are not cut off; reflow 3 to 2 to 1 columns instead of squeezing.

## Summary for the owner
Category sections on the deck page now never get narrower than about 390px. As the window narrows the layout drops from three columns to two to one, instead of squeezing names down to a letter. Rows also give the card name all the spare space; the mana cost no longer reserves a fixed wide slot and the drag handle no longer takes row space.

## Changed files
- src/components/CardsTab.tsx — column count now follows the available width (min 390px per section, max 3), same shortest-column balancing as before
- src/components/CardGroupSection.tsx — row: mana cost takes natural width, spacer removed, drag handle positioned in the row padding so the name gets more room

## New decisions made (need owner confirmation)
- Minimum section width 390px (measured: the longest name in Yedora, "Nissa, Who Shakes the World", needs about 159px; at 390px a name gets about 168px).

## Assumptions
- Width is judged from the space the list actually has (sidebar included), not the window width.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- Local app, Yedora the Explorer, Category group: 700px = 1 column, 0 names cut; 1024px = 2 columns of 458px, 0 cut; 1440px = 3 columns of 439px, 0 cut; 1296px (just enough for 3) = 3 columns of 391px, 0 cut, narrowest name area 168px.
- Before the change at 360px sections (trial): 3 names cut, which is why 390px was chosen.
- npm run check: 2 failures remain, the known ImportIntentFlow env-flag test and a connector registry description test (CC-06) in code this change does not touch. A ResizeObserver crash in jsdom tests was found and fixed with a guard.
- Other group views (type, none, list, grid) use different layouts; only the shared row was touched (list view rows pick up the same natural-width cost). Not visually re-checked in the browser.
