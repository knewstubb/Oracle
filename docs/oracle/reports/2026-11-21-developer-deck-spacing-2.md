# Report: deck-spacing-2
Role: Developer
Status: PARTIAL
Task as received: Correct the remaining spacing differences on the deck page after the last spacing pass (Figma node 365:3032): first column left 328, columns 592 with a 16 gap, right column edge at window - 24, same relationships at 1024/1280/1440/1920, scrollbars unchanged, no changes to rail contents, mana colours or brand purple.

## Summary for the owner
The search toolbar and the cards had an extra 16 pixels of space on each side inside the content area. That is removed on wide windows, so the cards now line up with the tabs and sit 24 from the rail and 24 from the right edge. I could not open a browser, so the new positions are calculated, not measured on the real page.

## Before and after (window 1552, expected)
| Item | Before (measured by orchestrator) | After (expected) |
|---|---|---|
| First column left edge | 344 | 328 |
| Rail card to first column | 40 | 24 |
| Column width | 576 | 592 |
| Right column right edge | about 1511 | 1528 |
| Toolbar left edge | 344 | 328 |

Note: the 24 on the right is 12 page padding + 8 track + 4 gap, so the right column edge is at 1552 - 24 = 1528. Columns: 328 to 920 and 936 to 1528.

## Expected at other widths (column area = window - 352; columns = whole 390px sections that fit, max 2, each max 592)
| Window | Column area | Columns | Each | First column left | Right edge of last column |
|---|---|---|---|---|---|
| 1024 | 672 | 1 | 592 | 328 | 920 |
| 1280 | 928 | 2 | 456 | 328 | 1256 |
| 1440 | 1088 | 2 | 536 | 328 | 1416 |
| 1552 | 1200 | 2 | 592 | 328 | 1528 |
| 1920 | 1568 | 2 | 592 | 328 | 1528 (368 spare on the right, as built today) |
Chosen: columns share the width and 592 is the maximum, as already built. Where the area is wider than 1200 the columns stay left-aligned and the spare space is on the right.

## Changed files
- src/components/CardsTab.tsx - toolbar and card area lose their 16px side padding at 800px and wider (kept below 800px)

## New decisions made (need owner confirmation)
- none

## Assumptions
- The 16px came from the toolbar and card area padding in CardsTab; nothing else uses it at 800px and wider.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- No browser available to me: nothing measured in a browser. Numbers above are calculated from the classes. Orchestrator should measure after the merge.
- npx tsc --noEmit: 4 errors (baseline AddToPicklist)
- vitest src/components src/app: 1634 passed, 0 failed
- eslint CardsTab.tsx: 0 errors, 13 warnings (img warnings, existing)
