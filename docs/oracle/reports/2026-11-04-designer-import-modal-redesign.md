# Report: import-modal-redesign
Role: Designer
Status: DONE
Task as received: "revise the scan-wins import review mockup (docs/oracle/mockups/scan-wins-review.html) into a full redesign of the 'Import built deck' modal. Read AGENTS.md, your role files, docs/oracle/process.md, docs/oracle/briefs/use-what-i-own.md (sections 9 and 10 are the requirements; section 10 supersedes the separate 'cards in other decks' section), and the existing components in src/components/manabox-import/. Work in a new git worktree/branch off main. Deliver: an updated HTML mockup (docs/oracle/mockups/) showing all states (collapsed rows incl. mixed-source icon with number, expanded New/From collection/Unowned/pulled-from-deck rows with multi-deck per-copy picker, top non-dismissable warnings bar plus 'N need attention' chip, commander row with partner/background/companion conditional, Importing-as line with ignore-basics toggle, duplicate-deck-name warning, result screen listing what moved, laptop-size view), a short spec in docs/oracle/specs/, and a report in docs/oracle/reports/. Open questions go in the report in plain language for the owner (a BA/UX person who does not read code). Do not write app code. Stop after the report."

## Summary for the owner
The "Import built deck" window is redesigned as one clickable mockup. Each card row now holds its own "where does this copy come from" choice, problems are pinned in a bar at the top that you can't close, and the result screen lists exactly which cards moved out of which decks. Please open the mockup, try it, and answer the questions below; nothing is built until you approve.

Open it: `docs/oracle/mockups/import-modal-redesign.html` (in the worktree `oracle_app-import-modal-redesign`, branch `design/import-modal-redesign-2026-11-04`). Use the dashed strip at the top to switch screens, switch between large and laptop size, tick "Companion in file", and so on. Try: expand "Sol Ring" and choose a deck for each copy; watch the top warning and the "need attention" chip clear.

## Changed files
- `docs/oracle/mockups/import-modal-redesign.html` — the new mockup (self-contained, replaces the §9 mockup's design; the old file is left for Developer/Gene to delete at build time).
- `docs/oracle/specs/import-modal-redesign.md` — implementation spec.
- `docs/oracle/reports/2026-11-04-designer-import-modal-redesign.md` — this report.

## New decisions made (need owner confirmation)
- **"Leave Unsleeved" replaces the untick box.** Each copy's source menu ends with "Leave Unsleeved (don't use a copy)". It does what unticking did: the card stays on the new deck's list as Unsleeved, the real card stays where it is.
- **Spare copies come first.** If you own a loose copy in no deck, it is preselected before any deck copy is offered.
- **The "pulled from deck" icon** is a violet outlined card with an arrow leaving it (the proxy icon stays the teal filled mask). Violet is a new colour for the palette, outside the five Magic colours.
- **The number beside the pulled icon** shows only on rows with 2 or more copies, and counts how many are pulled.
- **Which problems block Import:** missing source choices and unmatched cards block it. The duplicate-deck-name warning does not.
- **The chip counts cards, not warnings** (so the duplicate-name warning doesn't count towards "N need attention").
- **Warnings bar shows two warnings, with "Show N more"** for the rest. It never hides one for good.
- **Laptop screens (800px tall or less):** the modal fills the screen with a 16px margin; the top section and the list scroll together while the warnings bar, filter chips and footer stay in view. Larger screens: modal is 88% of screen height.
- **Darker background for every pop-up:** 72% black plus a blur, set once in the shared pop-up.
- **Result screen** has a box for this deck, then one box per deck that lost cards ("Korvold · 2 cards moved out · now short by 2"), and a plain note that moves can't be undone yet.

## Assumptions
- Existing hover/focus styles, filter chips and the "Change" defaults editor are kept as they are today.
- Sample cards and decks (Sol Ring, Korvold, Thrasios, Lae'zel, and so on) are made up for illustration.
- "Ignore basic lands" only stops basics being pulled from other decks; the basics are still added to the deck. Not stated in the brief.
- Escape closes with the existing "Discard this import?" check; the mockup only shows a note.
- Hosted-database status (§10.13) is not a design matter; I have not checked it.

## Challenges to locked decisions
- D-020 / D-047 — the owner-approved move-between-decks exception is now visible on every pulled row and in the result. No change from me; Gene reconciles at close-out as the brief says.
- None to D-012 to D-015.
- Design-system note: the existing green primary button with white text is 3.4:1 contrast and fails the accessibility target (4.5:1). The mockup uses near-black text on it (5.5:1). Worth fixing app-wide; I didn't change the token.

## Open questions
1. **A spare copy and a deck copy both exist (for example one loose Sol Ring and one in Korvold). Which should the screen pick for you?**
   - Recommended: the loose one, since taking it from nowhere costs no deck anything. You would see "Spare copy" preselected and nothing in the warnings bar.
   - Other: ask every time. You would see "Choose source" and the chip count go up for each such card.
2. **Should Import be blocked until every "Choose source" is answered?**
   - Recommended: yes. You would see Import greyed out with the chip beside it, and you can't accidentally leave a decision open.
   - Other: let Import go ahead and treat unanswered copies as "Leave Unsleeved". Faster, but a copy could stay unsleeved without you noticing.
3. **A deck with the same name already exists: warn only, or stop?**
   - Recommended: warn only (as shown). You can still import, and the warning goes away when you rename.
   - Other: block Import until the name is changed. Safer, but gets in the way if you really want two decks with one name.
4. **Pulled icon number.** Right now a row with one copy shows the icon alone, and a row with 2+ copies shows the icon plus how many were pulled. Is that what you meant, or should the number also appear on single-copy rows ("1")?
5. **Ignored basic lands.** With the switch on, are the ignored basics still added to the new deck as ordinary basics (what the mockup assumes), or left out entirely?
6. **Language on Unowned cards.** The mockup lets you pick language on an unowned card, but whether Oracle can save that is still unconfirmed by the Architect (brief §10.5). I'd hold that one control back until it is answered; the rest can be built.
7. **The green Import button.** I made its text dark so it is readable. OK to change it in the app everywhere, or keep white and accept the lower contrast?

## Verification
- Read AGENTS.md, designer base and project role files, process.md, the brief (§9, §10), the previous scan-wins mockup and report, and the import components (defaults bar, card list, commander select, notice line).
- Created worktree `../oracle_app-import-modal-redesign` on branch `design/import-modal-redesign-2026-11-04` from main; no app code, schema, contracts or decisions touched.
- Opened the mockup in Chrome via Playwright: no console errors; exercised row expand, per-copy picking, rename clearing the duplicate warning, commander change, companion toggle, laptop size, result screen. Screenshots of large, laptop and result states reviewed. One real bug found and fixed (the Ignore switch could not be clicked).
- Contrast ratios computed with the WCAG formula (listed in the spec).
- Not verified: screen-reader behaviour (not tested with a real screen reader); the mockup's partner/background/companion sample cards are not checked against real card data.
