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
