# Brief: Rename a deck and reorder decks (UX-05, UX-03)
Status: DRAFT, awaiting owner approval (Gate 1). Date: 2026-11-20. Task size: medium.
Audit: `docs/oracle/reports/2026-11-20-architect-deck-rename-reorder-audit.md`

## Scenarios
1. **Rename from the library.** Who: the owner. When: looking at the deck tiles. Has: a deck with a name they want to change. Wants: click the name on the tile, type a new name, done.
2. **Rename from the deck page.** Same, but clicking the big name at the top of the deck page.
3. **Reorder in the library.** Who: the owner. When: no filter is on. Has: decks in the wrong order. Wants: drag a whole tile to a new spot; the other tiles shift to make room; the order is still there next visit.
4. **New deck.** The owner (or Claude) creates a deck. It appears at the end of the order.
5. **Same order everywhere.** Any other place that lists decks, including Claude's deck list through the connector, shows the same saved order.
6. **Filter on.** Tiles cannot be dragged. Rename still works.

## Owner decisions (confirmed 2026-11-20)
Rename:
- Available on the library tile and on the deck page. Click the deck name.
- On click the name keeps exactly the same size and position. A text field appears around the existing text. Nothing shifts.
- Clicking away saves. Enter saves. Escape cancels and restores the old name.
- An empty name is refused: the old name comes back and a short message says a deck needs a name.

Reorder:
- Drag the whole tile and drop it; tiles shift to make room. No drag handle.
- One saved order for every deck list, including Claude's. It persists.
- A new deck goes to the end.
- Dragging works only when no filter is active.

## What must never happen
- A deck is lost, duplicated or changed in any way except its name or its place in the order.
- A failed save looks like a success. If a rename or a move cannot be saved, the old name or old order comes back and a message says so (D-030).
- Dragging a tile opens the deck, or clicking the name opens the deck instead of renaming.
- A different order on different screens.
- Existing drag-a-tile-onto-a-folder stops working (see question 7).

## Words (to add to the shared vocabulary when approved)
- **Deck order**: the one saved sequence of the owner's decks, set by dragging.
- **Rename**: changing a deck's name from its tile or the deck page.

## Owner questions (recommendation first)
1. **Sorting vs your saved order.** Today the library is A to Z, with an optional "Group: Status". Should the saved order replace A to Z?
   - **A (recommended):** Your order is the order. Tiles follow it, and "Group: Status" keeps working: within each status group tiles follow your order. You would see decks no longer alphabetical after your first drag. Trade-off: no way back to A to Z.
   - B: Add a sort choice, "Sort: My order / A to Z". A to Z is a view only; dragging is available only under "My order". You would see one extra control. Trade-off: one more thing to learn.
   - Example: you drag Korvold to the front. With A, it stays first. With B, switching to A to Z moves it back to K, and switching back to My order returns it to the front.
   - Before your first drag, decks start in today's A to Z order either way.
2. **Dragging while grouped by status.** With "Group: Status" on, can you drag?
   - **A (recommended):** No, same as a filter. Dragging works in the plain grid only. Trade-off: you must switch grouping off to reorder.
   - B: Yes, within a group only. The order is saved for the whole list. Trade-off: moving a tile between groups is impossible and may confuse.
3. **Keyboard and touch.**
   - **A (recommended):** Mouse drag now. Keyboard and touch reordering later if you want it. Rename works with keyboard and touch from day one. Trade-off: a phone cannot reorder yet.
   - B: Include a keyboard way (pick up a tile, arrow keys, drop) and touch drag now. Trade-off: larger build; needs a mockup of the touch behaviour.
4. **Does a rename show in History or in Claude's Recent changes?**
   - **A (recommended):** No. A rename is a small label change you did yourself, and it is easy to undo by renaming again. Claude's own renames show in Recent changes and can be undone (rule D-034a). You would see nothing new in History after you rename.
   - B: Yes, every rename (yours too) shows in History. Trade-off: more noise.
   - Example: you rename "Korvold" to "Korvold Treasures". With A, nothing appears in History.
   - Note: Claude cannot rename a deck today (see report). Should Claude be allowed to? Recommendation: not in this feature; add later if wanted. If yes, its renames should show in Recent changes with an undo, and your order is never changed by Claude.
5. **Name limits and duplicates.**
   - **A (recommended):** Names up to 100 characters (the same limit Claude already uses when creating a deck). Two decks may not share a name, ignoring capital letters, matching Claude's creation rule. A clash refuses the save and restores the old name with a message. Trade-off: some existing decks may already share a name; the first rename into a clash is refused.
   - B: Limit only, duplicates allowed. Trade-off: two tiles named the same are hard to tell apart for you and for Claude.
   - Example: you have "Prosper" and rename another deck to "prosper". With A you see "You already have a deck with that name."
6. **Must a Claude rename be distinguishable?** Only matters if you say yes to Claude renaming in question 4.
   - **A (recommended):** Yes, through the existing Recent changes entry ("Claude renamed Korvold to Korvold Treasures"). Nothing extra on the tile.
   - B: Also mark the tile for a while. Trade-off: new visual element, needs design.
7. **Dragging a tile onto a folder today.** You can already drag a tile onto a folder chip to file it. After this feature, a drag could mean "reorder" or "put in folder".
   - **A (recommended):** Keep both. Dropping on a folder chip files the deck; dropping among tiles reorders. You would see no change to filing.
   - B: Retire drag-to-folder and keep the right-click "move to folder" menu only. Trade-off: removes something you may use.
8. **Mockup.** The audit says your written behaviour is enough for the rename field. For drag, a short mockup of how tiles shift and what the dragged tile looks like is recommended at Gate 3. Okay to proceed that way?

## Not in this feature
- Reordering folders, sorting by anything other than your order and A to Z, changes to tile contents.
