# Report: picklist-simplification
Role: Developer
Status: DONE
Task as received: PART 1, make the all-decks Picklist (/picklist, GET /api/picklist, buildAllDecksPicklist, AllDecksPicklist) list every planned card of every deck automatically (investigation Option A: derive rows from deck_cards like GET /api/decks/[id]/picklist, saved steps take precedence, no database change). Picked = existing 'found' tick (moves to In your hand). Placed requires Picked first. Unowned cards get their own section with no ticks. Keep "Can't find it". Header "N of M cards placed" per deck and overall, counted over derived rows plus steps. A contested free copy goes to one row only, with no failing tick on the other. A failed load shows an error, never "Nothing to move" (D-030). Page past the 1000-row limit. Update the empty-state wording and tests. Leave AddToPicklist / create_move_list in place. PART 2, reproduce and fix: a Picked card shows "Planned · Unowned" in the deck's card list instead of In your hand. Fix it everywhere the chip appears, keep in-hand copies out of available supply, and add a test. (Full handoff in the workflow step prompt.)

## Summary for the owner
The all-decks Picklist now lists every planned card in every deck as soon as it is added. Each card sits under where its copy is now: Storage, Another deck, or a new Unowned section. Each deck shows its own "N of M cards placed" line, and the page shows the total. A card you have Picked now shows a violet "Planned · In your hand" chip in the deck's card list, not the pink "Unowned" chip. If two decks want your only free copy, it goes to one of them. The other deck's row has no tick and says "Your only copy is already going to TEST A". Please confirm that wording.

---

# Technical section

## Part 1: all-decks Picklist derives every planned card
- `GET /api/picklist` now reads all of the user's decks (or the `deckIds` filter) and their planned slots: `deck_cards` with `copy_id IS NULL`, not generic (`isGenericSlot`, D-032). This is the same test the per-deck route uses. It also reads the ranked candidates (`getBatchRankedCandidates`) and the saved steps (`move_items`), then merges them in `buildAllDecksPicklist`. [Confirmed: src/app/api/picklist/route.ts]
- Every read pages with `.range()` through `fetchAllRows`, the existing helper in src/lib/supply-pool.ts, which is now exported. `in` lists are chunked at 150 ids, and candidate lookups at 200 names per call.
- Any failed read, including the candidate lookup, returns 500 `load_failed`. The page then shows "Couldn't load the Picklist. Try again" (D-030). The old route logged the unowned-count failure and carried on. The per-deck route still does that for candidates (see residual risks).
- Builder rules [Confirmed: src/lib/all-decks-picklist.ts]:
  - An open step (to_find, found or missing) takes precedence for its slot, and that slot is not derived again.
  - A placed step whose slot is planned again (the copy was released since) is dropped as history.
  - The copy for a derived row is the first free copy in storage that no other row has taken. If there is none, it is the first copy in another deck that no other row has taken. Copies already in the same deck are skipped, as `categorizeCards` does.
  - Rows with no owned copy (tier 5 or no candidates) go into the `unowned` stops, one per deck, with `copyId: null`.
  - **Contested copy:** slots are processed in a fixed order (deck name, then card name, then slot id). The first slot gets the copy. A later slot that only has the same copy keeps it as `copyId` but gets `blockedBy` set to the name of the deck the copy is going to. The UI hides its ticks and shows "Your only copy is already going to TEST A. Pick it there first, or add another copy." Copies that already have an open step count as taken. This prevents the `copy_already_in_open_item` refusal.
  - New response fields: `unowned: WalkStop[]`, `decks: DeckProgress[]` (per-deck placed/total), and `counts.unowned`. Removed: `unownedByDeck` and `unownedFootnote`. Each `WalkRow` now has `itemId: number | null` (null means a derived row with no step yet), a `key` and `blockedBy`.
  - `applyWalkOptimistic` (added in b7182ed while this task was running) is kept and keyed by the new `walkRowKey(row)`: the step id, or minus the slot id for a derived row. It also updates the per-deck placed count.
