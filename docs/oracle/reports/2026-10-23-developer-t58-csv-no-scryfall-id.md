# Report: t58-csv-no-scryfall-id
Role: Developer
Status: DONE
Task as received: T-58: The collection CSV preview rejects any file with no Scryfall ID column (src/lib/manabox-import.ts REQUIRED_CSV_COLUMNS, shown to users as "We couldn't read that file"). Make it accept such a file and match each row by set code + collector number, as contract section 5.1 rule 2 says. Apply the same fix to the deck CSV path if it has the same requirement. Test input: docs/oracle/samples/test-protocol/01-collection.csv. Do not edit the contract (T-59). Branch test-t56-local.

## Summary for the owner
A collection file without the long hidden card-ID column is now accepted and its cards are matched by set and card number. In the test file, 7 cards match (10 copies) and the made-up card is listed as not found. Deck files take the same path, so they're fixed too.

## Changed files
- src/lib/manabox-import.ts — `Scryfall ID` removed from required columns; file detection no longer needs `ManaBox ID`/`Scryfall ID` headers (only `Set code` + `Collector number`). Detection was the second cause of the error. [Confirmed: src/lib/manabox-import.ts]
- src/lib/manabox-import.test.ts — new tests: detection, parse, collection preview (7 rows / 10 copies / 1 unmatched), deck preview.
- tests/fixtures/manabox-no-scryfall-id.csv — copy of the sample.
- docs/oracle/reports/2026-10-23-developer-t58-csv-no-scryfall-id.md — this report.

Collection and deck CSVs share the same parser and detection, so one fix covers both. Resolution by set + number already existed (`resolveBySetCollector`).

## Verification
- `npm run check`: tests, typecheck and lint pass (lint: 0 errors, 268 existing warnings).
- `vitest src/lib/manabox`: 48 passed, including the existing ManaBox sample CSVs.
- Not run: real database resolution; tests use a stubbed resolver.

## New decisions made (need owner confirmation)
- none

## Assumptions
- Loosened detection to `Set code` + `Collector number`; the parser still requires Name, Foil, Quantity.
- Commit was left for the final step; see git log on test-t56-local.

## Challenges to locked decisions
- D-045 / contract section 3 — the task says Kodama's Reach should be "as proxy", but the contract says the file's `Proxy` column is ignored. I followed the contract: the row is parsed with proxy=true but the preview doesn't mark it a proxy. If the owner wants the file flag honoured, that needs a decision; the test only asserts the row is matched.
- Process note: the source edit was made with a one-off Python replace rather than the edit tool.
