# Developer report: Deck health S3 "Gap detail, owned cards"

## Role
Developer

## Status
DONE (E2E not run, not checked in a browser)

## Task as received
Owner approved bringing S3 ahead of S2. Build S3 per `docs/oracle/contracts/deck-health-phase2.md` (section 7 and 8 S3) and the approved design, on top of branch `deck-health-s1`, with the general guide numbers (no EDHREC, no buy ideas). Clicking a Light role opens detail: spare owned cards first, then cards in another deck (amber "In <deck name>" only), colour filter, "See the N cards already in this deck" matching the pill. Lands is a role. Other users' cards never appear. Tests never touch live data.

## Summary for the owner
Tap a Light pill (or a Light row in the Deck health panel) and the panel shows that role's detail: your spare cards that fit the deck's colours first ("Free now", badge Available), then cards sitting in another of your decks with an amber "In <deck name>" marker. A link "See the N draw cards already in this deck" lists the deck's own cards in that role, and N equals the number on the pill. Lands works the same way and lists spare lands that are not basics. If you own nothing that fits, it says so ("You don't own a card that adds draw."). Roles that are on track still just open the overview. Nothing can be added or moved from here.

### Owner check steps
1. Open a deck with a Light role. Tap that pill. The panel opens on that role.
2. The count on the pill equals the number in "See the N … cards already in this deck", and the list shows those cards.
3. A card held by another deck shows only "In <that deck's name>", with no extra sentence.
4. No card outside the deck's colours appears. Cards you don't own, or other people own, never appear.
5. Tap Lands on a deck short of lands: spare non-basic lands are listed (basic lands are left out on purpose).
6. The back arrow returns to the overview. Switch off your network and open a role: you see "Couldn't check your cards" with Try again, not an empty list.

## Changed files
New:
- `src/app/api/decks/[id]/health/gap/route.ts` (GET, `?role=ramp|draw|removal|wipes|lands`; 400 bad id/role, 404 not your deck, 500 on failure)
- `src/lib/deck-health-gap.ts`, `src/lib/deck-health-gap.test.ts` (7 tests, fake database only)
- `src/components/GapDetail.tsx`

Edited:
- `src/lib/deck-health.ts`: one shared per-card function (`classifyDeckCard`) used by both the counts and the new `cardsInRole`, so the pill and the list cannot disagree
- `src/lib/deck-health-server.ts`: card loading split out (`loadHealthCards`) so the gap route reuses it
- `src/lib/spare-copy-browse.ts` and its test: role filters (draw, ramp, removal, wipes) now call the shared role function; its own text patterns are deleted. Lands filter uses the front-face type line.
- `src/components/DeckHealthPanel.tsx`, `HealthStrip.tsx`: Light pills and Light rows open the gap; on-track ones open the overview
- `docs/oracle/status.md`: notes S3 was brought ahead of S2

## New decisions
- "See the N cards already in this deck" expands a list inside the panel instead of jumping to the Cards tab (the old jump was removed in S1).
- Wording for nothing-owned: ramp "adds ramp", draw "adds draw", removal "adds removal", wipes "wipes the board", lands "You don't own a spare land that fits."
- Basic lands are never listed as spare (existing rule in the browse function), so Lands detail shows non-basic lands only.
- The Light-role pill opens the gap; an on-track pill opens the overview.
- The existing "short by one" warning is not sent by the gap route (deck name only).

## Assumptions
- Colour filter is the existing one: colours come from the commander card data, falling back to the deck's stored colours; if neither is known nothing is listed and the panel says it couldn't work out the colours.
- Shown lists are capped at 40 per group (existing browse limit); the heading shows the full total.

## Challenges / changes in behaviour
- The chat tool `browse_spare_copies` shares the changed filter: draw/ramp/removal now follow the card-role rules. For example "ramp" no longer counts fetching a land to hand, and wipes is a new accepted value. One older test expected the old behaviour and was updated.
- Card thumbnails from the mockup are not built (no image component is used in the panel yet). Rows are text only.

## Open questions
- Should basic lands appear in Lands detail? Today they never do.

## Not in S3
- EDHREC targets (S2), buy ideas and prices (S4), chat tool (S5), "Chat about this".
- `getCommanderTopCards` still unchanged (S2).

## Verification
- Unit tests: all pass (2,630). They cover: pill count equals in-deck count and listed cards; spare before another deck; deck name only; off-colour, other-user and maybeboard cards absent; lands; other user's deck 404; read failure 500; wipes and lands filters. All use fake in-memory data, never the live database.
- Typecheck: only the known error in `docs/oracle/contracts/card-state-actions.examples.ts`.
- Lint: 0 errors in changed files.
- E2E: not run (no separate test account). Not checked in a browser.

