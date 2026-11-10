# Report: handoffs V-14 rerun to V-18, and close-out recommendations
Role: Gene
Status: DONE (handoffs written, NOT sent; nothing started)
Task as received: Review V-07 (reload to 150), V-11, V-12, V-13, V-14 reports; update status.md; write handoffs for V-14 rerun, V-15, V-16 to V-18 with Tester tasks and owner approvals; recommend on BR-1, the unfiltered-sync tag issue and Homebrew Postgres cleanup. Do not edit decisions.md.

## Summary for the owner
All the data the test needs is now stored (card meanings, tag-enriched meanings, 106,266 known combos), and the three style lists now hold 150 cards each. The comparison lists must be rerun on the longer style lists before anything else (they were only 11 to 18 cards long before). No decision is needed from you until the 5-card sample sheet near the end; then you confirm the layout and book about 2 hours.

## 1. Review of the reports (all read; evidence in each report)
| Slice | Verdict | What matters |
|---|---|---|
| V-07 reload | Accept | 450 rows (3 x 150), no basics, nothing else changed (counts before and after match). New `--max-cards` option only works in filtered mode, default stays 50. **The Tester check of this data was never run.** |
| V-08 | Accept | 99.677% matched (gate 99%); 60 shared-name cards keyed by oracle_id. |
| V-10 | Accept | Applied by owner in dashboard; history repaired. Types file was hand-merged; unrelated drift left alone. |
| V-11 | Accept | 18,854 rows, re-run adds nothing. **Function times out on cold start**; retries work. |
| V-12 | Accept with a caution | Only 13.7% of pool cards carry any agreed tag, so the tag A/B test (contract 5.1) can only move a small minority of lists. Report it as split tagged vs untagged (contract 2.4); do not treat a "no difference" as proof tags are useless. |
| V-13 | Accept | Mendicant 10 combos, Wilhelt 35 (21 in colour) match the contract. Open point: colourless-only combos are kept (it follows the plan wording). Recommend **keep**; they affect no commander's counts. Not one-transaction-per-combo; re-run safe and verified. |
| V-14 | Accept, rerun needed | Gates all pass, deterministic. EDHREC lists were 11 to 18 cards because only 50 were stored. Seed blend 0.5/0.5 and "seed picks removed from all arms" are consistent with the contract; accept. |

Not for Gene to decide: raising the hosted function timeout (new migration, owner gate). Recommend **no change**: keep retry-with-wait in the harness. It costs seconds on cold runs only and the trial is offline.

Challenges to locked decisions: none. New decisions needing owner confirmation: none beyond the three Developer assumptions above (the 150 ceiling, colourless-only combos kept, hand-merged types).

## 2. Handoffs (not sent; send in this order, one at a time unless stated)

### H1: V-14 rerun on the 150-card baseline (Developer)
```
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-14r: In /Users/bradknewstubb/Developer/Personal/oracle_app-trial-clean (branch trial/vector-clean) rerun trial/vector/run-retrieval.ts against the three builds now holding 150 non-basic cards each (report docs/oracle/reports/2026-11-06-developer-v07-reload-150.md); do not change any rule, only remove anything that assumes 50 stored cards, update tests, and keep the old output folder as trial/vector/output-50card-baseline for comparison.
Done when: lists for W1, W2, M1 regenerate twice byte-identically, every hard gate passes, EDHREC arm sizes and the per-list counts after filters are reported against the old 18/11/18, and the report says whether any seed pick changed.
For Brad (plain words): Redo the comparison lists now that the style lists are three times longer.
```
Notes for Gene: read-only, no approval. Commit on trial/vector-clean. Do not read the sealed key. Do not stage the stray import files. Seed picks may change (top 8 by synergy from a longer list); that is allowed and must be reported, because V-06c fixed the rule not the result.

### H2: Tester check of the reload and the rerun (Tester; send after H1)
```
You are the Tester agent. Read AGENTS.md, ~/agents-shared/tester.md and .agents/project/tester.md before anything else.
Task V-07t/V-14t: Read-only on /Users/bradknewstubb/Developer/Personal/oracle_app-trial-clean: check the T-V07 and T-V14 lists in docs/oracle/reports/2026-11-06-gene-handoffs-v14-rerun-to-v18.md section 3, and report by pass/fail per item.
Done when: every listed item has a pass or fail with the command or query used and no file or table was changed.
For Brad (plain words): An independent check that the longer style lists and the new comparison lists are correct.
```

