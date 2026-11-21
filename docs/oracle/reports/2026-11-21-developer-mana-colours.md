# Report: mana-colours
Role: Developer
Status: DONE
Task as received: Update the mana colours to the Figma values everywhere the app draws them, from one shared token set (white #F5F0C1, blue #6BA5C4, red #D4836A, green #7BC4A0, colourless #CBC2BF, multicolour #8F51D5). Do not change Black. Owner request: "ensure all mana icons/components use the correct mana colours. The green in particular looks wrong in the bars."

## Summary for the owner
The deck page rail now uses the Figma colours for white, blue, red, green, colourless and multicolour in the commander pips, curve bar and legend, Pips and Sources bars, and mana production. The green bars were a darker green (#3DAA6D) and are now the lighter Figma green (#7BC4A0). The colour dots in the Analysis tab use the same colours. Black is unchanged, and the card-row mana symbols still use their own artwork colours (see questions).

## Changed files
- src/styles/tokens.css — added --mana-colourless and --mana-multi next to the existing Figma --mana-white/blue/red/green; removed the duplicate --mana-fill-w/u/r/g/c/multi copies
- src/lib/ui-tokens.ts — rail colour lookups now point at the shared --mana-* tokens; hex table for the contrast test updated
- src/components/ManaSymbol.test.tsx — expects the new token name
- src/components/AnalysisTab.tsx — only the W/U/R/G swatch dots use the shared tokens; the red severity colour (#D3202A) for low scores and poor coverage is unchanged
- src/components/DeckStatusCard.tsx, CommanderOverview.tsx, brew-v2/CandidateCard.tsx — old hex values (#F9FAF4/#F8F6D8/#FFF8DC, #0E68AB, #D3202A/#D32029, #00733E, colourless #B5A99B) replaced by var(--mana-*); Black (#150B00) left as is
- src/components/DraftDeckTile.tsx, DraftSessionTile.tsx — hard-coded Figma hex copies replaced by var(--mana-*)

## Measured before and after
The rail fills are plain solid backgrounds (or text colour for pips). No opacity, blend mode or filter applies, so the computed colour equals the token value. [Confirmed: src/components/deck-rail/RailCurve.tsx, RailProduction.tsx, src/components/ManaSymbol.tsx]
Contrast is against the rail card surface (#16161A, the translucent card over the page).

| Place | Before | After | Contrast after |
|---|---|---|---|
| White: rail pips, curve bar and legend, Pips/Sources bars | #F0E6B8 | #F5F0C1 | 15.6:1 |
| Blue: same places | #4C9BE8 | #6BA5C4 | 6.7:1 |
| Red: same places | #E5604D | #D4836A | 6.2:1 |
| Green: same places (the bars) | #3DAA6D | #7BC4A0 | 8.8:1 |
| Colourless: same places | #9AA0A6 | #CBC2BF | 10.3:1 |
| Multicolour: curve bar and legend | #A78BFA | #8F51D5 | 3.7:1 |
| Analysis tab dots White | #F9FAF4 | #F5F0C1 | n/a |
| Analysis tab dots Blue | #0E68AB | #6BA5C4 | n/a |
| Analysis tab dots Red | #D3202A | #D4836A | n/a |
| Analysis tab dots Green | #00733E | #7BC4A0 | n/a |
| Status card pip, identity dots (Strategy tab), brew commander cards: White | #F9FAF4 / #F8F6D8 / #FFF8DC | #F5F0C1 | n/a |
| Same three places: Blue | #0E68AB | #6BA5C4 | n/a |
| Same three places: Red | #D3202A / #D32029 | #D4836A | n/a |
| Same three places: Green | #00733E | #7BC4A0 | n/a |
| Identity dot Colourless (Strategy tab) | #B5A99B | #CBC2BF | n/a |
| Already Figma, now the single source (deck tiles, commander card, collection filter) | #F5F0C1 #6BA5C4 #D4836A #7BC4A0 | unchanged | n/a |

All six pass the existing 3:1 rule. No Figma value was rejected.

## New decisions made (need owner confirmation)
- The rail and the rest of the app now share one set of colour tokens. The rail's separate copy was removed.
- Analysis tab dots were changed to the Figma colours (they previously used the official card colours).

## Assumptions
- "Everywhere the app draws these colours" means colours the app sets itself. Mana symbols inside card rows are drawn by the mana-font icon library and were not recoloured.

## Challenges to locked decisions
- none

## Open questions
1. Black: Figma #6C6C6C. The rail uses #8E7F9E and the rest of the app uses #9E9E9E. Left unchanged. Which should it be, and should the two copies be merged?
2. Card-row mana symbols (cost symbols, import screen, chat) use the icon library's own colours (the printed card look). Recolour them to Figma, or keep the card look?
3. Multicolour purple is the lowest contrast (3.7:1). It passes, but it is dimmer than the others. Keep?
4. Colour-vision: green and blue are close in brightness, and red and green are close in hue. Bars have hover labels and the curve has a legend, but the Pips and Sources bars have no text labels. Add them?
5. The settings colour editor lists W/U/B/R/G only. Add colourless and multicolour?

## Verification
- npm test — 369 files passed, 4571 tests passed (includes contrast tests)
- npx tsc --noEmit — 4 errors, the known AddToPicklist baseline
- npm run lint — 1 error, the known baseline (277 warnings)


## Review follow-up notes
- Shared set: src/styles/tokens.css is the source. src/lib/ui-tokens.ts keeps a hex table only for the contrast test; contrast.test.ts checks it against tokens.css, so drift fails the test.
- Intentional literals left: the settings components page shows the Figma values as default examples; #8F51D5 for multicolour also appears in DeckTile and deck-status-label because it is the Figma "brewing" status colour.
- Open owner question: Black stays on the old values (#8E7F9E in the rail, #9E9E9E in deck tiles, #150B00 in status card, identity dots and brew cards). Figma says #6C6C6C. Which one should all of them use?
- The "measured" values are read from the code (solid fills, no opacity/blend/filter), not from a browser run.
- Verification after follow-up: npm test 4571 pass (one earlier run had 2 known flaky failures, rerun clean), tsc 4 baseline errors, lint 1 baseline error.
