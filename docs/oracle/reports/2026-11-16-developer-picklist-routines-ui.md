# Report: picklist-routines-ui
Role: Developer
Status: DONE
Task as received: Continue from the previous report (2026-11-16 developer, applying picklist routines). Server endpoints for the five routines are live on main. Owner decisions (2026-11-16, 'Agree'): (1) all-decks Picklist shows unowned cards as a COUNT footnote only (spec wins over contract; update contract wording and note it as a new decision for owner confirmation); (2) Missing page may load extra data (saved step id) so 'I checked here' works; (3) 'Add all to the Picklist' goes on the Unsorted page first, with a simple destination dropdown (box or deck); import-result placement deferred. Build: Add to Picklist / Add all buttons; Found it / Turned up and I checked here on Missing page; Undo tick and Cancel step on the all-decks Picklist; the footnote; the all-decks data shape per decision 1. Tests, typecheck, lint on changed files, run affected existing screen tests too. Commit and push to main (only your files).

## Summary for the owner
The Unsorted page now has a "Send to" dropdown (a box or a deck), an Add to Picklist button on every card and an Add all button. The Missing page has Found it (you choose where it is now) and I checked here beside each place to look next. The all-decks Picklist has Undo on ticked cards, Cancel step on waiting cards, and one footnote line per deck saying how many unowned cards are not listed. Please confirm the footnote decision (below).

## Changed files
- src/components/AddToPicklist.tsx (+ test) — Add to Picklist / Add all, shared destination dropdown, result toast naming cards left off and why
- src/components/PicklistPlaces.tsx — shared box-and-deck list (moved out of the system pages)
- src/app/storage/[locationId]/page.tsx — Unsorted page only gets the bar and per-card button
- src/components/SystemPlacePages.tsx (+ test) — Missing: Found it, I checked here
- src/lib/system-locations.ts — Missing cards carry the saved step id; places already checked are left out of "Where to look next"; Unsorted entry carries its box id
- src/components/AllDecksPicklist.tsx (+ test) — Undo, Cancel step, footnote
- src/lib/all-decks-picklist.ts (+ test), src/app/api/picklist/route.ts — `unownedByDeck` counts (same unowned test as the deck's own Picklist)
- docs/oracle/contracts/know-where-cards-are.md and .types.ts — all-decks wording and shape: `unowned: PicklistRow[]` replaced by `unownedByDeck`
- docs/oracle/status.md — update line (only my line staged; other pending edits left alone)

## New decisions made (need owner confirmation)
- All-decks Picklist never lists unowned cards, only a count per deck (spec wins over the old contract). Footnote covers decks on the walk plus any named in the deck filter; a deck with no steps shows no footnote.
- Missing: Found it asks "Where is it now?" with In your hand, boxes and decks (never auto-picked). I checked here hides that place from the list afterwards. It appears only when the card has a saved Missing step.
- Cancel step has no confirm dialog (kept as history, nothing moves); Undo likewise.
- The Unsorted dropdown is shared by the whole page, not one per row.

## Assumptions
- Unowned count excludes slots that already have a saved step and generic lands.

## Challenges to locked decisions
- none

## Open questions
- Add all on the import result screen is still deferred (decision 3).

## Verification
- npm test (src/components, src/lib/all-decks-picklist, src/app/api): 147 files passed, 1209 tests passed.
- Lint on changed files: 0 errors (remaining warnings are old: unused import and img tags on the storage page).
- Typecheck: my files clean; one error remains in another agent's uncommitted connector work (get-deck.ts, not mine, left alone).
- Not checked live in a browser; the unowned count query was not run against real data.
