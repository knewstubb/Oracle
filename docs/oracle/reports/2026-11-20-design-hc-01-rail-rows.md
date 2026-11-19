# Report: hc-01-rail-rows
Role: Designer
Status: DONE

Task as received: "Part 1, design (Gate 3 proposal) ... update docs/oracle/specs/deck-rail-strategy-tags.md and the mockup docs/oracle/mockups/deck-rail-strategy-tags.html for the new rail Deck health rows with real numbers for Yedora the Explorer and A rot to process (audit section g) ... the six rows, Light / Ok / Heavy states (icon plus word, never colour alone, contrast at least 4.5:1), the Game Plan total row, the uncategorised note, the double-faced land line, the details panel opened by a row, and phone layout. Keep the rail's width and look. ... flag every visual choice ... Flag, do not guess: any place the audit and the code disagree. ... no migration, no hosted write; do not edit decisions.md or status.md."

## Summary for the owner
The Deck health part of the deck page's left rail now shows six rows: Lands, Ramp, Card Advantage, Targeted Removal, Board Wipes / Mass Disruption, and Game Plan & Win Conditions. The first five say Light, Ok or Heavy with an arrow or tick; Game Plan is a plain total. For Yedora the Explorer you would see Card Advantage 6 Light, Targeted Removal 6 Light, Board Wipes 0 Light, Ramp 18 Heavy, Lands 37 Ok and Game Plan 34. Tapping a row opens the details panel. Open the mockup file and use the switches at the top. Nothing is built. Please look at the visual choices below and the four questions at the end.

## Changed files
- docs/oracle/specs/deck-rail-strategy-tags.md: new section 1a (rows, states, notes, panel, phone, words), rail table row 6 replaced, accessibility line and four open questions added
- docs/oracle/mockups/deck-rail-strategy-tags.html: Deck health section rebuilt from audit numbers for two decks, details panel (overview and one row), switches for cards without text, double-faced lands, loading and failed, and a future "Claude proposal" state; contrast table extended; narrow-width switch moved from 720 to 800 px (see disagreements)
- docs/oracle/reports/2026-11-20-design-hc-01-rail-rows.md: this report

## Visual choices (flag for the owner)
1. **Row shape.** Name with a grey second line on the left, count in bold in the middle, icon plus word on the right (72 px). Rows grow to 63 to 80 px because the range and names wrap inside the 304 px rail. Chosen over putting the range in its own column, which would cut "Board Wipes / Mass Disruption".
2. **Words.** Light, Ok, Heavy replace Met and Short. "Short" is kept for Reconcile only. Row names change from Draw, Removal, Wipes to Card Advantage, Targeted Removal, Board Wipes / Mass Disruption.
3. **Icons.** Light is a down arrow, Heavy an up arrow, Ok a tick. In greyscale the arrows and the words still differ.
4. **Colour.** Light and Heavy are both amber (7.98:1 on the rail, 7.37:1 on hover), Ok is green (8.28:1). Heavy is not a second colour or red, because a heavy deck is a choice, not a fault.
5. **"2 below" or "6 above" in the second line.** Added so the gap is readable without opening the panel.
6. **Header line "1 of 5 in range".** Replaces today's "Well covered" headline. Counts only the five ranged rows.
7. **Game Plan row.** Same row shape, right column says "Total" in grey with no icon, a dashed line above it, second line "No range. Everything not counted above." The 25 to 30 template note appears only in the panel, in grey.
8. **Notes under the rows.** Mana sources, "Ranges are the Command Zone template", the could-not-place note, and the "2 cards count in two rows" line, in 12 px grey with an info icon. The last two show only when they apply.
9. **Double-faced lands.** The Lands count stays the plain land count ("37") and a third line reads "+ 2 double-faced". Mana sources adds them. The verdict uses plain lands only.
10. **Details panel.** Reuses the existing drawer (420 px) and 86% bottom sheet. Overview shows six cards with a meter (range band, white count marker); one row shows the range, the source, the cards counted, the "cards that fill it" list for Light rows, and the EDHREC figure as "For reference only".
11. **EDHREC** appears only in the panel, never in the rail rows.
12. **Future state, mockup only.** A Claude-proposed range shows "Proposed" with a dashed circle, no verdict, a Confirm and a Decline button in the panel. It is behind a switch labelled Future.
13. **Phone.** The expanded rail shows the same rows full width. The collapsed 64 px bar does not show health (as today).

## Where the audit, the code and the owner's words disagree (flagged, not guessed)
- **No-text cards and Game Plan.** Audit section f puts cards with no card text in "Not in any category" and keeps them out of Game Plan; the brief's success check 2 says the same. Your direction for this task counts them in Game Plan and asks for a note. I followed your direction: they are in the Game Plan total and a note says how many. Numbers for Yedora and A rot to process are the same either way (0 such cards). The build must use one rule.
- **Proposed range with a default.** Audit section g says the default keeps its verdict beside a proposal. D-061 (binding) says no verdict until you confirm. I followed D-061 in the future-state mock.
- **Narrow-width switch.** The spec and the built rail use 800 px; the mockup used 720 px. I set the mockup to 800 px. The details panel switches to a bottom sheet at 700 px in the built code, so between 700 and 800 px the rail is stacked while the panel is still a drawer. Not changed; mention for the build.
- **"Cards in the list" for Yedora.** Audit counts 101 main cards. The existing mockup shows 102 / 100 (including the commander). Consistent, left as is.
- **Today's code.** The rail shows "have / typical", Met or Short, and the verdict rule "2 or more short" ([Confirmed: src/components/deck-rail/RailHealth.tsx, src/lib/deck-health.ts roleState]). There is no Heavy state in code, and only Light rows open a gap detail. In the new design every row opens the panel (the built rail already opens the panel from Ok rows, with no gap list).
- **No code reads double-faced land cards** ([Confirmed per audit h]); the "+ 2 double-faced" line cannot be shown from real data until HC-06. Neither sample deck has any, so the mockup uses a labelled example.

## New decisions made (need owner confirmation)
- Light, Ok, Heavy replace Met and Short in the rail; row names as in choice 2.
- Header line "n of 5 in range".
- Verdict for Lands ignores double-faced lands.

## Assumptions
- Light and Heavy in the rail use the same amber; only the arrow and word differ.
- "Below" and "above" are measured from the minimum and the maximum.
- Sample card names in the panel are placeholders; the Claude reason in the future state is a made-up sample.
- Elfball (4 cards with no text, 3 double-faced) was used for the two example switches only; the numbers shown for the other rows stay Yedora's.

## Challenges to locked decisions
- none

## Open questions
1. Header line "1 of 5 in range": keep (recommended) or drop?
2. Light and Heavy both amber, told apart by arrow and word: keep (recommended) or give Heavy a second colour?
3. Should double-faced lands count toward the Lands verdict (recommended: no, plain lands only)?
4. No-text cards counted in Game Plan with a note (recommended), as in your direction. The audit's rule differs; confirm.

## Verification
- Opened the mockup over a local web server in a browser: six rows for Yedora render with Ok / Heavy / Light as in audit section g; rail width 304 px; phone width shows the panel as a bottom sheet (86% high); overview and Ramp views render.
- Contrast ratios computed from the app's tokens (node script): amber 7.98 / 7.37, green 8.28 / 7.65, secondary text 6.36 / 5.88, control border 5.07, marker 11.34. All text at 4.5:1 or more.
- Not run: keyboard-by-keyboard pass of the new panel, screen reader check. No code, migration or hosted write changed; decisions.md and status.md untouched.
