# Report: commander-section
Role: Developer
Status: DONE (live behaviour untested; backfill NOT applied)
Task as received: Owner (live test, deck 'Mendicant', id 1596770643): assistant said "84 in the main list + Mendicant Core as commander = 85" while the header says 84/100. The commander card is a normal deck_cards row (categories ["Creature"], is_commander=false, command_zone_role=null); decks.commander_name is set. Same for 'rocco' (1587385967). Owner request: "We need a commander section same as any other section, and Mendicant should be in that." Approved: Cards tab Commander section at the top in all group modes (partner/background as commanders, companion stays in its own slot, D-058), commander counted exactly once everywhere. Tasks: (1) picker/commander routes/import choice mark the card itself (no migration; STOP and report if the import RPC cannot), (2) render the section with existing styling, (3) count once with name fallback, (4) idempotent dry-run-by-default scripts/backfill-commander-flags.ts, never run --apply, (5) mock-only tests, `npm run check`, commit with Copilot trailer, this report. Worktree ../oracle_app-commander-section, branch commander-section, no merge.

## Summary for the owner
The Cards tab now shows a "Commander" section at the top holding your commander (for example Mendicant Core, Guidelight), and it no longer also appears under Creature. This works in every grouping (category, type, status, mana value, colour, price) and in the list, grid and group views, and the sleeve/proxy marker still shows on the card. Choosing or changing the commander now marks that card in the list itself. Decks that were set up before this (Mendicant, rocco) already show the Commander section because the app matches the card by name; a one-off tidy-up script exists to fix the stored data and has not been run. The assistant is now told outright that the deck's total already includes the commander, so it should stop saying "84 + commander = 85".

## Findings
- The counts were already counting the commander once: the header, the deck-chat facts and readiness all count every main-list row, and the commander is one of those rows. The "85" came from the assistant, which saw "Commander: Mendicant Core" separately and added it. So the fix for the count is a clear statement to the assistant plus the commander being identified as a list card, not a change to the arithmetic. [Confirmed: src/app/decks/[id]/page.tsx totalCards; src/lib/deck-chat-facts.ts buildDeckSlotFacts]
- Header slots bar, readiness (deck-readiness.ts counts slots) and the Sleeve List (grouped by location, not category) needed no change; the Sleeve List does not group by category.
- Import: the review-screen commander choice is saved by the same PATCH the deck-page picker uses (ManaBoxDeckImportFlow), so it is covered. The import RPCs are not involved in the post-import choice, and the intent import already flags the commander when a commandZone is sent. No migration needed, nothing to STOP on.

## Changed files
- src/lib/commander-card-flag.ts (new) — shared helper: find the commander card (flagged, else exact name match), plan/write the flag (set new first, then clear the previous primary; partner/background/companion untouched), and the group helper that builds the Commander section.
- src/app/api/decks/[id]/route.ts — PATCH with a commander name (or clearing it) now also flags/clears the card; response gains `commanderCard`. Best effort: the name is already saved if the card write fails.
- src/components/CardsTab.tsx, src/app/decks/[id]/page.tsx — Commander section at the top for every group mode; page passes commanderName.
- src/lib/deck-chat-facts.ts — facts list the commander card(s) and say the count already includes them.
- scripts/backfill-commander-flags.ts (new) — dry-run by default, `--apply` to write; only sets is_commander on the exact-name main-list card (first by id) of decks that have a commander name and no flagged commander. Never deletes. `ENV_FILE` can point at another env file.
- src/lib/commander-card-flag.test.ts (new) — mock-only tests (planning, fallback, section grouping, count 84/100 with the commander included, write order).

## Dry run of the backfill (read-only, hosted DB, secrets not printed)
```
DRY RUN: 5 deck(s) with a commander name
  would  #1262795440 Eldrazi Unbound: flag card 54846 "Zhulodok, Void Gorger" (["Creature"])
  would  #1316627570 Landfall: flag card 54967 "Hearthhull, the Worldseed" (["Artifact"])
  would  #1596770643 Mendicant: flag card 55316 "Mendicant Core, Guidelight" (["Creature"])
  would  #1587385967 rocco: flag card 55237 "Rocco, Cabaretti Caterer" (["Creature"])
  skip   #-2103214467 E2E Read-only Snapshot Fixture: already has a flagged commander
Would flag 4 deck(s).
```
Not run with --apply.

## Verification
- `npm run check`: 2451 tests pass, typecheck clean, lint 0 errors (existing warnings only).
- Untested live: the Commander section in the browser, the picker writing the flag, the assistant's wording change.

## New decisions made (need owner confirmation)
- The Commander section's heading uses the section style every other group has ("Commander (1)"); no new design.
- The two flag writes (set new, clear old) are two separate calls, not one transaction, because the one-call function (set_deck_command_zone) is part of the migrations not yet applied to the hosted database. Order is set-first so a failure never leaves a deck with no commander card at worst two flagged ones; the section would then show both. Switching to the one-call function after migrations are applied is a small follow-up.
- Choosing a new commander clears only the previous main commander flag; a partner/background from the old pairing stays flagged until changed in the command-zone slot.

## Assumptions
- A commander whose card is not in the main list (picked via "Search all cards") has no card to flag; nothing breaks, the section just does not show until the card is added and the commander is chosen again.
- Search filtering hides the commander like any card.

## Challenges to locked decisions
- none
