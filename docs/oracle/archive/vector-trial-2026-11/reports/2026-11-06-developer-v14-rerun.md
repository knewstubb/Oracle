# Report: v14-rerun
Role: Developer
Status: DONE
Task as received: H1 V-14r — rerun trial/vector/run-retrieval.ts against the three builds now holding 150 non-basic cards each; do not change any rule, only remove anything that assumes 50 stored cards, update tests, keep the old output folder as trial/vector/output-50card-baseline. Done when: lists for W1, W2, M1 regenerate twice byte-identically, every hard gate passes, EDHREC arm sizes and per-list counts after filters are reported against the old 18/11/18, and the report says whether any seed pick changed. Read-only; do not open the sealed key.

## Summary for the owner
The comparison lists were redone now that each style list holds about 150 cards instead of 50. The EDHREC-based lists are much longer (85, 83 and 93 cards instead of 18, 11 and 18), and every safety check still passes. The eight "seed" cards that describe each deck's style did not change at all. Nothing needs your decision.

## Results
- Nothing in the code assumed 50 stored cards (no rule or code change was needed); the old output was copied unchanged to `trial/vector/output-50card-baseline`.
- Reruns: two consecutive reruns produced byte-identical output (diffed whole folder).
- Hard gates: ALL PASS on all 12 lists (legal, in colour, no basics, not in deck mainboard, no commander, no seed pick, no duplicates).
- Seed picks: **no change** for W1, W2 or M1 (same eight cards, same order). Cards qualifying for the seed rose from 46/49/39 to 132/141/120, but the top 8 stayed the same.
- Stored build cards: W1 149, W2 149, M1 150 (one card fewer on the two Wilhelt builds; the reload report counts 150 rows each, so check this with Gene/Tester, likely the commander or a card with no matching row).

| List | Old stored → after filters | New stored → after filters |
|---|---|---|
| W1 | 50 → 18 | 149 → 85 |
| W2 | 50 → 11 | 149 → 83 |
| M1 | 50 → 18 | 150 → 93 |

List lengths per arm (old → new):

| List | F1 EDHREC inclusion | F2 EDHREC synergy | V vector only | Fused |
|---|---|---|---|---|
| W1 | 18 → 85 | 18 → 85 | 200 → 200 | 210 → 256 |
| W2 | 11 → 83 | 11 → 83 | 200 → 200 | 207 → 264 |
| M1 | 18 → 93 | 18 → 93 | 200 → 200 | 215 → 276 |

Unknown-synergy cards: 0 in the old run; the summary files hold the new figure.

## Changed files
- trial/vector/output/ — regenerated for 150-card builds
- trial/vector/output-50card-baseline/ — copy of the old 50-card outputs
- docs/oracle/reports/2026-11-06-developer-v14-rerun.md — this report

## New decisions made (need owner confirmation)
- none

## Assumptions
- "Twice byte-identical" was checked by diffing the output folder from two consecutive runs.
- No test update was needed since tests do not depend on stored-card counts.

## Challenges to locked decisions
- none

## Open questions
- W1 and W2 show 149 stored cards, not 150. Worth a Tester look (T-V07).

## Verification
- `npx tsx trial/vector/run-retrieval.ts` (run three times) — exit 0; last two outputs identical; gates ALL PASS.
- `npx vitest --run trial/vector` — 76 passed.
- `npm run typecheck` — passed.
- Read-only: SELECT and the read-only similar-cards function only. Sealed key not opened. No push.
