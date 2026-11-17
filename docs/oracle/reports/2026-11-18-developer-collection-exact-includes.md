# Report: collection-exact-includes
Role: Developer
Status: DONE
Task as received: Owner report on the Collection page after the colour filter rewrite (b244ded): "Exact and includes are not working." Reproduce broadly in a real browser (list and grid, every colour, two-colour combinations, colourless alone and mixed, Exact and Includes, toggling with and without a colour selected), find the root cause and fix it with a regression test, or show it works as designed with evidence and list confusing design points as recommendations.

## Summary for the owner
I could not make Exact or Includes fail. In both list and grid view the toggle changes mode, the highlighted button matches, a new search runs, and the count and rows change. Green in grid view shows 477 (Exact) and 777 (Includes). In list view it shows 809 (Exact) and 1,209 (Includes). The most likely cause of what you saw is the toggle doing nothing when no colour is selected (see below), or an older copy of the page from before the last fix. No app code was changed. I added a test that protects the behaviour.

## What the owner would see
- With no colour selected, clicking Exact or Includes changes the highlighted button but the cards and count stay the same, because there is nothing for the mode to apply to. This is the most likely reason it "looks broken".
- With one or more colours selected, the cards and the count change straight away (a second or two on first use, instant for a combination already seen).
- Includes with green shows every card that contains green (mono-green plus green-blue and so on), so it is always at least as many as Exact.
- Colourless alone gives the same cards in Exact and Includes (list 415, grid 249), so toggling then also looks like nothing happened.
- Grid view counts cards and list view counts copies, so the numbers differ between views by design (477 vs 809).

## Evidence (real browser, local app on the real database, read only)
- Toggle test, both views: Exact to Includes to Exact with green selected. Each switch sent one request with the new mode, the highlighted button matched the mode in use, and the count followed (grid 477, 777, 477; list 809, 1,209, 809). Returning to a mode already seen was served from cache and showed the right number.
- Rapid toggling (five clicks) with Blue and Red selected: the last click always won (list 26 for Includes, 20 for Exact; grid 20 and 14). Superseded requests were cancelled, which shows in the browser as aborted requests; this is expected.
- Tab return: a focus event and a tab-visible event, fired straight after a toggle, did not change the answer or the mode shown.
- Console errors: none. Network: all answers were 200; the only failures were the deliberate cancellations above.
- Every single colour, 8 two or more colour sets, colourless alone and mixed, each in both modes and both views (requests made directly): Exact is never larger than Includes. Colourless alone is identical in both modes. Examples (list Exact / Includes): W 491 / 814, U 648 / 908, B 727 / 1,065, R 573 / 867, G 809 / 1,209, W+U 42 / 60, all five colours 6 / 6. Grid: G 477 / 777, C 249 / 249.
- The numbers in the earlier report (grid green Exact 477, list green Exact 809 and Includes 1,209) are confirmed.

## Changed files
- src/app/collection/page.test.tsx — new regression test, run for both views: select green, switch to Includes and back, and check that each switch sends the new mode, the highlighted button matches, the count follows, and a tab-return refresh keeps the answer on screen. I confirmed it fails if the mode is left out of the cached request key (the likeliest way for the toggle to break).
- docs/oracle/reports/2026-11-18-developer-collection-exact-includes.md — this report

## New decisions made (need owner confirmation)
- none

## Assumptions
- The owner's report was made against a page already running the fix, but could have come from an older running copy of the page or from the no-colour case.

## Challenges to locked decisions
- none

## Open questions / recommendations (not changed)
- Make the toggle look inactive (dimmed, or a small hint "applies when colours are selected") while no colour is selected. Recommended, since this is the most likely source of the complaint.
- Includes with a colour is not obvious to many people. Clearer labels could be "Only these colours" and "At least these colours", or a hint line with an example. Recommended.
- Selecting colourless together with colours adds colourless cards to the result in both modes, which may surprise. Making colourless exclusive was already offered in the previous report.
- With no colour selected, switching mode sends a pointless repeat request in list view. Harmless; could be skipped.
- Please tell me what exactly you saw (which view, which colours, which mode, what you expected). If it was something else, I will look again.

## Verification
- Browser run on a local dev server (port 3417, real database, read only, no writes): results above.
- npx vitest run src/app/collection/page.test.tsx — 33 passed (the new test included); with the mode removed from the cached request key, the two new cases fail.
- npm run check — 2 failures, none from this change: the known ImportIntentFlow failure and a connector description test (get_deck wording, in the connector area I was told not to touch; it fails without my change since only a test file differs).
