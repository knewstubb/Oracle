# Report: rail-width-fix
Role: Developer
Status: DONE
Task as received: fix the deck page left rail rendering ("A rot to process" shows a thin collapsed bar instead of the sticky 304px rail on a desktop browser).

## Summary for the owner
The rail code was not broken. The app you were viewing (the one already running on port 3000) was serving an out-of-date stylesheet that lacked the rail's layout rules, so every width showed the phone layout, even 1280. Restarting that app fixes what you saw. I also moved the switch to the phone layout up to 800 px wide so tablets (768) get the compact bar, and stopped the tab row from running under the build picker. Decision for you: the switch point moved from 720 to 800 px (see below).

## Findings
- Port 3000 (started before the rail existed): rail never showed at any width (390 to 1280). Its stylesheet had no rail rules (only an unrelated 720 px max-width). [Confirmed: browser, port 3000 vs worktree build on port 3100]
- Same code on a fresh app: full rail at every width from the switch point up. The app sidebar, the page shell and the Oracle chat panel do not shrink the content area (chat is paused in this setup, so the panel is closed; if chat is switched on, its 420 px panel would narrow the page and can trigger the compact bar at 1024).
- Browser zoom shifts the switch: 1024-wide screen at 125% (819 px) shows the rail; at 150% (683 px) shows the compact bar. 1920 at 150% (1280 px) shows the rail.
- Switch point: the layout measures the page width (container query), not the screen. It was 720 px; now 800 px. Reason: the done check wants the compact bar at 768 and the rail at 1024 and 819 (1024 at 125%). The rail (304) plus a card list needs about 500 px; 800 leaves 496.

## Widths checked (decks "A rot to process" and "Yedora the Explorer")
| Width | Result |
|---|---|
| 390 | compact bar, opens when tapped |
| 768 | compact bar, opens when tapped |
| 819 (1024 at 125%) | full rail, sticky, own scroll |
| 683 (1024 at 150%) | compact bar, opens when tapped |
| 1024, 1280, 1440, 1920, 1280 (1920 at 150%) | full rail 304 px, card list to its right |

Screenshots: docs/oracle/reports/evidence/slice-3-rail-widths/ (`<deck>-<width>.png`, and `-opened.png` for the compact bar after a tap).

## Other layout checks against the mockup
- Fixed: at 1024 and 819 on A rot to process, the "Strategy" tab sat underneath the build picker. The tab row now scrolls sideways when tight. [Confirmed: screenshots]
- Design choice, not changed: card list is a single column of category boxes at 1024; the "..." menu stays at the far right of the tab row.
- Design choice, not changed: the page background art is hidden below the 640 px screen width only, not by the rail.
- Not changed: at exactly 800 px the rail shows; the spec said "720 and below" compact, so "below 800" is now the rule.

## Changed files
- src/app/decks/[id]/page.tsx, src/components/deck-rail/DeckRail.tsx, src/components/DeckViewSkeleton.tsx — switch 720 to 800; tab row scrolls
- src/components/deck-rail/railBreakpoint.test.ts — new, pins the single switch point and the rail rules
- docs/oracle/specs/deck-rail-strategy-tags.md — section 5 switch point 800
- evidence screenshots

## New decisions made (need owner confirmation)
- Compact bar below 800 px page width (was 720).

## Assumptions
- The owner's browser was loading the stale app on port 3000. If it still shows the bar after a restart, send the browser zoom level and whether Oracle chat is open.

## Challenges to locked decisions
- none

## Open questions
- none

## 2-minute test
1. Stop the app on port 3000 and start it again.
2. Open "A rot to process" in a desktop window: rail on the left, cards to the right, scroll the rail and the list separately.
3. Narrow the window below about 800 px: the compact bar appears; tap it to open and close.

## Verification
- Browser, 9 widths x 2 decks, tap test on compact bar — as table above
- vitest full — 331 files passed, 4103 tests passed, 0 failed
- tsc — 4 errors (pre-existing AddToPicklist); eslint — 1 error (pre-existing PicklistV2)
