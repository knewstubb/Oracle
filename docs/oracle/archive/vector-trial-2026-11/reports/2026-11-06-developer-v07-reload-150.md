# Report: v07-reload-150
Role: Developer
Status: DONE
Task as received: Reload the 3 trial builds (Wilhelt zombies, Wilhelt aristocrats, Mendicant artifacts) with up to 150 non-basic cards each instead of 50 (owner approved 2026-11-06). Make the cap configurable (default unchanged, strict form, tests), dry run, real run with the exact --commander=... --theme=... form, verify counts, commit on trial/vector-clean, do not push.

## Summary for the owner
The three style lists now hold 150 cards each (up from 50), still with no basic lands, so the recommendation baseline has enough cards to compare against. Nothing else changed: your collection, decks and the other 1,885 style entries are exactly as before, and the combo and card-meaning data used by the trial was not touched.

## What was done
1. Cap made configurable: new option `--max-cards=N` (whole number 1–150). Without it the cap stays 50, so default behaviour is unchanged. It is strict: any other spelling (space instead of "=", no value, non-numbers, 0, over 150, repeated, wrong case) is rejected before any network/database call, and it is refused unless the commander/theme filters are given, so the unfiltered path can never be affected [Confirmed: scripts/sync-edhrec-builds-filters.ts `parseMaxCards`; scripts/sync-edhrec-builds.ts `extractBuildCards` option `maxCards`].
2. Dry run (`--max-cards=150 --dry-run`): exactly 3 builds, each "now 50, after 150 (add 100, replace 50, remove 0)", no basics. Zero removals anywhere, so nothing beyond the 3 builds' rows could be deleted. The write only reads/upserts/deletes rows by those builds' ids [Confirmed: `safeReplaceBuildCards`, deletes only stale rows of the same build; none were stale].
3. Real run with `--commander=wilhelt-the-rotcleaver,mendicant-core-guidelight --theme=zombies,aristocrats,artifacts --max-cards=150`: 150 rows saved for each build on the first attempt. Unfiltered sync and db push were not run.

## Verification (counts before → after, read-only queries)
| Table | Before | After |
|---|---|---|
| user_cards | 2650 | 2650 |
| deck_cards | 792 | 792 |
| ref_commander_builds | 1885 | 1885 |
| ref_build_cards | 150 (3 builds × 50) | 450 (3 builds × 150) |
| ref_card_embeddings_trial | 37708 | 37708 |
| ref_combo_pieces_trial | 378470 | 378470 |
| ref_combo_variants_trial | 106266 | 106266 |

Per build (zombies, aristocrats, artifacts): 150 rows, 150 distinct names, 150 distinct positions, 0 basics. All card rows belong to those three build ids.

## Changed files
- scripts/sync-edhrec-builds-filters.ts — `parseMaxCards`, default and limit constants
- scripts/sync-edhrec-builds-filters.test.ts — tests for the new flag
- scripts/sync-edhrec-builds.ts — cap passed to the filtered path only
- docs/oracle/reports/2026-11-06-developer-v07-reload-150.md — this report

## New decisions made (need owner confirmation)
- Hard ceiling of 150 for `--max-cards` (matches the approval).

## Assumptions
- The worktree had no `.env.local`; I added a symlink to the main folder's file (git-ignored, not committed).
- Deck-count refresh from the existing build upsert may have re-touched the three build rows (same as the earlier A2 run); no rows added or removed.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- `npx vitest run scripts/sync-edhrec` — 64 tests pass (36 in filters, incl. new `parseMaxCards`)
- `npx tsc --noEmit` — clean
- Dry run and real run as above
