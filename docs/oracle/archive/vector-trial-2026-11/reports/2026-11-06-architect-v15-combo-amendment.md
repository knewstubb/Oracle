# Report: v15-combo-amendment
Role: Architect
Status: DONE
Task as received: Worktree oracle_app-trial-clean (branch trial/vector-clean). Developer's V-15 combo arm is built, but L-cmd fails for Wilhelt and Mendicant and L-deck fixtures 1-2 fail. Developer asks: (1) should "completes" / "1 piece away" labels require at least one piece already in the deck? (2) should frozen-list checks run on lists that do not exclude the deck's own cards? (3) is "top 10" still wanted for a "completes" card, or does it need a bigger combo weight? Decide with evidence from the report and data (read-only, no DB writes, no sealed key). Recommend a minimal contract amendment (draft for Gene to sign; do not edit decisions.md), keeping the owner's rules: Commander Spellbook credit, per-deck off switch, infinite combos held back until the deck says yes. Say whether Wilhelt can pass after the change; if not, why, and the honest fallback. Owner decision as at most 3 options, recommendation first.

## Summary for the owner
Combo suggestions will only say "1 piece away" when you already hold something from that combo, so two unrelated cards no longer label each other. A card that finishes a combo will show near the top third of the list, not necessarily the top 10, because a combo on its own is a weaker signal than a card that EDHREC and the card-similarity search both like. Wilhelt's combo cards will be listed and correctly labelled, but they will sit in the 20s to 40s of a list of about 270, not at the top. One choice for you is below.

**Example.** Your Wilhelt deck already has Poppet Stitcher and Ashnod's Altar. Carrion Feeder shows "Combo: completes" with the Commander Spellbook credit. Phyrexian Altar will no longer say "1 piece away" for Gravecrawler when your deck holds neither.

**Decision for the owner (behaviour only):** how prominent should a card that finishes a combo be?

1. **(Recommended) Visible, not pinned.** It shows the "completes" label and lands in the first 30 or so suggestions, ranked with everything else. The other combo cards are listed and labelled but may sit lower. Nothing else about ranking changes. Trade-off: a finished combo is not guaranteed to be at the very top.
2. **Pinned to the top.** A card that finishes a combo always goes first. Trade-off: you see it every time, even when you would rather see better ordinary suggestions. It is rare, and infinite combos stay hidden until you say yes for that deck.
3. **Boost all combo cards.** Combo cards rise into the top 10 generally. Trade-off: about 20 combo cards would crowd the list, and the weight would be tuned after seeing the failures, which weakens the test. Not recommended.

## Evidence (answers to the three questions)

All numbers are from `trial/vector/output-combo/gates.txt` and `summary.json` (contract rules) and `trial/vector/output-combo-anchored-diagnostic/` (anchored variant), plus a score simulation I ran on the F2 lists in `output-combo/*-F3-off.csv`. No database access, no new harness run, no sealed key. The simulation counts how many F2 scores beat a combo-only card's score `1/(60+r)`. It is an estimate; the harness rerun is the proof.

**Q1. Yes, require an anchor (tier 2 only).**
- Contract tier 2 ("M = 1") fires for combos where nothing is in the deck: W1 has 12,774 usable in-colour combos and 33 labelled cards, so the cap of 20 fills with unrelated pairs and the commander's own combos fall to ranks 31 to 130 [Confirmed: gates.txt, summary.json].
- With the anchor (at least one other piece present; the commander counts) labelled cards drop from 33 to 10 per list and Mendicant L-cmd goes from 1/10 to 9/10 [Confirmed: output-combo-anchored-diagnostic/gates.txt; summary.json].
- Tier 1 (M = 0) and tier 3 (needs the commander) are already anchored, so the rule only changes tier 2. It is also more honest: "1 piece away" for a pair with nothing in the deck is arithmetically true but misleading.

**Q2. Yes, for the frozen-list checks only.**
- L-cmd is written "against a deck that holds only the commander", but the Developer ran it on lists that exclude the owner's fixture decks. 14 of 20 Wilhelt L-cmd failures are "in-deck" (Poppet Stitcher, Carrion Feeder, Ashnod's Altar are in the fixture) and so is Mendicant's Scrap Trawler. That is a mismatch between the check and the list, not a label bug.
- Real lists must still exclude deck cards (gate 2 keeps running on the fixture-deck lists). Only the L-cmd and L-deck checks use a "clean" base: the same pipeline with the deck empty.
- One more exclusion: **seed cards are never shown**. Carrion Feeder is in W2's seed, which is why L-deck fixture 1 says "not listed" for it in W2 [Confirmed: output/summary.json seeds; gates.txt]. A frozen-list piece that is a seed card of that list is reported as "excluded by seed" and does not count as a failure.

**Q3. Top 10 for "completes" is not deliverable at the fixed weights. Do not raise the weight.**
- A combo-only card scores at most 1/61 = 0.0164. The score at list rank 10 is 0.0234 (W1), 0.0203 (W2), 0.0193 (M1); at rank 30 it is about 0.016, 0.015, 0.015 [Confirmed: F3-on CSVs]. A top 10 slot needs a combo weight of roughly 1.5 or more for the best-ranked combo card, and more for the rest. That is a rule change tuned on the test, and it affects every combo card, not just "completes".
- Measured "completes" ranks (contract rules): W1 26 and 27, W2 18, M1 passes top 10 (Mendicant has a strong enough list). So top 30 holds for the cases that can be listed; top 10 does not [Confirmed: gates.txt].
- Combo rank is already tier-first, so "completes" cards are always the highest combo-ranked cards; the limit is the single signal, not the ordering.

