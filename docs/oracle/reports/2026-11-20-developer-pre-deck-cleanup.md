# Report: pre-deck cleanup (TIDY-01..04, RC-01, CC-12)
Role: Developer
Status: PARTIAL
Task as received: Clean up small or nearly finished items before starting the next piece of work (TIDY-01, TIDY-02, TIDY-03, TIDY-04, RC-01, CC-12), update status.md, record before/after test, type-check and lint counts, and write one combined report.

## Summary for the owner
Five of the six items are finished. The old branch `cc04a-connector` is still there because deleting it needs your OK. Stax on Stax now shows 8 ramp cards (was 5), and Basalt Monolith is one of them. One question is open: should utility lands ever count as ramp?

## Item status
| Item | Status | Commit |
|---|---|---|
| TIDY-01 | DONE | decision in `f3dda73`, row marked in `bc643e3` |
| TIDY-02 | DONE | `7a89bff` |
| TIDY-03 | DONE | `c350c5c`, `2c78ebe` |
| TIDY-04 | PARTIAL | branches deleted locally; `cc04a-connector` kept |
| RC-01 | DONE (read-only check) | status row in this docs commit |
| CC-12 | DONE | `51c3a8e`, row marked in `bc643e3` |

### TIDY-01 decision
The check was wrong, not the wording. The CC-06 contract moved the price estimate to the search and ownership tools. The "show one deck" description now says "no prices here" and points to those tools. The check was already updated in `f3dda73` (CC-14), so only the status row was stale. A test still covers that the search and ownership tools say "estimate".

### TIDY-02
The fake fetch in `src/components/AddToPicklist.test.tsx` now declares its second argument. No check was weakened. Type errors went from 4 to 0.

### TIDY-03: migration history comparison
Done with `supabase migration list` (read-only). No migration commands or writes were run.
- Copied from `b627840` onto main: `supabase/migrations/20261116140000_close_remaining_anon_gaps.sql`, its undo script in `supabase/drafts/`, and two tester reports (`cc03-remaining-flows`, `cc04a-verify`).
- In local migrations but not in the hosted history: CC-03c (`20261116120000`), CC-03d (`20261116140000`), connector sign-in (`20261116130000`, `20261116130100`, `20261116170000`, `20261116200000`), and also 20261111120000, 20261112120000, 20261113100000, 20261113100100, 20261113130000, the CC-03a/b and CC-04 files from 20261116100000 to 20261116150300, 20261116190000, 20261117100000, 20261117120000, 20261117200000, 20261117200100, 20261120110000, 20261120120000, 20261121100000.
- In the hosted history with no local file (same changes applied under the hosted tool's own timestamps): 20261111053539, 20261112065224, 20261113020541, 20261115230056, 20261115230105, 20261115230241, 20261115230258, 20261116002842, 20261116003115, 20261116003621, 20261116004055, 20261116014823, 20261116030615, 20261116030622, 20261116062246, 20261116084751.
- Everything up to 20261116062746 otherwise matches both ways.
- Conclusion: the difference is only record keeping. The history was not repaired.
- Not checked: the live database was not queried to confirm CC-03c and CC-03d are in place.

### TIDY-04: branches
- Deleted with `git branch -d` (refused if unmerged): `cc04b-edits` (was 5b16520), `cc04d-guide-switch` (was 652265b), `import-destination` (was 6236b9f). All their work is on main.
- Kept: `cc04a-connector`. `-d` refused because `b627840` is not merged. Its migration files and two reports are on main by copy; its status.md edit is superseded. Deleting needs `-D`, which is the owner's call.
- Left alone: `cold-squid`, `fuzzy-quail`, `squalid-fish`, and untracked `.agents/tasks/`.
- The four reports (stax ramp count, connector brief order, feature audit, CC-06/07 tester) were already tracked. Nothing to commit.
- `git branch` now: cc04a-connector, cold-squid, fuzzy-quail, main, squalid-fish.

### RC-01 findings
Stax on Stax (deck 792324746), run through the app's own Deck health loader and classifier v2, read-only: 8 ramp cards at quantity 1 each: Everflowing Chalice, Karn Legacy Reforged, Etherium Sculptor, Sol Ring, Sapphire Medallion, Cloud Key, Machine God's Effigy, Basalt Monolith. Basalt Monolith is in the main list (not maybeboard) and its card text is present. The three new ones (Etherium Sculptor, Sapphire Medallion, Cloud Key) match the 2026-11-16 developer report. The commander Urza is excluded by design. No bug. Utility lands remain excluded; whether they should ever count is not answered.

### CC-12
The connector deck list uses the app's current words Brewing / Assembling / Playable. Unowned cards is described as a count, not a deck status, because D-059 is not built. Revisit when D-059 is built.

## Before / after counts
| Check | Before (at `583372a`) | After (this commit's tree) |
|---|---|---|
| tests | 4617 passed, 0 failed, 46 skipped (375 files passed, 6 skipped) | 4617 passed, 0 failed, 46 skipped (375 files passed, 6 skipped) |
| tsc | 4 errors | 0 errors |
| lint (`src`) | 1 error, `PicklistV2.tsx` line 686 (`<a>` should be `<Link />`), untouched | 1 error (same), 246 warnings |

Before lint over the whole repo was 11 errors; 10 of them are in untracked `.agents/tasks/`, which is outside the tracked code.

Test run notes:
- The shell here has `NEXT_PUBLIC_IMPORT_INTENT_SAVE=true` set. With it, `ImportIntentFlow.test.tsx` "built: ... keeps Import disabled (save flag off)" fails twice in a row, because the test expects the flag off. With the variable emptied for the run, all tests pass (counts above). This is an environment setting, not a code change.
- One run also failed the random-input test "returns 400 for invalid bracket values" in `upgrade-engine.property.test.ts`. It passed on rerun. It is flaky, and the known CardDetails arrow-key test did not fail this time.

## Changed files
- docs/oracle/status.md — TIDY-03, TIDY-04, RC-01 rows updated (TIDY-01, TIDY-02, CC-12 were marked in `bc643e3`)
- docs/oracle/reports/2026-11-20-developer-pre-deck-cleanup.md — this report

## New decisions made (need owner confirmation)
- TIDY-01: the check, not the wording, was wrong.

## Assumptions
- Tests were run with the import-save flag emptied, because the test expects it off.

## Challenges to locked decisions
- none

## Open questions
- Delete `cc04a-connector` with force? Everything useful from it is on main.
- Should utility lands ever count as ramp in Deck health?
- Should the hosted migration history be repaired so it lists the migrations applied another way?

## Verification
- npm test (flag emptied) — 4617 passed, 0 failed, 46 skipped
- npx tsc --noEmit — 0 errors
- npx eslint src — 1 error (known), 246 warnings
- supabase migration list — read-only comparison, as above
