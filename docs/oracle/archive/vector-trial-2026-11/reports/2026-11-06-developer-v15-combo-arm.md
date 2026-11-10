# Report: v15-combo-arm
Role: Developer
Status: PARTIAL
Task as received: Part 1 (small fix): Clearwater Pathway is stored in both Wilhelt builds but is dropped because the card data has two entries with that name. Resolve it with a deterministic, unit-tested rule (never guess by name alone; prefer oracle_id/scryfall data; if it cannot be resolved without guessing, stop and report), then rerun V-14 so the Wilhelt EDHREC lists include it if legal/in colour. Part 2: execute the V-15 handoff (combo arm, labels with "Commander Spellbook" credit, per-deck off switch, ask-before-suggesting rule for infinite combos, gates). Read-only against the DB; no writes, no push, do not open the sealed key.

## Summary for the owner
The Clearwater Pathway gap is fixed: the second, odd entry turned out to be a piece of card art, not a card, so the real land is now found and both Wilhelt lists include it (one card longer each). The combo ingredient is built, credits Commander Spellbook on every label, has an on / off / unknown switch per deck, and holds back infinite-combo cards and asks one question when the answer is unknown. All the safety checks on what a label says pass (legal, right colours, honest wording, off switch gives the same list as today). But the contract's own "must appear" checks for Wilhelt and Mendicant combos fail, for reasons that are about the rules rather than bugs, so I stopped there: I need a decision before the grading session is scheduled (see Open questions).

## Part 1: Clearwater Pathway
- **Cause:** the extra entry "Clearwater Pathway // Clearwater Pathway" is a Scryfall art card (layout "art_series", set AZNR, not legal), not a game card. It shares the front name with the real land, so the name matcher saw two cards and refused to guess [Confirmed: query on ref_printings, 1 art_series printing vs 6 real printings, all one oracle_id].
- **Rule (deterministic, uses Scryfall data, not names):** rows whose Scryfall layout is a non-game layout (only `art_series`) never take part in name matching. Two real cards sharing a front face stay ambiguous; if layout data is absent the name stays ambiguous [Confirmed: trial/vector/oracle-id-resolution.ts `NON_GAME_LAYOUTS`, `buildNameIndex`; 5 new tests in oracle-id-resolution.test.ts].
- **Rerun V-14:** `unresolved` is now empty for W1, W2 and M1. Clearwater Pathway (blue-black land, legal, in colour) now appears: W1 EDHREC list 85 to 86, FUSED 256 to 257; W2 83 to 84, FUSED 264 to 265; M1 unchanged. Seeds unchanged (no seed line changed in summary.json). Two runs are byte-identical, all V-14 hard gates pass [Confirmed: `diff -r` of the output folder, trial/vector/output/gates.txt "ALL PASS"].
- Committed separately before the combo work.

## Part 2: the combo arm
Built to contract sections 4A.2 to 4A.6 and 5.4 gates 5, 6, 8, reading combos from the stored trial tables and the V-14r lists as input. No migration, no live app, no `deck_combos`, no advisor touched.

