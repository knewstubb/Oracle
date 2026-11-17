# Report: decks-group-by-status
Role: Developer
Status: DONE
Task as received: Allow the deck list to be grouped by status (Decks page), with a Group control (None / Status), sections Playable, Assembling, Draft, remembered choice, working with folders and optimistic delete. Full handoff in the orchestrator's task.

## Summary for the owner
The Decks page now has a Group control next to the "All Decks" heading. "None" is today's A to Z list. "Status" shows Playable, Assembling and Draft sections, each with its badge, the word and the number of decks, for example "Playable (12)". Sections can be folded, empty ones are hidden, and the choice is remembered. Decision for you: should Playable decks come first when Group is None (not done)?

## Changed files
- src/app/page.tsx — Group control, status sections, remembered choice (key `oracle:decks:groupBy`), fold state kept in the page
- src/components/DeckTile.tsx — exports the existing badge icon and colours so section headers reuse them (no visual change to tiles)
- src/app/page.test.tsx — 8 new tests: default, section order and counts, hidden empty sections, persistence, folders, optimistic delete, fold and refresh, details arriving later
- docs/oracle/test-plan-2026-11-17.md — step 4 added under A0 (edited in the main checkout, untracked)

## New decisions made (need owner confirmation)
- The control is a dropdown reading "Group: None" / "Group: Status", same style as "Group: Category" on the deck page, placed on the right of the "All Decks" heading.
- Fold state is not remembered between visits (only the Group choice is). It survives refreshes within a visit.

## Assumptions
- Order inside a section is the list order from the server, which is already A to Z by name. Status is not recomputed; it comes from the first response, so the later details response cannot move tiles.
- Fold state is not reset when the Group choice changes.

## Challenges to locked decisions
- none

## Open questions
- Should the control later also offer "Format"? Not built.
- Should Playable decks come first when Group is None? Not done; the owner has not answered.
- The real list had 21 decks today (12 Playable, 6 Assembling, 3 Draft), not 22 / 4 Draft.

## Verification
- npx vitest run src/app/page.test.tsx — 20 passed
- npm run check — only known failures: the ImportIntentFlow env-flag test, the connector description ("estimate") test, and the existing typecheck errors and lint errors. One more failing test, copy-availability "supply readers carry the filter" for card-status.ts, is in code this change does not touch; I take it to be the known TIDY item, please confirm.
- Browser, read only, local app on port 3457 with the real decks: Group set to Status showed Playable (12), Assembling (6), Draft (3); choice survived a reload; folding Playable hid its 12 tiles; no deck was changed. The remembered choice was cleared afterwards.