- UI [Confirmed: src/components/AllDecksPicklist.tsx]:
  - Section titles are now Storage, Another deck, Place in decks and boxes, and Unowned. They were "Take from boxes" and "Take from decks".
  - The header reads "N of M cards placed", with one line per deck under it.
  - The help line reads "Every planned card in your decks shows here. Ticks save straight away. Picked moves the card to In your hand, and out of any deck it was in. Placed needs Picked first."
  - The empty state reads "Nothing to pick. None of your decks has a planned card waiting for a copy."
  - Derived rows have Picked and Can't find it. They have no Cancel step and no Undo, because no step exists yet. The first tick creates the step through the unchanged `picklist_tick`.
  - Unowned rows read "For TEST B · not in your collection" and have no ticks.
  - A tick also refreshes the deck queries (`['decks']`), so a deck's chips update.
- AddToPicklist and create_move_list are untouched.

## Part 2: a Picked card shows Unowned in the deck list
- **Reproduced (by test and code reading).** `computeUnresolvedStatuses` reads copies with `.eq('in_hand', false)` [Confirmed: src/lib/card-status.ts]. A Picked copy has `in_hand = true` and its target slot still has `copy_id = NULL` (Placed fills it). So for the only copy of a card, the slot classifies as `unowned`, and CardSlotBadge renders "Planned · Unowned" in pink. The new test "still reports unowned when nothing was Picked" and the supply test below pin that supply behaviour. Before the fix, the scenario in "shows a Picked card as in_hand, not unowned" returned `unowned`.
- **Fix.** I added a status `in_hand` to `CardSlotStatus`. `loadInHandSlotIds` reads the user's `move_items` in state `found` for the deck's planned slots and keeps only those whose copy still has `in_hand = true`, so stale steps are ignored. `computeDeckCardStatuses` marks those slots `in_hand` (lifecycle stays `planned`). If that lookup fails, slots that would read Unowned or In decks read "Couldn't check" instead (D-030). The supply filters are unchanged, so in-hand copies stay out of available supply everywhere else.
- **Chip.** "Planned · In your hand", violet #9D8DF1 with the `back_hand` icon. This reuses the existing In your hand badge colour and icon on the deck Picklist (StateBadge in PicklistV2). It is applied to CardSlotBadge (badge, icon and grid border), the CardsTab group label and tile border, the CardGroupSection mobile dot, and a short StatusChipPopover message. The card-statuses response has a new `counts.in_hand`.
- The deck's own Picklist now also refreshes the deck's card statuses after a tick, so the chip changes without waiting out the 5-minute cache.

## Manual-style check (not run against live data; describes what the owner should see)
1. Open the Picklist from the top menu. TEST A and TEST B each have a line such as "TEST A: 0 of 61 cards placed", under a total such as "0 of 122 cards placed". Your numbers will differ.
2. Cards with a free copy are listed under Storage, by box (Unsorted first). Cards whose only copies are in other decks are under Another deck, by deck name. Cards you don't own are under Unowned, by deck, with no buttons.
3. Tick Picked on a TEST A card. It moves to "Place in decks and boxes" as "In your hand · going to TEST A". Open TEST A's card list: that card's chip reads "Planned · In your hand" in violet.
4. Tick Placed. The card shows as placed, and "1 of …" goes up for TEST A and for the total.

