# Report: star-trek-commander-import-unmatched
Role: Developer
Status: DONE
Task as received: "Im getting these issues with rows not matching for import" — Exploration, Lotus Cobra, Ancient Greenwarden, Heroic Intervention (all `trc`, collector numbers 457–466, with Scryfall IDs).

## Summary for the owner
These four Star Trek Commander cards were added to Scryfall after Oracle last refreshed its card list, so the import could not recognise them. I refreshed the card list and all four are now found. Re-run the import; no code changed.

## Changed files
- none (card reference data refreshed only)

## New decisions made (need owner confirmation)
- none

## Assumptions
- The import used was the ManaBox CSV flow, which looks cards up only in the local card list (`ref_printings`) [Confirmed: src/lib/manabox-import.ts `resolveCsvRecord`].

## Challenges to locked decisions
- none

## Open questions
- None blocking. Note: the nightly cron (`/api/cron/sync-scryfall`) triggers a Supabase Edge Function `scryfall-sync` whose source is not in this repo. It may be worth confirming it still runs daily; the last stored sync before today was 28 Oct.

## Verification
- Scryfall API: all four IDs valid (set `trc`, Star Trek Commander, releases 2026-11-13).
- `ref_printings` before: 0 of 4 IDs present; `sync_meta.printings_last_sync` = 2026-10-28 bulk; Scryfall bulk = 2026-10-29T21:05.
- `npx tsx scripts/sync-scryfall-printings.ts` — 119,756 upserted, 0 failed.
- `ref_printings` after: 4 of 4 IDs present.
