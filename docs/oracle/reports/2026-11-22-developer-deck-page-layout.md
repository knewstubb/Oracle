# Report: deck-page-layout
Role: Developer
Status: DONE
Task as received: Layout and style fixes on the deck page (requests 1 to 6): remove health info lines, 1px gaps in colour bars, corner radii, equal 32px page margins, scrollbar inside the rail and hidden unless hovered, rail at least 280px wide.

## Summary for the owner
The three grey info lines are gone everywhere (the health detail window no longer shows them either). Radii, 32px page margins, an in-rail scrollbar that appears only on hover, a 280px minimum rail width are in code. The page was measured in a real browser at 1024, 1280, 1440 and 1920 using a copy of the page layout with placeholder content (no database), so the pixel values below are measured. Mana colours are not changed (see questions). Please decide the questions at the end.

## Changes (element, before, after)
| Element | Before | After |
|---|---|---|
| Info lines under health tiles | Not in the rail in this build, but still shown in the health detail window | Removed entirely (component deleted) |
| Colour bars (curve, Pips, Sources) | Already 1px gap in the style rules | Unchanged, 1px gap confirmed in the rules; not measured on screen |
| Rail card radius | rounded-xl = 16.8px (token scales) | 12px fixed |
| Health tiles, curve panel, opening-hand boxes | rounded-lg = 12px | 8px fixed |
| Left page margin (from 800px of page width up) | rail 16px inside a 320 column, about 24 measured | 32px |
| Top margin | rail 8px padding, about 10 measured | 32px |
| Right margin | 24px content padding plus centring, about 51 measured | 32px (content padding removed) |
| Rail to first card column | 320 column, about 76 measured with scrollbar | 32px |
| Gap between cards | 20px | unchanged |
| Rail scrollbar | scrolled the whole column, bar sat in the gap | scrolls inside the rail card, thin, invisible until the pointer is over the rail |
| Rail width | 320 column, 288 card | 288 card, never under 280, does not shrink |


## Measured at four widths (browser, placeholder content, no database)
Method: the page and rail layout classes copied exactly into a test page and compiled with the app's own stylesheet, then measured in Chromium. Not the live page, so real content heights are not covered. The top navigation is a bar across the top, so the page area is the full window width (chat panel closed).
| Window | Rail shown | Rail width | Rail left | Rail top below nav | Rail to first card column | Cards area to right edge | Gap between cards |
|---|---|---|---|---|---|---|---|
| 1024 | yes | 288 | 32 | 32 | 32 | 32 | 20 |
| 1280 | yes | 288 | 32 | 32 | 32 | 32 | 20 |
| 1440 | yes | 288 | 32 | 32 | 32 | 32 | 20 |
| 1920 | yes | 288 | 32 | 32 | 32 | 32 | 20 |
Also measured: rail card radius 12px; no sideways page scrolling at any width; the rail card scrolls inside itself and its scrollbar is inside the card.
Narrower and wider windows:
- 800 to 900: rail shown at 288, margins 32, cards area 416 wide at 800.
- Under 800 (799, 768, 390): rail is the collapsed "Show deck summary" bar, page keeps 24px side padding, one scrolling column. Nothing is hidden and nothing is changed.
- 2560: the card content is capped at 1920 wide and centred, so the right margin grows to 160. Pre-existing; see questions.
- Scrollbar hiding relies on the browser's thin-scrollbar colour setting. Its hover reveal could not be seen in the headless browser, and Safari older than 18.2 ignores that setting (it shows the normal scrollbar).
## Changed files
- src/app/decks/[id]/page.tsx — 32px margins and gap; content side padding removed from 800px up
- src/components/deck-rail/DeckRail.tsx — width, radius, in-card hover scrollbar
- src/components/deck-rail/RailHealth.tsx, RailCurve.tsx, RailProduction.tsx — 8px radii
- src/components/DeckHealthPanel.tsx, src/components/deck-health-parts.tsx — info notes removed
- src/components/deck-rail/DeckRail.test.tsx, railBreakpoint.test.ts — updated tests

## New decisions made (need owner confirmation)
- The info lines were also removed from the health detail window, as "not moved elsewhere" asks.
- Page margins (32px) are on the deck page only.

## Assumptions
- Margins use the 800px switch point already in the page.
- No bottom margin on the cards column; the rail has 32px below it.

## Challenges to locked decisions
- none

## Open questions
1. Rail under about 900px (and under 800px): keep the collapsed bar, or design something else?
2. Apply the same 32px margins to other pages?
3. Black: Figma #6C6C6C, app #8E7F9E (shared across the app). Change it?
4. Mana colours: an earlier version of this change replaced the rail's White, Blue, Red, Green, Colourless and Multicolour fills with the Figma values. A review rejected that as out of scope, so it is reverted. The rail bars still use the app's own values (for example green #3DAA6D versus Figma #7BC4A0). Update them to the Figma values?
4b. Windows wider than about 2240px: content is capped at 1920 and centred, so side margins grow beyond 32. Keep, or let it fill?
5. Scrollbar thickness: on systems with always-visible scrollbars the thin bar takes about 8px inside the card.

## Verification
- npm test — 4570 pass, 1 failure in upgrade-engine.property.test.ts (known flaky, baseline)
- npx tsc --noEmit — 4 errors, all baseline AddToPicklist
- npm run lint — 1 error (baseline), no new
- Browser measurement at 1024, 1280, 1440, 1920, 800, 799, 768, 390, 2560 on the layout copy: see table above
- Review fix: mana palette changes reverted (tokens.css, ui-tokens.ts, contrast.test.ts back to main)