**Why not just raise the combo weight:** the contract fixes the blend before the test (§4A.4, "fixed before the test, not tuned on it"). Changing it after seeing failures would make F3 versus F2 in §5.4 a tuned comparison.

## Draft amendment for Gene to sign (DRAFT, not yet in the contract)

Amendment A-V15 to `vector-trial-2026-11.md`. Changes are limited to §4A.3, §5.7 and a note in §5.4. Constants (60, cap 20, tier cutoffs, credit, switch, infinite rule) are unchanged. Because these thresholds are being changed after the first results were seen, the report for V-16 must show the original-rule results beside the amended ones.

1. **§4A.3 anchor rule (new sentence).** A tier 2 label applies only if at least one combo piece other than the candidate card is present (the commander counts as present). Otherwise the card is unlabelled for that combo and gets no boost. Tiers 1 and 3 are unchanged.
2. **§5.7 clean base for the frozen lists.** L-cmd and L-deck are evaluated on a list built the same way as V-14/F3 but with an **empty deck** (it still excludes the commander, the seed, basic lands, duplicates and illegal or out-of-colour cards). The fixture-deck lists continue to feed gates 2, 5, 7 and 8. A frozen-list card that is a seed card of the list under test is reported as "excluded by seed" and is not a failure; the report names it.
3. **§5.7 L-cmd criteria.** Hard (100%): every non-commander piece of the top 5 combos is **listed** in the F3 list with the label its tier gives (as before: "1 piece away" for 3-piece, "Combo with commander" for 4-piece), and none is lost to the cap or a filter. Soft (reported, target 80%): the piece is in the top 30. The rank of every piece is printed.
4. **§5.7 L-deck criteria.** Fixture 1: the missing piece is labelled "Combo: completes" (hard) and ranks in the **top 30** (hard; was top 10); the top 10 is reported as soft. Fixture 2: the next piece is labelled "Combo: 1 piece away" and names the missing card (hard) and is listed (hard); top 30 is soft (reported). The template and 5-piece synthetic checks are unchanged.
5. **§5.4 gate 6 note.** Gate 6 passes on the hard parts above. The soft rank results are reported and carried into §5.2 grading, so the owner judges whether combo-only cards sit too low.
6. **Honest limit (add to §7).** Combo-only cards compete on one signal and will usually sit between roughly the 20th and 45th place in a list of about 270. The combo arm is a labelling and discovery signal, not a strong ranking lever, at the fixed weights.

## Can Wilhelt pass after the change?

- **Hard criteria above: yes, expected.** The labels were already correct (gate 5 and every label check pass). With the clean base, the in-deck failures disappear; the cap of 20 holds all of Wilhelt's about 10 anchored commander-combo cards (summary: 10 labelled, 10 ranked under the anchor); "completes" cards are at 26/27 (W1) and 18 (W2) under contract rules, within top 30 [Confirmed: gates.txt; anchored variant shows 27/30 in W1, which is on the edge].
- **Rank thresholds as hard gates: no.** On W1, combo-only cards sit at about 23 (combo rank 1), 26, 31, 33, 36 (ranks 2 to 5) [Approximate: my simulation on F2 scores]. Under the anchored variant, fixture 2 is rank 33 and 45 in W1 [Confirmed: anchored gates.txt]. W1's list is dense: 30 cards beat 0.0159, while a combo-only card can score at most 0.0164. A top-30 hard gate for all five combos' cards would fail on W1, and a fixed-weight blend cannot fix it.
- **Honest fallback:** report Wilhelt as "labelled correctly and listed, but placed 20th to 45th", count that as a known limit, and let the owner's grading of F3 versus F2 (§5.2) say whether that is useful. Do not widen to top 50 or raise the weight to make the number green. If the owner wants prominence, Option 2 (pin "completes") is the clean, separately testable rule.
- Mendicant: passes after the change by the Developer's own diagnostic (L-cmd 9/10 with only Scrap Trawler, an in-deck card, missing; L-deck 1 and 2 pass).

## Preserved owner rules (unchanged by the amendment)
- **Credit:** every label keeps "Source: Commander Spellbook" and the link (gate 8, passes).
- **Per-deck switch:** off equals the two-signal list exactly (gate 8, passes). Anchoring only removes labels, so off is untouched.
- **Infinite combos:** held back with one question when the deck's answer is unknown; the anchor reduces the held-back count (it applies to labelled cards only). Pinning (Option 2), if chosen, must apply only after the hold-back filter.

## Changed files
- docs/oracle/reports/2026-11-06-architect-v15-combo-amendment.md — this report with the draft amendment

## New decisions made (need owner confirmation)
- Owner: the one prominence choice above.
- Gene: sign or reject Amendment A-V15 (contract edit by Architect after signing; `decisions.md` is untouched).

## Assumptions
- The anchored diagnostic's behaviour equals the proposed rule (Developer describes it as "at least one piece already present"). [Approximate: I did not read its code]
- My rank simulation ignores deck cards re-entering the clean base, which would push ranks slightly lower.

## Challenges to locked decisions
- none

## Open questions
- Developer, after signing: rerun V-15 with the anchor on by default, clean-base frozen lists, and print every rank. If W1 completes ranks exceed 30 on the rerun, return to Gene with the numbers rather than adjust constants.
- Designer: label wording and look (unchanged).

## Verification
- Read gates.txt, summary.json and F3 CSVs in both output folders — figures above.
- Python score simulation on F2 CSVs (read-only, output not saved) — ranks as quoted, marked Approximate.
- No DB access, no sealed key, no harness run, no push.
