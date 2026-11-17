# Report: collection-colourless-and-filter-speed
Role: Developer
Status: DONE
Task as received: Two owner reports on the Collection page. (1) BUG: clicking the colourless icon shows "No cards match your filters" although the owner owns colourless cards (Sol Ring, Basalt Monolith). Reproduce in Exact and Includes, list and grid view, find the root cause, fix, add a test; decide the Includes rule and flag it. (2) PERFORMANCE: measure and speed up filtering (colour click, search, status chip) for about 4,400 cards; no migrations, no data changes, keep to the Collection filtering path, do not touch Decks or connector tools. Report before and after timings.

## Summary for the owner
The colourless icon now shows your colourless cards (415 copies in list view, 249 cards in grid view). Clicking a colour in list view used to take about 11 seconds and now takes about a second; typing in search went from about 2.3 seconds to about 1.7 seconds (0.3 of that is the typing pause). Please confirm the rule for colourless when mixed with other colours (see "New decisions").

## Root cause (colourless)
- List view [Confirmed: src/app/api/collection/printings/route.ts, before this change]: the icon sends the letter C. The card library stores a colourless card as an empty colour list, never as C, so "has colour C" matched nothing. This failed in Exact and in Includes.
- Grid view [Confirmed: src/app/api/collection/rollup/route.ts, before this change]: the colour filter read the colour text on your card records, and that text is empty for all 2,832 cards (the CC-07 view migration notes the same). So in grid view EVERY colour filter returned nothing, not only colourless. Green Exact returned 0 cards before; it now returns 477.
- The Claude connector avoids both by using a database view with has_w to has_g and is_colourless columns [Confirmed: src/lib/connector/tools/collection-filters.ts, supabase/migrations/20261116200000_connector_collection_copies_view.sql]. The Collection page now reads that same view (read only, no change to it).

## Reproduced before the fix (local app on the real database, read only)
| Request | Result before |
|---|---|
| List, Exact + colourless | 0 cards, 11.4 s |
| List, Includes + colourless | 0 cards, 11.4 s |
| Grid, Exact + colourless | 0 cards, 1.1 s |
| Grid, Includes + colourless | 0 cards, 1.0 s |
| Grid, Exact + green | 0 cards (should be 477), 1.0 s |

## Timings, before and after
Measured in a real browser against the local app (Next dev server, hosted database, cold browser cache, about 4,400 copies). Time from the click or keystroke until the footer count changes. Each database round trip from this machine costs about 0.25 to 0.3 s, so a floor of about 1 s per fresh answer remains (sign-in check, then the page query, then the page details).

| Action (list view) | Before | After |
|---|---|---|
| Click green (Exact) | about 11.7 s | 2.1 s first time (includes a one-time lookup, cached 30 s), about 1.1 to 1.3 s after |
| Click colourless (Exact) | 11.3 s, wrong (0 cards) | 1.2 s, 415 cards |
| Type "sol" in search (300 ms typing pause included) | 2.3 s | 1.7 s |
| Clear filter / go back to a combination already seen | 0.1 s (cached) | 0.1 s (cached) |
| Change a status chip | 0.1 s, no request | unchanged (see Open questions) |
| Unfiltered first load, server only | 1.8 to 2.1 s | 1.1 to 1.2 s |
| Grid view colour click, server only | 1.0 s (but wrong, 0 cards) | 1.5 to 2.0 s (now correct) |

Server-only timings (same machine): list colour request 11.4 to 12.0 s before, 1.0 to 1.25 s after; list search 2.1 s before, 1.07 s after.

## Where the time went
- Server, list view with a colour filter (the big one): the route read all 4,413 copies in five batches one after another, then about 18 batches of card details one after another, then filtered in the app. About 11 s. Response was small; payload was not the problem.
- Server, list view with no colour filter or with search: read all 4,413 copies in the app and sorted them there for every request, about 1.8 to 2.1 s.
- Not a cause: re-rendering rows (the list is already virtualised), the 300 ms search pause (kept), the refresh-on-tab-return hook (it refetches only the one query on screen, only when the tab returns, at most every 5 s), and blank flashes (the previous results already stay visible while loading, via placeholderData; confirmed in the code and in the browser).
- Stale requests: the old requests were not cancelled. Fixed.