### H3: V-15 combo arm (Developer; send after H2 passes)
```
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-15: In the trial branch add the combo arm (F3) to the offline harness exactly as docs/oracle/contracts/vector-trial-2026-11.md sections 4A.2 to 4A.6, 5.4 gates 1 to 8 and the frozen lists describe, reading combos from the stored trial tables and the V-14r lists as input.
Done when: all gates run and pass on W1, W2, M1 and a synthetic fixture; combo labels read "Source: Commander Spellbook" with a link to commanderspellbook.com; the per-deck switch has on, off and unknown, where off gives the identical list to F2 (same cards, same order, no label) and unknown holds back labelled infinite-combo cards and produces exactly one plain-words question; the cap is 20 combo-ranked cards.
For Brad (plain words): Add the "known combos" ingredient to the test, with a credit to Commander Spellbook, an off switch per deck, and a rule that it asks before suggesting infinite combos.
```
Details Gene attaches in the brief, not in the two sentences:
- Rule (D-036(b), owner answer 2026-11-04): any card that is a piece of an infinite combo and carries a label is held back when the deck's answer is unknown, and the advisor asks once. A card that ranks on its own merits is still listed when switched off, just without a label (contract 4A.6).
- Wilhelt's own four W/U/B combos must be unlabelled in Wilhelt lists (the commander is part of them); a template-requirement combo never says "completes"; a five-piece combo is never tier 3.
- Trial only: the on/off/unknown state lives in the harness. Do not touch the live app, the `deck_combos` table or the advisor.
- Label wording and look are the Designer's call for the real app; the trial uses plain text only.
- Read-only; no new migration. If the colour check or any gate needs a database function that does not exist, stop and report BLOCKED.

### H4: V-16 Tester gate run (Tester; after H3)
```
You are the Tester agent. Read AGENTS.md, ~/agents-shared/tester.md and .agents/project/tester.md before anything else.
Task V-16: Run and independently re-check the T-5 gate list (see section 3) against the V-15 output on trial/vector-clean; report pass or fail per gate and per frozen list.
Done when: every gate has a result with its evidence and a single overall line says whether the owner's grading session may be scheduled.
For Brad (plain words): A separate agent checks the combo ingredient is safe before you spend two hours grading.
```

### H5: V-17 pool, sheet, sealed key, scoring (Developer; after V-16 passes)
```
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-17: Build the pooled lists (about 40 cards per list for W1, W2, M1), the look-alike traps, multi-feature, deck-dependent, build-flip and combo-only cards, the 10 pairwise situations (A/B positions randomised), the blind grading sheet per docs/oracle/contracts/vector-trial-grading-sheet-format.md, the separate sealed key file, and the scoring script (nDCG@10, precision@10, novel finds, specificity, combo harm, pair ordering, build separation).
Done when: the sheet has no arm name, rank, score, EDHREC number, build-source hint or key reference; the key is a separate file whose hash matches the freeze file; the scoring script matches hand-worked examples; and the report lists how many cards are in the pool, by list.
For Brad (plain words): Build the actual list of cards you will grade, hidden answer key kept separate.
```
Notes: the Developer will need the key to place traps; that is fine, because the grades are drafted by someone else (H6). Do not paste key contents into reports or messages. Sheet order shuffled within each list.

### H6: V-18 drafted grades (a fresh Architect session)
```
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-18: In a NEW session that has never seen the sealed key (not the session that wrote or amended it), read only the grading sheet and the freeze file, and draft a 0 to 3 grade and a one-line reason for every card, per plan C7; do not open the sealed key file or any trial/vector/output file.
Done when: every sheet row has a drafted grade, the report states which files you opened, and you confirm you did not open the key.
For Brad (plain words): A second reader, who has not seen the answers, takes a first guess at the grades so your two hours go faster.
```
Gene must check the Architect used a fresh session (the V-04b/V-04c/V-04d Architect has seen the key and is disqualified). If a fresh session cannot be proven, the owner is told and drafted grades are dropped from scoring; nothing else changes.

### H7: V-18 sample, then V-19a (Gene and Tester)
- Gene extracts 5 cards from the sheet (layout only, no arm information) and presents them to the owner as the A1b sample check (rewritten wording: "Is this card readable and enough to grade without looking anything up?").
- V-19a Tester check of sheet blindness and the scoring script (T-6, T-7) runs in parallel with the sample check, before V-19.

