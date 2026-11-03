# Spec: "Import built deck" modal redesign
Role: Designer · 2026-11-04 · Gate 3 (owner approves before build)
Mockup: `docs/oracle/mockups/import-modal-redesign.html` · Requirements: `docs/oracle/briefs/use-what-i-own.md` §9 and §10 (§10 wins)
Supersedes the separate "Cards already in other decks" section in `docs/oracle/mockups/scan-wins-review.html`. Builds on `import-review-controls.md` and `import-row-editing.md`.

## 1. The problem
Decks are scanned out of order, so a card the owner is holding is often still recorded in another deck. The first scan-wins mockup solved this with a separate "moves" section above the card list. That splits one decision (where does each copy of this card come from?) across two places, hides warnings inside the scroll, and makes the commander, defaults and basics controls compete for space. The owner needs one list where every card shows where its copies come from, and where anything that needs a decision is impossible to miss or lose.

## 2. Principle
- **Object-action mapping / one place per decision:** the source choice lives on the card row it affects (D-015: controls live inside the scope they act on).
- **Progressive disclosure:** collapsed rows show state only; edit controls appear on expand, and only the ones that apply.
- **Quiet default, loud exception (D-014):** with nothing wrong the modal has no warning bar and no chip. Problems are loud and pinned.
- **Visibility of system status / error prevention (Nielsen):** warnings cannot be dismissed, only resolved. The result screen lists exactly what moved.

## 3. Layout (top to bottom)
1. Title bar: "Import built deck", close.
2. **Warnings bar** (only when there are warnings). Pinned under the title, never scrolls away, no close button.
3. Header block: row 1 deck name + format; **row 2 command zone** (commander, then conditional slots); **"Importing as" line**.
4. Filter chips + card list (the only part that scrolls on large screens).
5. Footer: summary text, **"N need attention" chip** (only when N > 0), Cancel, **Import deck**.

## 4. Component inventory
| Component | Props | Builds on |
|---|---|---|
| `ImportModalShell` | `size` (large/laptop), children | shadcn `Dialog` (overlay darkened, see §10) |
| `WarningsBar` | `warnings[]` {id, text, actionLabel, blocking} | plain div, `role="region"` |
| `CommandZoneRow` | commander, partner/background (conditional), companion (conditional) | existing `ReviewCommanderSelect` (slots: commander, second, companion) |
| `ImportingAsLine` | defaults, ignoreBasics, ignoredCount | existing `ImportDefaultsBar` + shadcn `Switch` |
| `AttentionChip` | count, pressed | shadcn `Toggle`/button |
| `ImportRow` (collapsed) | qty, name, set, kind badge, proxy mark, pulled mark (+count), right-hand summary | existing `ImportCardList` row |
| `CopyEditor` (expanded, one per copy) | copy index/total, source choice, per-kind edit controls | existing `ImportRowEditor`, shadcn `Select` |
| `PulledMark` | count (shown when the row has 2+ copies), deck names | icon + tooltip |
| `ResultScreen` | counts, per-deck moves | existing `ImportResult` |

## 5. Rows
### 5.1 Collapsed row
`chevron · qty× · Card name + set/#  ·  [proxy mark] [pulled mark (+n)] [kind badge]  ·  summary`
- **Kind badge** (text always): `New` · `From collection` · `Unowned` · `Mixed` (e.g. a new copy plus a pulled copy) · `Choose source` (amber, needs attention) · `Not matched` (amber).
- **Pulled mark:** violet outlined card with an arrow leaving it (`--status-pulled #A78BFA`, proposed). No text. Shown whenever any copy is pulled from another deck. The number beside it = how many copies are pulled; shown only on rows with 2+ copies. Deck names appear on hover **and on keyboard focus**; the same names are in its accessible label ("2 copies pulled from other decks: Korvold, Jund Core").
- **Proxy mark:** existing teal filled mask. Different shape (filled mask vs outlined card-with-arrow) and hue (teal vs violet) from the pulled mark. A row can show both.
- Summary (right): New → "Original · Nonfoil"; Unowned → "Unsleeved · Nonfoil"; From collection → source deck name(s).
- The whole row is one disclosure button (`aria-expanded`).

