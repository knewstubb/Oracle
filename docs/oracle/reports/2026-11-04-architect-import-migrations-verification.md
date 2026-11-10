# Report: import-migrations-verification
Role: Architect
Status: DONE (read-only; nothing applied, nothing written to the database)
Task as received: Verify which of migrations 20261020120000 to 20261023170200 are applied on the hosted Supabase database (read-only checks only); resolve the status.md vs import-intent.md conflict with evidence; confirm the save-path contract changes in import-intent.types.ts against the Developer report 2026-11-04-developer-import-modal-redesign.md; plan safe application of any missing migrations (rollback note, test-account steps). Do not apply or write. Report to docs/oracle/reports/ and stop.

## Summary for the owner
All ten import database changes are already in the live database, so `status.md` is out of date and the contract is right. Nothing needs applying. The one real gap: if two people (or two tabs) change the same card at the same moment, a foil card could be swapped for a non-foil one. Turning saving on needs a test-account run first, which is outlined below.

## 1. Migration state (evidence)
Check run: `supabase migration list --linked` (CLI 2.75.0, project ref `udocxsyzzvrceiuupprj` from `supabase/.temp/project-ref`). It only reads the hosted migration-history table. [Confirmed: command output 2026-11-04]

All 10 local files have a matching hosted entry (Local and Remote columns both filled, same timestamp). No remote-only or local-only rows anywhere in the 75-row list.

| Migration | Local | Hosted |
|---|---|---|
| 20261020120000_deck_import_per_copy_attributes | yes | **applied** |
| 20261020120100_ref_printings_finishes | yes | **applied** |
| 20261021120000_deck_cards_is_generic | yes | **applied** |
| 20261021130000_generic_basics_rpcs | yes | **applied** |
| 20261023140000_deck_card_alerts | yes | **applied** |
| 20261023150000_ref_precons_cards | yes | **applied** |
| 20261023160000_import_deck_with_intent | yes | **applied** |
| 20261023170000_deck_cards_command_zone_role | yes | **applied** |
| 20261023170100_set_deck_command_zone | yes | **applied** |
| 20261023170200_import_deck_with_intent_roles | yes | **applied** |

**Conflict resolved:** `contracts/import-intent.md` §7 (M1, M2, P1 applied 2026-10-23) matches the hosted history. The `status.md` header line ("10 migrations NOT yet applied") is stale. The later 20261023170000–170200 files (command-zone role) are not mentioned in §7 but are also applied. Not covered by that line: T-57's `20261013120000_deck_import_row_finish.sql`; it does not appear in the hosted history or in the local migrations folder list I checked (the local folder has no file with that number), so T-57 is a separate, superseded or unmerged item. Gene should reconcile it.

**Limits of the evidence:** Migration history proves each file was recorded as run. I did not directly query for the function `import_deck_with_intent` (the CLI here has no read-only query command, `linked-schema.sql` in `.temp` is empty, and I did not handle service keys). A history entry for a `CREATE OR REPLACE FUNCTION` migration is strong evidence but not proof the function was not later dropped by hand. Closing check for whoever has SQL access (read-only): `select proname from pg_proc where proname in ('import_deck_with_intent','import_deck_with_intent_roles','set_deck_command_zone');` should return 3 rows, and `select to_regclass('public.deck_card_alerts');` should be non-null.

## 2. Contract types vs Developer report
Compared `docs/oracle/contracts/import-intent.types.ts` (added in commit a88c362) with the report.

| Change claimed | In types file | Verdict |
|---|---|---|
| Source pick | `SourcePick` (`none` / `spare` / `deck{deckId}`), `IntentCopyOwnerEdits.pick`; comment says browser always sends the resolved pick | Matches |
| Exact finish | `CopyPlan.finish` = exact finish of the chosen owned copy; `fromDeckName` | Matches the types. Database side differs, see below |
| Result lists | `usedSpare`, `taken[{cardName, fromDeckId, fromDeckName}]`, `newCopies` | Matches |
| `share` kind removed | No `'share'` in `CopyPlanKind`; no `SharedCopyError` | Matches |
| Plan kinds | `move`, `move_skipped`, `needs_choice_move` retained | Consistent with report |

