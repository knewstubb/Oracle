# Report: import-modal-redesign (reworked on today's modal)
Role: Designer
Status: DONE (two owner questions still open)
Task as received: first, a full redesign mockup of the "Import built deck" modal from brief §9/§10. Then owner feedback: "the mockup does not match the current app. Rework it so the CURRENT import modal is the baseline… Change or add ONLY what brief §10 requires… Mark each changed or added element… Owner answers now locked… Update mockup, spec and report, commit, and stop."

## Summary for the owner
Two approved tweaks applied:
- **Ignore basic lands** now shows just the label, the switch and the count (e.g. "12 basics"). The explanation text is gone.
- **Footer message** is now just "1 card needs a source." (or "N cards need a source.").

Confirmed in the spec: when a copy has exactly one possible source (a spare copy, or a single other deck), it is chosen automatically. A spare wins over decks. You only pick when several decks hold the card and there is no spare; until you do, the row shows "Choose source" and Import stays off. In the mockup, "Cultivate" is the example (two decks, no spare); "Swords to Plowshares" (one deck) is pre-filled.

Open `docs/oracle/mockups/import-modal-redesign.html`.

## Changed files
- `docs/oracle/mockups/import-modal-redesign.html`, `docs/oracle/specs/import-modal-redesign.md`, this report.

## Assumptions
- The "Needs a source" pill reuses the existing small pill shape with the existing amber text colour; the footer line reuses the existing amber blocking text (shortened to "N card(s) need a source.").
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
