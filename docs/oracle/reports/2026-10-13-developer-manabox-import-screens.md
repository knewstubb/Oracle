# Report: manabox-import-screens (T-56)

Role: Developer
Status: DONE
Task as received: Build the ManaBox import screens (collection import and deck import, including the commander picker that opens straight after a deck import) exactly per the approved spec docs/oracle/specs/manabox-import.md and mockup docs/oracle/mockups/manabox-import.html, wired to the merged server routes from T-55 (see docs/oracle/contracts/manabox-import.md section 15 and docs/oracle/reports/2026-10-13-developer-manabox-import-server.md); you own src/components and src/app pages only (no migrations, no changes to src/lib or src/app/api beyond tiny type exports; report anything else needed), with component tests where the repo has a pattern. Done when: npm run check passes, both import screens work against the T-55 routes for the five sample files in docs/oracle/samples/manabox/, and your report lists what you could not verify without the hosted database. For Brad (plain words): Build the new import screens you approved, connected to the importer behind the scenes.

## Summary for the owner

The new ManaBox import screens are live in the app. From Collection you can import a ManaBox CSV and choose per-card Original/Proxy before adding only; from Import Deck the File tab accepts a ManaBox CSV or text file and lets you mark each card as Original, Proxy or Unsleeved, convert basic lands to generic slots, and review before anything is saved. After a Commander deck import, the new deck opens with the commander picker already showing. One item is not wired: the card "⋯ Make commander" menu item, because the deck page does not currently have a card actions menu to add it to.

## Changed files

- `src/components/manabox-import/` — new directory containing all import UI components and tests.
  - `types.ts` — UI-local state types, row-choice helpers, and payload builders for the T-55 commit routes.
  - `ManaBoxFilePicker.tsx` — dashed drop zone with Choose file button and drag-over/error states.
  - `ImportFileChip.tsx` — file name · count · Change chip in the dialog header.
  - `DeckImportOptions.tsx` — name, format and generic-basics switch.
  - `ImportNoticeLine.tsx` — unmatched-line and skipped-token notices.
  - `CopyTypeControl.tsx` + `CopyCountPicker.tsx` — Original/Proxy/Unsleeved segments and count picker.
  - `FoilCheckbox.tsx` — per-row foil tick box for text files.
  - `ImportCardList.tsx` — virtualized card list with filters, search, selection and bulk bar.
  - `ImportSummary.tsx` — footer count summary.
  - `ImportProgress.tsx` — collection progress bar and deck importing spinner.
  - `ImportResult.tsx` + `ImportResultLine.tsx` — done dialog and dismissible deck-page result line.
  - `ManaBoxCollectionImportDialog.tsx` — collection import dialog state machine.
  - `ManaBoxDeckImportFlow.tsx` — deck import flow (used standalone and inside the existing import dialog).
  - `ManaBoxDeckImportDialog.tsx` — standalone deck import dialog wrapper.
  - `CommanderPicker.tsx` + `ChooseCommanderButton.tsx` — commander picker and header button.
  - `*.test.tsx` — component tests.
- `src/components/collection/CollectionImportButton.tsx` — now opens the ManaBox collection import dialog.
- `src/components/collection/CollectionImportButton.test.tsx` — updated for the new dialog flow.
- `src/components/DeckImportButton.tsx` — the File tab now renders the ManaBox deck import flow; CSV tab removed.
- `src/app/decks/[id]/page.tsx` — shows Choose commander button when commander is missing, opens picker automatically after a fresh Commander import, and renders the import result line.

## New decisions made (need owner confirmation)

- The card "⋯ Make commander" menu item from the spec is not implemented because the deck page has no card-level actions menu to attach it to. Adding it requires a new menu on each card in `CardsTab`/`CardGrid`, which is outside the import-screen scope.
- The import result line on the deck page reads its counts from `sessionStorage` placed there by the import flow before navigation. This avoids long query strings.
- The standalone `ManaBoxDeckImportDialog` and the inline File tab both use the same `ManaBoxDeckImportFlow` component.

## Assumptions

- The T-55 server routes (`/api/collection/import/preview`, `/api/collection/import?mode=manabox`, `/api/decks/import/preview`, `/api/decks/import`, `PATCH /api/decks/[id]`) are deployed and behave as documented.
- The deck import commit accepts preview rows as `deck.cards` carrying `sourceIndex` and inline `rowSplit`, per the T-55 report.
- `CommanderSearch` (used for "Search all cards") and the `/api/ai/search` endpoint are available and accept a legendary-creature commander query.

## Challenges to locked decisions

- None to the locked decisions themselves. One implementation gap noted: the deck import commit cannot preserve foil/etched finish on created copies because the existing `replace_deck_with_new_cards` RPC hard-codes `finish = 'nonfoil'`. This was already documented in the T-55 report and is unchanged.

## Open questions

- Should the card-level "Make commander" menu item be added in a follow-up task, and if so, where should the menu live (card tiles, list rows, or both)?
- For "Search all cards" in the commander picker, should results be restricted to cards the user owns, or to all legendary creatures?

## Verification

- `npm run typecheck` — passed (`tsc --noEmit` clean).
- `npm run lint` — passed, 0 errors (272 pre-existing warnings).
- `npm test` — passed, `146 passed | 4 skipped`, `1645 passed | 40 skipped`.
- `./node_modules/.bin/vitest --run src/components/manabox-import/` — passed, 10/10.
- `./node_modules/.bin/vitest --run src/components/collection/CollectionImportButton.test.tsx` — passed, 3/3.
- `./node_modules/.bin/vitest --run src/components/DeckImportButton.test.tsx` — passed, existing tests still pass.
- Sample-file proofs via the existing `src/lib/manabox-import.test.ts` (25/25 passed):
  - `manabox-scan-2026-06-05.csv` — 26 rows, 0 unmatched, 0 tokens.
  - `manabox-scan-2026-10-13.csv` — 2 rows, optional columns parsed.
  - `Strix draft.csv` — 65 rows combine to 58, 8 basics.
  - `Armageddon.txt` — token skipped.
  - `Strixhaven.txt` — token skipped, DFC names preserved.

## What could not be verified without the hosted database

- Actual `POST /api/collection/import/preview` and `/api/decks/import/preview` responses against the real `ref_printings` table.
- Actual commit via `POST /api/collection/import?mode=manabox` and `POST /api/decks/import` writing real rows.
- Actual `PATCH /api/decks/[id]` commander update and the resulting deck page opening with the picker.
- End-to-end import of all five sample files through the UI (file picker → preview → commit → result).
- Foil/etched finish preservation on deck-imported copies (blocked by the RPC limitation above).
