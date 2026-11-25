# Report: deck-rename-slice1
Role: Developer
Status: DONE
Task as received: Slice 1, rename, no stored data, verbatim from the brief: Rename from the library tile and from the deck page exactly as the approved mockup and spec; name length up to 100 characters; no two decks share a name ignoring capitals; empty name refused; Escape restores; Enter or click away saves; failures restore the old name with a message (D-030). Keep keyboard and touch working for rename. Out of scope: Claude renaming or reordering decks, keyboard and touch reordering, folder reordering. Delete any old code paths that the new behaviour replaces in the same task (process.md Gate 4).

## Summary for the owner
You can now rename a deck by clicking its name, on its library tile or on the deck page. A quiet outline shows around the name when you point at it, the text does not move when the edit box opens, Enter or clicking away saves, and Escape puts the old name back. An empty name, a name another deck already uses (ignoring capitals) or a failed save puts the old name back and says why. The right-click menu on a tile also has Rename, and F2 on a focused tile starts a rename.

## Changed files
- src/lib/deck-name.ts — trims and checks a name (1 to 100 characters) and finds clashes ignoring capitals; unit tested
- src/app/api/decks/[id]/route.ts — the existing deck update route now accepts a name and answers name_empty, name_too_long, name_taken, not_found or save_failed (contract section 2)
- src/hooks/useRenameDeck.ts — sends the rename; the cached deck list and deck page switch to the new name only after the save succeeds
- src/components/InlineNameField.tsx — the shared in-place name editor (idle outline, editing, saving spinner, red refusal moment, messages, Try again)
- src/components/DeckTile.tsx — the tile is no longer one big link: a full-tile link sits under the name control, so the name is not nested inside a link. Adds the Rename menu item and F2. Dragging to a folder chip is unchanged
- src/components/deck-rail/DeckRail.tsx — the deck page name heading uses the same editor
- tests: route.patch-name.test.ts, InlineNameField.test.tsx, deck-name.test.ts; DeckTile.test.tsx and accessibility.test.tsx updated because the tile's outer element is now a plain box, not the link

## New decisions made (need owner confirmation)
- The deck page name lives in the deck summary panel on the left (the spec named an older header that is no longer on screen). Rename is on that heading, at its current size, not the 28px the spec quoted.
- The narrow-screen collapsed summary row (one line with the deck name) is a button that opens the summary; rename is in the opened summary, not on that row.

## Assumptions
- The old static deck-name text on the tile and the deck page is the only code the rename replaces; it was swapped for the editor in place. No other rename path existed (audit, section 1).
- The "too long" message uses the existing information toast; no new toast style was added in this slice.

## Challenges to locked decisions
- none

## Open questions
- None for behaviour. The header component the spec names (PersistentHeader) is not used by any screen; deleting it is a separate cleanup and was left alone.

## Verification
- npx vitest run (full suite) — 4639 passed, 1 failed: ImportIntentFlow "built: ... keeps Import disabled". It fails the same way with my changes stashed, so it is not caused by this slice. upgrade-engine property test failed once in the full run and passed 60/60 on rerun (random inputs).
- npx vitest run on the rename, tile, accessibility, deck rail and deck route tests after the last edit — 257 passed
- npx tsc --noEmit — no errors
- npx eslint on changed files — 0 errors (one existing unused-prop warning)
- Not done: a click-through in a real browser and a save against a test account (no test account yet, process.md Gate 4). Look and pointer behaviour are untested in a browser.
