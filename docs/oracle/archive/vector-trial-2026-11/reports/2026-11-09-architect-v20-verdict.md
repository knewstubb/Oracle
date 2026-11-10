# Report: v20-verdict
Role: Architect
Status: DONE (verdict reached; two checks could not be scored, stated below)
Task as received: V-20: compute the staple set read-only if feasible; run the scorer with the V-18 drafts for edit rate; score every arm per the contract (nDCG@10 delta vs EDHREC inclusion, precision@10, novel finds per commander, A/B tally, traps, deck-dependent, multi-feature, flip, combo incl. the Mendicant soft top-30); apply the signed go/stop bar exactly; note low statistical power; include the owner's note on comparison 2; read-only DB, no push; commit results, scores, report and the result key.

## Summary for the owner
**The trial did not earn a "go", and it did not hit the "stop" line either; it sits in between, narrowly.** The new suggestion list beat the plain "most popular cards in this build" list by a small margin for the Zombies and Aristocrats builds, but not enough to count, and it barely helped for Mendicant. You also preferred the new list over the previous design in only 4 of 10 side-by-sides. The sample is very small (three lists, one grader, and nine of the ten comparisons differed by only two cards), so this is a hint, not proof either way.

What you would see in the assistant: asking for Wilhelt Zombies ideas, today's popularity list already gives ten cards you rate as "would play" or better (10 of 10). The new list gives 9 of 10, with a couple of cards swapped. For example it adds Phyrexian Altar and Altar of Dementia higher up (you liked those) and drops cards like Open the Graves (you graded it 3). Its real new strength is the combo notes: a card can say "one piece away from an infinite combo (credit: Commander Spellbook)", and 14 of the 23 cards that only the combo signal found were ones you would play.

## Options (recommendation first)
1. **Recommended: park the "meaning-based" suggestions; keep today's popularity-based suggestions; take only the combo notes forward as their own small feature.** You would see no change to the ranking in the assistant, plus (later, if you want it) combo notes on cards with a per-deck switch. Trade-off: you give up a possible upside from the meaning-based list, which this small test could neither confirm nor rule out.
2. **Use the one allowed retry:** rerun on a second, different meaning model against the same graded cards, with more lists and more situations where the two lists really differ. You would see a clearer answer in a few days of agent time plus another grading session from you. Trade-off: another round of your time, and the same small-sample limits unless the test is widened.
3. **Build it anyway.** Not supported by this evidence: it missed the improvement bar on all three lists and you preferred it in 4 of 10 comparisons.

## 1. Go/stop bar, applied as signed (contract §5.4)
nDCG@10 is the "how well-ordered are the first ten" score; precision@10 is the share of the first ten you graded 2 or 3. B1 is EDHREC inclusion order for the build, the signed baseline. Arm key (sealed result key): B1 EDHREC inclusion (F1 in the harness), B2 EDHREC synergy, V vector only, F2 vector + EDHREC fused, F3 F2 + combos (the candidate).

| List | B1 | B2 | V | F2 | F3 | F3 − B1 (need ≥ +0.10) | F3 precision@10 (need ≥ 0.70) | Novel finds, F3 top-20 (need ≥ 3) |
|---|---|---|---|---|---|---|---|---|
| W1 Wilhelt Zombies | 0.851 | 0.851 | 0.588 | 0.903 | 0.907 | **+0.056** fail | 0.90 pass | **0** fail |
| W2 Wilhelt Aristocrats | 0.730 | 0.789 | 0.555 | 0.802 | 0.822 | **+0.093** fail | 0.90 pass | **2** fail (Graf Harvest, Diregraf Horde) |
| M1 Mendicant Artifacts | 0.865 | 0.905 | 0.755 | 0.759 | 0.882 | **+0.017** fail | 0.90 pass | **1** fail (Starting Column) |

