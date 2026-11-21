# Report: deck-page-layout
Role: Developer
Status: PARTIAL
Task as received: Layout and style fixes on the deck page (requests 1 to 6) plus request 7 (mana colours): remove health info lines, 1px gaps in colour bars, corner radii, equal 32px page margins, scrollbar inside the rail and hidden unless hovered, rail at least 280px wide, shared correct mana colours.

## Summary for the owner
The three grey info lines are gone everywhere (the health detail window no longer shows them either). Radii, 32px page margins, an in-rail scrollbar that appears only on hover, a 280px minimum rail width and Figma mana colours are in code. PARTIAL because I could not measure the page in a browser (no database allowed), so pixel values below are from the style rules, not from the screen. Please decide the questions at the end.

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
| Mana fills (rail bars, dots, pips) | own values: W #F0E6B8, U #4C9BE8, R #E5604D, G #3DAA6D, C #9AA0A6, multi #A78BFA | W #F5F0C1, U #6BA5C4, R #D4836A, G #7BC4A0, C #CBC2BF, multi #8F51D5, all aliasing the shared mana tokens; Black stays #8E7F9E |

Green cause: the bars used their own copy (#3DAA6D, a stronger green) instead of the app's green token (#7BC4A0). No opacity, blend mode or filter is applied to the bars. Now one set of tokens feeds the bars, dots and commander pips.

## Width checks (from the rules, not measured)
- Margins apply when the page area is 800px or wider. Rail 288 + three 32px margins = 384, so the cards area is at least 416 wide at 800.
- 1024 and 1280 window widths: rail stays 288 (280 minimum holds). The page area is the window minus the left navigation, which I did not measure.
- Under 800px: unchanged. The rail is the collapsed "Show deck summary" bar, the page keeps its 24px side padding and scrolls as one column. Nothing is hidden.

## Changed files
- src/app/decks/[id]/page.tsx — 32px margins and gap; content side padding removed from 800px up
- src/components/deck-rail/DeckRail.tsx — width, radius, in-card hover scrollbar
- src/components/deck-rail/RailHealth.tsx, RailCurve.tsx, RailProduction.tsx — 8px radii
- src/components/DeckHealthPanel.tsx, src/components/deck-health-parts.tsx — info notes removed
- src/styles/tokens.css, src/lib/ui-tokens.ts — shared mana colours
- src/lib/contrast.test.ts, src/components/deck-rail/DeckRail.test.tsx, railBreakpoint.test.ts — updated tests

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
4. Mana symbols in card rows use their own icon colours; left alone. Align them?
5. Scrollbar thickness: on systems with always-visible scrollbars the thin bar takes about 8px inside the card.

## Verification
- npm test — 4570 pass, 1 failure in upgrade-engine.property.test.ts (known flaky, baseline)
- npx tsc --noEmit — 4 errors, all baseline AddToPicklist
- npm run lint — 1 error (baseline), no new
- Not done: browser measurement at 1024, 1280, 1440, 1920
