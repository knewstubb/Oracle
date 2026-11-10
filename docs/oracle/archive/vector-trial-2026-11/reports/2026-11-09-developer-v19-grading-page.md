# Report: V-19 owner grading page
Role: Developer
Status: DONE
Task as received: Build a single self-contained local HTML file (no server, no network, no build step, opens by double-click) for the owner to grade the blind sheet (205 cards plus 10 A/B comparisons), with one card at a time, list/commander/build context, feature question, 3/2/1/0 buttons and keys, notes, back/next, progress, jump to ungraded, autosave in localStorage, Pause and Export buttons producing the CSV the scoring tool expects, an ungraded warning, a separate A/B section, an always-visible scale legend. Do not open the sealed folder; do not embed the drafted grades. Test the export against the scoring tool's input checks; verify in a headless browser. Report with a plain-language owner summary.

## Summary for the owner
There is now one page you can grade in. Double-click the file named below, and it opens in your browser: one card at a time, the 3/2/1/0 scale always on screen, and your progress is saved as you go, so you can close the tab any time and carry on later (same computer, same browser). When you are done, press Export CSV for the cards and Export A/B CSV for the 10 comparisons; both files land in your Downloads folder. Nothing needs deciding.

Open it by double-clicking:

`trial/vector/grading-page/grading-page.html`

Send back (or hand to Gene) these two files from Downloads: the graded cards file, named `grading-sheet-graded.csv`, and the comparisons file, named `ab-answers.csv`. If you export before finishing, the name ends in PARTIAL and the scoring tool will not accept it, so only use that as a safety copy. Do not open the page in a private window (progress would be lost) and do not switch browsers midway, because progress is stored per browser.

## Changed files
- `trial/vector/grading-page/grading-page.html` — the owner-facing page (generated; data embedded; no network).
- `trial/vector/grading-page/template.html` — page layout and behaviour.
- `trial/vector/grading-page/build-grading-page.ts` — generator; reads only `sheet/grading-sheet.csv`, `grading-sheet.md`, `ab-comparisons.md`. Run: `npx tsx trial/vector/grading-page/build-grading-page.ts`.
- `trial/vector/grading-page/grading-page.test.ts` — tests (below).

## What the page does
- Always visible: the scale (3 would be great, 2 would play, 1 marginal, 0 wouldn't), "Grade on the card text for this deck, not popularity", progress bar and "N of 205 cards graded".
- Per card: deck, commander (with rules text), build, card name, type line, cost, rules text on separate lines, power/toughness, and the feature question in a highlighted box when present.
- Big 3/2/1/0 buttons and keys; arrows left/right; U jumps to next ungraded; optional note (typing in the note box does not trigger keys); option to move on automatically after grading (on by default).
- Pause here: saves and explains how to resume. Autosave happens on every grade and note.
- Export: if cards are ungraded it warns with the count, offers "Go to first ungraded", or a PARTIAL download.
- A/B tab: one comparison at a time, lists A and B side by side, "I prefer A/B" buttons and A/B keys, own progress, jump to next unanswered, export.
- No arm, rank, combo, trap or draft wording anywhere (test checks the page text). Drafted grades are not read or embedded.

## Export format (matches scoring tool)
- Cards: same 7 columns as the sheet (`row_id,list,card_name,card_text,feature_ask,grade,note`), same row order, columns 1 to 5 byte-identical to the blind sheet, grade 0..3, quoting per RFC 4180.
- A/B: same header and situation numbers as `ab-answer-form.csv`; the pick column holds A or B.

## New decisions made (need owner confirmation)
- Export is two files (cards, comparisons) rather than one, because the scoring tool takes them as separate inputs.
- Ungraded export is allowed but named PARTIAL.

## Assumptions
- The owner uses a normal (non-private) window in one browser; progress is stored in that browser's local storage under the sheet id.
- Card text layout (type | cost | rules / rules | P/T) is parsed from the sheet's plain text; no two-faced cards exist in this sheet. Anything that does not match the pattern still shows its text.

## Challenges to locked decisions
none

## Open questions
- None. Suggest a backup copy of the Downloads files before sending.

## Verification
- `npx tsx trial/vector/grading-page/build-grading-page.ts` — wrote page, 205 cards, 10 comparisons.
- `npx vitest --run trial/vector/grading-page` — 2 passed. Headless Chromium (opened from file://): graded by keyboard, partial export warns (203 ungraded) and is named PARTIAL, reload resumes with progress and position, note with comma, quote and newline round-trips, full export parses and passes the scoring tool's input checks (grades 0..3, every sheet row graded, columns 1 to 5 identical to the sheet), A/B export matches the answer form, no page errors. The throwaway graded copies live only in a temp folder the test deletes.
- Limitation: the scoring tool itself opens the sealed key, which I must not touch, so I repeated its input checks in the test instead of running it. Not run end to end.
- Screenshots viewed for card and A/B screens: readable, large type. Tested in Chromium only; Safari and Firefox not tested.
- No database access, no network use, no push.
