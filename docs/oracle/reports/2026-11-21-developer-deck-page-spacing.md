# Report: deck-page-spacing
Role: Developer
Status: DONE
Task as received: Fix deck page spacing and scrollbar placement to the owner's Figma dimension drawing (node 365:3032): page padding 24 left/top, 12 right, 0 bottom, gap 12; rail group 292 = card 280 + 4 + 8 scrollbar track outside the card; content columns 71px below the rail top; second scrollbar track outside the columns; visible space 24 on left, top, right and between rail and content; 16 between columns and cards.

## Summary for the owner
The deck page now has 24 pixels of space on the left, top and right, and 24 between the rail and the cards, with 16 between cards. Both scroll bars sit in those gaps, outside the cards, and appear only while the pointer is over their area. The first card row starts 71 pixels below the top of the rail. Please answer the questions at the end.

## Changes (element, before, after)
| Element | Before | After |
|---|---|---|
| Left margin | 32 | 24 |
| Top margin (below top bar) | 32 | 24 |
| Right margin (including content scroll bar) | 32 | 24 (12 page padding + 8 scroll bar + 4 gap) |
| Rail card to first card column | 32 | 24 (4 gap + 8 scroll bar + 12) |
| Rail card width | 288, min 280 | 280 (rail group 292) |
| Rail scroll bar | inside the rail card | outside, 4 right of the card, 8 wide, shown on hover |
| Content scroll bar | page edge, not placed | outside the columns, 4 right of them, 8 wide, shown on hover |
| Rail bottom | 32 below the card | card runs to the bottom of the page area |
| Tabs and toolbar band | height from content | fixed 71 tall, first card 71 below the rail top |
| Gap between cards and columns | 20 | unchanged by this task (CardsTab internal spacing; see questions) |

## Measured (Chromium, stand-in page using the same spacing values and the app scroll bar CSS, no database)
| Window | Card left | Card top | Card width | Rail track | Rail to column | Column gap | Right space | Content track | First card below rail top |
|---|---|---|---|---|---|---|---|---|---|
| 1024 | 24 | 24 | 280 | 8 | 24 | 16 | 24 | 8 | 71 |
| 1280 | 24 | 24 | 280 | 8 | 24 | 16 | 24 | 8 | 71 |
| 1440 | 24 | 24 | 280 | 8 | 24 | 16 | 24 | 8 | 71 |
| 1920 | 24 | 24 | 280 | 8 | 24 | 16 | 24 | 8 | 71 |
No sideways page scrolling at any width. Not measured on the live page (needs the database). The hover reveal is CSS only and was not visually confirmed. Firefox uses its thin scroll bar, which is about 8 wide but not exactly.

## Changed files
- src/app/decks/[id]/page.tsx: padding 24/24/12/0, gap 12, 71px tab band, scroll areas with 4px inner padding and reserved track
- src/components/deck-rail/DeckRail.tsx: 292 group, scroll area outside the card, card fills the height
- src/app/globals.css: .deck-hover-scrollbar (8px track, thumb on hover only)
- src/app/scrollbar-css.test.ts, src/components/deck-rail/railBreakpoint.test.ts: updated to the new values

## New decisions made (need owner confirmation)
- Under 800px wide the old stacked layout is unchanged.
- Workbench tab has no scroll bar but keeps the same right space.

## Assumptions
- The 71px band is a fixed height at 800px and wider. Import summary or legality banners, when shown, push the band down.
- The card area is still centred with its 1920 maximum.

## Challenges to locked decisions
- none

## Open questions
1. Rail behaviour under about 900px: keep the collapsed bar?
2. Apply the same margins to other pages?
3. Should the rail card stay exactly 280 on very wide windows?
4. Card spacing inside the Cards tab is 20 in places; the drawing says 16. Change it?

## Verification
- npm test: 4570 pass, 1 failure upgrade-engine.property.test.ts (known flaky baseline)
- npx tsc --noEmit: 4 errors, all baseline AddToPicklist
- npm run lint: 1 error (baseline), no new
