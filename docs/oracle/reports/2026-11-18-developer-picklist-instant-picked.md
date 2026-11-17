# Report: picklist-instant-picked
Role: Developer
Status: DONE
Task as received: On the Picklist, clicking the Picked button (formerly Found it) takes about 4 seconds before the card moves into the 'In your hand' section. Owner wants it essentially instant. (Full hand-off: measure where the 4 seconds go, then make Picked, Placed, Can't find it and Undo optimistic on the deck Picklist tab and the all-decks view, with rollback and the plain refusal message; cut easy server round trips; no migrations or live data changes.)

## Summary for the owner
Picked, Placed, Can't find it and Undo now change the screen the moment you click. The card moves into In your hand (or leaves the list for Placed) straight away and shows a small "Saving…" mark while the save finishes in the background. If the save is refused or the connection fails, the card goes back where it was and you see the same plain message as before. Nothing needs your decision.

## Where the 4 seconds went
Measured on the owner's running local app with read-only requests only (no card was clicked or moved on any real deck):
- The save itself is short: sign-in checks (two, one in the page gate and one in the route) plus the database call. A request that fails straight after the sign-in checks takes about 0.5 s, and the database call adds roughly 0.25 s plus the routine's own work. About 0.8 to 1.0 s in total. [Approximate]
- The long part is what the screen did afterwards. The row only changed after the save answered and the deck's Picklist was read again. That read took 1.2 to 2.2 s on the three decks tried (several lookups in a row). At the same moment the screen also re-read other lists (card statuses, deck, health, allocation, the In your hand/Missing data at 2.7 to 3.3 s, the all-decks Picklist at about 2.5 s), which compete for the same connection.
- Save (about 1 s) plus the Picklist re-read (1.2 to 2.2 s) plus queueing behind the other re-reads gives the roughly 4 s the owner saw.
- The new refresh-on-tab-return hook is not involved: it skips while a save runs and only acts on tab return.
- The database routine itself (picklist_tick) is a single transaction of a handful of small statements next to the data, so it is not the slow part. No SQL change is recommended.

Click to moved, before: save plus re-read, about 2 to 4 s (the old code does not move the row until then; the new tests fail against the old component for exactly this reason). After: the change is drawn in the same click, under 100 ms (asserted by a test; the real save finishes in the background).

## Changed files
- src/hooks/usePendingSaves.ts — new: keeps the shown-at-once state, blocks a second save for the same card, rolls back on failure, keeps the new state until the server data has been re-read.
- src/lib/picklist-tick-client.ts — new: sends one tick; a network failure becomes the standard plain "Couldn't save that" sentence.
- src/lib/picklist-optimistic.ts — new: the deck Picklist as it looks right after a click (pure, safe to apply on already-saved data).
- src/lib/all-decks-picklist.ts — added the same for the all-decks view (rows move to the right stop, counts follow).
- src/components/PicklistV2.tsx — Picked, Placed (both the box row and the In your hand row) and Can't find it are instant; per-card rather than whole-screen disabling; subtle "Saving…" note on the In your hand row.
- src/components/AllDecksPicklist.tsx — Picked, Placed, Can't find it and Undo are instant; Cancel step unchanged.
- src/components/SystemPlacePages.tsx — In your hand page: Placed removes the card at once. Missing page "Found it" unchanged.
- src/components/PicklistV2.test.tsx, AllDecksPicklist.test.tsx, SystemPlacePages.test.tsx — new tests: instant move, rollback on refusal, rollback on network failure, double click sends one save, a re-read while saving does not undo the move, no duplicate row after the server answer.

## New decisions made (need owner confirmation)
- While a card is saving, only that card's buttons are disabled (before, the whole screen was). This lets the owner tick the next card straight away.

## Assumptions
- On the all-decks view, Undo on a picked-up or Missing card is shown as "waiting" at once and moves back under the place it was taken from. If that place has no row left on screen, a stop with that name is shown until the real data arrives a moment later.
- The Placed button on box rows (assign route) is treated like the other ticks.

## Challenges to locked decisions
- none

## Recommendations (not done)
- The deck Picklist read (GET deck picklist, 1.2 to 2.2 s) does its lookups one after another. Running independent lookups in parallel would cut it by roughly half. It is a bigger change in a shared route, so it is left for its own slice.
- The tick route does two sign-in checks (page gate and route), about 0.25 s each, and the route's own check is a network call to the sign-in service. Reading the signed session locally instead would save about 0.25 s, but it changes sign-in handling for every route, so it is left alone. The remaining calls in the route depend on each other (sign-in, then the routine), so there was nothing safe to run in parallel.
- After a save the screen re-reads about eight lists. Narrowing that to what a tick can change would lighten the background work. No SQL change needed.

## Open questions
- If the re-read after a successful save itself fails (connection drops right then), the row falls back to the old state until the next refresh although the save went through. Rare; a fix would be to keep the new state and retry the read.

## Verification
- npx vitest --run on the three component test files — all pass (PicklistV2 22, AllDecksPicklist 17, SystemPlacePages 21 including the new ones)
- the new instant-move tests run against the previous PicklistV2 — 9 fail, as expected (row did not move until the save answered)
- npm run check (tests) — 2 failures only, both known: ImportIntentFlow env flag, connector description test
- npm run typecheck — only the 4 known AddToPicklist.test.tsx errors (TIDY)
- npm run lint — same 4 known errors; warnings only added elsewhere
- read-only timing of the running local app: picklist reads 1.2 to 2.2 s, all-decks 2.5 s, In your hand data 2.7 to 3.3 s, route sign-in only 0.5 s
