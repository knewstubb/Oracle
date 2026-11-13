# Developer report: Move here and the per-deck Picklist (slices 1 and 2)

Date: 2026-11-13. Branch: `picklist-move-here` (pushed, not merged).

## Status: DONE for the two slices, with a few honest gaps (listed below)

## What was built

**Slice 1: Move here.** When a card you add to a deck has your only copy in another deck, a "Move here" button is offered straight after Add to deck (in What's missing, and on the chat proposal card). One click moves that single copy, with one atomic step. You get an 8-second Undo toast and a small "Moved from X · Undo" note on the row. The other deck keeps its slot and now shows short by one. If you own several copies elsewhere, you pick one (order: decks that are not Playable first, originals before proxies, then deck name A to Z). It refuses to move a copy into the deck it is already in. If the source deck was built/Playable, it drops to Assembling and the toast says so (no dialog). No checklist entry, no reminders. No stored data changed and no migration was created.

**Slice 2: Picklist.** The "Sleeve List" tab is now "Picklist" and the "Sleeve" button is now "Placed it". The screen has three stacked, collapsible groups: Available (copies free in a box, grouped by box), Needs moving (copy is in another deck, with Move here), Unowned (price or "Price unknown", the Proxy button, and a buy ideas link). A line above reads "N of M ready · X available · Y need moving · Z unowned". The grouping is now one shared, tested function. Tests that pin the old grouping were committed first, before any rename. The Sleeved/Unsleeved labels and the import-reconciliation wishlist were left alone. The old "Sleeve from Active deck?" confirmation was removed from this screen (the server route behind it is still there).

## Checks you can do (plain language)

1. Open a deck that is missing a card whose only copy sits in another deck. In What's missing, add that card to the deck. A "Your copy is in X" line with a Move here button appears. Click it.
2. A toast appears for 8 seconds with Undo. The row shows "Moved from X". Open the other deck: it is short by one. Click Undo (toast or row) and the copy goes back.
3. If the other deck was Playable, the toast says it is now Assembling. No dialog.
4. Try the same in the Oracle chat: ask it to add a card you own in another deck; the card proposal shows Move here after you click Add.
5. Open a deck and click the Picklist tab (the old tab name is gone). You should see Available, Needs moving and Unowned, each with a count, and "N of M ready" near the top. Click a group title to collapse it.
6. In Available, click "Placed it" on a card. In Needs moving, Move here appears (and nowhere else). In Unowned, each card shows a price or "Price unknown".

## Checks run

- Full test run: 248 files passed, 2933 tests passed (5 files skipped as before).
- Typecheck: only the known earlier error in the card-state-actions examples file.
- Lint: 0 errors (existing warnings only).
- NOT done: a browser run on a copy on port 3100. Screens were only tested with component tests. Please eyeball the two flows above.

## Gaps and caveats

- **No dedicated move step in the database.** The contract's all-in-one move needs a migration, which is not approved. Move here uses the existing reassign step and does its checks just before it, then verifies afterwards and undoes itself if something shifted. A race would be rare but is not impossible to the degree a single database step would be.
- Deck size is assumed to be 100 when working out Playable.
- Copies with an open checklist item are not handled (that needs the unapproved move_items migration).
- The "Moved from X" row note lives in the page, so it disappears if you leave and come back. The toast Undo is the main route.
- Undoing the Add in chat after a Move here follows the existing chat undo rules.
- "N of M ready" uses the existing progress numbers (sleeved cards plus generic basics); the contract still lists the exact definition as open.
- "See buy ideas" links to the deck's Cards tab, where the buy ideas live; it does not open the panel directly.
- Two earlier-known bugs fixed on the way: the old screen put every Available card under "Unsorted" because it read the wrong field name; it now groups by box.
- Two large file edits (one in the Gap detail screen, one splice in the Picklist screen, plus a small rename in the shared grouping file) were done with a short script, not the edit tool.
- The two unapplied migration files (copy in hand and missing since, move items) are still untracked on disk. I did not add, edit or apply them.
- Owner decision for LATER slices, not built: imports into a deck warn and still add cards outside colour identity or not legal.
- Not built, as instructed: Found it, In your hand, ticks, wishlist, All-decks Picklist.

## Commits

Docs for Phase 3; Move here; shared grouping with pinning tests; Picklist rename and regroup; this report.