What it does:
- **Labels** (plain text only; look is Designer's): "Combo: completes", "Combo: 1 piece away (still needs X)", "Combo with commander (N more pieces still needed)", each with "+N more" and "Source: Commander Spellbook" plus a link to commanderspellbook.com for that combo. Example: `Combo: 1 piece away (still needs Gravecrawler): Infinite death triggers ... Source: Commander Spellbook https://commanderspellbook.com/combo/2577-4050/` on Phyrexian Altar in W1.
- **Rules:** a combo is used only if it is from the newest snapshot, every piece is found by oracle_id, Commander-legal in the Scryfall snapshot and inside the asking commander's own colours (not the wider pool); template combos never say "completes"; five-piece combos are never tier 3; a combo that needs a different commander is dropped. Combo cards rank by tier, popularity, oracle_id; only the top 20 get a combo rank (cap 20); a combo-only card can enter and shows its label.
- **Switch per deck:** Off = identical to the two-signal list (same cards, same order, no label, no question). Unknown = labelled infinite-combo cards are held back, no boost, no labels, exactly one plain-words question ("Should this deck show combo suggestions that can repeat forever or win on the spot? I have held back N cards ..."). On = labels with credit plus the boost. The state lives only in the harness.
- **Infinite combo wording:** a combo counts as infinite if any Spellbook result name matches the fixed pattern (infinite, near-infinite, win/lose the game, lock, exile/whole library, any number of) or it names no result (safe side). A card is held back if any of its labelled combos is infinite [Confirmed: trial/vector/combo-arm.ts `INFINITE_RESULT_PATTERN`; in the live data every in-colour combo qualifies].
- **Lists graded with "present" = the commander only** (they are no-deck lists, contract 4B.2 and the L-cmd rule).

### Gate results (state on unless stated; full text in trial/vector/output-combo/gates.txt)
| Gate | W1 | W2 | M1 |
|---|---|---|---|
| 1 every shown card resolves by oracle_id | PASS | PASS | PASS |
| 2 legal and in colour (plus deck, commander, seed, basic, duplicate filters) | PASS | PASS | PASS |
| 5 label facts equal an independent recomputation; legal, in colour, honest wording, credit and link | PASS | PASS | PASS |
| 7 build stated, seed fallback shown, no-data shown as empty | PASS | PASS | PASS |
| 8 off equals two-signal list; unknown holds back infinite cards and asks once; on shows credit | PASS | PASS | PASS |

Gate 6 (frozen lists, section 5.7):
| Frozen list | Result |
|---|---|
| L-negative (i) cards whose only combos are outside the commander's colours carry no label (842 Wilhelt, 861 Mendicant) | PASS |
| L-negative (ii) synthetic illegal-piece variant, (iii) synthetic unresolvable-piece variant | PASS, PASS |
| L-deck template check (synthetic) never "completes"; 5-piece check (9 real Wilhelt 5-piece combos) never tier 3 | PASS, PASS |
| L-cross (Mendicant and Wilhelt pieces label only through their own colour-legal combos; Krark-Clan Ironworks stays unlabelled in Wilhelt lists) | PASS |
| L-label (100% of labels equal recomputation) | PASS (gate 5) |
| L-deck fixture 1, Mendicant (last piece is "completes", top 10) | PASS |
| L-deck fixture 1, Wilhelt | FAIL: tier correct, rank 18 to 27, one case not listed |
| L-deck fixture 2, Wilhelt and Mendicant | FAIL: tier correct, but rank 7 to 125 vs top 30 |
| L-cmd top 5 commander combos, Wilhelt (2 of 20 checks) and Mendicant (1 of 10) | FAIL |
Gates 3 (ownership) and 4 (look-alike traps) are not part of the combo arm in this offline harness; gate 4 needs the sealed key, which I did not open.

### Why the frozen lists fail (evidence, not bugs in the labels)
1. **The owner's deck files contain the combo pieces.** The Wilhelt fixture already holds Poppet Stitcher, Carrion Feeder, Ashnod's Altar, Shambling Ghast; the Mendicant fixture holds Scrap Trawler. The V-14 rules exclude deck cards, so L-cmd (which says "against a deck holding only the commander") asks for cards the lists must not show [Confirmed: gates.txt reasons "in-deck"].
2. **Combos that do not involve the commander crowd the label tier.** The contract's tier 2 ("one piece away", M = 1) also fires for combos where the deck holds none of the pieces, for example a two-card combo: Phyrexian Altar is labelled "1 piece away" for Gravecrawler though neither is in the deck. About 12,000 combos per commander are in colour, so the top-20 cap fills with those, and commander combos fall to rank 31 to 130 or are below the cap [Confirmed: gates.txt, W1 summary: 33 labelled, 20 combo-ranked].
3. **A combo-only card cannot reach the top 10.** Its only score is 1/61 (0.016) against about 0.03 for a good vector plus EDHREC card, so a "completes" card ranks about 18 to 30. The L-deck "top 10" cannot be met by the specified fusion for a combo-only card.
4. **Diagnostic only, not the contract rule:** requiring at least one piece already present (`COMBO_ANCHORED_DIAGNOSTIC=1`, output in trial/vector/output-combo-anchored-diagnostic) makes Mendicant L-cmd 9 of 10 and fixes the crowding, but L-cmd, L-deck 1 and L-deck 2 still fail for Wilhelt (deck cards, rank 33 to 45) and gates 1, 2, 5, 7, 8 and the colour checks all still pass. I did not adopt it.

## Changed files
- trial/vector/oracle-id-resolution.ts, .test.ts — ignore art_series rows when matching names; 5 tests
- trial/vector/run-retrieval.ts, resolve-oracle-ids.ts — also read `layout`
- trial/vector/output/* — V-14 rerun (W1, W2 changed; M1 identical)
- trial/vector/combo-arm.ts, combo-arm.test.ts — pure combo arm, labels, switch, gates, 29 tests
- trial/vector/run-combo-arm.ts — read-only runner and frozen-list checks
- trial/vector/output-combo/ — F3 lists per list and state (on, off, unknown), the one question, gates.txt, summary.json
- trial/vector/output-combo-anchored-diagnostic/ — diagnostic variant (not the contract rule)

## New decisions made (need owner confirmation)
- Name matching ignores Scryfall art_series rows.
- A card is held back in "unknown" if any of its labelled combos is infinite; a combo with no named result counts as infinite.
- A combo that needs a different card as commander is dropped (cannot occur in this deck).
- "Present" for the graded lists is the commander only.
- Held-back count in the question is only cards that would otherwise have been listed.

## Assumptions
- Spellbook link pattern `commanderspellbook.com/combo/<variant id>/` [Approximate: not fetched].
- Names (`display text`) come from Scryfall; Spellbook names are not stored.

## Challenges to locked decisions
- none (contract 4A.3 / 5.7 conflict, below, is a contract matter, not a locked decision)

## Open questions
- Gene / Architect (needs a decision before V-16): (a) should tier 1 and 2 labels need at least one piece already in the deck (or the commander), so two unrelated cards do not label each other? (b) should L-cmd and L-deck run on lists that do not exclude the deck's own cards, since the fixture decks hold the pieces? (c) is "top 10" for a "completes" card still wanted, given the fusion maths cannot deliver it for a combo-only card (a larger combo weight would be a rule change)? Until answered, V-16 would only be able to confirm the failures.
- Designer: label wording and look (trial text is plain).

## Verification
- `npx vitest --run trial/vector scripts/sync-edhrec` — 8 files, 174 tests pass
- `npx tsc --noEmit` — pass; `npx eslint trial/vector` — clean
- `npx tsx trial/vector/run-retrieval.ts` twice, `diff -r` — identical; all hard gates pass
- `npx tsx trial/vector/run-combo-arm.ts` twice, `diff -r` — identical; exit 2 (5 frozen-list FAILs as above)
- Read-only selects only; no writes, no push, sealed key not opened.
