# Report: card-window-fixes
Role: Developer
Status: DONE
Task as received: fix four things the owner found while testing (test protocol docs/oracle/test-burst-1-2026-11-18.md): (1) artifact lands group under Artifact, not Land; (2) remove the 10-second Undo from card window role edits, keep "You removed X, Restore"; (3) adding and removing a role feels slow, make it instant with background save and plain rollback, measure before and after; (4) simplify the Category box to one Category (main), heading "Category", hint "Where it sits in the list", report secondary categories without changing data.

## Summary for the owner
Artifact lands already group under Land in "Group: Type". The Artifact you saw is the category saved on those cards in "Group: Category" (6 cards in 2 decks have "Artifact" saved), and I left it alone. Adding or removing a role now changes on screen at once and saves in the background. If the save fails, the change is put back with a message. The 10-second Undo on roles is gone (Restore stays). The Category box now shows one category.

What to retest, and where:
- Deck page, "Group: Type": Seat of the Synod and Power Depot (deck Arti-facts) and Scene of the Crime, Razortide Bridge, Ancient Den, Thousand Moons Smithy (the other deck) should sit under Land. Under "Group: Category" they still show Artifact because that is the name saved on them. To change that, open each card and pick Land in its Category.
- Deck health, "You have" type counts: an artifact land now counts as a land only (before it counted as both a land and an artifact).
- Card window, Universal roles: add a role, remove a role. Both should change instantly. Remove one and check "You removed: X. Restore" still appears, with no Undo.
- Card window, Category: one category chip and Edit, which opens one list called Category.

## Changed files
- src/components/CardWindow.tsx — roles update on screen first and save in the background; rollback with "Couldn't save that change, so it was put back."; role Undo removed; Category box shows one category and one drop-down; wording "Where it sits in the list"
- src/lib/card-window-stored-roles.ts — new applyOwnerAction (the on-screen result of a click); undoActionFor removed (only the role Undo used it)
- src/lib/deck-health.ts — the "You have" type counts give Land priority (artifact land counts as land only)
- src/components/CardsTab.tsx — groupByType and sortCards exported so they can be tested; no behaviour change
- src/components/CardsTab.type-group.test.ts — new: Group: Type and Sort: Type with real artifact land type lines
- src/lib/type-line.test.ts — more artifact land and Snow type lines through primaryType
- src/lib/deck-health.test.ts — new test for the type counts
- src/lib/card-window-stored-roles.test.ts — tests for applyOwnerAction; undo test removed
- src/components/CardWindow.test.tsx — tests for instant update, rollback, no Undo, one category

## New decisions made (need owner confirmation)
- The Deck health type counts ("You have X") now count an artifact land as a land only, to follow "Land takes priority over every other type". Other multi-type cards (Artifact Creature) still count in each of their types.
- The Category Undo (10 seconds, in the Category box) is unchanged; you only named role edits.
- While a role save is running the x, Restore and Add role controls stay usable, so you can make several changes quickly. A failure puts back the screen and then re-reads what is saved.

## Assumptions
- "Artifact" seen under an artifact land is the saved category, not the type. Evidence below. If you saw it under "Group: Type" on a live deck, tell me which card and deck and I will look again.
- Mirrorpool is a plain Land in the library ("Land —"), not an artifact land, so it was never an artifact case.
- "Primary/Secondary" wording is removed everywhere in the card window. The Cards tab and bulk move still use the saved main category.

## Challenges to locked decisions
- none

## Open questions
1. Saved categories on artifact lands (reported, not changed). Reading the live data (read-only): 6 artifact-land cards across 2 decks have the saved category "Artifact" (Scene of the Crime, Razortide Bridge, Ancient Den, Thousand Moons Smithy // Barracks of the Thousand in one deck; Seat of the Synod, Power Depot in the other). All 6 show under Artifact in "Group: Category" and under Land in "Group: Type". Do you want them moved to Land? That is a data change, so it needs your approval.
2. Secondary categories (kept, unchanged). Today 0 of 1917 deck cards have a second saved category. So nothing is hidden from you by the simpler box. The card window can no longer add one. The Cards tab already showed only the main one.
3. The old shared parser job (type-line.ts) was correct: Land is first in its order and "Artifact, Land —" and "Artifact Land" both read as Land. The one place that still treated an artifact land as an artifact was the Deck health type counts, now fixed. No other place groups or sorts by type: Group: Type, Sort: Type, the Brew curve and the connector summary all use the same parser.

## Measurements (item 3)
Time from the click to the screen showing the change. Measured from this computer to the live database, read-only, median of 15 runs. Database steps: deck check 214 ms, card check 213 ms, card identity lookup 555 ms, saved-roles read 220 ms, card text read 198 ms.
- Before: the screen changed only after the save (about 1.2 s of database steps) and then the re-read (about 1.4 s). About 2.6 s, and the controls were locked meanwhile. The save's write step was not timed because it would change your data, so it is estimated at the saved-roles read time. On the hosted app the numbers will be smaller, since the server is closer to the database.
- After: the screen changes in the same moment as the click (tests confirm the chip changes while the save is still waiting). The save runs in the background, then the saved answer is read back once.

## Verification
- npx vitest run (full) — 311 files passed, 1 failed (ImportIntentFlow, known); 3847 passed, 1 failed, 46 skipped
- npx tsc --noEmit — only the 4 known AddToPicklist.test.tsx errors
- npx eslint on all touched files — 0 errors (13 existing warnings in CardsTab.tsx, none new)
- Read-only database reads to check type lines, saved categories and timing; nothing written or changed.
