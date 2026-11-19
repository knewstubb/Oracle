# Spec: Deck left rail, Strategy window and card Tags (DV-01, DV-02, RQ-12)
Role: Designer · Status: **Proposal, awaiting owner approval (Gate 3).** Section 1a (Deck health rows, HC-01 and HC-02) added 2026-11-20; the rest is unchanged. Nothing new is built. · 2026-11-19
Mockup: `docs/oracle/mockups/deck-rail-strategy-tags.html` (open from disk in a browser; switches for every state, phone width and greyscale; sample data for the deck Yedora, the Explorer).
Briefs: `briefs/categories-drive-deck-health.md` (section 1a), `briefs/deck-page-left-rail-and-strategy.md`, `briefs/card-tags-and-deck-slot-why.md`, `briefs/claude-change-reason.md`. Evidence: `reports/2026-11-19-architect-audit.md`, `reports/2026-11-19-architect-conflict-list.md`. Owner direction: `.agents/tasks/planning-round-2026-11-19/owner-direction.md` (binding out-of-scope list).
Supersedes the layout parts of `specs/card-roles-and-deck-jobs.md` (three-layer Strategy tab, Card jobs layer, strategy points, proposals bar, Group by Job). That spec is marked partly superseded only after the owner approves this one.

**Binding rule for every screen here.** Nothing in the app blocks, filters or refuses a suggestion because of bracket, and no line of copy implies it. The bracket warning informs and restricts nothing.

