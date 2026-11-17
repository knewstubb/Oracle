# Report: deck-list-and-delete-speed
Role: Developer
Status: DONE
Task as received: fix two slowness problems the owner reported on the live site (deployed from main). 1. The Decks page takes a long time to load even though there are only about 17-21 decks. 2. After the owner clicks Delete on a deck and confirms, the success toast appears but the deck stays in the list for a few seconds before it disappears. Owner's expected behaviour: the deck list loads quickly; when a deck is deleted it leaves the list at once, together with the toast. If the delete fails the deck must come back with a clear error. Delete must still return cards to storage exactly as today. Constraints: no database migrations unless unavoidable; keep scope to these two problems; follow existing conventions; do not touch src/lib/connector; do not touch the live database or the owner's real decks. Check that proves it done: before/after timings for the deck list load and for delete-to-disappear, a test covering that a deleted deck is removed from the list immediately and restored on failure, and npm run check showing no new failures beyond the known TIDY-01/TIDY-02.

## Summary for the owner
The Decks page now loads in about 1.2 seconds instead of about 11. When you delete a deck it leaves the list straight away (about 0.2 seconds after you click Delete). If the delete fails, the deck comes back in the same place with a message such as: Couldn't delete "TEST A". It's back in your list. Deleting still returns the deck's cards to storage exactly as before. No database change was needed.

## What was slow and why
- **Deck list.** The page looks up the mana symbols for every card in your decks (about 670 card names) so it can draw the colour pips on each tile. All 670 names went to the database in one request. A request that large stalls for about 10 seconds and then fails. When it failed, the page waited the full 10 seconds and then quietly showed tiles with no pips. The fix sends the names in small groups of 150 at the same time. Each group comes back in about 0.3 to 0.6 seconds, and the pips can be drawn again (after the fix, 12 of the 20 decks came back with pip data; I did not count this before the fix). [Confirmed: src/app/api/decks/route.ts]
- The plan expected the slow part to be the "unresolved import conflicts" check. Server timing showed that check takes about 0.3 seconds, so I left it unchanged. The slow part was the mana-symbol lookup (see the timing table below).
- **Delete.** The deck only left the screen after the app had reloaded the whole list (the ~11 s load above). It now leaves the list as soon as you confirm. The list then refreshes quietly in the background. [Confirmed: src/hooks/useDeleteDeck.ts]

## Timings (local dev server against the hosted database, same machine and network for before and after)
Server timing per database call for one deck-list load, before the fix:

| Step | Time |
|---|---|
| First batch (decks, folders, deck cards, brew sessions, collection count, conflict counts), in parallel | 0.53 s total; conflict counts 0.29 to 0.36 s |
| Mana-cost lookup, one request with ~670 names | ~9.4 to 9.8 s, then "fetch failed" |
| Everything else | < 0.1 s |
| Whole request (server) | 10.0 s |

| Measurement | Before (main) | After (this branch) |
|---|---|---|
| Deck list request, 5 runs | 20.3 s (cold), 10.7, 10.6, 10.5, 10.5 s | 1.65 s (first), 1.21, 1.19, 1.23, 1.36 s |
| Open Decks page until tiles show | 12.3 s | 2.8 s |
| Click Delete until the tile is gone (simulated 1 s server delete) | 12.1 s | 0.22 s |
| Failed delete (simulated server error): tile returns | tile never left; plain error toast | tile leaves at 0.23 s and returns at 1.5 s with the toast: Couldn't delete "A rot to process". It's back in your list. simulated failure |

Delete timings came from a browser test. The delete request was intercepted in the browser and answered after 1 second, so no real deck was deleted and the real delete endpoint was never called. The deck-list requests were real and read-only.

## Changed files
- src/app/api/decks/route.ts — mana-cost lookup sends card names in groups of 150 instead of 1,000
- src/app/api/decks/route.test.ts — test that a 400-card list is looked up in groups of at most 150
- src/hooks/useDeleteDeck.ts — new shared delete hook: removes the deck from the list at once, restores it with an error toast on failure, refreshes in the background afterwards; server call unchanged
- src/components/DeckTile.tsx — tile's Delete uses the hook and closes the dialog immediately
- src/components/DeleteDeckButton.tsx — deck-page Delete uses the hook; keeps "Deleting..." until the server answers, then goes to the deck list (now without the deleted deck)
- src/app/page.test.tsx — tests: deck leaves the list before the server answers; deck comes back in its original position with an error naming the deck and the reason; a list reload already in progress does not bring the deleted deck back
- docs/oracle/reports/2026-11-17-developer-deck-list-and-delete-speed.md — this report

## New decisions made (need owner confirmation)
- Error message wording on a failed delete: Couldn't delete "<deck>". It's back in your list. <reason>
- Success toast on the tile now reads Deleted "<deck>" (with quotes), matching the deck page.

## Assumptions
- A group size of 150 names keeps each request well under the size that stalls (300 names took 0.37 s in a direct test; 670 failed after 9.8 s).
- The Draft deck tile has the same slow-delete pattern but is not shown anywhere in the app, so it was left unchanged.

## Challenges to locked decisions
- none

## Open questions
- The deck list reads only the first 1,000 of the 1,783 card rows because the database caps each read at 1,000 rows. Card counts, colour pips and "cards you still need" on some tiles may therefore be too low. Fixing this needs paged reads. Should that be its own task?
- Process note: when I stopped my test server I also stopped the dev server that was already running on port 3000. It needs restarting with npm run dev in the main folder. The live site was not affected.

## Verification
- npx vitest run src/app/api/decks/route.test.ts — 4 passed
- npx vitest run src/app/page.test.tsx src/components/DeckTile.test.tsx — 24 passed; with the DeckTile change temporarily reverted, the "removed at once" and "restored on failure" tests fail (the tests catch the old behaviour)
- npm run check — tests: 1 failed (TIDY-01, connector get_deck "estimate" wording), 3,461 passed, 46 skipped. The check stops at the first failure, so I ran the next two steps on their own
- npm run typecheck — only the 4 known TIDY-02 errors in AddToPicklist.test.tsx
- npm run lint — 4 errors, all in files this branch does not change and that are identical on main (PicklistV2.tsx, connector tools.test.ts, connector list-decks.ts); no lint errors in changed files
- Timings: see the tables above (browser on a local dev server at :3100 for this branch and :3000 for main)
