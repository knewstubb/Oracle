# Brief: Deck rail, new Figma design (addendum to DV-01 and HC)
Author: Developer, drafted 2026-11-21 from the owner's Figma rail (file Oracle, rail 338:1472, variants 341:2978, states sheet 350:1562). Status: **Draft, awaiting owner approval (Gate 1).** Nothing is built, applied or changed. This adds to `briefs/deck-page-left-rail-and-strategy.md` and `briefs/categories-drive-deck-health.md` (both still Draft) and replaces only the parts named in section 2.

## 1. Scenarios
1. **Open a healthy deck.** A Rot to Process, 100 of 100 cards, all sleeved, legal. Cards shows the green "Playable" and "Legal" chips and "100 / 100 sleeved".
2. **Deck over 100.** Yedora has 102 cards. Cards shows "Not legal" with the line "2 cards over". Sleeved count never goes above 100.
3. **Deck under 100.** Arti-facts has 84 cards. Cards shows "Assembling", "Not legal" and the line "16 cards short".
4. **No bracket set.** Arti-facts has no bracket. The Strategy block shows the dashed "Not set" state.
5. **Off-colour card at exactly 100.** A blue card in a mono-green deck of 100. Cards shows "Assembling" and "Not legal", with the line "1 card outside colour identity".
6. **Change a health range.** Open Deck settings, Deck health tab, change Ramp from 10 to 12 into 12 to 14. The rail tile updates after a short pause. No Save button.
7. **Switch to Custom categories and back.** Pick Custom categories, add "Protection 3 to 5", switch back to Default values. The rail shows the six default tiles. Switch to Custom again and Protection 3 to 5 is still there.
8. **Claude's proposal.** Claude suggests Protection 3 to 5. The rail only shows "No target" or the proposal as a note, with no confirm control. Confirm or decline happens in Deck settings.
9. **Click a curve bar.** Click the bar for mana value 3. The Mana value 3 panel opens with the count and one horizontal bar split by colour.
10. **Hover a mana production segment.** Hover the green part of the Sources bar. A small label shows the exact value, for example "Green 31 sources".

## 2. What the existing briefs cover, and what this replaces
- **DV-01 section 4, items 5 to 8** (card count with "n over", the original / proxy / other decks / unowned / value lines, Deck health, curve, colour needs against sources): replaced by the Cards, Deck health and Mana blocks below. The old "n over" amber wording is replaced by plain fault lines such as "3 cards over".
- **Categories brief, "Not in any category" line:** dropped from the rail (Figma has no such line). Open question 9.
- **Categories brief, "Heavy" wording:** the rail tiles show only the count against the range, with a green or amber state as drawn in Figma. Whether the word "Heavy" appears is not drawn. Open question 9.
- **Game Plan** is a plain total with no range and no verdict (D-061). The categories brief's "25 to 30" is out of date.
- Unchanged: Strategy block and window purpose (DV-02), the bracket-exceeded warning rules, the rule that nothing is blocked because of bracket.

## 3. New, needs approval
### (a) Cards
- **Not legal** for any card total other than 100, and for any card outside the commander's colour identity. Example: 99 cards is Not legal, 101 is Not legal.
- **Off-colour deck with exactly 100 cards** shows Assembling (designer assumption, please confirm).
- **Playable** needs every card sleeved AND legal.
- **Problem lines show the fault only.** Examples: "3 cards over", "100 cards not sleeved".
- **Sleeved count** is the number of sleeved cards, shown capped at 100 as "N / 100" (your answer).
- **Not in the design:** the old legend bar, "Basics short", "To buy", "Outside the 100" lines and the Salt chip. Open question 9.
### (b) Deck settings window
- Two tabs: Strategy and Deck health.
- Deck health tab: choose Default values or Custom categories.
- Custom categories and their targets stay stored when you switch back to Default values.
- Claude's proposals are confirmed or declined only here, never in the rail.
- Autosave, no Save button (same as the Strategy window, D-062).
- Out of scope: Claude WRITING proposals through the connector (HC-05).
- Categories brief's per-deck override of a default range is kept: you can change any default range for one deck.
- Category counts are worked out from each card's categories, matched by name ignoring capitals. They are not stored.
### (c) Mana production
- **Pips** come from the mana costs of nonland cards (assumption, not answered).
- **Sources** come from the deck's lands (what each land can produce), as answered.
- **Opening hand and land-drop odds** count lands AND ramp (as answered). This is new maths; DV-01 deferred mana base maths (RQ-13).
- Hover shows exact values. No static percentages, no legend (as answered).
- Amber at 20 percent and 60 percent, taken from Figma.
### (d) Curve click
Clicking a curve bar opens the Mana value N panel with the count, one horizontal bar, and a legend of White, Blue, Black, Red, Green, Colourless and purple Multicolour (as answered).

