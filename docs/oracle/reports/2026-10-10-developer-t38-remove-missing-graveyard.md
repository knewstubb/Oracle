# Report: t38-remove-missing-graveyard
Role: developer
Status: DONE
Task as received: Task T-38: Remove the Missing concept (D-028) and the legacy Graveyard/retired labels (D-029) from every screen, filter and action (start with src/components/collection/MissingToggle.tsx, StatusFilter.tsx, PicklistV2.tsx, StatusControl.tsx, StatusBadge.tsx, collection/RollupListPane.tsx and src/app/collection/page.tsx), letting copies already marked Missing behave as ordinary owned copies, with no migration or stored-data change (stop and report if one seems necessary).
Done when: no Missing or Graveyard wording or control remains in the app, affected tests are updated, and the focused tests, lint and typecheck for the touched files pass with results in your report.
For Brad (plain words): Remove the Missing option and the old Graveyard labels from the app, without touching your stored cards.

## Summary for the owner
The "Missing" option is gone from the app: there is no Missing chip, no "Mark as missing" action in any deck or collection menu, no dimmed/struck-through Missing rows, and no Missing badge. Any card that was previously marked Missing now simply counts as a card you own, so it appears and behaves like every other copy. The old "Graveyard" (retired deck) label is gone too — you can only mark a deck Brewing or Active, and no screen, filter or example shows "Graveyard" or "retired" any more.

## Changed files
Deleted (the Missing feature and its only consumers):
- `src/components/collection/MissingToggle.tsx` — the Missing show/hide chip; removed from Collection and Rollup views.
- `src/components/collection/MissingCopyRow.tsx` — the dimmed, struck-through Missing row; its only user was the instance detail panel.
- `src/lib/missing.ts` — `markCopyMissing` / `unmarkCopyMissing` RPC wrappers.
- `src/lib/missing.test.ts` — tests for the deleted helpers.
- `src/app/api/physical-copies/[id]/missing/route.ts` — the POST/DELETE Mark-as-Missing endpoint.

Missing concept removed from screens/actions/queries:
- `src/app/collection/page.tsx` — removed the Missing toggle, state, count and `includeMissing` plumbing; dropped unused props passed to `PrintingListView` (also clears two pre-existing type errors on this file).
- `src/components/collection/RollupListPane.tsx` — removed the Missing toggle and its props.
- `src/components/collection/CollectionRollupTab.tsx` — removed `showMissing` state and pass-through.
- `src/components/collection/InstanceDetailPanel.tsx` — removed the Missing section, the extra `showMissing` prop, the "Mark as missing" kebab item, and the `MissingCopyRow` import.
- `src/components/collection/PrintingListView.tsx` — removed the `showMissing` prop and all `isMissing` row treatment (opacity, red left border, strikethrough, "missing" tag).
- `src/components/collection/BulkActionBar.tsx` — removed the bulk "Mark as missing" button and mutation.
- `src/components/StatusChipPopover.tsx` — removed the "Mark as missing" action.
- `src/hooks/useCollectionPrintings.ts` — removed the `includeMissing` parameter and query key.
- `src/app/api/collection/printings/route.ts` — stopped filtering on `missing`, stopped selecting/returning it; all owned copies (including any still flagged Missing in the database) are now included.
- `src/app/api/collection/instances/[oracleId]/route.ts` — removed `isMissing` from the instance payload.
- `src/lib/collection-printing-utils.ts` — removed `isMissing` from `PrintingRowResponse`/`RawPhysicalCopy` and grouping.
- `src/lib/card-status.ts` — removed the `missing = false` filter so Missing-flagged copies count as supply.
- `src/lib/reconcile-overuse.ts` — removed the `missing = false` filter on original supply.
- `src/app/api/storage/overview/route.ts` — removed the `missing = false` filters so Missing-flagged copies appear in storage/unsorted counts.
- `src/lib/card-identity-store.ts` — removed the `missing` field from `CollectionCopy` and its mapper.
- `src/components/collection/CollectionImportButton.tsx` — removed "missing flags" from the import warning copy.
- `src/app/settings/components/page.tsx` — removed the Missing filter-chip and Missing-state showcase examples.