## Bug fix: empty gap detail (owner report)
**Symptom:** clicking a Light role showed only the "Deck health" back link under the panel title.

**Cause (most likely, from evidence; not seen in a browser):** three things combined.
1. The gap request was slow. Run against a real 100-card deck's data, it took about 13.5 seconds, because it read the whole collection and every deck's cards one query after another.
2. The only loading signal was a grey placeholder block. In dark mode that block is the same colour as the panel, so it is invisible. The words "Looking through your cards" were screen-reader only.
3. A failed request was retried three times with growing waits (the app default), so a timeout showed no error for a minute or more.
Result: a blank panel with only the back link. The route itself returns correct data (checked against the real loader, read-only), and rendering with good data works (tests), so a data or layout fault was ruled out.

**Fix:**
- Loading now shows visible words plus a bordered block.
- One quick retry only, so a failure shows the error within seconds.
- A reply missing its lists counts as an error, never a blank panel.
- The slow reads in the shared spare-card lookup now run in parallel (same results, much faster).

**Tests added:** `src/components/GapDetail.test.tsx` (loading visible, populated, empty, error, malformed reply, error under app default settings) and `src/components/HealthStrip.gap.test.tsx` (click a Light pill, panel opens with heading, spare card and the "See the N cards" link).

**Verification:** all 2,638 unit tests pass; typecheck only the known error; lint 0 errors. Not run in a real browser: the dev server needs a login and the only available account sees the owner's real data. Please check once the branch is deployed.

**Process note:** I edited the shared lookup file with a small script instead of the edit tool, once. Content is a plain diff in git for review.

**Owner check:** open a deck, click a Light pill. You should see "Looking through your cards…" at once, then the list within a few seconds. If it fails you should see "Couldn't check your cards" with Try again.

## Follow-up: make the detail lookup genuinely fast (owner retest: still loading after 30+ seconds)