Issues found:
1. **Stale comment:** the `CardSource` doc still says collection copies are "shared, flagged on both decks, never a new copy". That is the removed `share` behaviour. Fix the wording: collection means a copy you own, taken from a spare or from another deck. (Architect doc edit, not done here, report only.)
2. **Exact finish is not exact in the database.** Migration 20261023160000 orders candidates `ORDER BY (uc.finish = v_row_finish) DESC, uc.id` (lines ~279, ~342): finish is a preference, not a filter. The Developer's description is correct. Race: if the chosen foil is taken elsewhere between review and save, a non-foil is silently used. The app records the finish actually used, so the result list stays honest, but the owner did not choose it. Needs a forward migration (see §3) before this is called "exact".
3. The contract markdown `import-intent.md` should gain a short §: source pick, scan-wins moves, `share` removal. Gene needs to record D-020/D-047 supersession (per Developer's challenge).

## 3. Plan
**Applying migrations: nothing to apply.** All ten are live. Do not rerun them.

**Optional new migration (draft only, owner approval first):** `import_deck_with_intent` variant that, when the request carries an exact-finish flag, filters on finish instead of preferring it, and raises `copy_unavailable` (the whole import rolls back, since it is one transaction) so the app can show "that foil was just taken, review again". Forward-only, a `CREATE OR REPLACE FUNCTION`, no table changes.
- **Rollback:** re-apply the body from 20261023160000 (`CREATE OR REPLACE` the previous definition) as a new forward migration. No data is changed by the function replacement itself. Data written by imports cannot be rolled back by it. A bad import is fixed by hand (no undo, per owner decision); before first real use, note the deck id and take a row-count snapshot of the `deck_cards` and `user_copies` for the test account.
- Keep the old function signature; unknown JSON keys are ignored, so older app builds keep working.

**Turning saving on (`NEXT_PUBLIC_IMPORT_INTENT_SAVE=true`, currently off, not set in the repo):** do it only on a Vercel Preview first, not production.

**Test-account steps (no real-collection data):**
1. Create a separate test user (Supabase Auth) with its own small collection: one card in a spare copy; one card held by exactly one deck; one card held by two decks; one foil held by one deck; a basic land.
2. Deploy the branch `build/import-modal-redesign-2026-11-04` to a Preview with the flag on, pointed at the hosted database, signed in as the test user only.
3. Import a test deck file; check: spare copy auto-selected; single holder auto-selected; two holders show "Choose source" and block Import; un-setting a source blocks Import.
4. Save. Check the result screen lists spare, taken (with "now short N") and new copies, and that the donor deck now shows a "not in deck" slot.
5. Check the foil case: the foil is moved, finish stays foil. Then simulate the race by moving that foil in another tab between review and save; record whether a non-foil is used (expected today: yes; known gap).
6. Check the generic/ignore-basics switch: basics are not pulled from other decks.
7. Send a save request with a move pick the UI never showed (e.g. via the browser dev tools) and confirm the server answers 400 "needs a source".
8. Check nothing happened to non-test users' rows (counts unchanged); delete the test deck by hand only with owner approval.
9. Only then does the owner decide on turning the flag on in production.

## Changed files
- `docs/oracle/reports/2026-11-04-architect-import-migrations-verification.md` — this report (the only file touched)

## New decisions made (need owner confirmation)
- Whether to fix "exact finish" with a new database change or accept the rare race. Recommendation: fix it before production use; if skipped, imports remain safe and only the finish could differ in a race.

## Assumptions
- The hosted project linked in `supabase/.temp/project-ref` is the production database the owner means.
- `migration list` was run with the owner's existing local CLI login; no keys were read or printed.

## Challenges to locked decisions
- D-020 / D-047 — Developer's report shows moving cards between decks is now approved; earlier "never move" is superseded — Gene to reconcile. No new evidence beyond the Developer report.
