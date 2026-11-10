# Report: V-15 combo test re-run under Amendment A-V15
Role: Developer
Status: DONE
Task as received: Task V-15 (re-run): in worktree oracle_app-trial-clean (branch trial/vector-clean), apply Amendment A-V15 in `docs/oracle/contracts/vector-trial-2026-11.md` §10 (tier 2 anchor, empty-deck base for L-cmd and L-deck, completes in top 30, print every rank, "excluded by seed" noted) and re-run the combo gates, keeping the first-run output as the "original" and writing the new output as "amended" side by side; no weight or constant changes, no database writes, no sealed key. Done when: gates, L-cmd, L-deck, L-negative, L-label and L-cross are printed for W1, W2 and M1 under both rule sets, and any W1 "completes" rank above 30 is reported to Gene with numbers instead of being tuned away. For Brad (plain words): Re-run the combo test using the rules you just approved and show the old and new results next to each other.

## Summary for the owner
Under the new rules every combo check now passes (the old run had 5 failures). A card that finishes a combo now shows up at the very top of the list (1st or 5th place, never worse than 5th), and "one piece away" cards are always shown with the right label. The one thing still weak is cards that only appear because of a combo: some sit around 30th to 60th place, which is the "listed but placed low" limit the amendment already described. Nothing needs your decision right now.

## Original vs amended, side by side
Original = the committed first run (`trial/vector/output-combo/`, reproduced byte-identical this session). Amended = `trial/vector/output-combo-amended/`. The amended lists for L-cmd and L-deck use an empty-deck base (`trial/vector/output-emptydeck/`, same pipeline, deck empty).

| Check | Original rules | Amended rules |
|---|---|---|
| Gates 1, 2, 5, 7, 8 for W1, W2, M1 | all pass | all pass |
| Wilhelt L-cmd top 5 (hard) | FAIL: 2/20 | PASS: listed with right label 19/19 (1 excluded by seed: Carrion Feeder in W2) |
| Wilhelt L-cmd, soft "in top 30" (target 80%) | not measured this way (4/46 incl. top 10 set) | top 5: 17/19 = 89%. Top 10: 32/45 = 71% |
| Mendicant L-cmd top 5 (hard) | FAIL: 1/10 | PASS: 10/10 listed with right label |
| Mendicant L-cmd, soft "in top 30" | n/a | top 5: 6/10 = 60%. Top 10: 8/20 = 40% (below the 80% target, soft) |
| Wilhelt L-deck fixture 1 (completes) | FAIL: ranks 27, 26, 18; one not listed (top 10 required) | PASS: all rank 1 (W1 Carrion Feeder 1, W1 Poppet Stitcher 1, W2 Poppet Stitcher 1; W2 Carrion Feeder excluded by seed) |
| Wilhelt L-deck fixture 2 (1 piece away) | FAIL: three not listed, one at 125 | PASS: all labelled and name the missing card. Ranks: Ashnod's Altar W1 6, W2 5; Pitiless Plunderer W1 48 (outside top 30, soft), W2 15 |
| Mendicant L-deck fixture 1 | PASS (top 10) | PASS: Worldwalker Helm rank 5, Urza rank 1 |
| Mendicant L-deck fixture 2 | FAIL: Worldwalker Helm rank 83 | PASS: Worldwalker Helm 4, Urza 1 |
| L-deck 5-piece check, template check | pass | pass |
| L-negative (i), (ii), (iii) | pass | pass (842 Wilhelt and 861 Mendicant colour-blocked cards carry no label) |
| L-label (gate 5, label facts) W1, W2, M1 | pass | pass |
| L-cross | pass | pass |
| Overall | 5 FAIL | ALL PASS |

Not run here (same as first run): gate 3 (ownership labels, no ownership data offline) and gate 4 (look-alike traps need the sealed key; not opened).

**W1 "completes" ranks above 30: none.** Both W1 "completes" cases rank 1. Nothing to return to Gene on that point.

### Every rank printed
All individual ranks (every piece, every list, both L-cmd sets) are in `trial/vector/output-combo-amended/gates.txt`. Wilhelt top 5 combos, positions in the 312-card W1 list / 318-card W2 list:
- Poppet Stitcher // Poppet Factory 1 / 1; Carrion Feeder 2 / excluded by seed; Shambling Ghast 10 / 2 (4-piece set)
- Ashnod's Altar 6 / 5; Phyrexian Altar 7 / 4; Altar of Dementia 17 / 9
- Viscera Seer 41 / 36 (outside top 30)

Mendicant top 5 (325-card list): Urza 1, Worldwalker Helm 4, Scrap Trawler 9, Sensei's Divining Top 25, Krark-Clan Ironworks 28, Myr Retriever 31, Ashnod's Altar 34.

Lowest placed in the top-10 sets: Wilhelt Pitiless Plunderer 60 (W1), Chthonian Nightmare 63/48; Mendicant Ugin's Nexus 45, Meticulous Excavation 42. This matches the amendment's expectation that combo-only cards sit around 20th to 45th and a few lower; per amendment item 6 this is reported as "correct and listed but placed low", a known limit. No cut-off or weight was widened.

## Changed files
- `trial/vector/run-retrieval.ts` — `EMPTY_DECK=1` option builds the same lists with an empty deck into `trial/vector/output-emptydeck/` (default behaviour unchanged).
- `trial/vector/run-combo-arm.ts` — `COMBO_AMENDED=1` applies A-V15 (anchor, empty-deck base, top 30, every rank printed, "excluded by seed"); default still reproduces the original run.
- `trial/vector/output-emptydeck/` — empty-deck lists (new, local files).
- `trial/vector/output-combo-amended/` — amended gates, lists and summary (new).
- `trial/vector/output-combo/` — original output, unchanged (re-run matched the committed files).
- `docs/oracle/contracts/vector-trial-2026-11.md`, `docs/oracle/status.md`, `docs/oracle/handoffs/*` — Gene's uncommitted amendment and handoff files, committed as received.
- `docs/oracle/reports/2026-11-06-developer-v15-rerun.md` — this report.

## New decisions made (need owner confirmation)
- none

## Assumptions
- The empty-deck base recomputes the seed picks with an empty deck, so the seed can differ from the fixture-deck lists. That is why Carrion Feeder is a seed for W2 on the empty base ("excluded by seed", not counted).
- Anchored labelling (A-V15 item 1) is applied to every amended list, not only L-cmd and L-deck.
- "Top 30 soft" percentages count only pieces not excluded by seed.

## Challenges to locked decisions
- none

## Open questions
- Mendicant soft top-30 rate is 60% (top 5) and 40% (top 10) against the 80% target. Amendment item 5 carries this into §5.2 grading rather than tuning; Gene to confirm that is acceptable.

## Verification
- Original run `npx tsx trial/vector/run-combo-arm.ts` — exit 2 (5 FAIL, as before); output files identical to the committed ones.
- `EMPTY_DECK=1 npx tsx trial/vector/run-retrieval.ts` — all hard gates pass on all 12 arms.
- `COMBO_AMENDED=1 npx tsx trial/vector/run-combo-arm.ts` — ALL PASS.
- Database access was read-only (select and the read-only similar-cards function). No writes, no push, sealed key not opened. No constants or weights changed.
- `npx vitest run trial/vector/combo-arm.test.ts trial/vector/retrieval.test.ts` — 52 passed.
- Strict `tsc --noEmit` on the two runner files — no errors. (The repo-wide `tsc` run was too slow and was stopped.)
