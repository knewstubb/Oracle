# Report: deck rename and reorder, tester step
Role: Tester
Status: PARTIAL
Task as received: Tester step for UX-05 and UX-03: automated tests for name rules, order save and failure paths, connector deck list order and folder-chip drop; browser run only against a separate test account, otherwise flag save paths as untested; compare tests, tsc and lint before and after.

## Summary for the owner
New automated tests cover renaming, saving the deck order, failures, Claude's deck list order and dropping a deck on a folder. Nothing was clicked through in a real browser, because there is no test account yet and your live decks must not be written to.

## Counts (NEXT_PUBLIC_IMPORT_INTENT_SAVE empty)
- Tests: baseline 4617 pass. After the build slices, before the Tester tests: 4653 pass. After: 4675 pass, 46 skipped, 0 fail (one full run showed 1 failure, a known flaky test; two reruns were clean).
- tsc: baseline 0 errors. After: 0 errors.
- Lint: baseline 1 error (PicklistV2 link). After: 1 error, the same one.

## Scenario map (brief lists seven)
1. Rename from library: InlineNameField.test.tsx, DeckTile.test.tsx, route.patch-name.test.ts, deck-name.test.ts
2. Rename from deck page: same field and route tests. The deck page screen itself has no test (untested).
3. Reorder in library: page.reorder.test.tsx (drop saves whole order, no-op saves nothing, failure restores), useSaveDeckOrder.test.tsx, order/route.test.ts, deck-order.test.ts
4. New deck goes last: the database trigger. Rolled-back smoke test in the migration step only. No automated test (untested).
5. Same order everywhere: list-decks-order.test.ts (connector asks position, name, id; pages over it), deck-order.test.ts, decks/route.test.ts. Other lists (buying list, allocation, import destinations, picklist) are not individually tested.
6. Filter on: page.reorder.test.tsx (folder open refuses drop, saves nothing, message shown; rename still present)
7. Grouped by status: page.reorder.test.tsx (move inside group saves full order, other groups unchanged; cross-group drop refused with the grey message)
Also: FolderChip.test.tsx (drop files a deck, already-in-folder message, non-deck drag ignored, error shown).

## Untested
- Real browser click-through and real saves: no test account exists.
- Live `move_decks` call and trigger on new decks beyond the rolled-back smoke test.
- Smooth tile slide and reduced motion (not built).
- Touch and keyboard rename in a real browser.

## Changed files
- src/app/page.reorder.test.tsx, src/components/FolderChip.test.tsx, src/hooks/useSaveDeckOrder.test.tsx, src/lib/connector/__tests__/list-decks-order.test.ts: new tests
