# Report: V-17 sheet integrity and scoring tool (T-6, T-7)
Role: Tester
Status: PARTIAL
Task as received: Worktree /Users/bradknewstubb/Developer/Personal/oracle_app-trial-clean (branch trial/vector-clean). Check the 205-card sheet and 10 A/B comparisons: no leaks (no arm info, trap/section hints, order patterns, no trap names in owner-facing files), shuffle looks unbiased, card text correct and legal/in colour, no deck cards or basics, duplicates handled, key hash matches, scoring tool correct on an independent hand-worked example (nDCG@10, precision@10, novel finds, A/B tally). Open the sealed key only if the role file permits. Advise whether a backup of the uncommitted result key outside git (not shared) is wise. Read-only, no DB writes, no push.

## Summary for the owner
The card list you will grade and the 10 side-by-side comparisons passed every check I could run without the answer key: no hints about how a card was found, every card is legal and inside the deck's colours, no basic lands, text matches Scryfall exactly. The scoring tool gave the same numbers as my own hand calculation. Two things could not be checked because my role does not allow opening the answer key: whether the shuffle is fair for the hidden trap and flip cards, and whether any trap card's name appears in files you can read. Yes, keep a private backup copy of the answer key outside the project, and never share it.

## Changed files
- docs/oracle/reports/2026-11-06-tester-v17-sheet.md — this report. Nothing else touched; no database access; no network except re-downloading the public dated Scryfall file to /tmp.

## Not done, and why
My role files do not permit opening the sealed result key or the gold key, and the handoff says it stays closed until grades are final. I did not open or print either (I only hashed them). So **not checked**: (a) per-row shuffle bias by real source, (b) trap and flip card names against owner-facing files, (c) that "sample 10 cards match the key", (d) the key's own contents (seed, mapping, 34 slots). Gene or the owner can permit a mechanical count-only check later; see Open questions.

## Results (pass/fail)
| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Sheet shape: 205 rows (W1 81, W2 56, M1 68), columns exactly as the format contract, no section column, ids G-0001 to G-0205 in order, grade and note empty | PASS | independent Python read of the CSV |
| 2 | CSV and markdown copies identical (205 rows each) | PASS | parsed both, compared |
| 3 | No leak words (arm names, F1 to F3, B1/B2, EDHREC, combo, Spellbook, trap, score, seed, synergy, sealed, gold, slot ids) in sheet, A/B file or answer form | PASS | only hits are card names containing "Rank" (Rank Officer, Endless Ranks of the Dead) and the contract's own "Not derived from EDHREC" header line |
| 4 | Card text is correct: every row's text re-built from the dated Scryfall snapshot (hash `49563a2d…bf82` re-verified) in the contract's layout | PASS, 205 of 205 identical | own re-implementation, not the Developer's code |
| 5 | Legal in Commander, inside the asking commander's colours (W1/W2: blue and black; M1: white and blue) | PASS, 0 failures | snapshot legality and colour identity |
| 6 | No basic lands | PASS, 0 | type line and name |
| 7 | No deck cards in the pool | PASS with note | 25 rows name a card on the fixture mainboards, and every one is a deliberate deck-dependent or multi-feature card from freeze §6/§7 (for example Sol Ring, Skullclamp, the two commanders). No other mainboard card appears. Maybeboard cards (for example Midnight Reaper) are allowed |
| 8 | Duplicates handled | PASS | the only repeated (card, list) pairs are the 10 multi-feature cards, each repeat carries a different feature question; no exact duplicate rows. 51 cards appear in more than one list, which is intended (one row per card per list) |
| 9 | Order: three lists in blocks W1, W2, M1; no alphabetical order (share of ascending neighbours 0.47, 0.51, 0.54, expected 0.5); no type or text-length trend between first and second half | PASS | statistics on the visible rows |
| 10 | Known-card positions: the 12 deck-dependent cards sit at mean relative position 0.48, 0.60, 0.59 (W1, W2, M1); feature rows 0.54 and 0.46 | PASS (looks random) | well inside chance for samples of this size |
| 11 | Sheet hashes: result key file hash equals its recorded hash `5054e01b…d5ff`; gold key hash equals the freeze value `04d1f847…3862`; Scryfall file hash equals the freeze value | PASS | `shasum -a 256`. The new result key cannot appear in the freeze file (written later); the freeze pins the gold key only |
| 12 | A/B: 10 situations, two lists of 10 each, no duplicates in a list, all cards legal and in colour, text correct, no arm or rank text, side and card order differ between A and B | PASS | same independent rebuild |
| 13 | A/B plain-words restrictions hold (creatures only, cheap means value 3 or less and no lands, and so on) | PASS, 0 violations | checked against the snapshot |
| 14 | Scoring tool vs hand-worked example (see below) | PASS | all values equal |
| 15 | `npx vitest --run trial/vector/score-grades.test.ts` | PASS, 13 of 13 | |
| 16 | Result key not tracked by git; hash file tracked | PASS | `git check-ignore`, `git ls-files` |