Graveyard / retired concept removed from labels and controls:
- `src/lib/deck-status.ts` — `DeckStatus` is now `'brewing' | 'in_rotation'`; removed `graveyard` from `VALID_STATUSES` (the status API rejects it).
- `src/components/StatusFilter.tsx` — removed the Graveyard chip.
- `src/components/StatusControl.tsx` — removed the Graveyard state, the Active→Graveyard confirmation dialog and the release-cards "breakdown" flow; a status change now just changes status.
- `src/components/StatusBadge.tsx` — removed the Graveyard badge config.
- `src/components/collection/InstanceDetailPanel.tsx` — removed the `graveyard` case from status colour mapping.
- `src/components/PicklistV2.tsx` — `formatDeckStatus` no longer maps `graveyard`; unknown statuses read as "Active".
- `src/lib/supply-pool.ts` — copy ownership status now derives from the deck's live `is_active` flag instead of the legacy `decks.status` column (active → "Active", otherwise → "Brewing"), so retired status can never surface.
- `src/lib/brew-v2-types.ts`, `src/app/page.tsx`, `src/app/decks/[id]/page.tsx`, `src/app/api/decks/route.ts` — legacy `DeckStatus` unions no longer include `graveyard`.
- `src/app/settings/components/page.tsx` — removed the Graveyard deck-tile showcase and the Graveyard rows in the spec-reference lists.

Tests updated:
- `src/components/StatusControl.test.tsx` — expects two status buttons; removed Graveyard dialog/cancel tests.
- `src/components/StatusFilter.test.tsx` — expects two chips; graveyard is now asserted as an invalid, filtered-out value; fixed a missing `beforeEach` import.
- `src/components/collection/CollectionRollupTab.test.tsx` — bulk-action test now verifies resolved copy IDs are passed to the surviving bulk Delete action (was Mark as missing).
- `src/lib/card-status.test.ts` — mocks updated for the removed `missing` filter; Missing-specific cases repurposed.
- `src/app/collection/page.test.tsx` — removed `isMissing` from the printing fixture.
- `src/app/api/collection/printings/route.test.ts` — removed `missing` from fixtures.
- `src/lib/__tests__/supply-pool.test.ts` — removed the `graveyard` fixture value.

## New decisions made (need owner confirmation)
- None that change behaviour beyond D-028/D-029. Two implementation choices, both grounded in the locked decisions:
  1. Missing-flagged copies are now included in collection, availability, reconcile-supply and storage counts (D-028: "may behave as ordinary owned copies").
  2. Copy-ownership status in the Picklist/claim flow is derived from the live `is_active` flag rather than the legacy `decks.status` column, so the retired status can no longer appear anywhere (D-029).

## Assumptions
- Per D-028's 2026-10-10 transition note ("the owner will reimport"), no data conversion was performed and the `missing` database column and its RPCs were left in place. Existing Missing-flagged rows are simply read as ordinary owned copies.
- The word "missing" still appears in unrelated English strings (for example the AI suggestion "What staples am I missing?", import error messages, and Scryfall's `missing_fallback_fields` resolution reason) and "graveyard" still appears in Magic card text and card categories. These are not the removed concepts and were intentionally left alone.
- `src/types/supabase.ts` (generated) still lists the `missing` column and the `mark_copy_missing`/`unmark_copy_missing` RPCs; it was not regenerated because no schema change was made.

## Challenges to locked decisions
- none

## Open questions
- The database function `assign_physical_copy` still raises `copy_missing` when asked to place a copy whose stored `missing` flag is true. Removing the app's Mark-as-Missing action means no new Missing copies can be created, and the owner plans to reimport, so this write-path guard should not be hit in practice — which is why no migration was made. If the owner wants previously-flagged copies to be physically assignable before reimporting, that needs a follow-up migration (Architect + owner approval).

## Verification
- `./node_modules/.bin/tsc --noEmit` — 139 errors, down from the 141-error baseline; no file that was clean before is broken now, and `src/app/collection/page.tsx` (one of the named files) is now error-free. All remaining errors are pre-existing and untouched (O-007).
- `./node_modules/.bin/vitest --run` (full suite) — 135 failed / 1410 passed, against a pre-recorded baseline of 134 failed / 1424 passed. The only file that differs from baseline is `src/lib/deck-list-generator.property.test.ts`, which is the known randomly-failing property test tracked as T-39; it passes 4/4 in isolation here.
- Focused tests (the files this task touched): `vitest --run src/components/StatusControl.test.tsx src/components/StatusFilter.test.tsx src/components/collection/CollectionRollupTab.test.tsx src/lib/__tests__/supply-pool.test.ts src/lib/card-status.test.ts src/app/api/collection/printings/route.test.ts src/app/collection/page.test.tsx` — 89 passed / 89.
- `./node_modules/.bin/eslint .` — 581 problems (264 errors, 317 warnings), against a baseline of 588 (270 errors, 318 warnings). No new lint problems were introduced; the touched files' remaining `any`/`prefer-const` findings are all pre-existing.
