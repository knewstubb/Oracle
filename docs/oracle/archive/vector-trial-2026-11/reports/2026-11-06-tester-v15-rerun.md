# Report: V-16 check of the V-15 combo re-run under Amendment A-V15
Role: Tester
Status: DONE
Task as received: Task V-16 (also the check of the V-15 re-run; send after the Developer reports): independently verify the combo gates 1 to 8 and the frozen lists under Amendment A-V15 (`docs/oracle/contracts/vector-trial-2026-11.md` §10) using the Developer's output, and confirm the amended run changed no constant, weight or switch behaviour (off equals F2) and shows original and amended results side by side. Done when: your report states pass or fail for each hard check, lists the soft rank results (completes in top 30; Wilhelt pieces' places), and flags anything that was tuned or hidden; no database writes, sealed key not opened.

## Summary for the owner
Every hard check passes under the new rules, and nothing was quietly tuned: the only code that changed is the test runner, not the ranking itself. With the combo feature switched off, the list is identical to the plain list. The honest weak spot is unchanged: cards that appear only because of a combo often sit low. For Mendicant only 60% of the key combo cards reach the top 30 (target 80%). This is reported, not fixed, as the amendment says. Nothing needs your decision from this check.

## Changed files
- `docs/oracle/reports/2026-11-06-tester-v15-rerun.md` — this report (no other files touched)

## Hard checks (pass/fail)
Re-run by me, not just read: both the original rules and the amended rules were re-run against the database (read-only) and the output files came out byte-identical to the committed ones (git shows no changes).

| Check | Original | Amended |
|---|---|---|
| Gates 1, 2, 5, 7, 8, W1/W2/M1 | PASS | PASS |
| Wilhelt L-cmd top 5, listed with right label | FAIL | PASS 19/19 (1 excluded by seed) |
| Mendicant L-cmd top 5 | FAIL | PASS 10/10 |
| Wilhelt L-deck fixture 1 (completes) | FAIL | PASS (top 30 hard) |
| Wilhelt L-deck fixture 2 (1 piece away, names missing card) | FAIL | PASS |
| Mendicant L-deck fixture 1 | PASS | PASS |
| Mendicant L-deck fixture 2 | FAIL | PASS |
| 5-piece, template, L-negative i/ii/iii, L-cross | PASS | PASS |
| Gate 3 (ownership) and gate 4 (look-alike traps) | not run | not run (no ownership data offline; sealed key not opened) |

Original and amended are shown side by side above and in the Developer report. The original run still exits with 5 FAIL, so the first result was not hidden or overwritten.

## Soft rank results (reported, not tuned)
- Wilhelt L-cmd, in top 30: top 5 combos 17/19 = 89% (target 80%, met). Top 10 combos 32/45 = 71%.
- **Mendicant L-cmd, in top 30: top 5 combos 6/10 = 60%; top 10 combos 8/20 = 40%. Below the 80% target. Reported as a known limit per A-V15 item 6; no weight or cut-off was changed.**
- W1 "completes": Carrion Feeder rank 1 of 313, Poppet Stitcher rank 1 of 314. W2 Poppet Stitcher rank 1 of 321. No W1 completes above 30, so nothing goes back to Gene under item 7. W2 Carrion Feeder excluded by seed (noted in output, not a failure).
- Mendicant completes: Urza rank 1, Worldwalker Helm rank 5.
- Wilhelt pieces' places (W1 / W2): Poppet Stitcher 1 / 1; Carrion Feeder 2 / excluded by seed; Shambling Ghast 10 / 2; Ashnod's Altar 6 / 5; Phyrexian Altar 7 / 4; Altar of Dementia 17 / 9; Viscera Seer 41 / 36 (outside 30).
- Fixture 2 (one piece away): Ashnod's Altar 6 / 5; Pitiless Plunderer 48 (outside 30, soft) / 15. Mendicant: Worldwalker Helm 4, Urza 1.
- Mendicant top 5 pieces: Urza 1, Worldwalker Helm 4, Scrap Trawler 9, Sensei's Divining Top 25, Krark-Clan Ironworks 28, Myr Retriever 31, Ashnod's Altar 34.
- 31 pieces are marked "outside top 30" in the output; every rank is printed.

## Was anything tuned or hidden?
- No tuning found. Between the first V-15 commit and now, the only code changes are two runner scripts (`trial/vector/run-combo-arm.ts`, `run-retrieval.ts`). The ranking code and constants (`RRF_K` 60, `COMBO_CAP` 20, tiers, credit text) are untouched [Confirmed: git diff a046c70..HEAD, no change to `trial/vector/combo-arm.ts` or `retrieval.ts`].
- The new rules do change what is measured (empty-deck base, anchored tier 2, top 30 instead of top 10). That is the signed amendment A-V15, not a quiet change, and the old results are kept.
- Off switch: for all three lists the "off" list has no combo labels and matches the plain fused list exactly (same cards, same order, 257/265/276 cards), under both rule sets. Gate 8 passes. (The 86/84/93-row F2 file is the shortened display list; the fused list is the full one.)
- Credit: Spellbook credit is present in output and the label facts gate 5 passes. Infinite-combo hold-back: the switch gate (which receives the set of infinite-labelled cards) passes on all three lists. I did not separately inspect the "unknown" state wording beyond gate pass.
- Rank correctness: ranks in every on-list CSV run 1..N with no gaps, in both rule sets.
- Both runs (original and amended) used only read queries. No writes, no push, sealed key not opened.

## Things to flag to Gene
- Mendicant soft top-30 rate of 60% / 40% is below target. Per A-V15 item 5 it carries into §5.2 grading; Gene to confirm that is acceptable.
- Cosmetic: in Wilhelt fixture 2 the Ashnod's Altar label shows the other combo's link (796-1762-2034, still needs Poppet Stitcher) rather than the planted combo's. It is a valid combo and names a real missing card, so the check passes, but the owner may find it a surprising example.
- Hard checks only prove "listed with the right label" for L-cmd; for several Wilhelt/Mendicant combo-only cards, placement is 30th to 63rd (e.g. Wilhelt Pitiless Plunderer 48 / 60, Mendicant Ugin's Nexus 45). A-V15 item 6 expects this.

## New decisions made (need owner confirmation)
- none

## Assumptions
- Byte-identical reproduction of the committed outputs counts as confirming the Developer's numbers.

## Challenges to locked decisions
- none (D-003, D-009, D-012 not touched; trial code only)

## Open questions
- Is the Mendicant soft shortfall acceptable as a known limit?

## Verification
- `COMBO_AMENDED=1 npx tsx trial/vector/run-combo-arm.ts` — exit 0, ALL PASS, outputs identical to committed.
- `npx tsx trial/vector/run-combo-arm.ts` — exit 2 (5 FAIL, original rules), outputs identical to committed.
- `npx vitest run trial/vector` — 6 files, 110 tests passed.
- `npm run typecheck` — no errors.
- `npx eslint` on the two changed runner files — no findings. Full `npm run lint` and the wider `npm test` were not run (change is limited to trial scripts).
- Off-list versus fused-list comparison and rank-sequence check done by script on the CSVs — all match.
- No endpoints changed; no UI states in scope.
