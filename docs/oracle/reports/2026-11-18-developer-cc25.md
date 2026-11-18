# Report: cc25-trade-location
Role: Developer
Status: DONE
Task as received: CC-25 (item 2 of 2): a Trade location type, a storage place type 'trade' that is left out of Claude's suggestions, search and buying lists by default. Also covers CC-14 item 4 'leave out chosen locations'. Database change as a DRAFT with rollback, tried on a throwaway database, not applied. App code must degrade safely while the draft is unapplied. Flag, do not guess: what "by default" means for the owner, and whether existing locations get the type automatically.

## Summary for the owner
You will be able to mark a storage place, for example the Black Binder, as a Trade place. Once that is done, Claude's card search and counts leave cards in that place out, and tell Claude how many were left out and how to include them. Nothing changes in the app today: the database change is only a draft, nothing is marked, and Claude's search behaves exactly as before until you approve it. Two decisions are yours, see the open questions.

## Changed files
- supabase/drafts/20261118130000_cc25_trade_locations.draft.sql: DRAFT, not applied. Adds one yes/no column "is_trade" (default no) to storage places. Only storage places can carry it.
- supabase/drafts/20261118130000_cc25_trade_locations.rollback.sql: undo; refuses while a place is marked unless the override setting is given.
- docs/oracle/reports/evidence/cc25-db/ (run.sh, results.sql, test_cc25.sh, test_cc25.out): throwaway-database test, same approach as roles-db. Reuses the base and seed files of roles-db.
- src/lib/connector/tools/collection-query.ts: reads the owner's Trade places and leaves their copies out; adds a note with the count. Missing column gives "no Trade places".
- src/lib/connector/tools/collection-filters.ts: new optional input include_trade for search and counts.
- src/lib/connector/tools/collection-view.ts: location_id is an optional column on the narrow row.
- docs/oracle/contracts/connector-collection-search.types.ts: include_trade added to both inputs.
- src/lib/connector/__tests__/trade-places.test.ts (new, 11 tests), view-db.ts (test helper), collection-search-filters.test.ts (input list now includes include_trade).

## New decisions made (need owner confirmation)
- A flag column "is_trade" on a normal storage place, not a new value 'trade' in the place type. Reason: the picklist tick and move list functions accept only type 'storage' and would refuse a new type. Deviates from the wording "location type"; the owner sees the same thing.
- Naming a Trade place in the search "location" filter includes it without include_trade (asking for the Black Binder by name means you want it).

## Assumptions
- Left out by default applies to search_collection and get_collection_summary (the tools that look at where copies are).
- The buying list and list_deck_cards_by_ownership look at deck slots, not places, so no place can be left out there. [Confirmed: src/lib/connector/tools/get-buying-list.ts] Trade copies are already not counted as owned-and-free for decks only if Claude uses the search; the ownership status of deck slots is computed elsewhere and is not touched here.
- "Claude's suggestions" (card roles suggestions, connector edit functions) were not touched: they sit in the card roles drafts and functions I was told not to change.

## Challenges to locked decisions
- none

## Open questions
1. What does "by default" mean for you? As built: Claude leaves Trade places out unless it sends include_trade true or names the place. Should you also have a switch in the app (for example in storage settings) to include them for good? Not built; there is no screen for it.
2. Should existing places get the type automatically? As drafted: no. Every place starts unmarked, including the Black Binder. After you approve, marking the Black Binder is one separate step (the exact statement is in a comment in the draft), or a settings screen if you want one (not built).
3. Should the Black Binder's cards also stop counting as free for decks in the app itself (deck building, allocation, picklist)? Not done; it would touch the card window and allocation code.
4. Suggestions and the card roles functions are not covered (hard constraint). If you want Claude's edit suggestions to skip Trade places, that is a follow-up after the roles drafts are settled.

## Verification
- ./run.sh test_cc25 (throwaway Postgres 17, nothing real touched): 18 PASS, 0 FAIL, including existing places stay unmarked, deck places refused, row security for a second user and the anonymous role, rollback refuses while marked, exact restore of the previous state, re-apply.
- npx vitest run src/lib/connector: 347 passed, 4 skipped, 0 failed.
- npx vitest run (full): 3830 passed, 46 skipped, 0 failed (6 skipped files).
- npx tsc --noEmit: 4 errors, all the known AddToPicklist.test.tsx ones; none new.
- npx eslint src/lib/connector: clean.