## Scoring tool: independent worked example (T-7)
I built a synthetic key and graded sheet in a temp folder (never the real key), ran the real runner against it, and compared with hand arithmetic.
- Pool grades for one list: 3,3,3,3,2,2,2,2,1,1 and zeros (one of the 2s is a combo-only card). F3 top 10 graded 2,3,0,1,3,0,2,0,0,1.
- Hand: DCG = 2 + 3/log2(3) + 1/log2(5) + 3/log2(6) + 2/log2(8) + 1/log2(11) = 6.4398. Ideal = 11.0586. nDCG@10 = 0.5823. Tool: 0.582. Match.
- B1 graded 3,3,3,3,2,2,2,1,1,0 → hand 10.4541 / 11.0586 = 0.9453; tool 0.945. F3 minus B1 = −0.363, tool −0.363. Combo harm (F3 minus F2) 0 as set up. Match.
- Precision@10: F3 4 of 10 = 0.4, B1 7 of 10 = 0.7. Match.
- Novel finds (F3 top 20, not combo-only, not in stored build, graded 2 or more): 4 by hand, tool 4; combo-only graded 2 or more "1 of 1". Match.
- Pair ordering: 10 pairs, 9 with a gap of 2 or more, 6 ranked correctly (null rank counts as worse, a tie counts as wrong) → 6 of 9; tool 6 of 9. Cards unranked or tied behave as stated. Match. The across-commander version also matches.
- A/B tally: 10 answers, mapping hand-set, F3 preferred 6; tool "answered 10, prefers_f3 6". Match.
- Edit rate against drafts: draft 3,1,2,0 vs final 3,3,3,2 → 3 changed (75%), mean change 1.25; tool the same.
- Trap slot report: unexposed, exposed and the low-confidence slot are separated as intended.
- Refuses to run with ungraded rows: confirmed (error names the count).

## Findings for Gene (none blocking; fix before the owner grades if cheap)
1. **Low: the 12 deck-dependent cards are identifiable.** They are exactly the 12 cards that appear in all three lists (W1, W2 and M1), and a repeated card with one blank feature question and others with feature text marks the multi-feature cards. This follows the format contract (one row per card per list), and the owner already knows these by design; trap and flip contrast rows are not exposed this way. Accept, but note the owner can infer it.
2. **Low: the sheet states which commander plus build** (required context), so build-contrast cards in W1 and W2 can be spotted by someone who knows the freeze file. Same as above, by design.
3. **Weak A/B test power.** Nine of the 10 situations differ by exactly 2 cards between the two lists (one by 4); the other 8 cards are the same in both, only reordered. With 10 picks the 7-of-10 rule will rest on very small differences, and "no preference" is likely. Consider stating this in the verdict, or widening the lists (for example compare top 20).
4. **A/B mix is 4 W1, 4 W2, 2 M1** against the target 4/3/3 (top-up from another list, as the Developer said). Mendicant has the least evidence.
5. **Scorer, minor:** (a) with fewer than 8 eligible pair-ordering pairs it still prints a rate; "inconclusive" is only a text note, so a reader could miss it. (b) A grade row whose row_id is not in the key is silently ignored (it only refuses ungraded key rows). (c) `readGrades` uses the header position without checking the column exists. (d) Specificity needs a staples file that does not exist yet (the Developer flagged it). (e) The trap report counts slots in the top 10 only; it does not use the owner's grade of the trap row, which matches contract §5.4 gate 4. None changed anything in my example.
6. **Sealed gold key is tracked in git** (`trial/vector/sealed/gold-key.json`, committed in earlier slices), so trap and contrast names are readable by anyone running a git or file command on the branch. This predates V-17 but matters for V-18: the drafter session must be told not to read the sealed folder, the output folders or git history, and Gene should confirm that in the drafter's report.
7. Row count 205, not the estimated 230; the Developer reported why.

## Backup of the result key (advice)
Yes, make one. The result key is git-ignored and exists only in this worktree; it also holds the shuffle seed, and the row-to-card mapping cannot be rebuilt without it. If the worktree is deleted or cleaned, the sheet the owner has graded would be impossible to score. Recommended: one copy of the key file plus its hash file in a private folder outside the repo and outside any shared or synced-to-others location (for example a locked folder on the owner's Mac or an encrypted disk image), file readable by the owner only. Do not paste it in chat, do not put it in an agent-readable folder (the V-18 drafter must never see it), do not commit it before the results. Check the copy by comparing its hash to the recorded one. Keep the key hash in git as it is now (already committed). Gene decides the exact place; the owner does not need to do anything technical.

## New decisions made (need owner confirmation)
- none

## Assumptions
- Fixture mainboard lists stand for "the owner's deck" (the freeze file's definition); the stored build lists were not re-checked here (needs the database or the key).
- Snapshot card name matching by face name or whole name is equivalent for the two-faced cards on the sheet; text compared equal on all 205 rows.

## Challenges to locked decisions
- none

## Open questions
- Gene: may a Tester run a count-only script (no names printed) that opens the key to check shuffle bias and trap names in owner-facing files? Until then those two checks stay open. Alternatively the check can be run after grades are final, when the key is opened anyway.
- Finding 3: widen the A/B lists, or accept low power?

## Verification
- `shasum -a 256` of the result key, the gold key and the downloaded dated Scryfall file — all equal their recorded values; I did not read either key.
- Independent Python scripts (in /tmp, not committed) over the CSV, markdown and A/B file and the dated Scryfall snapshot — results in the table above.
- `npx vitest --run trial/vector/score-grades.test.ts` — 13 passed.
- Scorer run with `tsx` against a synthetic key in a temp folder — every value equals the hand calculation; refusal with ungraded rows confirmed.
- `git status` — clean before this report; the result key is not tracked.
- `npm run typecheck` and `npm run lint` not run: nothing but a report was added.
