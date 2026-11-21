# Report: rail-figma-pass
Role: Developer
Status: DONE
Task as received: Style and component-usage pass across the deck page left rail so it matches the Figma (file YCoOUFO1BOsUUxAPbh52TZ, page Redesign), comparing .agents/tasks/rail-figma-spec.md with .agents/tasks/rail-app-measured.txt.

## Summary for the owner
The rail now follows the Figma: 288-wide card in a 320 column, 16 padding everywhere, smaller section labels, smaller health tiles with full names (no more "Card Advant…"), fixed tile order, no grey info lines under the tiles, a problem box in the Cards section, and a neutral grey for Black so it no longer looks like the purple Multicolour. I did not check the result visually against Figma in a browser; I compared measurements only. Four questions for you are at the end.

## Changes (element, before, after)
| Element | Before | After |
|---|---|---|
| Rail column padding / card | 24 gutter, 272 card (measured 261) | 16 gutter, 288 card in 320 column |
| Rail card fill, border, radius | translucent surface, white 8% border, 12 | bg/surface token, border/subtle token, 12 |
| Commander art | natural height (about 211) | 288 x 150, cropped |
| Header (name + commanders) | two blocks, 16/8 then 0/16/16 | one block, padding 16, gap 8 |
| Commander name | 14 / 500 | 13 / 500 |
| Colour pips | 20x20 | 16x16, gap 2 |
| Background / Companion line | tag 10, name 12, tag border subtle | tag 11 uppercase outlined, name 13 regular |
| Section padding | 20 (Health, Curve, Production) | 16 |
| Section gap | 8 | 12 (Strategy 8) |
| Section dividers | white 8% | border/subtle token |
| Section labels | 11 / 600 muted | 10 / 500 text/secondary (Strategy and rail sections share one style) |
| Edit links | 44px tall buttons, two copies of the markup | one shared RailEditLink (shadcn Button, link variant), 10 / 500 accent, about 23px tall |
| Cards: count row | centre-aligned | count and "/ 100 cards" baseline-aligned |
| Cards: chips | hand-made span | shared Badge (outline) with Figma padding; green tick uses signal/success, fill and text neutral |
| Cards: problems | plain list | box: padding 8, gap 8, radius 10, border/subtle, bg/canvas; 16 icon, 12 / 500, one line, value not grey |
| Amber colour in rail | warn-amber (#F2B84B) | signal/warning token (#EF9F27) |
| Strategy bracket box | radius 9.6, no padding, dash primary | radius 6, padding 4, dash secondary |
| Strategy summary | always secondary | primary when set, secondary for the prompt |
| Health verdict | 14 / 600 | 12 / 500 |
| Health tiles | padding 12, radius 12, min height 72, label 12 truncated, count 24, range 12 | padding 8, radius 8, gap 2, label 11 no truncation, count 20, range 11 |
| Problem tile | amber border, amber 10% | border amber 45%, signal/warning-bg |
| Neutral tile | white 3% fill | bg/canvas, border/subtle |
| Tile order | problems first | fixed: Ramp, Board Wipes, Card Advantage, Lands, Targeted Removal, Game Plan |
| Info lines under tiles | 3 lines | removed from the rail (still shown in the cards-in-category panel for the notes that applied there) |
| Curve avg CMC | 11 / 400 muted | 11 / 500 primary |
| Curve bars | width 20, radius top 4, normalised to 64px, count primary 11 | width 24, radius 2, 1.65 px per card (max 64), count and label 10 secondary, selected 10 / 600 primary |
| Breakdown panel | padding 12, radius 12, border 12% white, no fill | padding 10, radius 8, border/subtle, bg/canvas; title 11 / 500; legend 11 secondary, dot gap 4; colour bar radius 2 with 1px gaps |
| Black mana colour | #8E7F9E (purple-grey, like Multicolour) | #7A7A83 neutral grey (token and hex mirror); Multicolour stays purple |
| Mana production header value | 11 / 400 muted | 11 / 500 primary |
| Pips and Sources | label w-14, bar radius full, rows gap 8 | label 52 wide, bar radius 2, rows gap 10 |
| Opening hand | title 12 / 600 primary; boxes padding 8, radius 12, border 12% | title 11 / 400 secondary; boxes padding 8x10, radius 8, border/subtle |
| Land drop lines | 12 / 400 primary, value 600, gap 6 | 11 / 400 secondary, value 11 / 500, gap 12 |

## Component audit
- Used already: shadcn Button (retry), Tooltip (Pips and Sources), design tokens, ManaSymbol, DeckSettingsHost.
- Duplicated and now shared: Edit link (was in StrategyBlock and RailHealth) is RailEditLink; section label (Strategy had its own h2) uses SECTION_LABEL_CLASS; status chips use Badge instead of a custom span.
- Left alone: tiles and the bracket box are single implementations. Strategy loading and error boxes still use their own markup (not in the Figma spec).
- Rail card uses tokens directly; CARD_SURFACE_* stays for other screens.

## New decisions made (need owner confirmation)
- Black mana is #7A7A83. It also changes Black wherever the mana fill token is used.
- Amber in the rail now uses signal/warning, not warn-amber.
- Curve bars use a fixed 1.65 px per card, so a small deck shows short bars.
- Edit links are now about 23px tall (Figma look) instead of 44px; this is a smaller click target.

## Assumptions
- Columns in the curve stay evenly spread across the width, with bars 24 wide (Figma gives 24 wide columns without saying whether they fill the row).
- Custom health categories keep problems-first order (Figma only shows the default set).
- Narrow windows: unchanged. Under 800px of page width the rail is the collapsed "Show deck summary" bar; opened, the card fills the width with 16 padding. Not retested visually.

## Challenges to locked decisions
- none

## Owner questions
1. Info lines under the health tiles ("Mana sources...", "Ranges are the Command Zone template...", uncategorised and overlap notes): removed from the rail. Keep them somewhere (Deck settings, a tooltip) or drop them?
2. Tiles are now in the fixed Figma order, so problems no longer jump to the top (the headline and amber tiles still show them). Keep the fixed order, and should custom categories also be fixed (today problems-first)?
3. Edit link size: keep the small Figma look, or keep a 44px click target?
4. Curve bar height: fixed scale (current, per Figma) or stretch to the tallest bar as before?

## Verification
- npm test: 4569 pass, 1 failure in upgrade-engine.property.test.ts (flaky, passes alone and on base)
- npx tsc --noEmit: 4 errors, all baseline AddToPicklist.test.tsx
- npm run lint: 1 error (baseline storage link), no new
- Existing tests updated for the new order, token names, 320/288 widths and removed notes.