**Words.** Tag (what a card does in any deck, global, read-only), Category (your own grouping in a deck list, exists today), Why (this card's reason in this deck). The words "role", "job" and "strategy point" do not appear in any screen or copy in this spec. Keep is a flag, not a fourth naming concept.

## 1. Left rail (DV-01)
Fixed panel, 304 px wide, full height under the top bar, scrolls on its own (the card list does not move). It replaces the deck header, the slot-usage bar and the Deck health footer. It is read-only except the Strategy block.

Order, top to bottom (all sample figures from the owner's wireframe):

| # | Section | Content | Notes |
|---|---------|---------|-------|
| 1 | Commander art | Card image, up to 220 px wide, centred | Placeholder in the mockup |
| 2 | Deck name | "Yedora, the Explorer", 20 px, weight 650 | One `h1` for the page |
| 3 | Commander | Colour badge (letter inside, never colour only), commander name, "Commander · Green". Partner, Background or Companion slot appears **only** when the commander allows one | The mockup shows the dashed slot box as an explanation; in the app it is simply absent for Yedora |
| 4 | Strategy | The Strategy block (section 2) | Only interactive item in the rail |
| 5 | Cards | "102 / 100"; amber icon plus "2 over" when above 100; bar (green, with a hatched amber end when over); Original, Proxy, In other decks, Unowned counts; "Estimated value $131.98" | Zero counts stay readable (secondary text, 6.36:1). Words are the existing vocabulary terms |
| 6 | Deck health | Six rows with ranges and a verdict word (section 1a). **Replaces** the earlier Ramp / Draw / Removal / Wipes / Lands "have / target" rows and the "Met" / "Short" words (D-061, 2026-11-20) | Same place, same 304 px width, same fonts and colours as the rest of the rail |
| 7 | Mana curve | Eight bars, cost 0 to 7+, count printed above each bar | Chart carries a text alternative listing every value. Marked sample shape until real data is wired |
| 8 | Colour needs against sources | Per colour: badge, "Symbols" bar and percentage, "Sources" bar and "33 of 37" | Space reserved for RQ-13; sample figures only |

**"..." menu** (Export, History, Delete deck, Delete last, separated by a rule). Placed at the right end of the tab row in the main area, so it is the same place on desktop and phone. Opens a menu: arrow keys move, Escape closes and returns focus to the button, items are 44 px high. Delete shows icon, word and red text and opens the existing confirmation; it never deletes on first click.

Edge cases: a deck with no commander (brewing, none chosen yet) shows a dashed "Choose a commander" slot in place of art and commander, and the rest of the rail still works. A deck at or under 100 shows "n / 100" with no amber text. A very long deck name wraps to two lines; it is not cut off.

## 1a. Deck health rows (HC-01, HC-02; D-061)
Binding: D-061 and the owner's wording of 2026-11-20. The rail keeps its 304 px width, section order and look. Only the Deck health section changes. Mockup: switch "Health numbers for" (Yedora the Explorer, A rot to process) and "Health details panel". Real counts come from audit section g.

**Header line (a button).** Icon plus "1 of 5 in range" (amber triangle when any of the five is off range, tick plus "All 5 in range" when none is). It opens the details panel overview. The count covers the five ranged rows only.

**Six rows, always shown, even at 0, in this order:** Lands 35 to 38, Ramp 10 to 12, Card Advantage 10 to 12, Targeted Removal 10 to 12, Board Wipes / Mass Disruption 3 to 6, Game Plan & Win Conditions (no range).

**Row layout** (one button per row, at least 44 px high, grows when text wraps): left, the name with a smaller second line; middle, the count in bold; right, the verdict as icon plus word in a 72 px column.
- Second line for the five ranged rows: "Range 10 to 12", plus " · 6 above" or " · 4 below" when off range. "Below" is measured from the minimum, "above" from the maximum.
- Long names wrap to two lines inside the row ("Board Wipes / Mass Disruption", "Game Plan & Win Conditions"). They are never cut.

| Verdict | Rule | Icon and word | Colour |
|---|---|---|---|
| Light | count below the minimum | down arrow, "Light" | amber (7.98:1 on the rail) |
| Ok | within the range, ends included | tick, "Ok" | green (8.28:1) |
| Heavy | count above the maximum | up arrow, "Heavy" | amber (7.98:1) |

Light and Heavy share amber because both mean "outside your range". The arrow direction and the word tell them apart, so nothing depends on colour. Every ratio is above 4.5:1 for text (table in the mockup). A row is never read as a failure or a block; it is information.

**Game Plan & Win Conditions row.** Count in bold. The right column says "Total" in secondary text with no icon. Second line: "No range. Everything not counted above." A dashed rule above it separates it from the five. It has no verdict and is not counted in the header line. It is the number of nonland cards not counted in the other five rows. Cards Oracle cannot place (no card text yet) are included in it. The template's "about 25 to 30" appears only inside the details panel, as a quiet grey sentence ("a guide only").

**Notes under the rows** (12 px, secondary text, each with an info icon, shown only when they apply except the first two):
1. Mana sources (HC-06): "Mana sources 55: 37 lands, 18 ramp cards. An estimate." With double-faced land cards: "Mana sources 57: 37 lands, 2 double-faced, 18 ramp cards."
2. "Ranges are the Command Zone template. Select a row for details." (replaces the old "Targets: commander average" line.)
3. Uncategorised: "4 cards have no card text yet, so Oracle could not place them. They are counted in Game Plan & Win Conditions." Not shown at 0.
4. Overlap: "99 cards in the list. 2 cards count in two rows, so the rows add to 101." Not shown at 0. The rows are never summed on screen without this line.

**Double-faced land cards (HC-06).** The Lands row count stays the plain land count and the verdict uses it. A third line under the range reads "+ 2 double-faced". The same cards are added to mana sources. They are never added to the land count, to any row, or to the deck total.

**Details panel.** Opened by any row or the header line. Same panel the old footer opened: a 420 px drawer on the right at wide widths, an 86%-high bottom sheet below 700 px (unchanged from the built panel). Focus goes to the panel title, Escape and Close return focus to the row that opened it, the page behind is inert.
- *Overview:* a headline box ("1 of 5 in range"), one card per row (name, verdict, meter, one sentence such as "You have 18 cards, 6 above the maximum of 12."), the Game Plan card (total, no verdict), the same notes, then "For reference only: the average EDHREC deck for this commander" with the five numbers and "Not used for any verdict". Rows off range have an amber outline plus the icon and word.
- *One row:* back button "Deck health", status line and meter, the range and its source ("Default. The Command Zone template."), the cards counted here (first six, then "and 12 more"), for a Light row the existing "cards that fill it" list unchanged, and the EDHREC reference sentence. Lands also shows mana sources and the double-faced explanation. Game Plan shows the total, the no-card-text count and the quiet template note.
- *Meter:* a track with the range as an outlined, tinted band and the count as a white marker; the text underneath states the range and the count, so the meter is decoration. It has a text alternative.
- No odds, no Claude rename and no "set my own range" control exist in HC-01 and HC-02.

**States.** Loading: "Checking…" (polite status). Failed: red icon, "Couldn't check" and a "Try again" button (44 px), as built. Cards without text, and the existing 10 % partial-check warning in the panel, stay.

**Future state, shown only so no redesign is needed (HC-05).** A range proposed by Claude: the row's second line reads "Claude proposes 14 to 18. Not confirmed.", the right column shows a dashed-circle icon and "Proposed", no verdict, count unchanged (D-061). In the panel: the proposal, Claude's one-line reason, the default range, and "Confirm 14 to 18" and "Decline" buttons that only the owner sees. An owner-set range will say "You set" in the panel's range box. None of this is in HC-01 and HC-02.

**Phone (800 px and below).** Rows are identical inside the expanded rail, at full width. The collapsed 64 px row is unchanged and does not show health. The panel is the 86% bottom sheet; its cards stack in one column.

**Words.** Light, Ok, Heavy (owner's words). "Short" and "Met" are no longer used for health, because "Short" already means an original-copy shortage in Reconcile (vocabulary.md). "Draw" becomes "Card Advantage", "Removal" becomes "Targeted Removal", "Wipes" becomes "Board Wipes / Mass Disruption". "Uncategorised" is used in the report; on screen the note says "could not place".

## 2. Strategy block (in the rail)
The whole block is one `button` (`aria-haspopup="dialog"`), at least 44 px high, with the visible text as its name. It holds the target bracket chip, an "Edit" cue with a chevron, the one-line summary, and (when applicable) the warning line.

| State | What the block shows |
|-------|----------------------|
| Empty (all 21 decks today) | Dashed outline. Amber-outlined chip with icon: "Target bracket: Not set". Italic prompt: "Add a one-line summary of how this deck plays" |
| Set | Solid outline. Chip "Target bracket 4 · Optimized". The summary text. No warning when the calculated bracket is lower than or equal to the target |
| Bracket exceeded | As Set, plus an amber line with a triangle icon and the words: "Cards in this deck imply at least Bracket 4. Your target is Bracket 3." (the wireframe's shorter "Cards imply at least Bracket 4" is replaced by the full sentence so both places read the same) |
| Loading | Chip replaced by "Loading strategy…", two grey placeholder lines, `aria-busy`. Not openable |
| Failed (load) | Not a button. Red-bordered box with icon, "Couldn't load your strategy.", "Nothing was changed. Your saved strategy is safe.", and a "Try again" button |
| Offline | Shows the last saved copy plus a chip with icon "Offline · showing saved copy". Still opens; Save is off inside |

Failed save is shown in the window, not the block (the block keeps the last saved values).

## 3. Strategy window (modal)
One window, 560 px wide on desktop. Title "Strategy", subtitle "Yedora, the Explorer. Claude reads this when it advises you.", Close (X) button.

Fields, in order:
1. **Target bracket.** Radio group of five buttons: 1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized, 5 cEDH (US spelling). Selected = thick outline, tinted fill and a tick mark (not colour alone). Arrow keys move and select. Helper "The bracket you are aiming for." plus a "Clear target" text button (44 px) that returns to Not set.
2. **Warning region** directly under the picker (`role="status"`, polite). Shown only when the calculated bracket is higher than the target: icon, "Cards in this deck imply at least Bracket N. Your target is Bracket M.", and a second small line "Based on: 4 Game Changers." (what the check found). When the calculated bracket is equal or lower, or no target is set, nothing is shown and no space is left. It updates live as the picker changes. Until RQ-14 exists the region is absent.
3. **One-line summary.** Single line, optional, hard limit 120 characters, counter "73 / 120" (text, always visible; at the limit it reads "120 / 120 · limit reached"). Helper "Shown on the deck page."
4. **Strategy.** Multi-line, optional. Placeholder: "How the deck wins, what your commander does for it, and any cards Claude should never suggest cutting. Plain sentences are fine."
5. **Playgroup (optional).** Single line. Placeholder "Who you usually play against".

Footer: "Last changed by <you|Claude> · <date> · See in History" (link), Cancel, Save. When never saved: "Not saved yet. Nothing in History." and no link. Save is the primary (green) button with dark label.

Behaviour:
- Opening puts focus on the selected bracket (or the first one). Closing returns focus to the Strategy block.
- Escape, Close and Cancel close. If there are unsaved edits, an inline bar appears in the window: "Discard your changes?" with "Keep editing" (focused) and "Discard". Clicking the dimmed background does nothing (avoids losing text).
- Save closes the window, updates the block, moves focus to the block and announces "Strategy saved". Saving is always allowed regardless of the warning.
- Claude's change is visible in the footer; the restore path is History (DV-04), not this window.

### Window states
| State | Window shows |
|-------|--------------|
| Empty | No target selected, empty fields, no warning, footer "Not saved yet" |
| Set | Saved values, no warning when target 4 and calculated 4. Picking Bracket 3 live shows the warning |
| Bracket exceeded | Target 3, warning shown with "Based on: 4 Game Changers." Save works normally |
| Loading | Grey placeholders in place of fields, `aria-busy`, Save inactive (`aria-disabled`, reason read out) |
| Failed (save) | Red box with icon at the top (`role="alert"`): "Couldn't save. Your changes are still here and nothing was lost. Check your connection and select Save to try again." Save button reads "Try again". All typed text is kept |
| Offline | Amber box with icon: "You're offline. You can keep typing. Save is off until you're back online. Your text stays in this window." Small line under the picker: "The card check can't update while you're offline." Save inactive; the Save label stays and the reason is read out |

Save and the other inactive buttons use `aria-disabled` (not `disabled`) so keyboard users can still reach them and hear why.

## 4. Card details (the card window)
Opens from a card row on the Cards tab or from the collection. Read-only Tags, then the editable fields. The editable label section built in CC-26 slice 2 is gone.

- **Tags** (lock icon, read-only). Chips in a plain row, at most five. Order: broad Tags first, then mechanic Tags, alphabetical inside each. If there are more than five: "2 more not shown. Search your collection by Tag to find this card by them." A card with none: "No Tags yet." Chips are not buttons (no add, remove, accept or dismiss). Helper: "What this card does in any deck. Shared by every deck and read-only." Sol Ring shows "ramp". Warren Soultrader shows "ramp", "sacrifice outlet", "token generator".
- **Category.** Existing select. Helper "Your own grouping in this deck's list." A Tag never changes it.
- **Why (optional).** One line, up to 120 characters with counter, saves when you leave the field, with a polite "Why saved" status. If Claude filled an empty Why: "Added by Claude · 19 Nov · See in History". If Claude later changes a Why you wrote, nothing waits in this window; it appears in History with the reason and Undo.
- **Keep.** Switch with the text "Keep: On" or "Keep: Off". Helper "Protects a pet card or combo piece. Only you can switch this." A card with Keep on shows a small "Keep" mark with an icon in the deck list row; a Why shows as a grey second line under the card name in the list.
- **Status and price** as today.

## 5. Phone layout
At 800 px page width and below (was 720; moved up so tablets, 768 px, get the compact row): the rail stacks above the card list and collapses to one compact row (card thumbnail, deck name, target bracket line with the warning icon and words when exceeded, "102 / 100 · 2 over", chevron). The row is a 64 px button with `aria-expanded`. Expanded, the full rail appears in the same order and scrolls with the page (no inner scroll). The tab row (with "...") follows the rail. The card list becomes one column. The Strategy window and card details become full-screen sheets; the bracket picker stays five across (numbers 20 px, names 11 px) and the footer wraps so Cancel and Save stay 44 px tall.

## 6. Accessibility
- **Modal.** `role="dialog"`, `aria-modal`, labelled by the title and described by the subtitle. Focus moves in on open, Tab and Shift+Tab cycle inside (tested in the mockup), the page behind is inert, Escape closes, focus returns to the control that opened it.
- **Focus.** Every control shows a 2 px white outline with a 4 px black halo (17.35:1 on surface).
- **Targets.** All buttons, bracket options, menu items, rows, links in forms and the rail toggle are at least 44 × 44 px.
- **Not colour alone.** Warning = triangle icon + sentence. Not set chip = icon + words. Over 100 = icon + "2 over". Health = tick, down arrow or up arrow + "Ok" / "Light" / "Heavy" (section 1a). Selected bracket = tick + thicker outline. Failed and offline = icon + words. Tested with the greyscale switch in the mockup.
- **Live regions.** Warning region and "Strategy saved" are polite; save failure is an alert. The character counter is not announced on every key.
- **Motion.** Loading shimmer stops under reduced-motion.
- **Contrast** (WCAG 2.2 AA, text 4.5:1, control borders and icons 3:1), calculated from the app's dark tokens:

| Pair | Ratio |
|------|-------|
| Text #E8E8EA on surface #1A1A1E | 14.18:1 |
| Secondary text #9C9CA3 on surface / canvas | 6.36:1 / 6.80:1 |
| Secondary text on the amber fill | 4.84:1 |
| Amber #EF9F27 on surface / on the amber fill | 7.98:1 / 6.07:1 |
| Green text #3DC99A on surface / on the green fill | 8.28:1 / 6.82:1 |
| Save label #0B0B0D on green #1D9E75 | 5.81:1 (white on that green is 3.39:1, so the label is dark) |
| Error red #F2766B on surface | 6.26:1 |
| Control border #8A8A93 on surface / canvas | 5.07:1 / 5.42:1 |
| Focus ring white on surface | 17.35:1 |

The existing faint border (#35353A, 1.42:1) is decoration only and is not used on controls in these screens.

## 7. Copy list (exact)
Strategy, Target bracket, Target bracket: Not set, Add a one-line summary of how this deck plays, One-line summary, Shown on the deck page., Playgroup (optional), Last changed by you · 19 Nov · See in History, Cards in this deck imply at least Bracket N. Your target is Bracket M., Couldn't load your strategy., Couldn't save., You're offline., Tags, Category, Why, Keep, No Tags yet. Not used anywhere: role, job, strategy point, "restricted", "limited", "only suggest", "recommended for your bracket".

## 8. Open questions for the owner (recommendation first)
1. Warning wording in the rail: full sentence, as built here. Alternative: your wireframe's shorter "Cards imply at least Bracket 4".
2. "Based on: 4 Game Changers." under the warning in the window: recommend yes (it tells you what to look at). Alternative: sentence only.
3. Unsaved edits: recommend the "Discard your changes?" bar. Alternative: close at once.
4. Why length: recommend 120 characters, same as the summary. Alternative: 200.
5. Tag order when over five: recommend broad Tags first. Alternative: alphabetical.
6. The "Clear target" link: recommend keep, so a target can be un-set.
7. Where the Save label is dark: recommend dark text on green for readability. Alternative: darker green with white text.

## 8a. Open questions for the owner, Deck health rows
1. Header line "1 of 5 in range": recommend keep. Alternative: no header line, rows only.
2. Light and Heavy both amber, told apart by arrow and word: recommend keep. Alternative: Heavy in a second colour (more to tell apart in greyscale).
3. Double-faced lands: the verdict uses the plain land count only. Recommend keep. Alternative: count each as a land for the verdict.
4. Cards with no card text sit in Game Plan and are named in a note. Recommend keep.

## 9. Not covered here
Build, migrations, RQ-13 and RQ-14 maths, the Picklist screens, the EDHREC build picker and category manager (they stay where they are), and the Workbench and Analysis tabs.
