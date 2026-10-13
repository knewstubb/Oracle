# Report: manabox-import-server (T-55)

Role: Developer
Status: PARTIAL
Task as received: Build the server side of the ManaBox import exactly per docs/oracle/contracts/manabox-import.md (and its .types.ts), decisions D-044 to D-053 and the T-55 line in docs/oracle/status.md: CSV and text parsing, token skipping by card type, the non-writing preview, add-only collection import, deck import with per-row Original/Proxy/Unsleeved counts, basics-to-generic and text-file foil flags, and setting the commander on an existing deck; you own src/lib and src/app/api only (no screens, no migrations), with unit tests using docs/oracle/samples/manabox/.

## Summary for the owner

The page behind the new importer now reads both your ManaBox files: it understands the collection spreadsheets, the deck spreadsheet and the deck text files, keeps every detail it needs (including double-faced card names and collector numbers), and can show you a full preview of what would be added without saving anything. Importing a collection only ever adds cards, and you can set a deck's commander afterwards from the deck page. One thing is not finished: when a deck file imports a foil, the new copy is saved as non-foil, because the existing save routine cannot record a finish yet — this needs a small change to the database routine that the contract said would not be needed. Nothing you already own is changed by any of this, and the importer never uses the file's own Proxy flag.

## What was built

- ManaBox CSV and text parsing for both collection scans and deck exports.
- Identity resolution by the file's Scryfall ID (CSV) or set code + collector number (text), with tokens skipped only from resolved card data and unmatched lines reported (`no_card`, `bad_line`, `unknown_id`).
- A non-writing preview for `/api/collection/import/preview` and `/api/decks/import/preview` (the latter also still serves the existing URL preview).
- Add-only collection import with per-row Original/Proxy counts; the file's Proxy column is ignored.
- Deck import with per-row Original/Proxy/Unsleeved counts, basics-to-generic conversion, and a type-line-derived category.
- `PATCH /api/decks/[id]` now accepts `commander_id`, `commander_name` and `commander_scryfall_id` (plus the existing `build_id`).

## Changed files

- `src/lib/manabox-import.ts` — pure parsing, token detection, row combining, preview, split/proxy normalisation.
- `src/lib/manabox-resolver.ts` — Supabase `ref_printings` resolver implementing the injectable resolver.
- `src/lib/manabox-collection-import.ts` — add-only collection import via `insert_user_copies`.
- `src/lib/manabox-deck-import.ts` — one-deck import with per-row splits and basics-to-generic via `replace_deck_with_new_cards`.
- `src/lib/manabox-import.test.ts` — 25 tests covering all five sample files.
- `src/lib/text-deck-parser.ts` — keeps the collector number; DFC names preserved (contract §6.2).
- `src/lib/deck-normalizer.ts` — added optional `collectorNumber` to `NormalizedCard`.
- `src/lib/import-engine-v2.ts` — ManaBox extractor no longer treats the file's Misprint/Proxy column as a proxy (D-045).
- `src/app/api/collection/import/preview/route.ts` — new preview endpoint.
- `src/app/api/collection/import/route.ts` — ManaBox add-only dispatch (`?mode=manabox` or a JSON body).
- `src/app/api/decks/import/preview/route.ts` — ManaBox deck file preview branch.
- `src/app/api/decks/import/route.ts` — ManaBox deck import dispatch.
- `src/app/api/decks/[id]/route.ts` — commander PATCH + format legality check.

## New decisions made (need owner confirmation)

- Deck-import commit accepts the already-resolved combined rows in `deck.cards`. Because `ManaBoxNormalizedCard` carries no source index, the route reads an optional runtime `sourceIndex` on each card (or an inline `rowSplit`) to look up `rowSplits`. T-56 must send `sourceIndex` back from the preview. (Technical; no owner decision needed.)
- Collection preview/commit `sourceIndex` and `proxyCounts` keys are **1-based physical line numbers** (the header is line 1). This matches the spec's "Row 66" example for a 65-row deck file.
- Combined collection rows display the first contributing row's condition; every stored copy still keeps its own condition (D-051). 
- `totalLines` in the preview response counts card rows/lines after comments and blanks are removed.

## Assumptions

- `ref_printings` carries both `layout` and `type_line`, so token detection and category derivation need one lookup table.
- In the injected test data, only the contract/spec-named token lines are tokens (`Drake (TFDN) 8` in Armageddon.txt, `Inkling (TSOS) 7` in Strixhaven.txt). Token skipping is driven purely by resolved card data, so production behaviour follows the real Scryfall data.
- ManaBox deck imports default to `format = 'commander'`, no commander, `is_active = false`; the deck opens with the picker (D-052, T-54).

## Challenges to locked decisions

- **None to the decisions themselves.** One contract/reality gap:
  - Contract §16 says no migration is needed and §12.2 requires per-row Original/Proxy/Unsleeved writes plus a row finish. The only existing atomic deck write (`replace_deck_with_new_cards`) hard-codes `user_copies.finish = 'nonfoil'` and `source_tag = 'deck-import'`. Consequence: **foil/etched finish on a deck-imported copy is not preserved** (contract §8 text-file Foil flag, property 2). Suggested change (Architect / migration): let that RPC accept a per-row `finish` and `source_tag`, or add a dedicated ManaBox deck RPC. This task forbids migrations, so I left it as a documented limitation.
  - The same RPC's `is_maybeboard` branch is the only "planned, no copy" path available without a migration. I reuse it (passing the real category, never the string "Maybeboard") to create Unsleeved and generic-basic slots. A purpose-named `is_planned` flag would be clearer.

## Open questions

- For the deck-import commit, is the intended wire shape `{ deck, rowSplits }` with `deck.cards` being the preview rows (carrying `sourceIndex`), or should the commit re-parse the raw file itself? I implemented the former per contract §15.2.

## Verification

- `npm run check` — passed. `1639 passed | 40 skipped`, `tsc --noEmit` clean, eslint `0 errors` (262 pre-existing warnings, none in the new files).
- `./node_modules/.bin/vitest --run src/lib/manabox-import.test.ts` — 25/25 passed.
- Sample-file proofs (all five files):
  - `manabox-scan-2026-06-05.csv` — 26 rows, 0 unmatched, 0 tokens, 26 cards.
  - `manabox-scan-2026-10-13.csv` — 2 rows, optional `Signed`/`Proxy` parsed, 0 unmatched.
  - `Strix draft.csv` — 65 rows combine to 58 rows, 8 basics, 0 tokens; `Island (sos) 268` combines lines 49/52/53 to qty 3.
  - `Armageddon.txt` — 98 lines, `Drake (TFDN) 8` skipped as a token (line 22), 0 unmatched.
  - `Strixhaven.txt` — 88 lines, `Inkling (TSOS) 7` skipped, DFC names stored front-face only, 0 unmatched.
- Endpoints (`POST /api/collection/import/preview`, `POST /api/decks/import/preview`, `POST /api/collection/import?mode=manabox`, `POST /api/decks/import`, `PATCH /api/decks/[id]`): types and dispatch verified by typecheck and unit tests; responses follow the contract shapes. Not executed against a live Supabase instance in this environment.

## Environment note

This worktree had no `node_modules`; I symlinked the main checkout's `node_modules` (git-ignored, not committed) so the checks could run.
