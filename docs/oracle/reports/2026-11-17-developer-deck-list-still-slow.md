# Report: deck-list-still-slow
Role: Developer
Status: PARTIAL
Task as received: Owner report (17 Nov, live site, after 7d0fce9 and 9e66c63 were deployed): the Decks page still takes a long time to load with about 21 decks. Find why and fix it; check deployment, the refresh-on-tab-return hook, server work per page load, Vercel/Supabase region, and client-side work. Expected: content in about 2 s or less on live, or tiles first and slow numbers afterwards. Region or settings problems are recommendations only. No migrations; do not touch the owner's decks; avoid src/app/collection.

## Summary for the owner
The deck tiles now appear after one quick lookup instead of waiting for three slow ones. The colour pips and the "available / claimed / unowned" counts fill in a second or two later. I also found that tiles were showing wrong card counts (for example Tidus showed 29 cards instead of 98) because the page read only the first 1,000 of 1,904 card rows; that is fixed. I could not time the live site itself, and two things that probably cost the most on live need your decision (see Open questions).

## Where the seconds go (measured)
Local dev server in NZ against the same hosted database the live site uses, 21 decks, 1,904 deck-card rows, 1,189 distinct card names, 115 unresolved cards. Each database call costs about 0.2 to 0.25 s round trip from here.

| Step (server) | Before (main) | After |
|---|---|---|
| Sign-in check in middleware, then a second sign-in check in the route (one after the other) | about 0.5 s | unchanged |
| First parallel batch (decks, folders, deck cards, brew sessions, collection count, conflict counts) | 0.4 to 0.8 s (deck cards read stopped at 1,000 rows) | 0.45 to 0.6 s (now reads all 1,904 rows, two pages in parallel) |
| Available/claimed/unowned lookup (3 database calls in a row; only ran because earlier data was cut off, and ran once the cap is fixed) | 0.5 to 1.0 s | moved out of the first response |
| Mana-cost lookup for pips (5 parallel calls) | 0.3 to 0.65 s | moved out of the first response |
| Deck list request, 5 to 20 runs | 1.3 to 2.3 s (1.4 to 2.0 s once the cap was fixed, before splitting) | 0.8 to 1.0 s (typical 0.9 s) |
| Details request (pips and counts, runs in the background) | not separate | 1.3 to 1.8 s |
| Browser: open Decks page until the 21 tiles show (fresh browser, includes dev-server auto sign-in) | 2.8 to 4.1 s (7.3 s first run) | 2.2 to 3.1 s |

Why it is probably worse on live than local numbers suggest: the Supabase project is in Singapore (the database pooler address in the project settings is ap-southeast-1). Vercel runs functions in Washington DC (iad1) unless the project sets another region, and there is no region setting in the repo. Every database call from Vercel therefore crosses the Pacific, about 0.2 to 0.25 s each, and the page does about 6 of them in a row. That alone is about 1.5 s of server time before the browser's own trip. I could not confirm the Vercel region: the Vercel command line on this machine is not signed in, so I could not read project settings. Nothing in deployment settings was changed.

## Findings against the checklist
- (a) Deployed: yes. GitHub shows production deployments for 9e66c63 (success, 17 Nov 20:21 UTC) and later for bdb2180 (success, 20:24 UTC). 7d0fce9 is an ancestor of both. Vercel's own state could not be read (CLI not signed in).
- (b) Refresh-on-tab-return: it does not run on page load; it only reacts to the tab becoming visible or the window gaining focus, at most once per 5 s, and it skips while a delete or save is running. [Confirmed: src/hooks/useRefreshOnTabReturn.ts] It does refetch the deck list (and now the details) each time the owner returns to the tab, so a full list load happens on every tab return. That is not doubling the first load, but each return costs the same as a first load, with the old route about 1.4 to 2.3 s.
- (c) Server work: no per-deck queries (no N+1). Three real problems: (1) the deck-card read hit the 1,000-row cap, so counts were wrong (6 of 21 decks showed too few cards) and the unresolved-card lookup was skipped for most of them, which hid its cost; (2) three slow lookups ran in sequence inside the page-blocking request; (3) one intermittent stall, see below. The conflict-count routine takes about 0.25 s and runs in parallel; left alone. [Confirmed: src/app/api/decks/route.ts]
- (d) Region: see above. Recommendation only.
- (e) Client side: the page renders 21 plain tiles with no extra requests per tile; nothing heavy. [Confirmed: src/app/page.tsx, src/components/DeckTile.tsx]

