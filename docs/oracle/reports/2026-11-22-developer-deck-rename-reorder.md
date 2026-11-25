# Report: deck-rename-reorder
Role: Developer
Status: PARTIAL
Task as received: Step 5 of the brief: update status rows UX-03 and UX-05, add Deck order and Rename to the shared vocabulary, write this report with an owner click-through list, commit on the branch, stop. Nothing pushed or merged.

## Summary for the owner
You can now click a deck's name to rename it, on its tile and on the deck page. You can also drag a deck tile to a new spot, and every list of decks, including Claude's, follows that saved order. Nobody has clicked through it in a browser yet, so it is waiting for your click-through before it goes anywhere. A few visual touches from the design are missing (see "Untested and not built").

## Changed files
- docs/oracle/status.md — UX-03 and UX-05 rows now say built on the branch, awaiting click-through
- docs/oracle/specs/vocabulary.md — added the words Deck order and Rename
- docs/oracle/reports/2026-11-22-developer-deck-rename-reorder.md — this report
- Earlier steps on the branch (see their reports): the stored-data change, rename (slice 1), reorder (slice 2), and tests.

## Commits on the branch deck-rename-reorder
- 11ca722 stored-data change applied
- 57cd016 rename
- 80a62fc reorder
- d49ff8f tests
- this report's commit

## Migration result
Applied to the hosted project the app uses. Migration 20261122120000.
- All 24 decks across 2 users have a position, no gaps or repeats. The order equals the old A to Z order for every user.
- New decks go last (checked in a rolled-back test, nothing kept).
- Only the server's service role can run the reorder function. Signed-in users and anonymous visitors cannot.
- The undo script is kept in the drafts folder.

## Before and after counts
Run with the import-intent setting empty.
| Check | Before | After |
|---|---|---|
| Tests passing | 4617 | 4675 (46 skipped, 0 failed) |
| Type errors | 0 | 0 |
| Lint errors | 1 (existing, PicklistV2 link) | 1 (the same one) |

One earlier full run showed a single failure in a known flaky test; two reruns were clean. The ImportIntentFlow "keeps Import disabled" test fails on the base commit too when the setting is on.

## Owner click-through list
The brief lists seven scenarios, not six. All seven are below.
1. **Rename from the library.** Click a deck's name on its tile. Check that the name does not move or change size, and a box appears around it. Type a new name and press Enter: it saves quietly. Click away: it saves. Press Escape: the old name returns. Try an empty name, a name another deck already uses (different capitals, for example "prosper"), and 101+ characters. Each should be refused or cut off with a short message. Clicking elsewhere on the tile should still open the deck.
2. **Rename from the deck page.** Open a deck and rename it from the name in the left summary panel. Same checks. On a narrow window, expand the summary first.
3. **Reorder in the library.** With no filter, drag a tile to a new spot. A dashed "Drop here" spot and a label show where it lands. Reload the page and visit another list (buying list, allocation, import destinations): the new order is the same everywhere. Ask Claude to list your decks: same order.
4. **New deck.** Create a deck. It should appear last.
5. **Same order everywhere.** Covered in step 3. Also check dragging a tile onto a folder chip still files it, and that dropping on the folder it is already in says so.
6. **Filter on.** Open a folder or use a filter. Tiles cannot be reordered, with a note saying so. Rename still works.
7. **Grouped by status.** Turn on Group: Status. Drag within one group: it works. Drag into another group: it is refused with a grey message.
Also try: a rename failure or a failed order save (for example with the network off) should restore the old name or order and show "Try again".

## New decisions made (need owner confirmation)
- Deck page rename is in the left summary panel, at that heading's current size, because the header the design described is no longer used.
- On narrow screens rename is in the expanded summary, not on the one-line row.

## Assumptions
- The report date follows the brief's file name (2026-11-22).
- The unused old deck-page header component stays; removing it is a separate cleanup.

## Challenges to locked decisions
none

## Open questions
- Should the missing visual touches below be built before merging, or left for later?
- Should the two flaky tests be looked at separately?

## Untested and not built
- No browser click-through, no real rename or order save on a test account (none exists), and nothing was written to your live data beyond the stored-data change.
- Not built: tiles do not slide smoothly (they jump), no reduced-motion handling, and the carried copy is the browser's default ghost image, not the tilted one from the design.
- The "take from" and "place in" stops on the all-decks pick list stay A to Z by place name, because boxes are mixed in with decks there.
- New deck goes last: no automated test; only checked in the rolled-back test.
- The buying list, allocation list, import destinations and pick list order is not tested one by one.
- The deck page screen has no test of its own.
- Touch rename and drag feel are unchecked.

## Verification
- Test, type and lint results above come from the earlier steps' runs on d49ff8f. This step changed only documents and ran no code checks.
- git status on the branch before commit showed only the three document changes.