## Changed files
- src/app/api/picklist/route.ts — derive every planned card, merge steps, page every read, fail loudly
- src/app/api/picklist/route.test.ts — new: route test (derived rows, deck filter, paging past 1000, failed reads give 500)
- src/lib/all-decks-picklist.ts — builder merges derived rows and steps, Unowned section, one copy per row, per-deck counts; `applyWalkOptimistic` keyed by row
- src/lib/all-decks-picklist.test.ts — rewritten for the new behaviour
- src/components/AllDecksPicklist.tsx — new sections, header, wording, ticks on derived rows, blocked rows, deck refresh
- src/components/AllDecksPicklist.test.tsx — updated fixtures and wording; new tests for sections, derived ticks, blocked row, error state
- src/lib/supply-pool.ts — export `fetchAllRows` (paged helper)
- src/lib/card-status.ts — `in_hand` status, `loadInHandSlotIds`
- src/lib/card-status.test.ts — Picked-card tests; default mock answers the new lookup
- src/app/api/decks/[id]/card-statuses/route.ts — `counts.in_hand`
- src/components/CardSlotBadge.tsx — In your hand chip, icon and border
- src/components/CardsTab.tsx — In your hand label, group order and tile border
- src/components/CardGroupSection.tsx — In your hand mobile dot
- src/components/StatusChipPopover.tsx — In your hand popover text
- src/components/PicklistV2.tsx — refresh card statuses after a tick
- docs/oracle/reports/2026-11-18-developer-picklist-simplification.md — this report

## New decisions made (need owner confirmation)
- Contested copy: the deck that comes first alphabetically gets it. The other row has no tick and says "Your only copy is already going to <deck>. Pick it there first, or add another copy."
- Section names: Storage / Another deck / Place in decks and boxes / Unowned.
- New status chip "Planned · In your hand" (violet). It needs adding to vocabulary.md and the status taxonomy (D-025 / D-043 list Original, Proxy, Available, Alternate, Claimed, Unowned).
- A Placed step whose card was later released is no longer shown, and that slot appears again as a planned card.

## Assumptions
- "Planned card" uses the same test as the per-deck Picklist, so cards in Maybeboard or Sideboard categories are included if the per-deck Picklist includes them.
- Steps that point at a box rather than a deck count in the overall total but not in any deck's line.

## Challenges to locked decisions
- D-025 / D-043 — the taxonomy has no in-hand state, and the owner asked for one — add "In your hand" as a planned-slot status.
- The 2026-11-16 contract note ("unowned cards are never listed") is reversed at the owner's request. It was not a locked decision, but the contract text in know-where-cards-are.md should be updated by the Architect.

## Open questions
- Is the contested-copy wording right, and should the winner be chosen differently (for example, the deck added most recently)?

## Residual risks
- Load cost: one request now does the deck-route work for every deck. It is batched, but a very large collection will make /picklist slower.
- Inside `getBatchRankedCandidates`, one copies query per 1000 card ids can still exceed 1000 rows. That code is existing. I lowered the risk by sending 200 names per call; it is not removed.
- The per-deck Picklist route still treats a failed candidate lookup as "no candidates", which shows cards as Unowned (existing, not changed here).
- Deck tiles on the deck list count unresolved cards by name, so a Picked card is still counted there as "unowned". That is a count, not the chip, and was left out of scope.
- Picking from a locked or built deck on the all-decks page has no extra confirmation (existing behaviour for steps).
- A concurrent commit (b7182ed, instant ticks) landed during this task. My first rewrite of all-decks-picklist.ts dropped its `applyWalkOptimistic`. I restored it and adapted it, and its tests pass.

## Verification
- `npx vitest run src/lib/all-decks-picklist.test.ts src/components/AllDecksPicklist.test.tsx src/app/api/picklist/route.test.ts "src/app/api/picklist/[action]/route.test.ts" src/lib/card-status.test.ts src/components/PicklistV2.test.tsx src/app/api/cards/builder-status/route.test.ts src/app/api/decks/route.test.ts src/components/CardGroupSection.moved.test.tsx src/lib/__tests__/supply-pool.test.ts src/lib/deck-chat-facts.test.ts` — 11 files, 134 tests passed.
- `npx tsc --noEmit -p .` — 4 errors, all in src/components/AddToPicklist.test.tsx (known, pre-existing); none elsewhere.
- `npx eslint` on the touched files — 1 error, already in PicklistV2.tsx (an `<a>` link to /storage/missing/, not touched here), plus warnings only.
- Not committed (task instruction). No database change.
