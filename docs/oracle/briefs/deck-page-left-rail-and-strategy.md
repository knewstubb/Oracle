# Brief: Deck page left panel and Strategy window (DV-01 + DV-02)
Author: Gene, drafted 2026-11-19 from the owner's design review. Status: **Draft, awaiting owner approval (Gate 1).** Nothing is built, nothing is approved by being written. Evidence: `docs/oracle/reports/2026-11-19-architect-audit.md` (sections 1, 2, 4, 8, 12) and `2026-11-19-architect-conflict-list.md`.
Replaces the three-layer Strategy tab of CC-26 (partly superseded only after the owner approves this brief). DV-03 (pause the in-app chat) is a separate small task, scoped in the audit, section 5.

## 1. What this is, in plain words
The deck page gets a fixed panel on the left that shows the deck at a glance: commander, your plan, card count, Deck health, mana curve. The plan lives in a "Strategy" block in that panel. Click it and one window opens where you set the target bracket, a one-line summary, the Strategy text and the playgroup. Claude, outside the app, reads those same fields when it advises you.

## 2. Problem
- The deck header, the slot-usage bar and the Deck health footer are three separate places for facts that belong together.
- No deck has a bracket, a summary or a strategy saved (0 of 22 decks). The current Strategy tab is a long form that nobody has filled in.
- Claude can read only the bracket today, not your strategy, and cannot write a summary. The app offers brackets 1 to 4, not your five.

## 3. Goals
1. One left panel with the deck's key facts, readable without scrolling the card list.
2. One small Strategy window, quick to open, that holds what Claude needs to know about how the deck plays.
3. A clear warning when the cards in the deck imply a higher bracket than the one you aim for.
4. Claude reads the deck brief in this order: deck, strategy, health, cards.

## 4. Scope
**Left panel (DV-01).** Fixed 304 px wide, scrolls on its own, stacks above the card list and collapses on a phone. Top to bottom:
1. Commander card art.
2. Deck name.
3. Commander, plus the partner, Background or Companion slot, shown only when the commander allows one.
4. Strategy block (below).
5. Card count as "n / 100", with an amber "n over" above 100. Under it: how many are original, proxy, in other decks, unowned, and the estimated value.
6. Deck health: the same groups and the same target sources as today.
7. Mana curve.
8. Colour needs against sources.

The panel replaces the deck header, the slot-usage bar and the Deck health footer. Export, History and Delete move behind a "..." menu, Delete last. Everything in the panel is read-only except the Strategy block.

**Strategy block and window (DV-02).**
- Block: target bracket chip and the one-line summary. The whole block is one button that opens the window.
- Empty state (all 22 decks today): dashed outline, "Target bracket: Not set", prompt "Add a one-line summary of how this deck plays".
- Window fields: Target bracket (1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized, 5 cEDH); one-line summary (up to 120 characters, shown on the deck page); Strategy (free text: how it wins, what the commander does, cards never to cut); Playgroup (optional).
- Footer: "Last changed by you or Claude, date, See in History", Cancel, Save.
- **Bracket-exceeded warning.** The bracket you pick is your target. When the cards imply a higher bracket, an amber warning with an icon and words (never colour alone) shows below the picker and in the panel block: "Cards in this deck imply at least Bracket N. Your target is Bracket M." Nothing shows when the cards imply the same or a lower bracket, because cards can only prove a minimum. This part depends on RQ-14 (see section 9). Until RQ-14 exists, the window and block ship without the warning.
- **Claude reads and writes it** through the existing connector tools for reading a deck and setting up a deck, so Claude sees bracket, summary, Strategy and playgroup, in the order deck, strategy, health, cards.
- **Stays where it is:** the EDHREC build picker, its guide and the category manager stay in the existing Commander guide area. Long term recommendation from the audit: a tab named "Build". Not decided here.

## 5. Out of scope (owner direction 2026-11-19, binding)
- Any build, migration or hosted write in this round.
- Moving the EDHREC build picker, its guide or the category manager.
- The CC-26 per-card purpose layer and its editors, the proposals bar and batch Accept / Undo-all, Ask Claude / Propose buttons, the Group by switch, Claude-set health targets and the broad health roll-up. All dropped.
- Changing Deck health groups or target sources. RC-01 stays separate.
- **Blocking, filtering or refusing suggestions because of bracket. Never.** The warning informs; it restricts nothing, and no line in the window or the panel may suggest otherwise.
- The mana base maths (RQ-13), the bracket check itself (RQ-14) and filling in all decks (RQ-07): later briefs.
- Pausing the in-app chat (DV-03).
- Redesigning the header, sidebar, Deck health or the Workbench/Analysis audit as separate items: they are folded into this panel.
- Deleting or converting any saved data. Old dated notes are kept as they are.

