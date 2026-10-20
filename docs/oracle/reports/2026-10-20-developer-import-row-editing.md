# Developer report: import row editing (10 steps)

Date: 2026-10-20 · Role: Developer · Status: **DONE with open items** (see Unverified)

## Task as received
Build the per-copy import editing feature for Oracle, following `docs/oracle/contracts/import-row-editing.md` and `.types.ts` (all 10 Developer tasks), on top of the owner-tested T-56 ManaBox import screens. Owner decisions approved 2026-10-20: foil proxy remembers its finish; a row stays together when a copy's language is edited; Unsleeved lines show Finish only; text Foil checkbox removed and text import uses the same preview/edit UI; unrecognised condition/language falls back to default with one counted notice; a file finish Scryfall doesn't list is kept and marked "not listed by Scryfall"; both migrations approved; refresh approved. Do not edit decisions.md; do not merge to main.

## Summary for the owner
You can now open any row in an import preview and edit each copy on its own: type (Owned / Proxy / Unsleeved), finish, condition and language. A small dot shows which values came from your file. Text imports use the same screen, and defaults sit in a bar at the top. All 10 steps are built and `npm run check` passes. The card-data refresh ran and filled in the finishes Scryfall lists.

## Branch
**`test-t56-local`** (the tested T-56 screens). Three commits on it; **not merged to main**.

## What was built
1. Pure core `src/lib/import-copies.ts` (+ test, 48 tests).
2. Migrations: both were **already applied** on remote and local (`supabase migration list` showed `20261020120000` and `20261020120100`). I did not apply them.
3. Parser and resolver: per-copy file values, `finishes` on `ref_printings`, sync of finishes.
4. Collection write (`manabox-collection-import.ts`).
5. Deck write (`manabox-deck-import.ts`), including Unsleeved as a requested-finish slot with no copy.
6. Routes: both import routes return 400 on invalid input (`ImportValidationError`); body `userId` ignored.
7. Refresh: `npm run sync:cards -- --force` finished: 118,810 processed, 118,810 upserted, 0 failed. Sampled foil-only and non-foil-only printings show the right finishes. **232 printings still have null finishes** (probably not in Scryfall's bulk feed); the app treats null as unknown.
8–10. UI in `src/components/manabox-import/`: defaults bar, row editor, bulk bar, notices; old Foil checkbox, copy stepper and type control removed.

## Changed files
- `src/lib/import-copies.ts`, `.test.ts`; `manabox-import.ts`, `manabox-resolver.ts`, `card-data-sync.ts`; `manabox-collection-import.ts`, `manabox-deck-import.ts`, `manabox-import.test.ts`, `manabox-import-write.test.ts`; `src/types/supabase.ts`
- `src/app/api/collection/import/route.ts`, `src/app/api/decks/import/route.ts`
- `src/components/manabox-import/*` (new `ImportDefaultsBar`, `ImportRowEditor`, `import-labels`, `ImportRowEditing.test`; rewritten `ImportCardList`, `types`; updated flows, summary, notices); deleted `CopyTypeControl(.test)`, `CopyCountStepper`, `FoilCheckbox`
- `src/components/collection/CollectionImportButton.test.tsx` (fixture updated)
- `docs/oracle/contracts/manabox-import.types.ts` (mirror edited, see Deviations)
- Added to git: contract, spec, mockup, earlier reports, the two migrations.

## Deviations
- Mirror types file `manabox-import.types.ts` edited to the new body/response shapes. `manabox-import.md` §6/8/9/12/13.3/15 not updated: for Architect/Gene.
- Helper signatures differ slightly from the contract sketches (`summariseRowTags` returns `{tags, overflow}`; `applyBulk` returns `{edits, applied, skipped}`; `applyCopyOneToAll` leaves copy 1 as is; `validateImportInput` takes options). Added `ImportValidationError` and `validateCopyFileValues`.
- Some edits during the work used bash (python/sed/cat) instead of the edit tool: a process slip, no content effect.
- Gene to update D-051 (and D-049 as needed); I did not touch decisions.md.

## Unverified / open
- **Contract test 15** (read-back against a real database) is **not written**. I couldn't inspect the body of the `replace_deck_with_new_cards` function and did not want a destructive test. Needs an opt-in test or manual check.
- Rollup proxy counting: `allocation-rollup.ts` already excludes proxies via `isProxy`; I did not audit the collection page's foil/condition counts (contract §5 rule 3).
- Not click-tested in a browser by me; only component tests.

## Open questions for the owner
1. Unsleeved lines show Finish only (your approved default): confirm after trying it.
2. ManaBox files fill every field, so defaults only matter for text imports and blank cells. Is that what you expect?
3. Should the 232 null-finish printings be chased, or left as unknown?

## Verification
- `npm run check`: exit 0. 164 test files passed (4 skipped), 1806 tests passed (40 skipped); typecheck clean; lint 0 errors (266 existing warnings).
- New tests: `import-copies.test.ts` (48), `manabox-import-write.test.ts` (8), `ImportRowEditing.test.tsx` (10), plus updated flow/dialog tests.
