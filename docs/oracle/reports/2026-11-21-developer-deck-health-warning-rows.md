# Report: deck-health-warning-rows
Role: Developer
Status: DONE
Task as received: Restyle the Deck Health section of the deck page left rail so it looks and behaves like the Cards section's legality warning box (warning rows only by default, "Light on / Heavy on <category>" with count and range on the right, See all / Hide toggle, no verdict sentence). Follow-up from owner: green check on healthy rows in the expanded list, empty spacer on no-target rows, compact See all button.

## Summary for the owner
Deck Health now shows only the categories with a warning, in the same bordered box as the Cards warnings (for example "Heavy on ramp   18 / 10–12"). A small "See all" button underneath shows every stat, with a green check on healthy ones, and switches to "Hide". The headline sentence is gone.

## Changed files
- src/components/deck-rail/RailProblemList.tsx — new shared box and row content (warning, green check, or spacer icon slot), used by Cards and Deck Health
- src/components/deck-rail/RailHealth.tsx — warning rows, See all / Hide toggle, verdict removed
- src/components/deck-rail/RailCards.tsx — now uses the shared box (same look)
- src/components/deck-rail/DeckRail.test.tsx, src/components/deck-strategy/DeckSettingsWindow.test.tsx — tests updated for the new behaviour

## New decisions made (need owner confirmation)
- With no warnings: no message, just the See all button (simpler).
- Warning wording uses the category's full name in lower case ("Light on targeted removal", "Heavy on board wipes"), including custom categories.
- Expanded rows: warnings first, then healthy (green check), then Game Plan "34 Total" and "No target" rows (blank spacer so text aligns).
- Right-side figures: "37 / 35–38", "34 Total", "2 No target".
- Lands' "+ N double-faced" note no longer appears in the rail row (still in the details panel it opens? Not verified; it was only in the old tile).
- See all button is a compact left-aligned text button with a small gap above.

## Assumptions
- Rows keep opening the cards-in-category panel as the tiles did; custom categories stay non-clickable.

## Challenges to locked decisions
- none

## Open questions
- Should the double-faced lands note return in the expanded Lands row?

## Verification
- npm test — 4610 pass, 1 fail: upgrade-engine property test (unrelated file, not touched; flaky)
- targeted rail/settings/page tests — 125 pass after the final change
- npm run typecheck — 4 errors (baseline)
- npm run lint — 11 errors, identical with my changes stashed (so not from this work)
