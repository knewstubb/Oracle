# Report: cc13-save
Role: Developer
Status: DONE
Task as received: Commit the uncommitted CC-13, CC-18a and CC-19 connector code to main. The working tree already holds the changes: modified connector files (edit-config.ts, tools/index.ts, ConnectionTab.tsx, RecentChangesTab.tsx, SetupGuideTab.tsx, change-sentences.ts, tests) plus new files for CC-13 amendment contract/types, CC-18 buying list tool/contract/types/test, and CC-19 empty-list wording. Inputs live in git status, docs/oracle/status.md CC-13 row, and reports/2026-11-17-developer-cc13-limits.md, -developer-cc18-buying-list.md, -developer-cc19-empty-buying-list.md.
Done when: changes are committed and pushed to main, npm run check passes (only known pre-existing TIDY-01 and TIDY-02 failures allowed), and a report is saved to docs/oracle/reports/2026-11-17-developer-cc13-save.md.
For Brad (plain words): Save the Claude connector code that allows bigger edits and buying lists, so the owner test plan can run.

## Summary for the owner
The Claude connector code for bigger one-request edits, the buying list, and the "nothing to buy but proxies exist" wording is now saved and online. Nothing changed in what you see today beyond what those three pieces already described, and the database and app now agree on the new limits. Nothing needs your decision; the remaining owner step is the test plan.

## Changed files
Committed as `cbc3753` and pushed to `origin/main` (22 files, 786 insertions, 30 deletions):
- src/lib/connector/edit-config.ts — limits 120 / 200 split / 500 hourly / 200 request / 200 Claude undo
- src/lib/connector/tools/index.ts — tool text for 120-card one-call jobs, moves straight through, buying-list description with CC-19 empty-list rule
- src/lib/connector/change-sentences.ts — move sentence only says "you approved this" for owner-approved moves; limits read from AI_LIMITS
- src/lib/connector/tools/get-buying-list.ts — new read-only `get_buying_list` tool
- src/lib/connector/__tests__/buying-list.test.ts — 10 tests for the buying list
- src/lib/connector/__tests__/edit-tools.test.ts — limits equality test reads the applied migration; 120-card, 201-refusal, move and tool-text tests
- src/lib/connector/__tests__/registry-and-isolation.test.ts — buying-list registry entry and CC-19 wording test
- src/components/connector/ConnectionTab.tsx — Can / Can't lists (120 limit, moves, buying list, no wishlist yet)
- src/components/connector/RecentChangesTab.tsx — multi-card Undo toast "Undone. N changes reversed."
- src/components/connector/SetupGuideTab.tsx — one-request deck builds, single Undo, 120 limit
- docs/oracle/contracts/claude-connector-cc13-amendment.md and .types.ts — new CC-13 amendment contract (120, not 100)
- docs/oracle/contracts/claude-connector-cc18-buying-list.md and .types.ts — new buying-list contract and result types
- docs/oracle/contracts/claude-connector-slice-a.md — `get_buying_list` tool-table row
- docs/oracle/contracts/claude-connector-slice-b.md — pointer to the CC-13 amendment
- docs/oracle/specs/claude-connector.md — CC-13 and CC-18a update sections and move-sentence wording
- supabase/migrations/20261117100000_cc13_loosen_limits.sql — the CC-13 migration already applied live, now recorded in git
- supabase/drafts/20261117100000_cc13_loosen_limits.rollback.sql — its rollback script
- docs/oracle/reports/2026-11-17-developer-cc13-limits.md, -developer-cc18-buying-list.md, -developer-cc19-empty-buying-list.md — the three build reports named as inputs, saved with the code
- docs/oracle/reports/2026-11-17-developer-cc13-save.md — this report

Deliberately not committed (other agents' uncommitted work kept out of the CC-13/18a/19 save): `docs/oracle/status.md`, `docs/oracle/test-protocol-import.md`, `docs/oracle/backlog-simple.md`, `docs/oracle/test-plan-2026-11-17.md`, the CC-15/16/17/18-wishlist database drafts, and the Architect/Gene/Tester reports.

## New decisions made (need owner confirmation)
- None. Committing the already-applied CC-13 migration and its rollback records the live change; it does not change any decision.

## Assumptions
- The changes lived only in the primary checkout (`/Users/bradknewstubb/Developer/Personal/oracle_app`, branch `main`), not in the `cold-squid` worktree, which was clean at `e6cc699`. I committed from the primary checkout so the commit landed on `main` directly.
- The three build reports are part of the CC-13/18a/19 record and were committed with their code; the CC-13 one still reads Status PARTIAL because it was written before the migration was applied live (superseded by the status row and this report).

## Challenges to locked decisions
- None.

## Open questions
- Gene: the CC-13 row in `docs/oracle/status.md` still says the code is NOT committed; it now is (`cbc3753`). Status is Gene's to update.
- Architect: the committed migration file still opens with `-- DRAFT. NOT APPLIED. Needs owner approval…` even though it is applied live. The SQL itself is correct; only the header comment is stale. Not edited here because the SQL is the Architect's.

## Verification
- `npm run check` — `npm test` fails only TIDY-01 (`registry-and-isolation.test.ts:32`, `get_deck` description no longer says "estimate"); 291 files passed, 3449 tests passed, 1 failed, 46 skipped. Because `check` stops at the first command, typecheck and lint were run separately.
- `npm run typecheck` — 4 errors, all TIDY-02 in `src/components/AddToPicklist.test.tsx` (lines 45, 57); none in the committed files.
- `npm run lint` — 4 errors, all pre-existing and in files not touched by this commit: `src/components/PicklistV2.tsx:672`, `src/lib/connector/__tests__/tools.test.ts:165,169`, `src/lib/connector/tools/list-decks.ts:52`; 280 warnings. Note: these lint errors are pre-existing but are not covered by the TIDY-01/TIDY-02 labels.
- `git push origin main` — `e6cc699..cbc3753  main -> main`.
- Connector tests exercised as part of `npm test`: only the known TIDY-01 failure.
