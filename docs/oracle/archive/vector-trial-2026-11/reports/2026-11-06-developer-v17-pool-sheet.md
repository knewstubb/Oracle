# Report: V-17 evaluation pool, blind sheet, sealed key, scoring tool
Role: Developer
Status: DONE
Task as received: Task V-17: build the evaluation pool for W1, W2 and M1, the blind grading sheet and the separate sealed key, and the scoring script, following contract `vector-trial-2026-11.md` §5.2, §5.3 and §10 and `vector-trial-grading-sheet-format.md`; combos use the amended rules, and the sheet carries no arm, rank, score, EDHREC, build-source or combo hint. Done when: the sheet (about 230 rows, shuffled, no section column), the sealed key (kept apart, hash recorded), the 10 randomised A/B comparisons and a scoring script with a small hand-worked test all exist and the report names their paths.

## Summary for the owner
The list of cards you will grade is ready: 205 cards across the three decks, shuffled, with nothing on the page saying how any card was found. There is also a separate sheet of 10 side-by-side comparisons (two lists of ten cards each, you pick one) and a tool that will score your answers once you are done. The answer key is stored apart and is not opened until all grades are in. Nothing needs deciding now; the count is a little under the "about 230" estimate because the combo-only allowance was not fully used.

## Changed files
- `trial/vector/sheet/grading-sheet.csv` — the blind sheet, 205 rows (W1 81, W2 56, M1 68), columns exactly as the format contract; no section column.
- `trial/vector/sheet/grading-sheet.md` — same rows with the header and one plain-words context block per list.
- `trial/vector/sheet/ab-comparisons.md` — the 10 blind A/B situations (no drafts, no arm names).
- `trial/vector/sheet/ab-answer-form.csv` — empty answer form for the 10 comparisons.
- `trial/vector/sealed/result-key.json` — sealed result key (row to card, sources, ranks, trap and flip slots, shuffle seed, A/B mapping, input hashes). **Untracked and git-ignored on purpose** (format contract: key and seed are committed with the results, never before). Do not open it before grades are final.
- `trial/vector/sealed/result-key.sha256` — the hash of the key (hash only).
- `trial/vector/build-pool-sheet.ts` — builder (reads local files only; no database, no network, no write anywhere but the files above).
- `trial/vector/pool-sheet-lib.ts` — the earlier partial file from the crashed run: reviewed (below) and reused unchanged.
- `trial/vector/ab-lib.ts` — A/B situation builder and formatter.
- `trial/vector/score-lib.ts`, `trial/vector/score-grades.ts` — scoring functions and the runner.
- `trial/vector/score-grades.test.ts` — 13 tests including a hand-worked nDCG example.
- `.gitignore` — ignores the sealed result key file.

## Key facts (paths and hash)
- Sealed key: `trial/vector/sealed/result-key.json`, SHA-256 `5054e01bc6c7dc76a6e2d8bb3646aac4e55e21eca217ca4e84784a793771d5ff` (also in `trial/vector/sealed/result-key.sha256`). Sheet id `vy4lclxd`.
- Freeze file unchanged; existing gold key (hash `04d1f847…3862`) read by the builder only, never printed; its file hash was re-checked after the run and still equals the freeze value (no edit made to it).
- Scryfall snapshot re-downloaded from the dated URL; the .gz SHA-256 equals the freeze value `49563a2d…bf82`. Legality and identity were checked against it.

