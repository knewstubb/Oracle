# Brief: Categories drive Deck health (HC-01 to HC-08)
Author: Gene (Architect/Designer pass), drafted 2026-11-20 from the owner's two messages (saved verbatim in `.agents/tasks/categories-health/owner-direction.md`; message 2 replaces the default categories and the default-target rule). Status: **Draft, awaiting owner approval (Gate 1).** Nothing is built, applied or changed. Evidence: `docs/oracle/reports/2026-11-20-architect-categories-health-audit.md`. Style follows `briefs/card-tags-and-deck-slot-why.md`.

## 1. What this is, in plain words
Deck health stops guessing from card text and an EDHREC average. Instead, every deck has its own categories, each with a target range, and health simply counts the cards in each one. Every deck starts with six: Lands 35 to 38, Ramp 10 to 12, Card Advantage 10 to 12, Targeted Removal 10 to 12, Board Wipes / Mass Disruption 3 to 6, and Game Plan & Win Conditions about 25 to 30. These ranges are the starting point and show a verdict straight away. Claude can add categories that fit the deck's plan (for example Payoffs and Protection for a blink deck) and can propose a different range. Only you confirm a range.

Example: in Yedora the Explorer, Ramp shows "18 cards, target 10 to 12, heavy" and Card Advantage shows "6 cards, target 10 to 12, light". You tap Ramp, set 14 to 18, and it now reads "ok". Claude suggests "Protection 3 to 5" for another deck; it shows as a count with the note "Claude proposes 3 to 5, not confirmed" until you confirm it.

## 2. New words (defined once; to be added to the vocabulary file after approval)
- **Category**: your grouping of cards inside one deck. Exists today. A card can now sit in several; the first one is where it appears in the list.
- **Generic category**: one of the six every deck starts with. Each has a fixed hidden identity, so renaming "Ramp" to "Mana" never breaks health.
- **Strategy category**: a category Claude or you add for this deck's plan. Not a child of Game Plan. A card usually sits in Game Plan and in its strategy category.
- **Target**: a minimum and an optional maximum for one category in one deck.
- **Default target**: the six ranges above, built into the app. Not stored per deck.
- **Proposed / Confirmed**: a range Claude suggested but you have not confirmed, or a range you set or confirmed.
- **Uncategorised**: a main-list card in no health category. Health always shows how many.
Category, Tag and Why stay three separate words. A Tag (read-only, same for every deck) is not a Category and never writes into one.

## 3. Problem
- Health today reads card text with fixed rules and compares with the commander's EDHREC average. It cannot see how you or Claude actually filed the deck.
- Claude cannot say "this deck needs 4 more removal pieces" from your own categories, and it cannot add a category such as Sacrifice Outlets that health understands.
- Nothing shows when a category has too many cards (today only "short" exists).
- Claude can assign several categories to a card, but the card window only shows one, the app cuts long names at 16 characters, and parts of the app keep only three. A long name such as "Game Plan & Win Conditions" would be damaged today.

## 4. Goals
1. Deck health counts your categories, with a verdict (light, ok, heavy) for every category that has a range.
2. The six Command Zone ranges work on day one for all existing decks, with no card lost from a count.
3. Claude can list categories and ranges, put cards in categories, add or rename a category, and propose a range. You confirm. Every Claude change shows its reason in History with 7-day Undo.
4. Lands show "mana sources" beside the land count, counting double-faced cards that can be played as lands.
5. Each category shows the chance of holding at least one card by a chosen turn, as a labelled estimate.

## 5. Scope
- **Six generic categories per deck** with the default ranges above. You can override any range per deck. EDHREC's average stays only as a small reference line if cheap.
- **Ranges.** Minimum, optional maximum. Below minimum is light, above maximum is heavy, inside is ok, no range means count only.
- **Proposed and confirmed.** Your own range is confirmed at once. Claude's is "proposed": shown, never counted as a verdict, until you confirm. Claude cannot confirm and cannot overwrite a range you confirmed.
- **Strategy categories** appear in the left rail beside the generic ones. They have no default range.
- **Day-one setup** copies today's text-reading result into each deck's categories once (Lands, Ramp, Card Advantage, Targeted Removal, Board Wipes). Game Plan & Win Conditions gets every other card that has card text. Cards with no card text stay uncategorised and are counted.
- **Totals.** The deck total is always the number of different cards (for example 99). Category counts may add up to more because a card can sit in two. The screen says so.
- **Lands.** Own range like any category. Land count includes double-faced cards that can be played as lands (RQ-13). "Mana sources" = lands plus ramp pieces.
- **Odds read-out** per category, from one shared piece of maths that RQ-13 will reuse.
- **Claude's tools.** One read tool for categories, ranges and health; one for adding or renaming a category; one for proposing a range; the existing one for putting cards in categories. Tool wording fixed so Claude no longer treats card roles as categories.

## 6. Out of scope
- The per-card Why and Keep (later, once categories drive health).
- The in-app AI chat (paused, DV-03).
- Your target bracket and bracket warnings (RQ-14). Nothing here blocks or filters anything by bracket.
- Card Tags (RQ-12). Tags stay read-only and separate.
- Merging categories across decks, deleting categories, colours or icons for categories.
- Removing the unused card-role and job tables (a later, separately approved task).

## 7. What the owner will see
- Left rail Deck health: six rows (Lands, Ramp, Card Advantage, Targeted Removal, Board Wipes, Game Plan) plus any strategy categories, each "have, range, state" with an icon and a word (Light, Ok, Heavy), then a line "Not in any category: 0".
- A new "Heavy" state. One short is now "Light" (today two short is needed).
- A note "99 cards. Some sit in two categories, so the rows add up to more."
- Tap a row: the cards in it, the range and who set it, the chance of holding at least one by turn 5 ("estimate, ignores mulligans"), and Set my own range, Confirm Claude's range, Use default.
- On Lands: "37 lands, 2 double-faced that can be a land, 55 mana sources".
- A card shows every category it sits in, not only one.
- In Claude: Claude reads the same numbers and its changes appear in History with the reason.

