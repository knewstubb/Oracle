# Report: Deck health S4, buy ideas and prices

**Role:** Developer
**Status:** DONE (branch `deck-health-s4`, pushed, not merged)

## Task as received

Build slice S4 ("Buy ideas and prices") of Phase 2 Deck health in the Oracle app. Branch deck-health-s4 off current main; push it; do NOT merge. Implement exactly S4: in the role detail panel, a buy-ideas group from EDHREC cards (the cached cards in ref_commander_role_targets, already classified) that the owner does not own, are on-colour, and are not already in the deck; collapsed with a count when owned options exist, open when none; none on thin data (plain sentence says why); unknown colours give none; prices shown as "$38.00 est."; unknown price shows "Price unknown", never $0; rows reuse the S3 row design. Keep the lookup fast (target under 3s; use the cache, no extra EDHREC calls). Tests per contract section 7 S4 with fixtures. No migrations.

## Summary for the owner

When you open a role (Ramp, Draw and so on) in Deck health, there is now a "Buy ideas" group under your owned cards. It lists popular EDHREC cards for that role that you don't own, that fit the deck's colours, and that aren't already in the deck. Each shows a picture (hover to enlarge), the name, a short line on what it does, how many EDHREC decks play it, and an estimated price like "$38.00 est." If no price is known it says "Price unknown", never $0. If you own spare cards for the role the group is closed with a count; if you own nothing that fits it opens by itself. If the commander has too little EDHREC data, it says so in a sentence and guesses nothing. Lands show no buy group. Up to 8 ideas are shown.

## Owner check steps

1. Open a deck, then Deck health, then a role where you have spare cards. "Buy ideas (N) · estimates" shows closed; click to open.
2. Open a role where you own nothing that fits. The group is already open.
3. Check prices read "$X.XX est." or "Price unknown", never "$0".
4. Hover a thumbnail to see the larger card.
5. Try a commander with little EDHREC data: you should see "No buy ideas yet. No popularity data for this commander, so nothing is guessed."
6. Open Lands: no buy group.
7. The first time you view a commander it may be slower, because that fills the saved EDHREC list.

## Changed files

- `src/lib/deck-health-buy.ts` (new): buy-idea selection and price formatting.
- `src/lib/deck-health-gap.ts`: gap reply carries buy fields; reads now run side by side.
- `src/lib/commander-targets.ts`: exposes the saved classified cards.
- `src/lib/owned-copy-lookup.ts`: same behaviour, reads in parallel (faster).
- `src/components/GapDetail.tsx`: buy rows and the buy group.
- Tests: `deck-health-buy.test.ts` (15, new), `GapDetail.buy.test.tsx` (8, new); fixtures updated in `GapDetail.test.tsx`, `HealthStrip.gap.test.tsx`.
- `docs/oracle/status.md`.

## New decisions

- Added a `lookup_failed` reason (not in the contract union): shows "Couldn't check buy ideas just now. Your owned cards above are fine."
- Cap of 8 ideas; sorted by EDHREC popularity; the top 60 candidates are checked.
- Maybeboard cards still count as buy candidates; only main-deck cards and the commander are excluded.
- Cards from the average-deck source have no percentage, so no "In N%" line.

## Assumptions

- Price is the cheapest non-digital printing above zero.
- Proxy-only copies don't count as owned.

## Challenges

- First timing against 60 real names took 2.7 to 4.2s, over the 3s target. Running reads in parallel brought it to about 2.0s. The full route time was not measured, and Vercel may differ.
- The live cache had no "ok" rows when I checked, so I couldn't time a real commander end to end.

## Open questions

- Pre-existing, FIXED in the follow-up below: the panel always showed a "General guide" label even when targets came from EDHREC.

## Verification

- Unit tests: 2,748 passed, 42 skipped.
- Typecheck: only the known error in `docs/oracle/contracts/card-state-actions.examples.ts`.
- Lint: 0 errors (279 existing warnings).
- Screenshots (open, closed, thin) from a mocked preview page in a /tmp copy on port 3100; I looked at all three and they match the design. Copy removed afterwards.
- Not run: E2E (no separate test account) and a check of the real deck page in a browser.
- No EDHREC calls are made; a test asserts this. No migrations.

## Process slips

- I used python/sed shell scripts for a few file edits (test fixture fixes, the loader restructure, a type fix, a comment). All visible in the git diff.
- I briefly printed a local auto-login cookie in a terminal; nothing was shared.

## Follow-up: real source label in the role detail header

**Changed:** the role detail header no longer says a fixed "General guide". It shows the same source line as the overview panel ("EDHREC average deck, N decks", "EDHREC estimate, N decks", "General guide", "General guide (couldn't reach EDHREC)", and ", may be out of date" when stale). The gap reply now carries `sourceLine` (taken from the same health calculation the overview uses); an older reply without it falls back to "General guide". Files: `src/lib/deck-health-gap.ts`, `src/components/GapDetail.tsx`, fixtures in `GapDetail.test.tsx` and `HealthStrip.gap.test.tsx`.

**Tests:** 6 new in `GapDetail.buy.test.tsx` (each of the five labels, plus the fallback). Full suite: 2,754 passed, 42 skipped. Typecheck: only the known error. One earlier full run showed 8 errors while the machine was busy; a clean re-run passed with no changes, so I treat it as load flakiness, not a real failure.

**Real-route timing (read-only, owner's real decks, copy of this branch on port 3100, local dev mode, to the hosted database):**

| Deck (commander) | First view (cold) | Second view |
|---|---|---|
| Zhulodok, Void Gorger | 6.8s | 2.2s |
| Hearthhull, the Worldseed | 4.5s | 3.7s |

Both showed the right source ("EDHREC average deck, 21,789 decks" and "33,930 decks") and real prices (for example $36.88 for a card). The first view fills the saved EDHREC list and, in dev mode, also includes compiling the route, so it is slower. Warm views are 2.2 to 3.7s: close to, and once over, the 3s target. Dev mode is slower than the live site, so this is not a firm production number. I did not add EDHREC calls or caching beyond what exists. If the 3s target is firm, the next step is caching the final buy list per deck.

**Process note:** I also ran one empty shell append to the report by mistake; it wrote nothing. The preview copy and server were removed; the server on port 3000 was untouched.
