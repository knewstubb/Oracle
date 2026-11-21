# Report: deck rail Figma redesign (close-out)
Role: Developer
Status: PARTIAL
Task as received: FEAT-005 of the deck rail redesign: close-out with full checks, Figma versus app comparison on real decks, this report, and an owner test burst of 10 minutes or less. No new behaviour.

## Summary for the owner
The left rail now follows the new Figma design: commanders, a Cards box that shows only the problem (for example "2 cards over" or "29 cards not sleeved"), Strategy and bracket, Deck health tiles with an Edit link into Deck settings, a mana curve you can click, and mana production with opening-hand odds. All automated checks pass apart from the known failures that were already there. I could not compare the rail with Figma on real decks in a browser, because this environment has no login, so please run the short test below.

## Changed files
- src/components/deck-rail/ — rebuilt rail sections: commanders, Cards, health tiles, mana curve, mana production; old mana section removed
- src/components/deck-strategy/ — one Deck settings window with Strategy and Deck health tabs (Default values or Custom categories)
- src/lib/ — rail numbers, legality and Playable rule, health settings, opening-hand odds (with tests)
- src/app/api/decks/[id]/health-settings/route.ts — load and save of health settings
- src/app/decks/[id]/page.test.tsx — heading list updated for the two mana sections (this step)
- docs/oracle/reports/2026-11-21-developer-deck-rail-figma-redesign.md — this report

## New decisions made (need owner confirmation)
- Rail width is 352, the Figma column is 320.
- The Cards box dropped these lines: Basics short, To buy, Outside the 100 (companion now sits under the commanders), Unowned legend bar, Salt chip, role chip, combined identity row, "+ Set bracket" chip.
- Playable now requires the deck to be legal, not only fully sleeved.
- A deck with a card outside its colours at exactly 100 shows Assembling (Brewing if nothing is sleeved) together with Not legal.
- Opening-hand and land-drop odds count lands only, on the play (9, 10 and 12 cards seen), library of 99.
- Curve bars are slightly narrower than Figma (about 37 to 40 px) and cards with no mana cost have no bar.
- Custom category tiles in the rail do not open the cards panel; only the default rows do.
- Health ranges: Lands 35-38, Ramp 10-12, Card Advantage 10-12, Targeted Removal 10-12, Board Wipes 3-6.

## Assumptions
- Pips are counted from the mana costs of nonland cards.
- The Sources bar compares coloured mana only with coloured pips; colourless is left out.
- Library is the deck minus commanders.

## Challenges to locked decisions
- D-059: Playable now also requires the deck to be legal.
- D-061: the Game Plan wording is now a plain total.
- Otherwise none.

## Open questions
- Should the rail be 320 wide like Figma, or stay 352?
- Do you want the dropped Cards lines (To buy, Basics short) somewhere else on the deck page?
- Should custom category tiles open their cards, as the default ones do?
- Should an off-colour deck at exactly 100 say Assembling plus Not legal, or only Not legal?

## Verification
- npm test — 4570 passed, 1 failed on the first run: the deck page heading list still expected one Mana section. Fixed in this step; that file now passes 8 of 8. The ImportIntentFlow failure did not appear in this run.
- npm run typecheck — only the 4 known AddToPicklist errors.
- npm run lint — only the known 1 error (in a storage page) and 275 warnings.
- Figma versus app comparison at 1280 and 800 wide, real decks (Rot to Process, Yedora, Arti-facts, a Background deck), problem states, Deck settings, curve click, hover — NOT run. No login in this environment, so no screenshots exist. Differences are therefore unlisted beyond those under decisions above.
- Migration: the health settings migration was recorded in FEAT-003 as applied by the owner and moved into the migrations folder. The save path has only been tested with a fake database, never against the real tables. docs/oracle/status.md still needs it recorded (not edited here).

## Owner test burst (about 8 minutes)
1. Open A Rot to Process. Expect: Cards shows 100 / 100, Playable and Legal in green, Bracket shown.
2. Open Yedora (over 100). Expect: "2 cards over", Not legal, sleeved count never above 100.
3. Open Arti-facts (under 100, no bracket). Expect: a "cards short" message, Assembling or Brewing, and an empty Bracket box.
4. On Deck health click Edit. Expect: Deck settings opens on the Deck health tab.
5. Choose Custom categories, set a range, then switch back to Default values. Expect: default tiles return.
6. Switch to Custom again. Expect: your custom ranges are still there.
7. Click a mana curve bar, then the same bar again. Expect: a card list opens, then closes.
8. Hover Pips and Sources. Expect: exact values appear. Check the rail at a narrow window too.
