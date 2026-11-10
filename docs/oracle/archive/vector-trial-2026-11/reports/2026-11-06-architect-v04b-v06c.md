# Report: architect-v04b-v06c
Role: Architect
Status: DONE
Task as received: Resume the cancelled V-04b and V-06c run in the clean trial worktree (branch trial/vector-clean), per `docs/oracle/reports/2026-11-06-gene-blinding-branch-signature.md` sections 1, 3 and 4: V-04b (replace 5 of 10 traps per commander and 3 of 6 Wilhelt contrast cards with picks the owner must not see; identities only in the sealed key with random salt and SHA-256 in the freeze file; no trap names or `section` column in owner-facing files; A1b = 5-card sample of ordinary pool rows with full card text) and V-06c (build seed = top 8 stored cards by synergy, tie-break inclusion then name, synergy > 0, ignore `is_signature`, fallback to commander seed under 5). No commit.

## Summary for the owner
The look-alike test cards are now partly swapped for new ones you have never seen and locked in a sealed file, so blind grading works again. The grading sheet no longer labels any row as a look-alike, and your sample check is five ordinary rows with the full card text. The "key cards" rule now uses each style's eight strongest cards. Nothing needs your decision.

## Work state found on resume
Partial edits from the cancelled run were reviewed and kept: sealed key, freeze file, sheet format, contract amendments and the V-04 report scrub were all correct. Fixed one fault: the key had been edited after its hash was written, so the freeze file held a stale hash. Updated it (3 places).

## V-04b result (slot ids and counts only; no card names)
- Sealed key: `trial/vector/sealed/gold-key.json`, 64-hex-character random salt.
- Sealed key SHA-256: `f03c5084f0a5ef3de27f18591036183b958f6054828e7322f9a36996aca4a0d2` (written in freeze §5, §8, §9).
- Traps: 10 per commander. Wilhelt: 5 exposed (W-T01, T03, T07, T08, T10), 5 new (W-T02, T04, T05, T06, T09). Mendicant: 5 exposed (M-T01, T05, T07, T08, T10), 5 new (M-T02, T03, T04, T06, T09).
- Reserves: 4 per commander (W-R01 to W-R04, M-R01 to M-R04), all unseen.
- Flip contrast: 6 slots, F-01 to F-03 new and unseen, F-04 to F-06 original and exposed; 2 exposed reserves (F-R01, F-R02).
- Rule check done by the Architect with one batched Scryfall request (POST /cards/collection, 36 identifiers by `oracle_id`, 36 found, 0 missing): all 36 slots (traps, reserves, flips, flip reserves) are legal in Commander, inside the commander's colour identity (Wilhelt U/B, Mendicant W/U), and the stored name matches the `oracle_id`. No duplicate `oracle_id` across the key. [Confirmed: Scryfall API, 2026-11-06.]
- Not done here (Tester V-04c): wrong-function reading of the rules text, check against the stored build lists and fixture decks for the 10 new trap slots and 3 new flip slots, and the leftover-name file scan.
- Name leakage, own scan: no trap name or sealed flip name remains in the freeze file, the sheet format, or this report. Incidental matches remain only where a kept (exposed, original) flip card or a common phrase already appears in older, unrelated files (including the owner's own fixture deck): slots F-04, F-05, F-06 and M-T07 in about 8 non-sealed files, none of them owner-facing sheets. Tester V-04c should count these; they cannot be scrubbed from fixture data and are exposed anyway. Note: F-04 to F-06 sit in the owner's Wilhelt fixture deck (original picks, kept as exposed; the not-in-fixture rule was applied to new picks only).
- Sheet format: `section` column removed, no type headings, trap rows sit inside W1 (Wilhelt) and M1 (Mendicant) shuffled with the same columns; A1b sample = 5 pool-only rows with full card text.

## V-06c result
- `docs/oracle/contracts/vector-trial-2026-11.md` §4B.2 now has a "Seed pick procedure": keep synergy > 0, one `oracle_id`, Commander-legal, inside identity, not the commander; sort by synergy desc, then inclusion desc, then name asc; take 8; `is_signature` ignored; fewer than 5 qualify means commander seed with "no build signal". Weights unchanged (0.5 / 0.5; 0.3 / 0.3 / 0.4 with a deck).
- Other sections updated: header Update 6 (dated 2026-11-06), §1.3 builds kickoff check, §4B.1 note on `is_signature`, the seed-weights bullets, circularity note, §5.2 rule 5, §5.4 gate 4 and stop rule, §5.8, §5A source table, §7 risk row. No remaining "signature cards" wording; remaining `is_signature` mentions only say the trial ignores it.
- Gene signs the contract amendment (no owner decision).

## Changed files
- `docs/oracle/contracts/vector-trial-2026-11.md` — Update 6 header; seed rule (V-06c); exposed and unexposed trap and flip wording (V-04b)
- `docs/oracle/contracts/vector-trial-freeze-2026-11-06.md` — trap and flip names removed, slot ids, sealed key hash, dated amendment
- `docs/oracle/contracts/vector-trial-grading-sheet-format.md` — `section` column and type headings removed, A1b sample defined
- `docs/oracle/reports/2026-11-06-architect-v04-freeze-sheet.md` — trap names scrubbed
- `trial/vector/sealed/gold-key.json` — new sealed key (names, oracle ids, reasons, salt); open only by Architect, Tester, harness
- `docs/oracle/reports/2026-11-06-architect-v04b-v06c.md` — this report

## New decisions made (need owner confirmation)
- None.

## Assumptions
- Replaced hash is final only if the key is not edited again; any Tester-driven reserve swap changes the hash and needs a dated amendment (freeze §9).
- F-04 to F-06 (exposed originals) stay even though they are in the owner's fixture deck.

## Challenges to locked decisions
- None.
