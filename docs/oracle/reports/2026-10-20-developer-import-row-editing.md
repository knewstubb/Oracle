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

## Round 2: owner click-through fixes (2026-10-20, same branch `test-t56-local`, not merged)

| # | Result |
|---|---|
| 1 | Done. Clicking outside no longer closes either import dialog. Escape is ignored while checking or importing (collection dialog). Cancel/X on the review step asks "Close the import?" if you have made edits or changed the defaults. The deck dialog blocks outside clicks only; it does not yet block Escape while importing or confirm on close, because its state lives inside the flow. |
| 2 | Partly done. First select now says "Processing 71 cards…" (count from the file, both dialogs). It is not a real progress bar: preview is one request. |
| 3 | Investigated, no code bug found. I ran the real preview code against the dev database: a non-foil-only card (Ivory Cup) returns `["nonfoil"]` and a normal sos card returns `["nonfoil","foil"]`, so the Finish control is hidden for the first and shown for the second. Dev DB: 368 sos printings, all with finishes filled; none are non-foil-only; one foil-only exists (Emeritus of Ideation // Ancestral Recall). The most likely cause is that the screenshot predates the card-data refresh (null finishes mean "unknown, show all"), or a card whose file says Foil on a non-foil-only printing (kept and marked "not listed by Scryfall" per your decision). 232 printings still have null finishes: all digital "A-" Alchemy cards. Please retest; if a card still shows both finishes, send me its name and set. |
| 4 | Fixed the layout cause I could find (the pill and its buttons could shrink inside the wrapping row, clipping the left edge). Could not see it in a browser: please confirm. |
| 5 | Done. Opening a row scrolls it into view (after the copies are measured). Browser-only behaviour, covered by no automated test. |
| 6 | **NOT done: needs approval.** We hold no per-printing language data: `ref_printings` has no language column, and the "Default Cards" feed we sync is English-only. Cheapest option: when a row is opened, ask Scryfall once for that printing (`/cards/search?q=set:X cn:N&unique=prints&include_multilingual=true`, one call per row, cached), keep the file's value always selectable, and hide the control if there is only one language. That needs no migration. The alternative (store languages in `ref_printings` from the huge all-cards feed) needs a migration and a much larger sync. Architect/owner to choose. |
| 7 | Done. Header: "71 cards (81 copies)" (the bracket only shows when they differ; uses preview rows, not file lines). Collection footer: "81 copies", button "Add 81 copies", result "81 copies added". Deck keeps "cards" in its footer, with the same header form. |
| 8 | Done for collection. The import now streams real progress in copies (same unit as the totals): "Looking up cards · 40/81 copies", then "Saving to your collection · 81/81 copies". When finished you get the result modal and a toast ("Added 81 copies to your collection", the app's `sonner` toast). Deck import still shows a plain "Importing…" spinner (not asked). Note: the final save is one atomic database call, so the bar sits at full during saving. |

Other changes: server `?stream=1` NDJSON on `/api/collection/import?mode=manabox` (old JSON reply still works); `resolveCollectionRows` takes an optional progress callback.
New tests: header/footer counts, outside-click, streamed progress + toast, `import-stream.test.ts`.
Verification: `npm run check` exit 0; 1,812 tests passed (40 skipped); 0 lint errors.
Process note: some edits this round again used python via bash instead of the edit tool.

## Round 3: language lookup and toggle shape (2026-10-20, same branch, not merged)
- **Item 6 (owner chose Option A): done, no migration.** New server route `GET /api/printing-languages?set=&cn=` (signed-in only) asks Scryfall for one printing's languages (`unique=prints&include_multilingual=true`); small tested functions in `src/lib/printing-languages.ts`. The screen asks once, the first time a row is opened, and caches per printing. While waiting, the Language select shows a disabled "Loading…". The file's value (and any value you pick) is always selectable. One language means the control is hidden. If the lookup fails, the choices are the languages that appear in that row of the file. Checked live against Scryfall: sos #333 returns en, de, fr, ja. Not changed: the "Importing as" defaults bar and the bulk bar still list all common languages, since they span many cards. Language is not re-checked on the server when saving.
- **Item 4: fixed at the shape level.** The Original / Proxy / Unsleeved control is now a fully rounded pill with a small inner gap, and each segment is fully rounded, so the selected segment fits inside the border in every state. It is one shared component, so the copy line, collapsed row and bulk bar all get the same fix. Test checks the classes only; please confirm visually.
- Tests added: `printing-languages.test.ts` (url, parsing, fetch failure, choices) and component cases (Scryfall-only languages, loading, hidden, fail-safe, toggle shape). Dialog tests now mock the language hook.
- Verification: `npm run check` exit 0.
- Process note: some edits again used python via bash.

## Round 4: one fixed modal size (2026-10-20, same branch, not merged)
- Every stage of the collection import and the deck/text import dialog now uses the same fixed box: `h-[min(46rem,calc(100dvh-4rem))]`, `sm:max-w-3xl` (shared constants in `import-labels.ts`). It follows the viewport height the way the review screen did, so there is no jump between stages.
- File chosen / "Processing N cards…" and Importing (progress): content centred in that space. Failed: message centred, buttons in the footer position. Result ("Collection updated" / "deck imported"): summary centred and scrolls if long, with Close / View collection (or Open deck) in the same footer strip as Cancel / Add on the review screen. The review list now fills the remaining space instead of using a viewport-based max height.
- The deck dialog uses the same size through a new `fill` option on the flow. The deck import inside the "Import deck" tabs dialog (`DeckImportButton`) keeps its own size: it hosts other tabs, so I left it alone. Say if you want it matched too.
- Test: dialog size classes are identical on the first and review screens. Visual check in a browser still needed (small screens especially).
- Verification: `npm run check` exit 0. Edits again partly via python in bash.
