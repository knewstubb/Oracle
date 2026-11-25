# Spec: Rename a deck and reorder decks (UX-05, UX-03)
Role: Designer · Status: **Draft for owner review (Gate 3)** · 2026-11-20
Mockup: `docs/oracle/mockups/deck-rename-and-reorder.html` (open in a browser; drag, drop and rename all work; a tick box makes the next save fail).
Brief: `docs/oracle/briefs/deck-rename-and-reorder.md`. Audit: `docs/oracle/reports/2026-11-20-architect-deck-rename-reorder-audit.md`.
Inputs: D-012, D-014, D-015, D-030; `specs/vocabulary.md` (section 5 loading and error copy); the allocation terminology convention.
Data: this spec asks for one thing from the Architect and decides nothing about storage: a saved position per deck and a rename that can fail with "empty", "name already used" or "could not save" (section 10). No contract exists yet.

## 1. The problem
Decks cannot be renamed after they are created, and they cannot be put in an order the owner chooses: the library is always A to Z. A deck tile is also already draggable (onto a folder chip to file it), and the whole tile is a link. So a new drag-to-reorder and a new click-the-name-to-rename each collide with something that already works. The design has to add both without a click opening the wrong thing, without a drop meaning the wrong thing, and without a failed save ever looking like it worked.

## 2. Principles
- **Visibility of system status (Nielsen 1, D-030):** every save shows that it is saving, and a failure puts the old name or old order back with a message. Nothing stays changed on screen if it was not saved.
- **Error prevention (Nielsen 5):** two different drops (file in folder, reorder) look different in shape, colour fill, wording and where they appear, so one cannot be mistaken for the other. A refused drop says why.
- **Direct manipulation, no layout shift:** the name edits in place. The text does not move, resize or wrap when editing starts.
- **Quiet default, loud exception (D-014):** nothing new is visible until the pointer is over a name or a tile is picked up. Messages appear only when something is refused or fails.
- **Object-action mapping (D-015):** the dashed outline is used only for the empty spot a tile will land in (an empty drop zone). Nothing clickable is dashed.
- **Match the system to the real world:** "Group: Status" stays; status is worked out from the deck's cards, so a tile can never be moved to another status by hand, and the message says that.

## 3. New words (for `vocabulary.md` when approved)
- **Deck order**: the one saved sequence of the owner's decks, set by dragging. Shown the same everywhere decks are listed.
- **Rename**: changing a deck's name from its tile or the deck page.
Existing words used unchanged: **File** is not a new action word; the app's current toast says "Moved to {folder}" and this spec keeps that. Status words are **Playable**, **Assembling**, **Brewing** (vocabulary 3.4). Nothing here uses "claim" or "sleeve"; those words are about cards, not decks.

## 4. Scope map
| # | Screen | Change |
|---|---|---|
| 1 | Library, deck tile | Name can be renamed in place. Whole tile can be dragged to reorder or onto a folder chip. |
| 2 | Library, folder chips | Gain a "drop to file here" look while a tile is carried. |
| 3 | Library, "Group: Status" | Tiles reorder within their status group. Other groups show why they refuse. |
| 4 | Library, folder open | Reordering off, with a quiet note. Rename still works. |
| 5 | Deck page header | Name can be renamed in place. |
| 6 | Messages | New copy for rename and move results (section 8). |
Not in this spec: reordering folders, other sorts, tile contents, Claude renaming or reordering.

## 5. Rename (tile and deck page)
One behaviour in two places. The owner's description is the design; this section adds states and edge cases.

