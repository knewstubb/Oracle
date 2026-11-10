# Report: tester-v05-check
Role: Tester
Status: PARTIAL (V-05 passes its checks; one gap and one branch-hygiene problem for Gene)
Task as received: Verify V-05 on branch trial/vector-recommendations without any database access: (1) run the unit tests for the filter logic and the repo checks; (2) review that filtered mode refuses unsupported flags and any other commander or theme before any network or database call; (3) confirm the unfiltered path of the sync script is unchanged; (4) list exactly which files differ from main and whether any are unrelated to the trial. Do not change code.

## Summary for the owner
The style-loading tool passes the checks: it refuses anything except your three styles, and the normal "load everything" behaviour is untouched. Two things need Gene: (a) a typing slip such as `--commander wilhelt` with a space instead of `=` is silently ignored, and the tool then runs as the normal full load, so the first real run must be copy-pasted exactly; (b) the branch also carries unrelated import-screen work (already committed, and still being committed while I checked), which must not travel with the trial. Nothing was run against any database.

## Results
| # | Check | Result |
|---|---|---|
| 1a | `npx vitest --run scripts/sync-edhrec-builds-filters.test.ts` | PASS, 12/12 |
| 1b | `npm run check` (tests, typecheck, lint) | PASS, exit 0. 220 files passed, 5 skipped; 2549 tests passed, 42 skipped; lint 0 errors, 280 warnings (pre-existing style; includes the known unused `mapping`-type warning in the sync script) |
| 2 | Filtered mode refuses unsupported flags and other commanders/themes before any network/database call | PASS (see below), with one gap (G1) |
| 3 | Unfiltered path unchanged | PASS |
| 4 | Files differing from main | See section 4; unrelated files FOUND |

## 2. Refusals (executed, no network)
Ran the real script with a fake env (dead local address, fake key) so no database could be reached. Each exited 1 with a "Filter error" and no other output:
- `--commander=wilhelt-the-rotcleaver` with each of `--limit=5`, `--force`, `--tags-only`, `--cards-only`; `--theme=zombies` with `--min-decks=1` and `--offset=2`: refused, naming the flag.
- `--commander=atraxa`: refused (allowed list shown). `--theme=treasure`: refused.
- `--commander=wilhelt-the-rotcleaver --theme=artifacts`: refused ("match no allowed build").

Order of events [Confirmed: scripts/sync-edhrec-builds.ts, module top]: env read, client object created (makes no call), filter parse and conflict check, exit(1). All network and database calls are inside `main()`/`runFilteredSync`, after this point. Missing env vars exit earlier with their own message (also before any call).

Dry-run safety [Confirmed: scripts/sync-edhrec-builds.ts `runFilteredSync`]: plan is built from reads and EDHREC fetches only; `if (DRY_RUN) return;` comes after the plan print and before every write (`upsertBuild`, the build update, `safeReplaceBuildCards`). Any NOT FOUND build throws before writes, also in live mode. I did not execute the dry run itself (needs database and EDHREC).

**G1 (gap, not a V-05 failure; Gene to decide): flag typed without `=`.** `readList` only recognises `--commander=...` and `--theme=...` [Confirmed: scripts/sync-edhrec-builds-filters.ts, `readList` and the `commanders === null && themes === null` early return in `parseFilterArgs`]. `--commander wilhelt-the-rotcleaver --dry-run` (space) is therefore treated as unfiltered, and without `--dry-run` it would start the original full live sync across all commanders. I confirmed this by reading the code, and deliberately did not run it. Same for `--theme zombies` and for `--limit 5` combined with a filter (the original LIMIT also needs `=`, so that one is harmless). Suggested fix (Developer): treat any `--commander`/`--theme` token without `=` as a filter error. Until then the V-06 handoffs must use the exact `=` form, which they do, and always carry `--dry-run` for step 1.