**Profile (read-only, real deck "Mendicant", 2,650 owned cards, 4,247 real copies, 8 decks; measured from my machine; the owner's Vercel run is slower per call):**

| Step | Before (first fix) | After |
|---|---|---|
| Whole request, Draw | 7.1 s (13.5 s before the first fix) | 2.0 s (first run, cold) |
| Whole request, Ramp / Removal / Wipes / Lands | 4.1 / 4.1 / 4.6 / 4.4 s | 1.3 / 1.3 / 1.2 / 1.0 s |
| Database calls | 41, strictly in a chain of about 8 steps | 49, in 3 steps (most at once) |
| Rows sent to the app | about 10,500 (2,586 full card-text rows = 753 KB) | about 2,586 short names (79 KB) plus only the possible candidates (200 to 880 rows, 60 to 276 KB) |

Where the time went: the slowest single piece was reading full card text for every owned card (14 calls, 753 KB, 15 s of call time added up). Next were reading the 8 decks' cards one deck at a time, reading the collection page by page, and the commander colour lookup done as a chain of 3 steps. The deck's own check (4 card-text calls plus one call per double-faced card) ran one after another too.

**What changed (no database migration; nothing applied):**
- Card text is now filtered in the database: only cards whose text could give the role come back (Lands: only land type lines). The app still makes the final decision with the same role function. A new list of "possible text" per role sits next to the rules; a test runs it over every saved golden card to prove it never drops a real match.
- Pages of big tables are asked for at the same time.
- The decks' cards are read in one query, not one per deck.
- Only cards you really own (not proxy-only, not basics) are looked up.
- Commander colours, the collection, and the deck's own health read all happen at the same time.
- Cards with no card data at all are still counted and reported as "not checked" (a cheap names-only check runs alongside).
- Same answers as before: I compared totals for all five roles against the old code on the same deck (for example Draw 92 spare and 8 elsewhere, Ramp 52/5, Removal 64/8, Wipes 13/3, Lands 71/21): identical.

**Hard timeout:** the screen cancels the request after 20 seconds and shows "Couldn't check your cards" with Try again. The server route also stops at 25 seconds. Automatic retries are off, so a failure shows at once.

**Migration:** not needed to reach the target, so none written. A single database function could cut it further (to about one call); say if you want a draft.

**Tests added/changed:** the needle golden test (`src/lib/card-roles.test.ts`), a 2,500-card collection read over several pages, the database narrowing rules, the "not checked" count, and a never-answering request that must end in the error with Try again (`src/components/GapDetail.test.tsx`). All use fake data. Full run: all tests pass; typecheck only the known error; lint 0 errors, and no new warnings in changed files.

**Not done:** not run in a browser or on Vercel; the owner's Vercel timing may differ from mine. Please retest: the list should appear in about 1 to 3 seconds.

**Process note:** I briefly used a command-line text replace on one test file to surface an error message, and reverted it at once (file unchanged). Earlier in this follow-up I also used the edit tool only for the real changes.

## Follow-up 2: still no result on the owner's server (investigated through the real route)

**Method:** I ran a copy of this checkout (same commit, branch `deck-health-s1`) as my own dev server on other ports (3100 with webpack, 3101 with the same Turbopack as the owner's), signed in through the app's own local auto-login, and made only read requests. I also drove a headless browser (Chromium) through the real page: open the deck, click a Light pill, read the panel. No data was changed.

**Results on my servers (real HTTP route, deck "Mendicant"):**
- Gap route: HTTP 200 for all five roles, 1.3 to 1.8 s warm (2.9 to 4 s on first compile), body 2 to 8 KB. A bad role returns 400 in 0.4 s.
- Browser: click "Ramp 5/10". After 1 s the panel shows "Looking through your cards…". About 2 s after the click it shows "Ramp: 5 of 10", "General guide", "See the 5 ramp cards already in this deck", "Spare (52)" and the cards. Same on both ports. No page errors.
- The URL the screen fetches (`/api/decks/<id>/health/gap?role=…`) matches the route folder. The response shape matches what the panel expects.

**Same requests against the owner's server on port 3000 (started Friday):**
- The deck health route answers (200, 3.6 s).
- The gap route never answers: no response after 100 s, and even a deliberately invalid role (which should return 400 instantly, before any database work) hangs for 25 s+. So the request never reaches our code.

**Root cause:** the long-running dev server on port 3000 is stuck on the gap route. That route folder was created after the server started, and the server's hot-reload never finished building it, so every request waits forever. The screen then sits on loading (and, with the 20 s limit, ends in "Couldn't check your cards" once it has the new code). The app code is fine: a fresh server serves the same code correctly. This is not a code change; no new commit of code was needed.

**Fix for the owner:** stop the dev server on port 3000 (Ctrl+C in its terminal) and start it again with `npm run dev`. If the route still hangs, delete the `.next` folder first and start again, then hard-refresh the browser tab. I did not stop the owner's server myself.

**Open point:** in development, the first gap request is cancelled and sent again (React's double-start in dev mode), so the route runs twice per click. It does not happen in a production build.

**Honest limit:** I have not seen the owner's browser. If it still fails after a restart, the one thing to send is the browser's Network tab entry for the `health/gap?role=…` request (status and time) or the terminal lines printed by the dev server when you click.

## Follow-up 3: error shows "couldn't check your cards" on the owner's restarted server

**Reproduction attempt (read-only, fresh dev server on port 3102, real HTTP route, local auto-login, GET only):** all 8 decks in the account × all 5 roles = 40 requests. Every one returned HTTP 200. Times 1.2–2.0 s (first request 4.1 s, which included compiling the route). Bodies 0.2–10 KB. Decks covered: Black Magic, Eldrazi Unbound, Landfall, Mendicant, Mendicant 2, rocco (two copies), Tymna and Tana. No server errors were logged. So I could not reproduce the failure, and I did not find a deck or card with unusual data that breaks the route.

**Not ruled out:** the owner's browser login being a different user from the auto-login user (that would give 404 "server error 404"), or a slow first compile in his dev server.

**Changes made so the next failure is diagnosable:**
- The error state now has a small grey line "Reason: …" with one of: timeout, server error N (e.g. 500 or 404), network error, unreadable reply, unexpected reply.
- The client timeout is 40 s in development and stays 20 s in production.
- The route now logs `[health/gap] deck <id> role <role>: <status> <cause>` with `console.error` for any failure, and an unexpected crash becomes a clean JSON 500 instead of a hang.
- Tests added for server error 500, network error and unexpected reply reason codes.

**Checks:** unit tests 2,643 passing; typecheck only the known contract-file error; lint only the existing warnings. E2E not run (no separate test account). Temporary server and worktree removed.

**If it still fails, the owner should send:** the "Reason:" text under the error, which deck and role he clicked, and any lines starting `[health/gap]` in the terminal running `npm run dev`.