## Intermittent stall (not fixed)
In about 170 local requests, 3 database-backed requests sat for 22 to 50 s with no error (twice in the details request, once in the deck list request; the server log shows the time spent in the app's own code). I could not reproduce it in 100+ later runs, and a direct script against the database never stalled. It looks like a single database call hanging. Because the old route waited for about 12 calls, it was more exposed. Now the page-blocking request makes about 7 calls, and a hang in the details request only delays pips. I did not add a timeout and retry because the cause is not proven and it would change every route that uses the shared database client.

## Changed files
- src/app/api/decks/route.ts — first response no longer waits for mana costs or the available/claimed/unowned lookup; reads all deck cards past the 1,000-row cap
- src/app/api/decks/details/route.ts — new: colour pips and per-deck available/claimed/unowned counts, loaded after the tiles
- src/lib/deck-list-data.ts — new: paged deck-card read (two pages in parallel), mana-cost batches (errors are now logged instead of swallowed), pip and unresolved-count calculations
- src/app/page.tsx — loads details after the tiles and merges them in
- src/app/api/decks/route.test.ts — tests: no mana lookup in the first response; reads past 1,000 rows (2,300 rows read in 3 pages); details counts, failed lookup, missing lookup, mana batch size
- src/app/page.test.tsx — test: tiles show while details never answer; delete test counts only the list request
- docs/oracle/reports/2026-11-17-developer-deck-list-still-slow.md — this report

## New decisions made (need owner confirmation)
- While details load, a tile with unassigned cards shows the amber "needs attention" border; it turns red a moment later if cards are unowned. Pips show in equal shares until they arrive.
- Card counts on six tiles change to the correct (higher) numbers: All gas, no brakes 78 to 98; Tidus 29 to 98; Ureni the Heartbreaker 11 to 100; TEST A and Test C 1 to 61; Isshin 1 to 2.

## Assumptions
- Local dev server against the hosted database is a fair stand-in for the live server's database work; the live Vercel region is assumed to be the default (Washington DC) and was not confirmed.
- Timings used the owner's real account read-only through the local auto-login; no deck was written or deleted. The temporary timing scripts were deleted.

## Challenges to locked decisions
- none

## Open questions
- Please check in Vercel (Project Settings, Functions, Function Region) which region the functions use. If it is not Singapore (sin1), moving it next to the database should cut about 0.2 s from each database call, so the details (6 calls in a row) would fall by well over a second. I did not change it.
- Each request checks the sign-in twice in a row (middleware, then the route), two Singapore round trips. Using a local check of the session token for the second one would save about 0.25 s per request on live, but it touches sign-in for every route, so it needs your go-ahead as its own task.
- Do you want the stall handled with a timeout and one retry on read calls, as its own task?
- The live site was not timed directly (no signed-in session available to me). Please open Decks on live once and tell me how long the tiles take; the breakdown above predicts about 1.5 to 2.5 s for the tiles.

## Verification
- Temporary scripts (deleted): per-call timings, 3 runs, plus a 25-run stall hunt; browser page timings, main versus this branch.
- npx vitest run src/app/api/decks/route.test.ts src/app/page.test.tsx src/components/DeckTile.test.tsx — 32 passed (after the final edit the route test file was re-run: 7 passed)
- npm run check — 2 failed (known ImportIntentFlow flag test and TIDY-01 get_deck "estimate" wording), 3,501 passed, 46 skipped
- npm run typecheck — only the known TIDY-02 errors in AddToPicklist.test.tsx
- npx eslint on changed files — 0 errors (warnings pre-exist)