Not covered, by design: the filtered dry run and live write were never executed (no database); only the pure logic has tests. The first real exercise is V-06a.

## 3. Unfiltered path
`git diff` of the script is additions only, plus one added import and the filter parse [Confirmed: scripts/sync-edhrec-builds.ts]. The only code run on the unfiltered path is: `parseFilterArgs` returning `{active:false}` when neither flag is present, then `main()` skipping the early return. No original line is modified or removed (diff shows 206 insertions, 0 deletions in that file; the original `upsertBuildCards` delete-then-insert is intact). Remaining behavioural footnote: with neither flag, `assertNoConflictingFlags` is not called, so original flags behave as before. PASS.

## 4. Files that differ from main
V-05 itself is NOT committed. Its files are uncommitted in the working tree (the branch tip does not contain them), so "branch vs main" and "V-05 diff" are two different lists.

**V-05 (uncommitted working tree) – all in scope:**
- scripts/sync-edhrec-builds.ts (modified)
- scripts/sync-edhrec-builds-filters.ts (new)
- scripts/sync-edhrec-builds-filters.test.ts (new)
- docs/oracle/reports/2026-11-06-developer-v05-sync-filters.md (new, report)

Other uncommitted trial documents: AGENTS.md and docs/oracle/status.md (modified), plus untracked brief, contracts, drafts and the other trial reports. No uncommitted change touches src/.

**Committed on the branch, differing from main (13 files, 5 commits since main):**
Trial-related (commit 48c763b, V-03):
- docs/oracle/reports/2026-11-06-developer-v03-archidekt-pull.md
- trial/vector/pull-archidekt-fixtures.ts
- trial/vector/fixtures/mendicant-core-artifacts.json
- trial/vector/fixtures/wilhelt-rot-to-process.json
- trial/vector/fixtures/unmatched-risk-list.txt

**UNRELATED to the trial (import-review screen work, commits 1300448, 438de92, d410e5e, 229339f; 8 files):**
- src/app/api/decks/import/route.ts
- src/components/manabox-import/ImportIntentReview.test.tsx
- src/components/manabox-import/ImportRowEditor.tsx
- src/components/manabox-import/ManaBoxDeckImportFlow.tsx
- src/lib/import-intent.test.ts
- src/lib/import-intent.ts
- src/lib/import-intent.views.test.ts
- src/lib/manabox-deck-import.ts

Corrections to Gene's review: those edits are already committed, not uncommitted, and a fourth import commit (229339f, 15:05) landed while I was working, so something is still committing import work onto this branch. One of them is a behaviour change, not only look-and-feel: "ignore basic lands" now defaults to off in the import route and importer (`ignoreBasics === true` instead of `!== false`). Gene should check that against the owner's wishes and keep the import commits out of the trial merge (cherry-pick or split V-03/V-05 onto a clean branch from main).

## Changed files
- docs/oracle/reports/2026-11-06-tester-v05-check.md — this report. No code changed.

## New decisions made (need owner confirmation)
- none

## Assumptions
- "main" means the local `main` branch (tip 8ade9fc).
- I did not read the .env.local contents; the refusal runs used a fake env so nothing could reach a real database either way.

## Challenges to locked decisions
- none (D-003, D-009, D-012 not touched by V-05; it only writes trial-allowlisted build tables, and only after owner approval A2)

## Open questions
- G1: should Developer make a space-separated `--commander`/`--theme` an error before V-06a?
- Who is committing import work onto the trial branch, and should it move to its own branch?

## Verification
- `npx vitest --run scripts/sync-edhrec-builds-filters.test.ts` — 12 passed
- `npm run check` — exit 0 (see table)
- `npx tsx scripts/sync-edhrec-builds.ts <9 refused flag combos>` with fake env — all exit 1 with Filter error, no network
- `git diff main...HEAD --stat`, `git diff main HEAD`, `git status`, `git log main..HEAD` — lists above
- No database, EDHREC or other network access was made.