## How the pool was built
- Inputs: B1, B2, V and F2 from `trial/vector/output/`, F3 (combos on, amended rules) from `trial/vector/output-combo-amended/`. No-deck seed lists, as frozen.
- Per list: union of each arm's top 10 plus F3's top 20 plus up to 8 combo-only cards (best F3 rank first), duplicates merged (§5.2). Combo-only cards are ordinary rows.
- Added: the 12 deck-dependent cards in each of the 3 lists (36 rows); 20 trap rows (10 per commander, in the commander's first list: W1, M1); the 6 Wilhelt-only contrast cards in both W1 and W2 (12 rows, the 12 deck-dependent cards already cover the other flip rows); 22 multi-feature rows (one per named feature, freeze §7).
- Counts by real source (a row can have several; key only): pool 100, combo-only 23, deck-dependent 36, trap 20, flip 12, multi-feature 22.
- Legality gate on every slot (legal in Commander, inside the asking commander's identity; deck-dependent inside both): 0 replacements needed, so no reserve was used.
- Shuffle: rows of each list shuffled with a seed that exists only in the key; row ids assigned after shuffling.

## Review of the earlier partial file `pool-sheet-lib.ts`
Reviewed line by line; kept as is. Checked: seeded shuffle is deterministic and needs canonical input order (the builder sorts first); CSV writer/reader round-trips commas, quotes and newlines (tested); pool union matches §5.2 (tested); card text is plain type line, cost, rules text, P/T, both faces for two-faced cards, with no set, price, ownership or EDHREC data. Arm labels live only in key-bound fields.

## Blind A/B comparisons
10 situations (W1 4, W2 3, M1 3 target, topped up from any list when one could not fill its share). Each compares the first 10 F3 cards against the first 10 F2 cards after the same plain-words restriction (for example "only creatures"). Chosen by a fixed priority order and a rule that the two lists differ by at least 2 cards, never by grades (none exist). A/B side and card order within a list are random; the mapping is in the key. No combo labels, no ranks.

## Scoring tool
`npx tsx trial/vector/score-grades.ts --grades <graded sheet csv> [--ab form.csv] [--drafts drafts.csv] [--staples ids.txt] [--out file]`. It reports per list and arm nDCG@10 and precision@10, F3 minus B1 and F3 minus F2, novel finds (combo-only separate), combo-only cards graded 2+, W1/W2 top-20 overlap, trap hits by slot id (unexposed first, exposed beside, the low-confidence one apart), flip and deck-dependent pair ordering (unexposed contrast cards separately, fewer than 8 pairs means inconclusive), blind preference, and the owner's edit rate against drafts. It refuses to run if any row is ungraded.

## New decisions made (need owner confirmation)
- Multi-feature rows are one per feature, no extra "overall" row (an overall question for the shared cards is already covered by their deck-dependent rows).
- The 6 shared multi-feature cards were assigned to one commander's first list: Rhystic Study, Skullclamp, Mind Stone, Ashnod's Altar to W1; Sai, Scrap Trawler to M1. Commander-level check, so the list choice does not change the question.
- A/B "situations" are plain restrictions of the no-deck lists (creatures only, cheap only and so on), because no deck-state data exists for lists like "no sacrifice outlets yet".

## Assumptions
- "Stored build list" for novel finds is the B1 list file for that build (after legality and identity filters).
- nDCG gain is the grade itself; the ideal is the best 10 grades among rows an arm or the combo arm surfaced.
- Specificity needs the staple set (freeze §4: top 50 of at least 25% of stored builds), which needs the database; the scorer takes it via `--staples` and reports "not computed" without it. Not built here (read-only DB access was not needed for V-17).
- Control cards (freeze §8) are checked mechanically on rankings, so they carry no grade rows.
- The sheet is 205 rows, not 230: Mendicant gains few combo-only cards (23 in total, allowance was 24), and the pool union overlaps heavily.

## Challenges to locked decisions
none

## Open questions
- Gene: should the sealed result key be committed now, or only with the results as the format contract says? I followed the contract (kept untracked, hash recorded). If the worktree is lost, the key is lost; it can be regenerated only with the same seed (printed nowhere owner-facing; in the key).
- The staple set still needs to be computed for specificity (a read-only query).

## Verification
- `npx vitest --run trial/vector/score-grades.test.ts` — 13 passed, including the hand-worked nDCG (0.73338) and pair-ordering cases.
- `npx tsc --noEmit` — no errors in the new files.
- Builder run — 205 rows, 10 A/B situations, 0 replacements; sheet inspected: columns and header per the format, no section column, no arm, rank or combo text.
- Scorer smoke run with synthetic made-up grades (deleted afterwards; no result recorded) — runs end to end.
- Process note: one small edit to `ab-lib.ts` (the top-up pass) was applied with a script instead of the edit tool; the file was reviewed afterwards.