### 5.2 Expanded row: one `CopyEditor` per copy
Each copy has a "This copy comes from" select. Options (only those that exist for that card):
`New copy (add to collection)` · `Spare copy · in no deck` · `<Deck name> · <Original|Proxy> · <printing> · <finish>` (one entry per deck holding a copy) · `Leave Unsleeved (don't use a copy)`.
- A real copy can feed only one copy-slot of the row; used options show "(already used)" and are disabled in the other slots.
- If exactly one source exists it is preselected. If two or more deck sources exist and no spare, the copy starts as **"Choose a source…"** and needs attention (§9 says the owner picks). A spare copy is preselected before any deck copy.
- "Leave Unsleeved" is the old "untick the move": the card stays on this deck's list as Unsleeved, the physical copy stays where it is, no new copy is created.

**Edit rules (§10.12), by the chosen source:**
| Source | Editable here | Read-only text |
|---|---|---|
| New copy | Type (Original/Proxy), finish, condition, language | — |
| Spare or pulled copy ("From collection") | Source only | "Original/Proxy · printing · finish · keeps its status · cannot be edited here" |
| Unowned / Leave Unsleeved | Finish, language | — |
Each copy also has one plain sentence of consequence, for example: "Moves into this deck. Korvold keeps Sol Ring on its list as Unsleeved and shows short by one."

New copies' finish/condition/language start from the "Importing as" defaults (§10.4). Spare/pulled copies never show those fields.

### 5.3 Not-matched row
Badge "Not matched". Expanded: one select "Choose the right card…" / "Skip this row (don't import it)". Either choice resolves it.

## 6. Command zone (row 2 of the header)
- **Commander** select always.
- **Partner** (commander has Partner) **or Background** (commander has "Choose a Background"): a second select appears next to it, with a one-line hint ("Thrasios can be paired with another Partner"). Not shown for other commanders. Option "No partner/No background".
- **Companion** select appears only when the file contains a card with Companion. Hint: "Found in your file. Kept outside the 100."
- Changing commander clears the second slot.

## 7. "Importing as" line
`Importing as: Nonfoil · Near Mint · English  Change │ [switch] Ignore basic lands  3 ignored        Applies to new copies only`
- "Change" opens the existing inline edit for the three defaults.
- **Ignore basic lands** is a switch, **on by default**. On: Plains, Island, Swamp, Mountain, Forest and Wastes are never listed as moved or pulled; the count is shown, and a quiet line at the foot of the list names them. Snow-Covered and nonbasic lands stay listed. Off: those basics appear as normal rows and can be pulled; label reads "included".
- The right-hand note makes the "new copies only" rule visible.

## 8. Warnings bar and attention chip
- Amber tinted bar, one line per warning: icon + message + (optional) action button. **No close/dismiss control.** A warning leaves the bar only when its cause is fixed.
- Shows the first 2; a text button "Show N more / Show fewer" reveals the rest. This only expands; it never hides a warning permanently.
- Warnings in this design:
  | Warning | Blocks Import? | Clears when | Action |
  |---|---|---|---|
  | A deck with this name already exists | No | the name is changed | Rename (focuses the name field) |
  | N copies need a source deck | **Yes** | every copy has a source (or Leave Unsleeved) | Show them (turns on the attention filter and opens the first row) |
  | N cards weren't matched | **Yes** | each is matched or skipped | Show it |
- **"N need attention" chip** sits left of Cancel/Import. It counts **rows** that need a decision (not warnings, so the duplicate-name warning does not count). Pressing it filters the list to those rows (`aria-pressed`); pressing again shows all. Hidden at 0.
- While Import is blocked it is disabled and an off-screen description says "Resolve the N items marked 'need attention' to import."

## 9. Duplicate deck name
Warn only; the owner may still import (two decks may legitimately share a name). Name field gets an amber border in addition to the bar message (not colour alone: the message names the problem).

## 10. Size and overlay
- Modal width: `min(1120px, 100% − 64px)`.
- **Screen taller than 800px:** height 88% of the screen. Only the card list scrolls.
- **Screen 800px tall or shorter (laptops):** modal fills the screen minus a **16px margin on every side**. Header block and list scroll together; the title bar, warnings bar, filter chips (sticky) and footer stay in view.
- **Overlay for every pop-up** (not just this modal): `rgba(0,0,0,0.72)` + 8px background blur. Apply once in the shared dialog/overlay component. Reduced-motion: no animation on the chevron or switch.

## 11. Result screen
Title "Import complete". Heading "<Deck> imported". One box "This deck": new copies added, spare copies sleeved in, moved in from other decks, left Unsleeved (each with card names), basics ignored (when on). Then one box per source deck: "Korvold · 2 cards moved out · now short by 2" with the card names and "Now Unsleeved in Korvold". Footnote: "Moves can't be undone from this screen. To put a card back, import or scan the other deck again." (No undo for now, §10.11.) Buttons: "Import another", "Open <deck>".

