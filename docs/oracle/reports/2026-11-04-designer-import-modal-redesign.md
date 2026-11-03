# Report: import-modal-redesign (reworked on today's modal)
Role: Designer
Status: DONE (two owner questions still open)
Task as received: first, a full redesign mockup of the "Import built deck" modal from brief §9/§10. Then owner feedback: "the mockup does not match the current app. Rework it so the CURRENT import modal is the baseline… Change or add ONLY what brief §10 requires… Mark each changed or added element… Owner answers now locked… Update mockup, spec and report, commit, and stop."

## Summary for the owner
You were right: my first mockup invented its own layout. I rebuilt it from the live modal, using its real sizes, colours, columns (Qty, Card, Card origin, Type), header and footer. Only the §10 changes are different, and a **"Highlight what changed"** tick box at the top of the mockup outlines each one with a numbered tag. Untick it to see the modal looking like today's app. The numbered key under the controls says what each tag means.

Open `docs/oracle/mockups/import-modal-redesign.html` (worktree `oracle_app-import-modal-redesign`, branch `design/import-modal-redesign-2026-11-04`). Try: "Expand all rows"; pick a different source for "Cultivate" and watch the top warning and the "need attention" chip clear; pick "Tymna the Weaver" as commander to see Partner appear; tick "File contains a Companion"; tick "Deck name already exists"; switch to Result and to Laptop size.

## Changed files
- `docs/oracle/mockups/import-modal-redesign.html`: replaced with the baseline-faithful version.
- `docs/oracle/specs/import-modal-redesign.md`: rewritten as a "what changes on top of today" table (13 items) with the locked answers.
- `docs/oracle/reports/2026-11-04-designer-import-modal-redesign.md`: this report.

## What differs from today (all highlighted in the mockup)
1. Partner/Background beside the commander, only when allowed. 2. Companion only when the file has one (today always shown). 3. "Ignore basic lands" switch in the "Importing as" bar. 4. Importing-as defaults apply to new copies only. 5. Source deck chosen on each copy inside the expanded row. 6. Violet "pulled from deck" mark on the row (number only with 2+ copies). 7. Top warnings bar that can't be closed. 8. "N need attention" chip by the Import button (replaces the amber footer text). 9. Taller modal with a laptop margin. 10. Darker background on every pop-up. 11. Duplicate-name warning. 12. Edit rules per source, and the result screen listing what moved. 13. Dark text on the green Import button.

## Locked answers applied
Spare copy preselected; Import blocked until every copy has a source; duplicate name only warns; dark button text goes in the global button component; language on Unowned held back (the mockup shows "Language: held back" on Unowned copies, finish only).

## Assumptions
- Q4 (single-copy rows show no "1") and Q5 (ignored basics still added to the deck) as stated, pending you.
- The warnings bar shows two lines and "Show N more".
- The pulled mark is a violet outlined card with an arrow leaving; violet is a new colour outside the five Magic colours.
- Card and deck names are made up; partner/background/companion names are not checked against real card data.

## Challenges to locked decisions
- D-020 / D-047: the owner-approved move between decks is now visible on every pulled row and in the result. Gene reconciles at close-out, as the brief says.
- None to D-012 to D-015.
- Design-system note: white on the green button measures 3.4:1 and fails the 4.5:1 target; dark text is 5.5:1. Locked to apply globally; the Developer should check every primary button.

## Open questions (plain language)
1. **Pulled number on one-copy rows.** For a row with a single copy taken from another deck, should the mark show a "1", or just the icon? I assumed just the icon, with a number only on rows of 2 or more copies. You would see the icon alone on "Swords to Plowshares" in the mockup.
2. **Ignored basic lands.** With the switch on, should the basics still be added to the new deck (assumed), or left out of it entirely? "Ignored" in the mockup means "don't try to match them to your collection or take them from other decks".

## Verification
- Read AGENTS.md, role files, process.md, brief §9/§10 and the existing components. Compared with the live app at 1440×900, read-only; I never pressed the real Import button. Metrics and colours in the mockup were read from the running app's computed styles.
- Opened the mockup in Chrome via Playwright: no console errors. Exercised commander→partner, companion toggle, duplicate warning, per-copy source change clearing the warning, laptop size and the result screen. Found and fixed one layout bug (the highlight outline stopped the pop-up background filling the screen).
- Not verified: screen-reader behaviour; real card data; pixel-for-pixel match of every state (header, columns and collapsed rows were matched to the live app; the expanded copy line is a close approximation).
- No app code, schema or contracts touched.