## 3. Tester task lists
**T-V07 (Tester, read-only, on the 150-card reload):** 3 builds, 150 rows each, 150 distinct names, 150 distinct positions, 0 basic lands; every card resolves to an oracle_id (V-08 functions); other counts unchanged (user_cards 2650, deck_cards 792, builds 1885, embeddings 37,708, combo tables 106,266 / 378,470); `--max-cards` rejects every malformed spelling and the unfiltered path without a filter; default cap still 50; freeze-file hash and the dated amendment match the key (V-04d re-check) and V-04c slots still hold.

**T-V14 (Tester):** rerun the retrieval twice, outputs identical; the gate code is independent of the filters (spot-check 30 cards per list against hosted data: legal, colour identity inside the commander's, not basic, not a mainboard card of the owner's deck, maybeboard cards still eligible); the seed is the top 8 by synergy of the stored list (not the signature flag); arm sizes now exceed the old 18/11/18 and no list is padded (D-036(c)); unknown synergy shown as empty, never 0; no write to any table (row counts equal before and after).

**T-5 (V-16):** use the existing T-5 list in the plan (`reports/2026-11-04-gene-vector-trial-plan.md`, section 4): gates 1 to 8; frozen lists L-cmd, L-deck, L-negative, L-label, L-cross; off equals F2 exactly; unknown holds back infinite combo cards and asks once; the cap of 20; no combo shown for a commander's own colours it cannot use; missing build data is "no data", never 0. Ownership labels are only testable on synthetic data; record as untested on a real account.

**T-6 and T-7 (V-19a):** as in the plan.

## 4. Owner approvals and decisions (plainly)
Needed:
1. **A1b, 5-card sample check** at V-18: confirm the layout is readable. About 10 minutes. (No trap approval; that was removed by the blinding change.)
2. **A6, your time:** confirm about 2 hours, ideally two sittings, once the sample is ready.
Not needed (read-only, offline, no new data written): the V-14 rerun, V-15, V-16, V-17, the drafting step and the Tester checks.
Still open from earlier, not blocking the above: **A5**, where the trial sits in the roadmap and what happens to the trial code after the verdict; the Homebrew cleanup and BR-1 questions in section 5. Moving anything to the main branch stays at Gate 5.

## 5. Recommendations
**BR-1 (branch cleanup): close once two things are true, then mark DONE; do not delete anything yet.** (a) The import agent works only in its new folder (a stray import edit sat unsaved in the original folder at the time of the BR-1 report; it must be saved onto the import branch or dropped by the import agent first). (b) You say the old folder can be retired. What you would see: no change in the app. Trade-off: keeping the old branch as a backup costs nothing but disk and some clutter; deleting it is a separate, later step I will ask you about at Gate 5 with exact names. I could not confirm (a) from here, so it remains open.

**Unfiltered-sync tag issue: do not fix inside the trial; park it as its own small task after the verdict.** The full style-list refresh reads EDHREC tag names in an old layout and now finds none (the trial's filtered path already reads the new layout). Also the full refresh deletes then re-inserts non-atomically. What you would see: if someone runs the full refresh today, style lists lose their tag names. Recommend: nobody runs the full refresh until the fix is made (the trial branch refuses it by design for the three trial builds only; it is not blocked in the main folder), and Scribe records it as tech debt. A fix is a Developer task (about one slice), after Gate 5, because it touches the real sync.

**Homebrew Postgres 17 and pgvector on your Mac: remove now.** They were only a throwaway rehearsal copy; the online database has pgvector on and the migration is applied. Trade-off: if the reverse script or a re-rehearsal is ever needed we reinstall (a few minutes). Commands, for whoever runs them with your OK: stop the Postgres service if it is running, then `brew uninstall postgresql@17 pgvector`. Needs your yes; I do not run it myself.

## 6. Changed files
- docs/oracle/status.md (original folder) — V-04d, V-07, V-08, V-09b, V-10 to V-15 rows and an evening update line
- docs/oracle/reports/2026-11-06-gene-handoffs-v14-rerun-to-v18.md — this report

## Assumptions
- V-04d and V-09b are marked DONE from their committed reports, which I did not re-read in full.
- A3 and A4 were given (the migration is applied and the loads exist); recorded as done.
- The status file lives only in the original folder; the clean branch copy is not updated here and should be refreshed when the trial branch is next committed.

## Open questions
- Is the import agent now working in its own folder?
- Which Architect session wrote the key, so a fresh one is used for V-18?

## Verification
- Read the seven developer reports, the plan, contract sections 4A and 5, BR-1 report; `git log` on trial/vector-clean shows commits for V-07, V-10 to V-14; `git diff --stat` on status.md. No handoff has been sent; decisions.md untouched.
