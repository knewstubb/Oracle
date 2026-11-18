# Report: cc06-cc07-verify
Role: Tester
Status: PARTIAL
Task as received: Test CC-06 (card facts, live deck health, bracket, ownership counts) and CC-07 (filterable collection search and summary) against the owner's real collection, read-only. Run acceptance scenarios, confirm isolation; if no sign-in/second account, say what remains rather than working around auth.

## Summary for the owner
The numbers behind Claude's new search match what the developer reported, and the code checks pass. I could not run the real Claude scenarios or the isolation check: they need a connector sign-in (yours, plus a second account), and I did not work around that.

## Results
| Group | Result |
|---|---|
| Static checks: connector tests (232 pass, 4 live-only skipped), eslint on connector (clean) | PASS |
| Static: project typecheck | FAIL (not CC-06/07): 4 errors in AddToPicklist.test.tsx, as the developers flagged |
| Known counts, independent read-only SQL on the search view: 4,550 copies; 69 Elf card names (94 copies); 213 flying card names; 2,770 free copies; 392 mono-green creature copies; 446 colourless copies; 137 proxies; 100 card names / 124 copies with no facts | PASS (all match) |
| View safety: security_invoker on; anon cannot read; table has exactly one owner (1 user) | PASS |
| CC-07 live scenarios via the connector (type, subtype, keyword, colour incl. colourless, role, mana value, location, free-only, proxies, group_by; role counts vs direct count; Sol Ring/wipe present, lands absent; coverage note numbers) | NOT RUN: no sign-in |
| CC-06 live scenarios S1–S3 (facts, deck health, bracket, ownership counts), incl. first-check timing vs 8 s | NOT RUN: no sign-in |
| Isolation (only the signed-in owner's cards returned) | NOT RUN. Database has one user only, so even a bad filter could not be shown leaking; needs a second account. Structural isolation checked only via the view setting and developer tests |

## What remains
1. A connector session signed in as the owner (token comes from Claude's own sign-in): run the contract 13.7 scenarios and the CC-06 S1–S3, time one role search and one first-time health check.
2. A second signed-in account holding a few cards, to confirm the owner's cards never appear for it (and vice versa). Needs the owner to provide or approve a throwaway account.
3. Decisions already open from the developer report: slow first health check (over 8 s likely) and the 40 KB answer cap for large decks (get_deck pages at ~90 cards).

## Defects / notes
- 100 owned card names have no facts (data task for Gene); they are counted, not hidden.
- Project typecheck failure is in an unrelated picklist test.

## Changed files
- docs/oracle/reports/2026-11-16-tester-cc06-cc07-verify.md — this report

## New decisions made (need owner confirmation)
- none

## Assumptions
- Admin read-only SQL against the view is acceptable for count checks (SELECT only, no writes).

## Challenges to locked decisions
- none

## Open questions
- Who provides the sign-in and second account?

## Verification
- npm run typecheck — 4 errors, all AddToPicklist.test.tsx
- eslint src/lib/connector — clean
- vitest src/lib/connector — 232 passed, 4 skipped
- 4 read-only SQL selects on project udocxsyzzvrceiuupprj — counts above