## 12. States covered in the mockup
- Rows: New (Original, Proxy), From collection (spare; pulled, single deck; pulled, multi-deck per-copy), Mixed, Unowned, Not matched, Choose source, collapsed and expanded, companion row.
- Controls: default, focus (2px ring, #5BD6AE), hover, disabled (Import while blocked), pressed (chip, filter, switch).
- Screens: review, importing (spinner, Import disabled "Importing…"), result.
- Empty: attention filter with nothing left ("No cards need attention. Clear the filter…"); not-matched/skipped; no pulls ("No cards were moved out of other decks.").
- Sizes: large and laptop.
- Not shown (unchanged existing behaviour): file-error and discard-confirmation screens.

## 13. Interactions
**Pointer:** click a row to expand; selects as native; switch toggles on click; chip toggles filter; warning action buttons as above.
**Keyboard:** Tab order = close → warnings bar actions → deck name → commander → partner/background → companion → Change → Ignore switch → filter chips → rows (each row head, then its open controls in order) → attention chip → Cancel → Import. Enter/Space on a row head expands it; Space toggles switch/chip; Escape closes (with the existing "Discard this import?" confirmation); focus is returned to the control that opened a popover. The pulled mark is focusable (tabindex 0) so its deck names show on focus. No drag interactions.

## 14. Data binding
| Element | Source |
|---|---|
| Rows, copy sources, deck names, spare vs deck copies | import intent view (`docs/oracle/contracts/import-intent.*`) plus the Gate 2 audit `2026-11-03-architect-scan-wins-audit.md` (existing copies and source decks need no schema change) |
| Original/Proxy of an existing copy | `user_copies.is_proxy` (D-001) |
| Source-deck shortage after a move | the source deck's `deck_cards` slot becoming Unsleeved (audit) |
| Partner/Background/Companion eligibility | `docs/oracle/contracts/command-zone-roles.md` |
| Duplicate deck name | existing decks list; **needs a read the Developer must confirm** |
| Language on Unowned rows | **BLOCKED on Architect** (§10.5): where a language chosen for an unowned card is stored is unconfirmed. The mockup shows the control; do not build it until confirmed. |
No field is invented. Sample card/deck names are illustrative.

## 15. Copy (exact strings)
- Title: `Import built deck` · Result title: `Import complete`
- Warnings: `A deck named “{name}” already exists. Importing will create a second deck with the same name. Rename this one to clear the warning.` · `{n} copy needs a source deck.` / `{n} copies need a source deck.` + ` Choose where each one comes from, or leave it Unsleeved.` · `{n} card wasn't matched.` / `{n} cards weren't matched.` + ` Pick the right card or skip it.`
- Buttons: `Rename` · `Show them` · `Show it` · `Show {n} more` · `Show fewer` · `Cancel` · `Import deck` · `Importing…` · `Import another` · `Open {deck}`
- Chip: `{n} need attention`
- Line: `Importing as:` · `Change` / `Done` · `Ignore basic lands` · `{n} ignored` / `included` · `Applies to new copies only`
- Badges: `New` · `From collection` · `Unowned` · `Mixed` · `Choose source` · `Not matched`
- Source select label: `This copy comes from` (single copy: `Comes from`); placeholder `Choose a source…`; options as in §5.2.
- Footer summary: `{n} new copies · {m} copies pulled from other decks — those decks will show as short`
- Basics line: `{n} regular basic lands (Forest ×2, Wastes ×1) are ignored: never pulled from another deck. They are still added to the deck.`
- Result footnote as §11.

## 16. Accessibility
Contrast on `--bg-surface #1A1A1E` (computed): pulled violet 6.4:1; proxy teal 4.9:1; secondary text 6.4:1; amber 8.0:1; Unowned magenta border 4.7:1; primary text on amber bar 10.8:1. **New pair:** the existing white-on-`#1D9E75` primary button measures 3.4:1 and fails AA for 13px text; the mockup uses `#08150F` text on it (5.5:1). All other pairs are existing tokens.
D-012: every state is colour + text or icon (badge words, amber triangle + sentence, pulled mark has a screen-reader label; icons differ in shape). D-013: violet is outside WUBRG.
Screen readers: rows are disclosure buttons; the filter result and resolution changes are announced via a polite live region ("1 card needs attention." / "Everything is resolved."); the warnings bar is a labelled region (not an alert, so it doesn't interrupt on every change); the disabled Import button is described by why it is disabled; the switch has `role="switch"`.
Target size: all controls ≥ 24px tall (WCAG 2.2 AA target).

## 17. Open questions
See the report (plain-language versions for the owner).
