# Report: import-stage-screens
Role: designer
Status: DONE
Task as received: Design pass on two screens of the import modal, now that every stage uses one fixed large size (about 48rem wide, up to ~46rem tall, dark UI): (1) the first screen (upload), currently a small dashed "ManaBox .csv / Choose file" box floating in a big empty modal; (2) the last screen ("Collection updated"), currently a tiny title and one line "2 copies added" centred in a big empty modal with Close / View collection in the footer. Fill the space purposefully without clutter: upload as a large drop zone with drag-and-drop state, supported format, where to export from in ManaBox, a short "what happens next" hint; result as a clear success state with confirmation icon, headline with copy total, compact breakdown (copies added, originals, proxies, foils, notices such as unrecognised values or finishes not listed, cards that couldn't be matched). Also check processing and importing screens for balance. Plain short copy. Update mockup/spec/report with exact content and states (empty, drag-over, error, success with and without notices) and any data the result screen needs that the app may not return today. No app code changes.

## Summary for the owner
Upload is now one large drop zone that fills the modal, with two small help cards under it ("Export from ManaBox" and "What happens next"). The result becomes a green tick, "148 copies added", and a short breakdown and "Needs a look" notes that only appear when there is something to report; processing and importing are centred with clearer wording and a visible Cancel. Please check the questions below, mainly the ManaBox export wording, which I could not verify.

## Changed files
- docs/oracle/mockups/import-stage-screens.html — new mockup: upload (empty, drag-over, two errors), processing, importing, result (clean, breakdown, notices and unmatched), with controls for modal height and collection/deck wording
- docs/oracle/specs/import-stage-screens.md — spec with exact copy, states, interactions, data table
- docs/oracle/reports/2026-10-20-designer-import-stage-screens.md — this report

## New decisions made (need owner confirmation)
- Drop zone fills the body; help cards under it are static in every state.
- Errors appear as a banner above a zone that stays ready, rather than replacing the zone.
- Processing shows a spinner, a plain sentence and the file name; no progress bar (none is available).
- Importing: "Cancel import" becomes a visible text button instead of an icon-only ✕; Escape does nothing while importing.
- Result: breakdown rows and notices appear only when non-zero; a clean import shows "All originals."
- Foil is shown as an "included in the counts above" row, not as a separate category.
- Unmatched cards: three lines shown, then "Show all"; a header button copies all unmatched lines.
- Initial focus on the result screen goes to the primary button.

## Assumptions
- Current behaviour described from `src/components/manabox-import/ImportResult.tsx`, `ManaBoxFilePicker.tsx`, `ImportProgress.tsx` and the collection dialog [Confirmed: those files].
- The stage wording "Reading your file" replaces today's "Processing N cards…".
- The "We couldn't read that file" error is a third error case I added; the app has only the wrong-type message today [Confirmed: `ManaBoxFilePicker.tsx`].

## Challenges to locked decisions
- none (D-015 respected: dashed border only on the empty drop zone; D-012: icon plus text for every state)

## Open questions
- ManaBox export steps: I could not verify the real menu path, so the help card is generic. Provide the steps if you want them spelled out.
- Data the result screen needs and the app does not return today (Architect/Developer): `foils` (finish foil or etched; server preferred, client count from review rows acceptable); `unrecognisedValues` (already computed on the review screen, just carry it to the result); `unlistedFinish` (already in the summary, not shown on the result). Originals for decks (inserted − proxies − unsleeved) needs confirming.
- Is an indeterminate spinner fine for processing?
- Does a clean result need to say "Non-foil" as well as "All originals."?
- Is three unmatched lines the right cut-off?

## Verification
- jsdom load of the mockup — no script errors; 9 frames render; breakdown values 143/5/12/2; 3 notices on the notices frame; deck toggle changes headline to "Strix draft imported".
- Not viewed in a real browser (Playwright browsers are not installed); layout balance at the three heights is not visually confirmed.
- Contrast ratios computed by hand from token hex values.
