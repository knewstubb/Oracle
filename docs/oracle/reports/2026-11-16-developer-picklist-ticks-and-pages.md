# Developer report: Picklist ticks and pages (slices 2 to 4)

Status: PARTIAL

## Migration
- Applied `picklist_tick` (and grants) to hosted project The Oracle (udocxsyzzvrceiuupprj) with owner approval; hosted version 20261116032532. File moved from drafts to `supabase/migrations/20261116032532_picklist_ticks.sql`, header updated.
- Read-only checks: security definer, search_path fixed, only the server role can run it, listed in migrations.
- Smoke test inside one block that ended in a forced error (rolled back): found, repeat found (unchanged), placed to a box, can't find, repeat, bad box (target_not_found), wrong user (copy_not_found). Afterwards no saved steps and the copy was back in its slot.

## Changed files
- Slice 2: `src/lib/picklist-ticks.ts` (+test), `src/app/api/picklist/[action]/route.ts` (+test), `src/lib/picklist-move-items.ts`, `src/app/api/decks/[id]/picklist/route.ts`, `src/components/PicklistV2.tsx` (+test).
- Slice 3: `src/lib/system-locations.ts`, `src/types/system-locations.ts`, `src/app/api/locations/system/route.ts`, `src/components/SystemPlacePages.tsx` (+test), `src/app/storage/in-hand/page.tsx`, `src/app/storage/missing/page.tsx`, `src/app/storage/page.tsx`.
- Slice 4: `src/lib/all-decks-picklist.ts` (+test), `src/app/api/picklist/route.ts`, `src/components/AllDecksPicklist.tsx` (+test), `src/app/picklist/page.tsx`, `src/components/Sidebar.tsx`, `src/components/TopNav.tsx`.
- Docs: `docs/oracle/status.md`.

## New decisions made
- Available "Placed it" keeps the existing direct assign path; only the pick-up-first path uses the routine (a copy not in hand gives not_in_hand).
- Added route `/api/picklist/cant-find` (contract lists only found and placed).
- An In your hand row sits in the group of the deck it came from (box means Available).
- "Walk it instead" reveals Found it plus a disabled Placed it.

## Assumptions
- The all-decks response is my own shape (stops with rows from saved steps), not the contract's PicklistRow shape, because the view lists only cards that already have a saved step.
- In your hand and Missing responses carry extra fields (destination, last seen name, look-next); look-next is computed read-only (other decks listing the card, then Unsorted).
- "Put it somewhere else" lists boxes, and decks only when the import destinations route offers decks (it is behind a flag).
- The new tables and routine are not in generated types, so casts are used.

## Challenges
- None blocking. A combined test run hung once when piped; files run fine individually.

## Open questions
- Needs Architect drafting and owner approval of new stored routines: Turned up / Found it on Missing, saved "I checked here", Undo a tick, Cancel a step, Add to Picklist / Add all (create_move_list). Without Add to Picklist the all-decks view stays mostly empty.
- Unowned footnote on the all-decks view not built.

## Verification
- `npm run typecheck` clean. New and touched test files pass individually (picklist-ticks 21, tick route 10, PicklistV2 13, SystemPlacePages 8, all-decks lib 4, AllDecksPicklist 6, Sidebar 9). Lint on new files: no errors. Full test suite not run.
- Commits pushed to main. Other people's uncommitted connector files were left alone.
