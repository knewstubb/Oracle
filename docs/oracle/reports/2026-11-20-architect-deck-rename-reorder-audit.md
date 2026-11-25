# Report: deck-rename-reorder-audit
Role: Architect
Status: DONE
Task as received: Gate 2 read-only audit for UX-05 (click a deck's name to rename it) and UX-03 (drag decks to reorder them, saved order everywhere decks are listed, including Claude's connector deck list). Covers: what exists for deck names, deck order, library tiles and the deck page header; locked decisions touched; dead code to delete; whether deck order needs new stored data; how the connector and other deck lists order decks. Base main 0c374d5. No application code changed; nothing applied to any database.

## Summary for the owner
Nothing exists today for renaming a deck after it is created, and decks have no saved order: the library is A to Z. Reordering needs one new stored value per deck (a position), which I have only described, not drafted or applied. Nothing the owner decided conflicts with a locked decision, but two existing behaviours need an owner choice: drag-a-tile-onto-a-folder, and A to Z vs saved order.

## What exists
### Deck names
- The deck name is a plain text value on each deck. The app's create route trims it and refuses an empty one; it does not check duplicates or length [Confirmed: src/app/api/decks/create/route.ts].
- Claude's create-deck tool limits names to 1 to 100 characters and says a name must not match another deck, ignoring capitals [Confirmed: src/lib/connector/tools/edit-tools.ts, createDeckInput]. No database rule on name uniqueness found in migrations [Approximate: searched supabase/migrations].
- No rename exists in the app or the connector. The deck update route (PATCH) handles commander and build only [Confirmed: src/app/api/decks/[id]/route.ts]. Searched the connector tools and change-sentence list for a rename kind: none [Confirmed: src/lib/connector/write-gateway.ts, change-sentences.ts].
- Many places read the name straight from the database each time (picklist, reconcile, card details, import alerts, system locations), so a rename shows everywhere without extra work [Confirmed: grep of from('decks') in src/lib and src/app/api]. Text saved elsewhere that copies the name (for example old Claude change rows with deck_name) would keep the old name [Approximate].

### Library tiles
- The tile is one link to the deck page, and it is already draggable: dragging it onto a folder chip files the deck in that folder [Confirmed: src/components/DeckTile.tsx lines 155-180, sets drag data "application/x-deck-id"].
- The name is plain text inside that link [Confirmed: src/components/DeckTile.tsx line 229]. Clicking it opens the deck, so rename must stop that click from navigating while editing.
- No drag-and-drop library is installed [Confirmed: package.json has no dnd package]. Reordering would use the browser's built-in drag, or a new package (Developer to choose; a new package needs owner-visible justification).
- Library page: fetches /api/decks, filters by folder, groups none/status; the grid is A to Z. "Group" choice is remembered in the browser only [Confirmed: src/app/page.tsx lines 74-83, 321-326, 441-445]. The only filter today is the folder filter. If "Group: Status" counts as a filter or not is owner question 2.

### Deck page header
- The name is a heading with truncation, in the shared persistent header [Confirmed: src/components/PersistentHeader.tsx lines 56-60]. Editable there is straightforward; a field must match the heading's size and truncation to avoid shift.

### Deck order
- None stored. The library list orders by name [Confirmed: src/app/api/decks/route.ts line 53].
- Claude's deck list orders by name, and pages by that order [Confirmed: src/lib/connector/tools/list-decks.ts line 64].
- Other places order by id or not at all: reconcile, picklist, spare-copy browse, import ownership, card details, collection card details [Confirmed: src/lib/reconcile-overuse.ts, src/app/api/picklist/route.ts, src/lib/spare-copy-browse.ts, src/lib/card-details/load.ts]. Most of these are lookups for internal use, not lists the owner reads as a deck list. Lists the owner sees that show decks (deck picker popover, all-decks picklist, sidebar) need a check in the design step [Approximate: not traced].
- The Claude buying list and by-ownership tools list decks and also would need to follow the order if they present decks as a list [Approximate: src/lib/connector/tools/get-buying-list.ts, list-deck-cards-by-ownership.ts select decks without order].

