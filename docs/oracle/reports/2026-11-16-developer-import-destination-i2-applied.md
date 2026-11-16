# Report: import destination I2 applied
Role: developer
Status: DONE
Task as received: Apply the drafted all-or-nothing deck-import database routine to hosted project The Oracle (udocxsyzzvrceiuupprj) with owner approval (2026-11-16): re-read for safety, smoke test in a rolled-back transaction, apply via apply_migration, move file to supabase/migrations, switch deck import on, perf test with a large synthetic import in a rollback, tests/typecheck/lint, commit and push only my files, update status.md.

## Summary for the owner
Importing straight into a deck is now switched on. The database function is in place, only the app's server can run it, and a rehearsal on your real data (undone afterwards) worked. A 500-card import took under half a second. I have not clicked through it in a browser yet.

## Changed files
- supabase/migrations/20261116062746_insert_user_copies_to_deck.sql — the applied function (moved from drafts; version matches the live history)
- src/lib/import-destination.ts — deck destination switched on
- src/lib/import-destination.test.ts — two tests that expected "deck refused" now expect "deck not found" for a deck that is not yours
- docs/oracle/status.md — update line (only my line)

## New decisions made (need owner confirmation)
- none

## Assumptions
- Migration file named with the live version number (20261116062746), as the tool assigned it.
- The older draft file was left in the drafts folder (superseded by the applied version).

## Challenges to locked decisions
- D-020 wording still needs the "except when the owner picks a deck" exception (Gene).

## Open questions
- none

## Verification
- Safety re-read: one CREATE OR REPLACE FUNCTION plus grants; no drops, deletes or table changes; every read and write is filtered by the caller's user id and the deck must be theirs.
- Rolled-back smoke test on the live project (real owner and deck): 3 real cards, all placed as new slots, counts add up. 500-row import: 391 ms. Afterwards: copy count unchanged (4550), no smoke rows, function absent. Note: in the 500-row run every row went to Unsorted ("already filled", since only one copy per card is allowed), so the slower "add new slot" path was timed only on 3 rows.
- Applied; migration history shows version 20261116062746. Access check: anon false, signed-in users false, server role true.
- vitest (src/lib, import components, import and collection routes): 160 files passed, 2305 tests passed, 9 live tests skipped.
- tsc --noEmit: only the existing AddToPicklist.test errors. eslint on changed files: clean.
- Not done: browser click-through; real call of the function through the app.