## What changed
- List view fast path: the database now filters (search, colour, proxies), sorts and counts, and returns only one page of copies. Card details, deck usage and added dates for that page are fetched together in one step. The price-freshness read runs alongside instead of before. About 11 s becomes about 1 s.
- Colour rule is now one shared function used by both views and by the slower list sorts (price, rarity, set).
- Grid view colour filter works now (uses the same view). Without a colour filter, the grid's count and page queries run together instead of one after the other.
- Copies with no card-library row (124 copies, for example "Dusk // Dawn"): the view cannot judge them, so their colours are read from the printing and cached for 30 s. This keeps today's numbers exact: green Exact 809 and green Includes 1,209 are identical before and after.
- Order of cards is unchanged: I compared the database order with the old in-app order for all 4,413 copies and found 0 differences.
- Browser side: requests that are no longer wanted are cancelled when the filter changes again; the same colours in any click order share one cached answer.

## Changed files
- src/lib/collection-colour-filter.ts — new: colour rule (pure), database filter text, and the cached lookup for copies without library data
- src/lib/collection-colour-filter.test.ts — new: rule tests, including colourless in both modes
- src/app/api/collection/printings/route.ts — list view fast path on the database; shared colour rule in the slower sorts
- src/app/api/collection/printings/route.test.ts — fast-path tests moved to the new queries; colourless regression tests (Exact, Includes, Exact + green + colourless)
- src/app/api/collection/rollup/route.ts — grid view colour filter via the view; count and page in parallel
- src/app/api/collection/rollup/route.test.ts — colourless regression test for grid view
- src/hooks/useCollectionPrintings.ts, src/hooks/useCollectionRollup.ts — cancel stale requests; order-independent colour key
- docs/oracle/test-plan-2026-11-17.md — one colourless check added to Part C (this file is untracked in the main checkout, so the edit was made there directly and is not part of the commit)
- docs/oracle/reports/2026-11-18-developer-collection-colourless-and-filter-speed.md — this report

## New decisions made (need owner confirmation)
- **Colourless rule (Includes and mixed with colours).** Colourless alone shows colourless cards only, in both Exact and Includes (a colourless card has no colour to "include"). Colourless together with colours adds colourless cards to whatever the colours match. Example: Exact + green + colourless shows mono-green cards and colourless cards; Includes + green + colourless shows every green card (including green-blue) and colourless cards. Alternative: make the colourless icon exclusive (clicking it clears the colours). Recommendation: keep the rule above.

## Assumptions
- Both views count and list only cards you own as real copies (proxies stay off in list view unless the Proxies chip is on), as before.
- Grid view's colour filter now lists only cards with a copy in the tab (before it listed any card record). With colour filters off nothing changed.
- The 30 s cache for copies without library data may show a copy imported in the last 30 s with its colour one request late. Harmless.

## Challenges to locked decisions
- none

## Open questions
- **Status chips (Fully Placed, Partially Available, Unplaced, Over-Allocated) do not filter anything.** Clicking one only changes the chip and the empty-state wording, in both views; no request is sent, so it answers instantly but the list does not change. I did not change this because it would change what the filter means. Do you want them wired up? Gene to log as a backlog item.
- Grid view cards always show no colours (the same empty card-record colour text). Not in this task; list view is unaffected.
- A further speed-up would need a database change, so it is a recommendation only (not applied): none is needed at today's size, the view query already runs in about 0.3 s. If the collection grows past roughly 20,000 copies, consider an index for the name search: `create index concurrently if not exists user_cards_name_trgm on public.user_cards using gin (card_name gin_trgm_ops);` (needs the pg_trgm extension).
- The remaining roughly 1 s per fresh answer is network round trips from the local machine to the hosted database (sign-in check, page query, page details). On Vercel next to the database this is likely lower; not measured.

## Verification
- Reproduced before the change in the browser against the local app: list Exact and Includes colourless 0 cards in 11.4 s; grid colourless and green 0 cards.
- After: list colourless 415 copies (Exact and Includes), green Exact 809 and Includes 1,209 (same as before), green + colourless Exact 1,224; grid colourless 249 cards, green Exact 477, green Includes 777.
- Order check, database order against the old in-app order, 4,413 copies — 0 differences.
- Rapid clicks on blue, red, black in the browser — 3 requests started, final list correct.
- `npx vitest --run src/lib/collection-colour-filter.test.ts src/app/api/collection src/hooks src/components/collection src/app/collection` — 22 files, all pass.
- `npm run check` — tests: 3,514 pass, 2 fail, both known (the ImportIntentFlow env-flag test and the TIDY-01 "estimate" wording test; the TIDY-01 test fails the same on the untouched code). Type check: only the four known TIDY-02 errors in AddToPicklist.test.tsx. Lint: 0 errors, 2 existing warnings in files I did not touch.
- Nothing was written to the database; only reads were made (the browser requests and a few read-only scripts).
