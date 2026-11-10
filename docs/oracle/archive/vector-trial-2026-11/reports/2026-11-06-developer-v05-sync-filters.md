# Report: v05-sync-filters
Role: Developer
Status: DONE (code and tests only; the script was not run against any database, not even as a dry run)
Task as received: Slice V-05. On branch trial/vector-recommendations, add commander and theme filters (only Wilhelt, the Rotcleaver: Zombies and Aristocrats; Mendicant Core, Guidelight: Artifacts) and a dry-run report of build and card-list rows to be added or replaced to scripts/sync-edhrec-builds.ts per contract §1.4; confirm whether the per-build delete-then-insert is atomic and make it all-or-nothing if that is small, otherwise document the recovery; do not run it against any database. Done when: a dry run that makes no database writes lists exactly the three target builds and their rows, the atomicity answer is in the report, and npm run check passes.

## Summary for the owner
The build-loading tool can now be told to load only your three styles (Wilhelt: Zombies and Aristocrats; Mendicant Core: Artifacts) and refuses anything else. It can first print a preview of every card it would add, replace or remove, without saving anything. Loading is now safer: a failed load can no longer leave a style with an empty card list. Nothing was run. Because the three styles have no cards today, the first real load only adds cards.

## What was built
- **Filters.** `--commander=wilhelt-the-rotcleaver,mendicant-core-guidelight` and `--theme=zombies,aristocrats,artifacts`. Only those pairs are accepted (Wilhelt is never paired with artifacts); anything else exits with an error before any database or network call. Either flag alone narrows the list. Filtered mode refuses `--limit`, `--offset`, `--min-decks`, `--force`, `--tags-only`, `--cards-only`. Without the filter flags the script follows the original code path [Confirmed: `main()` only branches when a filter flag is present].
- **Dry run in filtered mode** (`--dry-run` plus the filters). Reads only: the two commanders, existing build and card rows, and EDHREC pages. For each build it prints: build row ADD or REPLACE, card rows now, card rows after, and the card names to ADD, REPLACE and REMOVE. A build EDHREC does not have (or whose tag is below the 2% line) is printed as NOT FOUND and the run stops before any write, even in live mode. The plan is shown in live mode too, before writes start.
- **Atomicity answer.** **Not atomic, confirmed** [Confirmed: scripts/sync-edhrec-builds.ts `upsertBuildCards`, original lines 594-607]. The delete and each 100-row insert were separate calls; the delete's error was ignored; a failed insert was only logged. A failure left that build with fewer cards or none. A true database transaction is not possible from this client library; it would need a database function, which is a new migration (Architect's lane), so I did not add one.
- **Safe filtered write (small fix, filtered path only).** Per build: read current rows, save the whole new list in one request (upsert on build + card name, a single statement that succeeds or fails whole), then delete only the old rows whose card is no longer in the list, by row id. Outcomes: save fails, nothing changes; delete fails, the new list is complete plus a few stale rows, the error says so, and re-running the same filtered sync repairs it. A build is never empty. Insert-then-swap was not possible because (build, card) is unique [Confirmed: supabase/migrations/20260806000000_create_commander_builds.sql].
- **Unfiltered path unchanged**, including its delete-then-insert, which stays non-atomic. [Approximate: that path was not exercised; no behavioural edit was made to it.]

## Changed files
- scripts/sync-edhrec-builds.ts — filtered mode, dry-run report, safe card-list replace; usage header
- scripts/sync-edhrec-builds-filters.ts — new pure module: allowlist, argument parsing, add/replace/remove planner, report formatter
- scripts/sync-edhrec-builds-filters.test.ts — 12 unit tests for the above
- docs/oracle/reports/2026-11-06-developer-v05-sync-filters.md — this report

## New decisions made (need owner confirmation)
- In filtered mode, a build row that already exists is replaced (upserted) and its card list refreshed even if it already has cards; the original only refilled builds with no cards unless `--force`. This is what "replaced" in contract §1.4 needs. Gene to confirm.
- Filtered mode ignores the 300-deck minimum (it selects the two named commanders directly).

## Assumptions
- EDHREC's theme slugs for these builds are exactly `zombies`, `aristocrats`, `artifacts` (the slug comes from the tag name). If one differs, the dry run prints NOT FOUND and stops; that is the intended check. [Approximate: not tested against EDHREC.]
- Commanders are found by exact `ref_commanders.display_name` ("Wilhelt, the Rotcleaver", "Mendicant Core, Guidelight"). The contract's oracle_id/printing-id check is a V-06 kickoff check and is not duplicated here; if a name does not match, the run errors.
- Cards stay at the script's existing top-50-per-build rule.

## Challenges to locked decisions
- none

## Open questions
- For V-06 / Gene: the dry run needs the service key and reads the online database (no writes) plus EDHREC. That read-only dry run is the next step once A2 is recorded.
- Should a true all-or-nothing transaction be added later (needs an Architect-drafted database function)? Not needed for the trial because the re-run repair works.
- Not tested: the live write path and the filtered dry run end to end (no database or network was touched). Only the pure logic is unit-tested.

## Verification
- `npx vitest --run scripts/sync-edhrec-builds-filters.test.ts` — 12 passed
- `npx tsc --noEmit --strict` on scripts/sync-edhrec-builds.ts (scripts are excluded from the repo tsconfig, so checked directly) — no errors
- `npm run check` — tests 220 files passed, 5 skipped; typecheck clean; lint 0 errors (1 existing warning at `mapping` unused in sync-edhrec-builds.ts). One earlier combined run showed a non-zero exit from a pipe I did not capture; a clean rerun of `npm test` exited 0.
- No endpoint involved; no request run.

For Brad (plain words): The build-loading tool can now preview and then load only your three styles, safely, and I haven't run it against anything yet.
