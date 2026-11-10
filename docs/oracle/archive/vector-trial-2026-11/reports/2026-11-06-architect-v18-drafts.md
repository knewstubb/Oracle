# Report: v18-drafts
Role: architect
Status: DONE
Task as received: V-18: draft a 3/2/1/0 grade for every card on the sheet from card text and the grade scale alone, and write them to the drafts file named in the grading-sheet format doc; do not draft the 10 A/B comparisons. Read only the V-17 grading sheet and the freeze file.

## Summary for the owner
I made a first-guess grade (3, 2, 1 or 0) and a one-line reason for all 205 rows on your grading sheet, judging only by card text and the grade scale. I did not see how the cards were picked or any results. Please confirm or change each grade. I did not touch the 10 A/B comparisons.

## Changed files
- trial/vector/sheet/grading-drafts-v18.csv — 205 rows: row_id, list, card_name, draft_grade, reason
- docs/oracle/reports/2026-11-06-architect-v18-drafts.md — this report

## Files opened (complete list)
- AGENTS.md (original folder), ~/agents-shared/architect.md, .agents/project/architect.md
- docs/oracle/handoffs/v18-drafter.md
- docs/oracle/contracts/vector-trial-grading-sheet-format.md
- docs/oracle/contracts/vector-trial-freeze-2026-11-06.md
- trial/vector/sheet/grading-sheet.csv and (header and list-context lines only) grading-sheet.md
- Directory listings of trial/vector and trial/vector/sheet (names only, no content)
- Not opened: anything in trial/vector/sealed/, any key, any output folder, combo list, V-14/15/17 report, git history. The key was not among the files opened.

Note: the freeze file itself names the 12 deck-dependent cards, the controls and the multi-feature cards. That is allowed content, but it means I knew those names were intended. I graded them on text and the list's build only.

## New decisions made (need owner confirmation)
- none

## Assumptions
- The format doc does not actually name the drafts file; I chose `trial/vector/sheet/grading-drafts-v18.csv`. Rename if the harness expects another name.
- Multi-feature rows are graded as the card overall for the list, not per feature.
- Repeated cards (same card, same list) get the same grade.
- Grades are first-guess, with W1 as Zombies, W2 as sacrifice/drain, M1 as artifacts.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- Row count of drafts file against sheet: 205 rows each, same row ids in order (checked by script: ids, names and grades all valid).
