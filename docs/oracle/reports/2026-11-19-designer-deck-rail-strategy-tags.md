# Report: designer-deck-rail-strategy-tags
Role: Designer
Status: DONE
Task as received: PLANNING ROUND, DOCS ONLY. Gate 3 proposals for the deck left rail (304px, Yedora example), the Strategy block and window in states empty, set, bracket-exceeded, loading, failed and offline, card details with read-only Tags, Category, Why and Keep, the phone layout and accessibility (focus trap, Escape, visible focus, 44px targets, warning not by colour alone, contrast at least 4.5:1). Deliverable: a spec, a self-contained HTML mockup, and this report. Nothing blocks, filters or refuses suggestions because of bracket.

## Summary for the owner
I drew the deck page's left panel, the Strategy window and the card window with read-only Tags, Why and Keep, in all the states you listed, plus the phone version. You can open the mockup in a browser and switch between every state. Everything is a proposal and waits for your approval; the questions at the bottom of this report need your answers.

## Changed files
- docs/oracle/specs/deck-rail-strategy-tags.md — new spec, marked Proposal, awaiting owner approval
- docs/oracle/mockups/deck-rail-strategy-tags.html — new self-contained mockup (no build step)
- docs/oracle/reports/2026-11-19-designer-deck-rail-strategy-tags.md — this report

## New decisions made (need owner confirmation)
- The warning is the same full sentence in the panel and the window; your wireframe used a shorter line in the panel.
- Window adds a small "Based on: 4 Game Changers." line under the warning.
- Clicking outside the window does not close it; Escape and Cancel ask "Discard your changes?" only when something was typed.
- A "Clear target" link returns the bracket to Not set.
- Failed save keeps all typed text and the Save button becomes "Try again". Offline keeps typing possible and turns Save off with a stated reason.
- Tag chips: at most five, broad Tags first, then mechanic Tags; chips are plain text, not buttons.
- Why is limited to 120 characters and saves when you leave the field. Keep is switched only by you.
- The "..." menu sits at the right end of the tab row on desktop and phone. The panel itself has no actions except the Strategy block.
- Save button text is dark on green, because white on that green is only 3.39:1.

## Assumptions
- The calculated bracket (RQ-14) is a number from 1 to 5 with a short list of what it found; the mockup fixes it at 4 with 4 Game Changers. Until RQ-14 exists the warning is absent.
- Deck health, mana curve and colour figures are sample data; real data comes from existing health code and later RQ-13.
- A deck with no commander shows a "Choose a commander" slot (not in the wireframe).
- The brief says 22 decks and the owner direction says 21. The audit confirms 22 live; the spec says "all decks today" in places and keeps 21 only where quoting your wording.
- Strategy text has no length limit in this design; an upper limit is a developer decision to confirm.

## Challenges to locked decisions
- none. (Conflict list covers D-060 and the CC-26 answers; nothing new here.)

## Open questions
1. Recommendation first: show the full warning sentence in the panel. Alternative: the shorter wireframe line. You would see a slightly longer amber box in the panel.
2. Recommendation: keep the "Based on: 4 Game Changers." line. Alternative: sentence only. The line tells you what to look at without saying anything is restricted.
3. Recommendation: ask "Discard your changes?" when you close with unsaved text. Alternative: close at once. Trade-off: one extra click versus lost typing.
4. Recommendation: Why limited to 120 characters. Alternative: 200. Trade-off: tidier list rows versus room.
5. Recommendation: broad Tags shown first when a card has more than five. Alternative: alphabetical.
6. Recommendation: keep "Clear target". Alternative: no way to un-set a target.
7. Recommendation: dark label on the green Save button. Alternative: a darker green with a white label.

## Verification
- Opened the mockup from disk in Chrome (headless script): no console errors; every state button renders; Tab key stays inside the open window after 30 presses; Escape closes it and returns focus to the Strategy block.
- Looked at screenshots of the exceeded, failed-to-load, card (seven Tags) and phone layouts; fixed a hidden-element display bug and the commander art width.
- Contrast ratios calculated with the WCAG formula; listed in the spec section 6 and in the mockup.
- No build, no code outside docs, no hosted write; decisions.md and Picklist files untouched.