### 5.1 States
| State | What the owner sees |
|---|---|
| Idle | Name looks exactly as today. On the tile: white, 14px, bold, one line, cut off with "…" if long. On the deck page: 28px, medium weight. |
| Idle, pointer over the name | A quiet rounded outline and a slightly lighter fill appear **around** the name (the outline sits outside the text, in the tile's side padding). The pointer becomes a text cursor and the tooltip says "Rename". Nothing moves. The tile's usual lift on hover is unchanged. |
| Idle, keyboard focus | Same outline plus the standard purple focus ring. |
| Editing | A text field replaces the outline: same font, size and weight, same text position, filled with the page background, 1px purple border (`--accent-text`) and a soft purple halo. All of the name is selected. The field is the width of the name area plus the 6px of outline on each side; long names scroll inside the field instead of wrapping. The rest of the tile does not change and stays unclickable (a click on it ends the edit, see 5.3). |
| Saving | The field stays, turns read-only with a grey border and grey text, and a small spinner sits inside its right end. Nothing else on screen is disabled. The old name is **not** replaced yet. |
| Saved | Field disappears and the new name shows in the same place. No success message (quiet default). Every other place showing the deck name updates. |
| Refused: empty name | Field border turns red for a moment, then the old name comes back and a message appears: "A deck needs a name." |
| Refused: name already used | Same, with: "You already have a deck with that name." Applies when another deck has the same name ignoring capital letters ("prosper" against "Prosper"). Changing only the capitals of the deck's own name ("korvold" to "Korvold") is allowed. |
| Failed save | Same red moment, old name comes back, message: "Couldn't rename {old name}. It still has its old name." with **Try again**. Try again opens the field again with the name the owner typed. |
| Disabled while | A tile being dragged or saving a move cannot start a rename until the save ends (under a second normally). |

### 5.2 Layout rule (no shift)
The field is laid over the existing text, not swapped for it. The original name keeps its space in the layout (hidden) while the field is open, so nothing around it reflows. The field extends 6px sideways and 3px up and down (tile) or 2px (deck page) beyond the text, using the empty padding. The field is inside the tile, so it is never clipped.

### 5.3 Interactions
| Input | Result |
|---|---|
| Click (press and release without moving) on the name | Starts editing. Does **not** open the deck. |
| Press on the name and drag more than 5px | Starts dragging the tile (section 6). Does not rename. |
| Click anywhere else on the tile | Opens the deck, as today. If a field is open, that click only ends the edit (saves it) and does not open the deck. |
| Enter | Saves. Ignored while an input method (for example Japanese or Chinese typing) is still composing. |
| Click or tap elsewhere / Tab away | Saves (same as Enter). |
| Escape | Cancels. The old name stays. No message. |
| Name unchanged, or only spaces added around it | Closes quietly, no save, no message. |
| Typing past 100 characters | The extra characters are not added. A short message once: "Names can be up to 100 characters." A paste is cut at 100 and shows the same message. |
| Spaces at the start or end | Removed before checking and saving. |
| Keyboard (day one) | Tab reaches the tile, then the name as its own stop, labelled "Rename {name}". Enter or Space on it starts editing. F2 on a focused tile does the same. The tile's right-click menu also gets a **Rename** item (placed above "Move to folder"). |
| Touch (day one) | A tap on the name starts editing; a tap elsewhere on the tile opens the deck. There is no hover, so the outline is not shown; the first tap goes straight to the field. |

### 5.4 What stays the same
The rename never changes the deck's cards, folder, status or place in the order. A rename by the owner does not appear in History or Recent changes (owner answer 4).

## 6. Reorder: dragging a tile
### 6.1 Picked up
- A copy of the tile follows the pointer: tilted 2.5 degrees, 4% larger, slightly see-through, with a large shadow and a purple outline (`--accent-text`).
- The tile's own spot is not left blank. It becomes the **drop spot**: a tile-sized rectangle with a **dashed** purple outline, a faint purple fill and the words "Drop here" (dashed because it is an empty drop zone, D-015). The same rectangle follows the pointer through the grid.
- Pointer shows a closed hand for the whole drag. The hover lift on other tiles is switched off while dragging.
- A small label follows the pointer and says what a drop would do: "Move before Prosper", or "Move to the end".
- Every folder chip gets a purple border while a tile is carried, so the owner can see that the chips accept a drop.

### 6.2 How other tiles shift
The drop spot jumps to the gap nearest the pointer: left half of a tile means before it, right half means after it. The tiles after it slide one place along, rows wrap as they do in the normal grid, and each slides in about 0.18 seconds (no animation if the owner has reduced motion on). At the end of a row, a pointer beyond the last tile of that row puts the spot at the end of that row. Below the last row puts it at the very end. With the pointer outside the grid and the chips, the spot returns to the tile's original place.

### 6.3 Dropped
- Dropping on a spot that is not the tile's original place: the picked-up copy settles into the spot, a small "Saving order…" with a spinner shows beside the "All Decks" heading, and tiles cannot be picked up until it finishes (renaming still works). There is no success message; the indicator just goes away.
- Dropping on the original place: nothing is saved.
- Pressing Escape during a drag, or dropping outside the grid and the chips: the picked-up copy glides back and nothing changes.

### 6.4 A failed move
The save is all or nothing. If it fails, the tiles slide back to the old order (same 0.18s slide) and a red-edged message appears at the bottom right: "Couldn't save the new order. Your decks are back where they were." with **Try again**. Try again sends the same move once more. If the deck list changed somewhere else in the meantime (for example Claude created a deck), the message is: "Your decks changed in another window, so this move wasn't saved. Showing the latest order." and the list reloads.

### 6.5 What the saved order means
- Before the first drag, decks are in A to Z. After that, deck order is the saved order and A to Z is gone (owner answer 1). A new deck goes to the end.
- The saved order is one list for all decks. In the plain grid the dropped deck takes the spot shown.
- With Group: Status on, tiles in each group follow the saved order. Only the carried deck changes place in the full list. Example: the full order is Atraxa (Playable), Edgar (Assembling), Korvold (Playable), Prosper (Playable). You drag Prosper before Korvold inside Playable. The order becomes Atraxa, Edgar, Prosper, Korvold. With Group: None you would see Prosper between Edgar and Korvold. The other decks keep their relative places.

## 7. Where a drop goes
### 7.1 Folder chip or among tiles (owner answer 7)
The two targets differ in four ways so they cannot be confused:

| | Dropping among the tiles | Dropping on a folder chip |
|---|---|---|
| Where | The tile grid | The row of folder chips above it |
| Shape | A dashed, tile-sized empty spot that tiles slide around | The existing chip, now with a solid 2px purple border, purple fill, and 5% bigger |
| Words on the target | "Drop here" | The chip's count line changes to "Drop to file here" |
| Words on the pointer label | "Move before Prosper" | "File in Budget" |

Only one of the two is ever shown at once. While the pointer is on a chip, the drop spot goes back to the tile's original place and the other tiles settle, so the grid never shows a landing spot and a lit chip together. Dropping on a chip files the deck and shows the existing message "Moved to {folder}". The deck's place in the order does not change. If it is already in that folder: "{Deck} is already in {folder}." (this replaces a silent re-move). If filing fails, the existing error message is used and nothing changes.

### 7.2 With Group: Status on
- Reordering works inside the tile's own group. While carrying, that group's header adds the quiet note "Moving within Playable".
- Every other group dims to about 45% and its header says "Can't drop here: a deck's status comes from its cards".
- If the pointer is over another group, that group gets an amber outline (amber is the app's warning colour; the label also uses words, D-012), the pointer becomes a not-allowed sign, and the label says "Not in Assembling: status comes from a deck's cards".
- Dropping there changes nothing. The picked-up copy glides back to its place and a message says: "Decks stay in their status group. Status comes from a deck's cards, so it can't be set by moving a tile." (grey information style, not red).
- Folder chips still accept the tile while grouped.
- A collapsed group cannot be dropped into either; it shows the same refusal.

### 7.3 Filter on (a folder is open)
- Tiles do not reorder. Hover and click are as today. A quiet line appears to the left of the Group menu: "Reordering is off while a folder is open. Dropping on a folder chip still files a deck." The "← Show all decks" link is already there.
- A tile can still be carried to a folder chip (see open question 1). Over the grid the pointer shows not-allowed, the label says "Reordering is off while a folder is open", the note brightens, and a drop gives the information message "Reordering is off while a folder is open. Show all decks to reorder."
- Rename works as normal.

### 7.4 Not yet (owner answer 3)
Keyboard and touch reordering are later. Today a phone or keyboard user can rename and open decks but cannot reorder. This leaves the standing rule "every drag has a keyboard equivalent" unmet on purpose, by owner decision. Suggested later design, for a future spec: focus a tile, press Space to pick it up, Left and Right arrows move the drop spot, Space drops, Escape cancels, and a live region announces "Moved Korvold to position 2 of 9". Touch would use press-and-hold, then drag. Nothing in this design blocks either.

## 8. Copy
| Where | Exact text |
|---|---|
| Rename tooltip and screen-reader name | "Rename" / "Rename {deck name}" |
| Empty name | A deck needs a name. |
| Name already used | You already have a deck with that name. |
| Over 100 characters | Names can be up to 100 characters. |
| Rename failed | Couldn't rename {old name}. It still has its old name. (Try again) |
| Saving a move (beside heading) | Saving order… |
| Move failed | Couldn't save the new order. Your decks are back where they were. (Try again) |
| Move failed, list changed | Your decks changed in another window, so this move wasn't saved. Showing the latest order. |
| Drop label, reorder | Move before {deck} / Move to the end |
| Drop label, folder | File in {folder} |
| Folder chip while target | Drop to file here |
| Filed | Moved to {folder} (existing) |
| Already there | {Deck} is already in {folder}. |
| Drop spot | Drop here |
| Group refused (label) | Not in {status}: status comes from a deck's cards |
| Group refused (group header) | Can't drop here: a deck's status comes from its cards |
| Group, own header | Moving within {status} |
| Group refused (message) | Decks stay in their status group. Status comes from a deck's cards, so it can't be set by moving a tile. |
| Folder open (note) | Reordering is off while a folder is open. Dropping on a folder chip still files a deck. |
| Folder open (drop message) | Reordering is off while a folder is open. Show all decks to reorder. |

## 9. Component inventory
| Component | Change | Built on |
|---|---|---|
| `DeckTile` | Name becomes its own focusable control (not a nested link); drag now means reorder or file; drop-spot state; menu gets Rename | Existing tile; text input styled like the app's inputs |
| `InlineNameField` (new, shared) | Props: current name, other deck names, onSave, max 100. Used by the tile and by the deck page header. Owns idle outline, editing, saving, refused and failed states | shadcn `Input` restyled to inherit font; sonner toast for messages |
| `PersistentHeader` | The deck-page name uses `InlineNameField` at 28px | Existing header |
| `FolderChip` | Gains the "target" look and the changed count line | Existing chip |
| Library page | Reorder drag state, drop spot, pointer label, status-group dimming, "Saving order…" indicator, folder-open note | Existing page, tile grid, status sections |
| Toasts | Information style (grey, "i" icon) added next to the existing success and error styles | Existing sonner setup |
The Developer picks how dragging is built (the browser's own drag, or a small package). The behaviour above is the requirement; a new package needs a justification the owner can read (audit note). The mockup uses its own pointer drag only so it can show the behaviour.

## 10. Data binding (needs from the Architect; no contract exists)
- A saved position per deck, and a way to save a full new order in one all-or-nothing step. The library list and Claude's list read in that order.
- A rename that returns one of: saved; empty; name already used (ignoring capitals, excluding the deck itself); too long; could not save. The screen messages above map one to one.
- A way to tell "the deck list changed since you loaded it" apart from "could not save" (section 6.4). If the Architect prefers not to provide it, the second message is dropped and the first used.
- A rename may carry who made it, so Claude's later renames can show in Recent changes. Not shown or built now.

## 11. States checklist
Default, hover, focus, active (editing, carrying), disabled (while saving a move, with a folder open, with a refused group), loading (saving name, saving order), empty (no change: a library with one deck has nothing to reorder and drags show no spot), error (empty, clash, failed rename, failed move, changed elsewhere), domain states (Playable, Assembling, Brewing groups; allocation words are not used on this screen).

## 12. Accessibility (WCAG 2.1 AA)
- Rename field and drop outlines use `--accent-text` (#A57CE0) on the tile and page backgrounds: about 5.4 to 1 on #1A1A1A, above the 3 to 1 needed for borders. The existing `--accent-primary` (#7138CC) is only about 2.6 to 1 on the tile background, so it is **not** used for these outlines. It remains on the existing chip border, and the chip also changes its words and fill.
- Secondary notes use `--text-secondary` (#9C9CA3), about 6.9 to 1 on the page background. `--text-tertiary` is not used for text (about 3.6 to 1).
- No state relies on colour alone (D-012): the drop spot has dashes and "Drop here"; the target chip has changed words; refused groups have text, an outline and a not-allowed pointer; errors have text and an icon.
- Focus order on a tile: the tile, then its name control. Escape leaves any edit or drag.
- Screen readers: the field is labelled "Deck name". Rename results are announced politely through the message area. The saving indicator is a status region. Drag has no screen-reader equivalent yet (7.4).
- Reduced motion: no tile slides, no tilt; the drop spot still jumps.
- Touch targets: the name is a 18px-high line on the tile, below 24px. The tap target grows with invisible padding to at least 24px high (the whole name row), and without overlapping the commander line.

## 13. Open questions for the owner
1. **A tile is carried while a folder is open.** You said tiles cannot be dragged with a filter on. Today dragging a tile onto another folder chip files it, even when a folder is open. What should happen?
   - **A (recommended):** Reordering is off, but you can still carry a tile to a folder chip to file it. Nothing about filing changes. In the mockup, open a folder and try it.
   - B: The tile cannot be picked up at all while a folder is open. To file a deck you use the right-click "Move to folder". Trade-off: you lose a thing that works today.
   - Example: you have the "Budget" folder open and want to move Prosper to "Commander night". With A you drag it to that chip. With B you right-click it.
That is the only open behaviour question. Choices made where the owner's answers were silent are listed below for confirmation.

## 14. New decisions made (need owner confirmation)
- The hover look for rename is an outline around the name, with no pencil icon, so nothing moves. Touch has no hover, so the name is simply tappable.
- A clash, empty name or failed save closes the field and restores the old name (as you asked); Try again is offered only for a failed save.
- Moving to an unchanged place saves nothing; Escape or a drop outside cancels a drag.
- While a move is saving, tiles cannot be picked up for a moment. Rename still works.
- No success message for a rename or a move; only failures and refusals show a message.
- The refusal for a cross-group drop is a grey information message, not an error, because nothing failed.
- "{Deck} is already in {folder}." replaces a silent re-file.
- A Rename item and the F2 key as the keyboard way to start a rename.
- Keyboard and touch reordering later: the rule that every drag has a keyboard equivalent is waived for now by your answer 3.
