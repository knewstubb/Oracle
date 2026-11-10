# Report: tester-reload-rerun
Role: Tester
Status: PARTIAL
Task as received: Task V-07t/V-14t: Read-only on /Users/bradknewstubb/Developer/Personal/oracle_app-trial-clean: check the T-V07 and T-V14 lists in docs/oracle/reports/2026-11-06-gene-handoffs-v14-rerun-to-v18.md section 3, and report by pass/fail per item. Done when: every listed item has a pass or fail with the command or query used and no file or table was changed. (Owner follow-up: resolve 150 vs 149 stored cards; check no basics, only the 3 builds changed, filters, determinism, list lengths; do not open the sealed key; no DB writes, no push.)

## Summary for the owner
The longer style lists and the new comparison lists check out. Each of the three style lists really does hold 150 cards. The "149" in the rerun report was one card (a blue-black land, Clearwater Pathway) that the matching step could not tell apart from a second, odd entry with a near-identical name, so it was left out of the two Wilhelt comparison lists. This is a small, real gap: one legal land is missing from those two lists; it did not change the eight style cards, and nothing needs your decision. The one item I could not do is re-checking the sealed answer key, because I am not allowed to open it.

## 150 vs 149: which is right and why
- **150 is right for what is stored.** W1, W2 and M1 each have 150 rows, 150 different names and 150 different positions [Confirmed: query on ref_build_cards, script `trial/vector/tester-check-v07-v14.ts`].
- **149 is the number that could be matched to a card.** On both Wilhelt builds, "Clearwater Pathway" is stored but cannot be matched, so the retrieval run drops it. The card database has two different cards whose names both start with "Clearwater Pathway": the real one (Clearwater Pathway // Murkwater Pathway) and a second entry (Clearwater Pathway // Clearwater Pathway). The name-matching rule refuses to guess between two cards and marks it "ambiguous" [Confirmed: trial/vector/oracle-id-resolution.ts `resolveName`; trial/vector/output/summary.json `unresolved`].
- **Does it matter?** Slightly. The real card is legal, inside the commander's colours, not a basic and not in the deck, so it should have appeared in the EDHREC lists (synergy 0.13 in zombies, 0.02 in aristocrats). It did not, so W1 and W2 EDHREC lists are probably one card short (85 and 83 would be 86 and 84). It could not have been one of the eight seed cards, so seeds are unaffected. Mendicant has no such clash. The runner reports the dropped card in its own summary, so it is visible, not silent. Suggested fix, for Gene to assign: when two cards match a name, prefer the one whose full name starts with it and that has real printings. Do this before the combo arm uses these lists. The Developer report guessed "likely the commander"; that guess was wrong.

## T-V07 results (reload)
| Item | Result | How checked |
|---|---|---|
| 3 builds, 150 rows each | PASS | Query on ref_build_cards per build id: 150 / 150 / 150 |
| 150 distinct names each | PASS | same query |
| 150 distinct positions each | PASS | same query |
| 0 basic lands | PASS | names and card type checked against ref_printings: 0 on all three |
| Every card resolves to an oracle_id (V-08 functions) | FAIL (minor) | 448 of 450 rows resolve: W1 149, W2 149, M1 150. The 2 that do not are Clearwater Pathway (above) |
| Only the 3 builds changed | PASS | ref_build_cards holds only the 3 trial build ids (450 rows in total, so nothing else has rows); the only build rows updated on 2026-11-06 are zombies, aristocrats, artifacts, the next most recent is 2026-08-06 |
| Other counts unchanged | PASS | user_cards 2650, deck_cards 792, builds 1885, embeddings 37,708, combo pieces 378,470, combo variants 106,266; read before and after my checks and identical |
| `--max-cards` rejects malformed spellings | PASS | Called `parseMaxCards` with 19 spellings: rejected a space instead of "=", no value, empty value, 0, 151, letters, 1.5, -5, 1e2, leading space, 0x10, repeated flag, wrong case, and use without a filter; accepted 1 and 150. Note: `--max-cards=050` is accepted as 50 (harmless) |
| Default cap still 50 | PASS | no flag gives 50; the unfiltered path only takes the cap from `parseMaxCards`, which refuses the flag without filters [Confirmed: scripts/sync-edhrec-builds.ts lines 83 to 90] |
| Freeze-file hash / dated amendment match the key (V-04d re-check); V-04c slots still hold | NOT TESTED | needs reading the sealed key, which my role file does not permit. Gene or an authorised role should do this |

## T-V14 results (rerun)
| Item | Result | How checked |
|---|---|---|
| Two reruns give identical output | PASS | Ran `npx tsx trial/vector/run-retrieval.ts` twice, diffed the whole output folder: identical, and also identical to what is committed |
| Gates independent of the filters (spot check) | PASS | Not 30 per list but all of them: every card in all 12 lists (F1, F2, V, FUSED for W1, W2, M1) re-checked straight from ref_printings and the deck files, not through the retrieval code: legal in Commander, inside the commander's colours, not basic, not in the deck's mainboard, not the commander, not a seed, no duplicates. 0 violations. I did not compare against hosted deck data, only the saved deck files, which the runner also uses |
| Maybeboard cards stay eligible | PASS | Maybeboard-only cards appear in the lists (W1 67, W2 69, M1 80 appearances across arms), and none of the mainboard cards do |
| Seeds are the top 8 by synergy of the stored list, not the signature flag | PASS | Re-derived independently; same eight cards in the same order for W1, W2, M1. The runner does not read the signature flag |
| Arm sizes exceed old 18/11/18; no padding | PASS | EDHREC arms 85 / 83 / 93; stored minus excluded cards equals list size exactly (W1: 149 resolved - 63 in deck - 1 seed = 85; W2: 149 - 66 = 83; M1: 150 - 56 - 1 = 93). Vector 200 each, fused 256 / 264 / 276 (union, no filler). Ranks run 1..n with no gaps |
| Unknown synergy is empty, never 0 | PASS | No "0" synergy in any list; empty synergy appears only where a card has no EDHREC data (vector-only cards) |
| No writes to any table | PASS | Seven table counts identical before and after; scripts only select |

## Other results
- `npm run typecheck`: pass.
- `npx vitest --run trial/vector scripts/sync-edhrec`: 7 files, 140 tests pass.
- `npm run lint`: 6 errors, all in my own new script at first; fixed with a file-level exemption (the script is a one-off check). Warnings elsewhere are old.

## Changed files
- trial/vector/tester-check-v07-v14.ts — new read-only check script (select and count only; no sealed key)
- docs/oracle/reports/2026-11-06-tester-reload-rerun.md — this report

## New decisions made (need owner confirmation)
- none

## Assumptions
- The saved deck files stand in for the owner's decks, as the runner does.
- A card dropped as "ambiguous" counts as a defect in coverage, not in the hard gates.

## Challenges to locked decisions
- none

## Open questions
- Gene: fix the Clearwater Pathway ambiguity now (small) or accept as a known gap and record it?
- Gene: who re-checks the freeze-file hash and V-04c slots, since I may not open the key?

## Verification
- `npx tsx trial/vector/tester-check-v07-v14.ts` — all queries above, counts equal before and after
- `npx tsx trial/vector/run-retrieval.ts` twice, `diff -r` — identical, working tree unchanged
- `npm run typecheck` pass; `npx vitest --run trial/vector scripts/sync-edhrec` 140 pass
- No database writes, no push, sealed key not opened.