## 6. What the owner will see
- Open any deck: a left panel with the commander art, your plan and the facts, and the card list on the right.
- On all 22 decks today, the Strategy block shows the dashed "Not set" state until you fill it in.
- Click the block: the Strategy window. Save closes it and the chip and one-liner appear in the panel.
- Example: Yedora, target Bracket 3, but the deck holds four Game Changers. The window and the block both show "Cards in this deck imply at least Bracket 4. Your target is Bracket 3." You can still save, and every suggestion is unchanged.
- Old labels "Casual, Focused, Optimised, Competitive" are gone; no bracket was saved, so nothing is lost.
- On a phone the panel sits above the card list and collapses.

## 7. Success checks (owner click-through)
1. The panel shows all eight items in the order above and scrolls without moving the card list.
2. The old header, slot-usage bar and footer health strip are gone; Export, History, Delete are in the "..." menu with Delete last.
3. The empty block looks as described; a keyboard user can open the window, move around inside it and close it with Escape.
4. Brackets 1 to 5 can be saved with your names; a 120-character summary saves, 121 does not.
5. The footer shows who changed it last (you or Claude) and the date.
6. Ask Claude about the deck: it quotes your bracket, summary and Strategy back, and the brief lists deck, strategy, health, cards in that order.
7. With RQ-14 in place: a deck with cards above the target shows the warning in both places; a deck at or below target shows nothing. No suggestion list changes in either case.
8. The build picker, guide and category manager still work where they were.
9. Existing dated notes are still readable.

## 8. Open questions (recommendation first)
1. **What does "History" open?** Recommend: one History per deck with two parts, Claude's changes (with the reason, see DV-04, and Undo) first, then the saved versions. You would see one window with both. Alternative: History stays as it is and "See in History" opens the Claude changes list for this deck (smallest, two different screens). Trade-off: a little more build for one place.
2. **Does Claude replace or add to your Strategy text?** Recommend: Claude adds a dated paragraph below yours; Undo works. Alternative: it may replace the whole text, as it can today. Trade-off: safer for your writing, longer text over time.
3. **Which fields are left out?** Recommend: win condition, budget and frustration do not appear in the window; their saved values stay untouched (all empty). Alternative: add a budget line. Trade-off: simpler now.
4. **Spelling.** Recommend: "Optimized" (US) everywhere; the app says "Optimised" today.
5. **Where do the old Deck Intent form and earlier-notes list go?** Recommend: leave them until the window ships, then remove the form and show the notes list read-only under the Commander guide area. Alternative: keep both. Trade-off: no loss either way.
6. **Where does the build area live long term?** Recommend: later, a "Build" tab. Not decided now.

## 9. Dependencies
- RQ-14 (bracket check from Game Changers, mass land denial, extra turns, two-card combos): needed only for the warning. Tutor density and intent are not countable and are not claimed.
- DV-04 (reason on Claude changes): the "See in History" link and the reason shown there.
- DV-03: independent; may run in parallel.
- RQ-13 supplies later mana base figures for the panel; the panel reserves the space only.
- Stored-data changes (drafts, owner approval and a throwaway rehearsal first, nothing applied): a summary field and a "changed by" marker on the deck's strategy record; bracket 5 allowed (audit section 12, S3).
- Gate 3: Designer proposals for empty, set, bracket-exceeded, loading, failed and offline states, phone layout and accessibility (focus kept inside the window, Escape closes, visible focus, targets at least 44 px, contrast at least 4.5:1).

## 10. Risks
- The panel replaces three existing places; a slice is not done while any old one still exists (process, Gate 4).
- Pretending the warning is exact. It states only a minimum.

## 11. Next gates
Owner approves this brief, then Architect (decision amendments from the conflict list), Designer (Gate 3), sliced build.

For Brad (plain words): this proposes a fixed left panel on every deck with your plan in it, one small window to set bracket, summary and strategy, and a warning (never a restriction) when the cards go above your target bracket.
