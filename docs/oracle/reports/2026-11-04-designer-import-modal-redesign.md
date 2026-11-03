# Report: import-modal-redesign (reworked on today's modal)
Role: Designer
Status: DONE (two owner questions still open)
Task as received: first, a full redesign mockup of the "Import built deck" modal from brief §9/§10. Then owner feedback: "the mockup does not match the current app. Rework it so the CURRENT import modal is the baseline… Change or add ONLY what brief §10 requires… Mark each changed or added element… Owner answers now locked… Update mockup, spec and report, commit, and stop."

## Summary for the owner
I applied your review to the mockup, spec and this report.
- **Commander** now sits on its own row below Name / Format. Partner, Background and Companion sit beside it only when they apply; otherwise the commander takes the full width.
- **Ignore basic lands:** the switch now says what it does. With it on, basics are never taken from other decks, need no source and raise no warning; the deck just gets ordinary basics. With it off, basics held by other decks need a source like any card (untick it in the mockup to see 12 Forests ask for one).
- **Pulled-from-deck icon, top warnings bar, "need attention" chip: removed.** What is left of "needs a source": the row shows the existing small amber "Needs a source" pill; the expanded row has the Source dropdown, whose first option "Choose source" clears the choice; and the existing amber footer text says how many cards still need one. Import stays off until none are left.
- **Result screen** restyled with the existing list-box look (grey header strip, rows), no new colours.
- 4, 5, 9, 10, 11, 13 unchanged. The "Highlight what changed" key keeps your numbering (6, 7, 8 shown as unused).

Open `docs/oracle/mockups/import-modal-redesign.html`. Try: tick "Deck name already exists" and "File contains a Companion", pick Tymna as commander, expand all rows, set "Cultivate" to a deck and back to "Choose source", untick Ignore basic lands, then view Result.

## Changed files
- `docs/oracle/mockups/import-modal-redesign.html`, `docs/oracle/specs/import-modal-redesign.md`, this report.

## Assumptions
- The "Needs a source" pill reuses the existing small pill shape with the existing amber text colour; the footer line reuses the existing amber blocking text (reworded, since the old "coming soon" message no longer applies).
- The duplicate-name note is one line of existing amber small text under the Name field.
- The "Language: held back" note on Unowned copies was dropped from the mockup; language is simply absent there until the Architect confirms storage.

## Challenges to locked decisions
- D-020 / D-047: the owner-approved move between decks still applies; the result screen lists what moved. Gene reconciles at close-out.
- None to D-012 to D-015. With the icon gone, the only new state signal is the amber word "Needs a source" (colour plus text).
- Design-system note: white on the green button is 3.4:1 (fails 4.5:1); dark text is 5.5:1. Applies globally as you decided.

## Open questions
None. Q4 is moot (icon removed). Q5 is answered (ignored basics go into the deck as ordinary basics).

## Verification
- Opened the mockup in Chrome via Playwright: no console errors. Checked: Import is disabled while "Cultivate" has no source, enabled once a deck is chosen, disabled again after "Choose source", disabled when Ignore basic lands is unticked (Forests need sources), enabled again with it on. Screenshots of the review and result screens reviewed.
- Not verified: screen-reader behaviour; real card data; pixel-for-pixel match of every expanded-row state.
- No app code, schema or contracts touched.