## Does deck order need new stored data? Yes
- One new whole-number column on the decks table (for example a position), per deck, owned by the same user through the existing user_id and row policy. The decks table already carries user_id [Confirmed: src/types/supabase.ts decks Row, src/app/api/decks/route.ts uses .eq('user_id')]. Not a card identifier, so D-003 does not apply.
- Existing decks: fill positions from today's A to Z order in the same migration so nothing visibly changes before the first drag.
- New deck goes to the end: the create paths (app create route, import, brew save, Claude create) must set position to one more than the highest. Several routes insert decks [Approximate: src/app/api/decks/create, import, brew/save, brew/skeleton]; a database default or trigger that assigns "max plus one" avoids touching each route and is the safer design.
- Save of a move: moving one tile changes the position of many decks, so it must be one all-or-nothing save (a database function) that takes the full new list of deck ids. If it fails halfway, nothing changes and the app shows the old order with a message. Not a destructive recompute: it only rewrites the position column, never deletes.
- Reads: library API and Claude's list-decks order by position, then name as tiebreaker.
- Index: (user_id, position) is enough for one user's few decks; optional.
- Migration process (not done here): drafted file marked DRAFT, an undo script (drop the column), a throwaway rehearsal against a copy, and explicit owner approval before applying to the hosted database. Reversible. Check docs/oracle/status.md for the deployed state before numbering.
- Rename needs no stored data change.

## Locked decisions touched
- D-030 (explicit loading/error states): the rename save and the move save both need visible failure with the old value restored. Applies, no conflict.
- D-034 / D-034a (Claude edits go through, undo from Recent changes for 7 days): applies only if Claude is allowed to rename or reorder (brief questions 4 and 6). Claude cannot do either today. Not a conflict.
- D-015 (controls sit inside the scope they act on; dashed borders mean empty drop zones): drag drop-target styling must not use dashed borders for non-empty spots. Design note.
- D-001 (core tables): decks is not one of the three named tables; adding a column does not conflict.
- No other decision found that mentions deck names, deck order or the library layout [Approximate: searched decisions.md for library, deck list, order, rename].

## Dead code to delete when this ships
- None found specifically replaced. A to Z ordering in the library and in list-decks becomes "position, then name": that is a change, not dead code. The comment "One A to Z grid" in the library page needs updating [Confirmed: src/app/page.tsx line 440]. If brief question 7 goes to option B, the tile's folder drag-and-drop and the folder chip drop code become dead and are deleted in the same task [Confirmed: src/components/DeckTile.tsx, src/components/FolderChip.tsx].

## Mockup: needed or not
- Inline name field: the owner's written behaviour is enough. It is specific (same size, same position, field around the text, click away saves, Enter saves, Escape cancels, empty refused with message). Designer confirms the field styling against existing inputs at Gate 3 with a short states list, no full mockup.
- Pointer drag: a short mockup is recommended, not required by the written behaviour alone. Unspecified: what the dragged tile looks like, the gap or marker where it will land, behaviour at row ends in the grid, what happens on drop failure, and the collision with the existing drag-to-folder. Designer decides; the owner approves at Gate 3.

## Changed files
- docs/oracle/briefs/deck-rename-and-reorder.md — Gate 1 brief
- docs/oracle/reports/2026-11-20-architect-deck-rename-reorder-audit.md — this audit
- docs/oracle/status.md — UX-03 and UX-05 rows

## New decisions made (need owner confirmation)
- None. Recommendations are in the brief as questions.

## Assumptions
- "Filter active" means the folder filter; whether "Group: Status" blocks dragging is brief question 2.
- Claude's deck list should follow the saved order (owner decision); it orders by name today.

## Challenges to locked decisions
- none

## Open questions
- Brief questions 1 to 8.

## Verification
- Read-only code search (grep and file reads) in the worktree. No build, test or database command run, as instructed.