Real examples, computed read-only from the live decks and today's rules (proposals, not promises):
- **Yedora the Explorer** (101 main cards): Lands 37 ok; Ramp 18 heavy; Card Advantage 6 light; Targeted Removal 6 light; Board Wipes 0 light; Game Plan 34 heavy. Today this deck reads "Well covered" against its EDHREC average.
- **A rot to process** (99): Lands 38 ok; Ramp 9 light; Card Advantage 7 light; Targeted Removal 7 light; Board Wipes 3 ok; Game Plan 37 heavy. Two cards sit in two categories, so the rows add to 101 for 99 cards.

## 8. Success checks
1. Rename Ramp to Mana in a deck: health still counts the same cards under the new name.
2. Every existing deck opens with six rows, each count equal to what today's rules find, and "Not in any category" equals the cards with no card text.
3. A card in two categories counts in both rows, and the deck total stays 99.
4. A range Claude proposes shows "Proposed", gives no verdict, and has no confirm path for Claude. A range you confirmed cannot be changed by Claude.
5. Every Claude change (add category, rename, propose range, assign cards) shows a one-line reason in History and can be undone for 7 days.
6. Long names ("Board Wipes / Mass Disruption") display in full and survive editing in the card window.
7. Odds example: 2 cards in a 99-card library, 12 cards seen, shows about 23% (22.9%).
8. A deck with a double-faced land-capable card shows it in the land line and in mana sources, and the deck total does not change.
9. Nothing is blocked or filtered because of bracket.
10. The old text-reading verdict and EDHREC-based range path are gone in the same task that replaces them.

## 9. Open questions (recommendation first, behaviour only)
1. **Game Plan on day one.** Game Plan gets every card nothing else claims, so on 14 of your 19 full decks it starts "Heavy" (more than 30) because the other rows are light. Recommend: show the verdict as you asked, with one line "Includes every card not placed elsewhere". You would see: Yedora Game Plan 34, Heavy. Alternative: show the count only until Claude or you first sort the deck. Trade-off: honest and immediate, versus red rows that mostly mean "not sorted yet".
2. **Proposed range when a default exists.** Recommend: the default keeps giving the verdict, and Claude's proposal shows beside it ("Claude proposes 8 to 10, not confirmed"). Alternative: show no verdict until you confirm. Trade-off: you never lose the template verdict, versus a mixed message.
3. **Double-faced land cards.** Recommend: count each as one land in the land line and mana sources, shown separately ("36 lands + 2 double-faced"). Alternative: count them as half. Trade-off: simple and matches RQ-13, versus slightly generous.
4. **Cards seen by turn N.** Recommend: assume a normal pod where everyone draws on turn 1, so 7 + N cards (your example, 12 by turn 5). Offer "two players, on the play" as one switch (7 + N − 1). Trade-off: right for pods, one extra switch.
5. **Claude renaming a category.** Recommend: allowed, because renaming rewrites every card in that category in one step with one Undo. Alternative: you rename, Claude only adds. Trade-off: renaming is the costliest tool to build and test; put it in the last slice.
6. **Do all six always show?** Recommend: yes, always, even at 0 (for example "Board Wipes 0, light"), so nothing is hidden. Alternative: hide empty ones. Trade-off: honest versus a longer rail.
7. **Smallest first step.** Recommend: first show the six default ranges and verdicts using today's text-reading result, before any stored data, so you can judge the numbers on your real decks. Alternative: go straight to stored categories. Trade-off: one throwaway step, versus approving stored data before you have seen the numbers.

## 10. Dependencies and risks
- **Locked decision D-060** (Claude sets targets, owner does not manage) conflicts with this direction; the 2026-11-19 conflict list proposed superseding it with "Claude does not set health numbers", which this brief reverses in part. New wording is in the audit (section k). Nothing changes in the decisions file until you approve.
- Stored-data changes (all need your approval and a throwaway rehearsal first): a category list table, a ranges table, a backup of today's categories before the one-time setup, and two new kinds of Claude change.
- Gate 3 design is needed: rail rows with the Heavy state, the category detail, the confirm control, the card window showing several categories.
- DV-01 (left rail) and DV-04 (reason on Claude changes) are built; this builds on both. RQ-13 and RQ-14: this defines the shared maths RQ-13 will reuse.
- **Risk: day-one shock.** Today's verdict is "Well covered" for Yedora; the new one is three light rows and two heavy. Mitigated by the bridge step and open question 1.
- **Risk: damaged names and lost categories** by existing caps (16 characters, three per card) in the card window and list. Fixed before any card gets a second category.
- **Risk: Claude invents "Card Draw" while the deck says "Card Advantage".** Mitigated by showing Claude the exact names and a near-match note.
- **Risk: a re-import resets categories.** The audit's recommendation covers it.

## 11. Next gates
Owner approves this brief (Gate 1). Audit is in the report (Gate 2). Designer (Gate 3) mockup of the rail rows, category detail and card window. Sliced build (Gate 4) in the order in the audit, section l. Close-out (Gate 5): D-060 amendment and vocabulary.

For Brad (plain words): health will count your own categories against the six Command Zone ranges, show Heavy as well as Light, let Claude propose ranges that only you confirm, and add odds and mana sources. Your Yedora deck would move from "Well covered" to "light on card advantage, removal and wipes; heavy on ramp and game plan".
