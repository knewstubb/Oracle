# Report: deck reorder (slice 2)
Role: Developer
Status: PARTIAL
Task as received: Slice 2, reorder, from `docs/oracle/briefs/deck-rename-and-reorder.md` (drag the whole tile, saved order everywhere, new decks last, within a status group, no cross-group drop, no dragging with a folder open but chips still file, all-or-nothing save with message on failure, delete old paths).

## Summary for the owner
You can now drag a deck tile to a new place and the order is saved. The library, the import destination list, the allocation list and Claude's deck list all follow it. A few visual touches from the mockup are not built yet (see Open questions), and nobody has clicked through it in a browser.

## Changed files
- `src/lib/deck-order.ts` — one shared order (position, name, id) and the "where does the dropped deck land" rule
- `src/app/api/decks/order/route.ts` — saves the whole order, all or nothing
- `src/hooks/useSaveDeckOrder.ts` — shows the new order at once, puts the old one back with a message on failure
- `src/app/page.tsx` — dragging, drop spot, pointer label, group rules, folder-open rule, "Saving order…"; the A to Z note is gone
- `src/components/FolderChip.tsx`, `src/components/DeckTile.tsx` — chip drop look, "already in folder" message, tile locked while saving
- `src/app/api/decks/route.ts`, `src/lib/connector/tools/list-decks.ts`, `get-buying-list.ts`, `list-deck-cards-by-ownership.ts`, `src/app/api/collection/allocation/route.ts`, `src/app/api/import/destinations/route.ts`, `src/app/api/allocation/valid-decks/route.ts`, `src/app/api/picklist/route.ts`, `src/lib/all-decks-picklist.ts` — deck lists use the saved order (old `order('name')` removed)

## New decisions made (need owner confirmation)
- Dragging uses the browser's own drag, no new package. The picked-up copy is the browser's ghost image (not tilted or enlarged).
- Claude's deck-per-card lists (buying list, ownership list) put decks in saved order instead of A to Z.

## Assumptions
- The paging of Claude's deck list needs no cursor change: it pages by offset over the new order.

## Challenges to locked decisions
- none

## Open questions
- Not built: tiles sliding smoothly (0.18s) and the reduced-motion rule; the tilted lifted copy; touch targets for names. Tiles jump instead.
- Not changed: "take from" and "place in" stops on the all-decks picklist stay A to Z by place name, because boxes are mixed in with decks.

## Verification
- `npx tsc --noEmit` — clean
- `npx eslint` on changed files — 0 errors
- `npx vitest run` — all pass except tests that also fail with these changes stashed: ImportIntentFlow (pre-existing), CardDetails and upgrade-engine property test (flaky on the base commit)
- Not run: browser click-through, saving against a test account (none exists), live order save