Precision@10 by arm (W1 / W2 / M1): B1 1.0 / 0.8 / 0.9; B2 1.0 / 0.8 / 0.9; V 0.7 / 0.5 / 0.9; F2 0.9 / 0.9 / 0.8; F3 0.9 / 0.9 / 0.9. Novel finds per commander: Wilhelt 2 (W1 0 + W2 2), Mendicant 1. Combo-only cards are counted separately (see §4), and one combo-only card (Sensei's Divining Top, graded 2) sat in M1's top 20 and is not counted as a novel find.

| Go condition | Result |
|---|---|
| F3 − B1 ≥ +0.10 on each list | **Fail** (all three lists) |
| F3 precision@10 ≥ 0.70 on each list | Pass |
| ≥ 3 novel finds per list | **Fail** (0, 2, 1) |
| Specificity ≥ 50% on every list | **Not computed** (see §7); cannot be shown |
| Owner prefers F3 in ≥ 7 of 10 | **Fail** (4 of 10) |
| Combo harm: F3 within 0.02 of F2 or better | Pass (+0.004, +0.021, +0.124) |
| Build direction: pair ordering ≥ 75% | **Inconclusive** (0 usable pairs; see §5) |

**Go: not met.** **Stop: not triggered.** The stop line is "F3 fails to beat B1 by ≥ 0.05 on at least two of the three lists". F3 clears 0.05 on two lists (W1 +0.056, W2 +0.093) and misses on M1 (+0.017), and V does not return mostly look-alike traps. The pass on W1 is by 0.006, so this is a narrow miss of stop, not a win. Mean F3 − B1 across the three lists is +0.055. Read against B2 (EDHREC synergy order, not the signed baseline): F3 − B2 is +0.056, +0.034, −0.023, so against the stronger popularity baseline F3 is level or worse on two of three lists. Vector only (V) loses to both baselines on every list.

**Verdict under the contract: "Iterate" (meets some but not all), with a recommendation not to build.** Per §5.4, one retry is allowed (model option 2, same graded set); the fallback is "record the result; keep option A (assessment) as the path".

### Statistical power: what this cannot tell us
- 3 lists, and W1 and W2 share a commander (same card pool, about 59% shared top cards), so they are not independent samples.
- One grader (the owner), who saw the V-18 draft grades and changed 43% of them (§3), so grading may lean on the drafts; the A/B comparisons were judged fresh, without drafts.
- 9 of the 10 blind comparisons differ by only 2 cards out of 10 (comparison 8, Mendicant, differs by 4). A 4-of-10 tally on near-identical lists is close to noise, and 7 of 10 was the bar, so it counts as a fail but says little about how much better or worse the lists really are.
- nDCG differences of 0.05 correspond to about one card moving a place or being graded one point differently. The pool the ideal ranking is drawn from is itself built from the arms' own top cards (about 40 per list), which favours the popularity lists, since EDHREC cards are guaranteed to be in the pool.
- Only 13.7% of pool cards carry any agreed tag (V-12), and no tagged arm was produced.

This is directional evidence from a small test. It does not show that meaning-based suggestions are bad, only that this test found no reliable improvement over popularity.

## 2. Blind A/B (F3 vs F2, owner answers, no drafts)
Tally: **F3 preferred 4, F2 preferred 6.** F3 won comparisons 1, 2, 8, 9; F2 won 3, 4, 5, 6, 7, 10.
- In the 9 close comparisons the only differences were two cards: F3 brought in combo-boosted cards: the altars (Phyrexian Altar graded 3, Altar of Dementia graded 2) in 7 of them, Blasting Station (3) in two, and in the Mendicant ones Krark-Clan Ironworks (2) and others. F2's different cards were often strong too (Open the Graves 3, Endless Ranks of the Dead 3, Empty the Laboratory 3, Unstoppable Slasher 3, Gleaming Overseer 3), which is why the owner often preferred F2.
- **Owner's one note, comparison 2 (Wilhelt Aristocrats, no restriction):** "B: altars, A has no outlets". The owner picked B, which was the F3 list; the note says the reason was the sacrifice outlets (the two altars), which are exactly what the combo signal added. That is the one place the owner explained a preference, and it supports the combo signal, not the vector.

## 3. Owner edit rate against V-18 drafts
Of 205 drafted grades the owner changed **88 (42.9%)**; mean absolute change 0.45 grade points. 58 raised, 30 lowered. Drafts averaged 1.76; the owner's final grades averaged 1.90. Most common changes: 1 to 2 (26), 2 to 3 (25), 3 to 2 (17). Edit rate by list: W1 43 of 81, W2 22 of 56, M1 23 of 68. A rate this high means the drafts were a loose first guess (too stingy), not that they anchored the owner; it changes no gate (§5.2 rule 3). Note: the scorer reads a column called `grade`, the V-18 file calls it `draft_grade`, so the main scorer's own edit-rate line shows 0 rows; the figure above comes from the supplementary scorer. I did not verify the V-18 drafter was a fresh session (Gene's check, A-V15 point 8).

## 4. Combo results
- **Combo harm:** F3 − F2 = +0.004 (W1), +0.021 (W2), +0.124 (M1). No harm; on Mendicant F3 recovers what F2 lost.
- **Combo-only cards** (surfaced only by the combo arm, graded by the owner): graded 2+ in 6 of 8 (W1), 6 of 7 (W2), 2 of 8 (M1), 14 of 23 total. Weak on Mendicant.
- **Hard gates 1, 2, 5, 7, 8 and L-cmd / L-deck / L-negative / L-label / L-cross all pass** [Confirmed: trial/vector/output-combo-amended/gates.txt]. Gate 4 (traps) passes (§6).
- **Mendicant soft top-30 limit (known, A-V15 point 6):** hard part passes: all 10 non-commander pieces of its top 5 combos are listed with the right label. Soft rank target (≥ 80% in the top 30) is **missed: 6 of 10 = 60%** (top 10 combos: 8 of 20 = 40%). The four misses are all just outside: Myr Retriever 31, Ashnod's Altar 34 (each appears in two combos). Wilhelt's soft top-30 passes (17 of 19 = 89%; top 10 combos 32 of 45 = 71%, misses at ranks 36 to 63, such as Viscera Seer at 41 and Blasting Station at 45 in W1). L-deck fixtures: the planted "completes" piece ranks in the top 30 for both commanders (Mendicant ranks 1 and 5). Per the amendment these misses are a recorded limit; constants were not changed.

## 5. Deck-dependent, flip, multi-feature, controls
- **Flip check (W1 vs W2, F3):** **inconclusive.** 18 cards were graded in both builds; **0 pairs differ by 2 or more grades** (minimum is 8); only 6 differ by even 1. The owner graded the two Wilhelt builds almost identically, so per-build direction could not be tested. Unexposed contrast picks (3): also 0 pairs. Build separation (F3 top-20 overlap W1/W2) is 70%, inside the 30 to 80% band.
- **Deck-dependent across commanders (F2, owner grades 2+ apart):** W1 vs M1: 2 of 6 ordered correctly (33%); W2 vs M1: 2 of 7 (29%); bar is 75%. Caveat: in 4 of 6 and 5 of 7 pairs the card was in neither list at all (the scorer counts that as wrong). Examples that did work: Sai, Master Thopterist (graded 0 for Wilhelt, 3 for Mendicant) ranks 13th for Mendicant and is absent for Wilhelt. Recorded as a known limit (§5.6).
- **Controls (5 staple mana rocks should stay in the top 30 in both Wilhelt builds):** **fail.** Arcane Signet, Talisman of Dominance, Fellwar Stone and Thought Vessel are absent from the W1 and W2 F3 lists; Mind Stone is 161st in W1 and absent from W2. Per §5.8 a control failure suggests the lists squeeze out universal staples; here the likely cause is that the stored EDHREC lists (top 150) do not hold them for these builds and the vector list does not return them.
- **Multi-feature (§5.5):** the per-feature merged arm and the single-query arm were never built, so "merged beats single by 0.05" cannot be scored; reported as **not run**. The 22 multi-feature rows are graded and stored in the scores-extra file. Four owner notes say "the commander itself is in the pool"; those rows are the commander's own multi-feature test rows by design, not arm output, and gate 2 (commander excluded) passes on every arm.
- **Tag A/B (§5.1):** **not run.** Tagged embeddings were loaded (V-12) but no tagged retrieval or tagged lists were produced or graded, so there is no tagged vs base comparison. By the §5.1 rule (kept only if tagged beats base by ≥ 0.03), tags are not kept; with 13.7% coverage this says nothing about whether tags are useful.
- **Build seed no-harm (commander-alone vs build seed):** not run (no commander-alone lists were graded).

## 6. Traps
Computed on the **10 unexposed traps first** (5 per commander): **none** appears in any arm's top 10 on any list (B1, B2, V, F2, F3). The 10 **exposed** traps: none either. One exposed trap flagged low confidence (W-T01) appears in vector-only's top 10 on W1 and W2 and is reported apart. Gate 4 passes; "V returns mostly look-alike traps" is not met, so no stop on that count. Owner grades of the traps: unexposed mean 1.1 (2 of 10 graded 2+), exposed mean 0.9 (2 of 10 graded 2+): they are look-alikes, not worthless cards.

## 7. Staple set and specificity
**Not computed.** Freeze item 4 defines a staple as a card in the top 50 of at least 25% of all stored builds that have card data. Read-only check of the live tables [Confirmed: select count on ref_commander_builds and ref_build_cards]: 1,885 builds exist, but **only 3 hold card data (450 rows, the three trial builds)**; the full card sync was deliberately not run. Applying 25% to 3 builds would make any card in one build's top 50 a "staple", which is not what the freeze meant, and I did not invent a different threshold. Specificity (≥ 50% on every list) therefore cannot be shown, and the go bar cannot be fully met on this evidence.

## Changed files
- trial/vector/results/grading-sheet-graded.csv, trial/vector/results/ab-answers.csv — owner grades and A/B answers (committed)
- trial/vector/results/scores.json — main scorer output (note: edit-rate line empty because of the draft column name)
- trial/vector/results/scores-extra.json — supplementary scores (edit rate, per-arm unrounded, traps, flips, deck-dependent, A/B detail)
- trial/vector/score-extra.ts — the supplementary scorer
- trial/vector/sealed/result-key.json and result-key.sha256 — sealed result key, committed with the results (force-added, the path is git-ignored); hash matches the stored sha256 file (5054e01b…)
- docs/oracle/reports/2026-11-09-architect-v20-verdict.md — this report

## New decisions made (need owner confirmation)
- Verdict recorded as "iterate, recommend park", with option 1 recommended. The owner decides.

## Assumptions
- "Fused" in the A/B is F3 versus F2, as built in V-17 (not versus the EDHREC list).
- Go bar applied per list (the contract), not on the average.
- The gold key was not opened; the result key already carried the trap and flip identities.

## Challenges to locked decisions
- none

## Open questions
- Do you want the combo notes (Commander Spellbook credit, per-deck switch) as a separate small feature?
- Was the V-18 drafter a fresh session? (Gene's check; not done here.)

## Verification
- `shasum -a 256 trial/vector/sealed/result-key.json` equals result-key.sha256 — match.
- `npx tsx trial/vector/score-grades.ts --grades results/grading-sheet-graded.csv --ab ... --drafts ... --out results/scores.json` — ran, 205 rows.
- `npx tsx trial/vector/score-extra.ts ...` — ran.
- Read-only select counts on ref_commander_builds (1,885) and ref_build_cards (450) — no writes; nothing pushed.