## 4. Owner answers already given
- (a) Clicking a curve bar opens the Mana value N panel (count, one horizontal bar, legend White/Blue/Black/Red/Green/Colourless and purple Multicolour).
- (b) Pips and Sources bars show exact values on hover, no static percentages or legend.
- (c) With more than 100 cards the sleeved count is simply the number of sleeved cards, shown capped at 100 as N / 100, no extra counting rules.
- (d) Deck health counts are preset from the default ranges the repo already records (Command Zone template: Lands 35-38, Ramp 10-12, Card Advantage 10-12, Targeted Removal 10-12, Board Wipes 3-6, Game Plan a plain total). The owner called these the "Rachel Weeks" numbers (see question 1).
- (e) Sources bar comes from the deck's lands (what each land can produce). Opening hand figures must consider lands AND ramp. Pips from the mana costs of nonland cards was not answered; it is stated above as an assumption.

## 5. Open questions for Brad (recommendation first)
1. **"Rachel Weeks" numbers.** The docs hold her only as one combined "interaction" number that was never confirmed. The locked numbers (D-061) are Lands 35-38, Ramp 10-12, Card Advantage 10-12, Targeted Removal 10-12, Board Wipes 3-6. Recommend: keep these. Do her numbers differ? Example: if she says 12-15 for removal, the Removal tile would read 12-15.
2. **Opening hand: lands or sources?** You said lands AND ramp, but Figma says "0-1 lands" and the 20 percent amber was drawn for lands only. Rough numbers for A Rot to Process (about 38 lands, about 9 ramp, so about 47 sources, 99-card library): chance of 0 or 1 in the opening 7 cards is 17 percent for lands only and 7 percent for sources. By the third turn on the play (9 cards) it is 7.5 percent for lands and 2.3 percent for sources. With 55 sources it is under 3 percent even in the opening 7, so amber at 20 percent would almost never show. Options: (A, recommended) hand figures count sources and are labelled "sources", land-drop lines count lands only; (B) lands only. You would see the label "0-1 sources" instead of "0-1 lands".
3. **Cards seen by turn.** Figma's numbers match being on the play (7 + turn - 1: 9, 10, 12 cards). The categories brief recommended a pod draw (7 + turn). Recommend: follow Figma. You would see turn 3 as 9 cards.
4. **Clicking the same bar twice.** Recommend: the second click closes the panel. Your answer only said a bar opens it. Alternative: it stays open until you click another bar or close it.
5. **Playable now also needs legal.** A deck that is fully sleeved but has an off-colour card stops being Playable. The 2026-11-20 report says no real deck is affected. Recommend: I confirm this with a read-only check before build and tell you if any deck changes. Agree?
6. **Over 100 is Not legal even when fully sleeved** (as designed). Example: Yedora, 102 of 102 sleeved, shows "Not legal" and "2 cards over". Recommend: keep.
7. **Tiles and drill-down.** Figma shows no drill-down. Today a row click opens the cards-in-category window. Recommend: keep it, so you can still see which cards count. Alternative: drop it.
8. **Sources bar colourless end.** Figma shows a pale colourless segment on the Sources bar. Land data may not always say whether a land makes colourless mana. Recommend: show it only where the land says so; otherwise leave it out.
9. **Lines not in the design.** The old legend bar, "Basics short", "To buy", "Outside the 100", the Salt chip, "Not in any category" and the word "Heavy". Recommend: drop the legend bar, Salt chip and "Heavy" word; move "To buy" and "Basics short" to the deck's cards area if you still want them. Which ones should come back?
10. **Rail width.** Today 352 px; Figma 320 px. Recommend: 320 as drawn. You would see a slightly narrower rail.

## 6. Stored-data change (draft only)
Two new tables, drafts at `supabase/drafts/20261121100000_deck_health_settings.*`: one holds each deck's mode (Default values or Custom categories), one holds custom categories and per-deck range overrides, with Claude's proposals kept apart until you confirm. Additive only. Not applied. Needs your approval and a rolled-back rehearsal first.

## 7. Next gates
Owner answers the questions and approves; Designer is already done in Figma; sliced build (FEAT-002 to 005); close-out.

For Brad (plain words): this describes the new rail, the Deck settings window and the mana bars, lists what the old briefs said that no longer applies, and asks ten short questions.
