# Report: t60-import-formats
Role: Developer
Status: PARTIAL
Task as received: T-60: build docs/oracle/contracts/import-formats.md slices S-1 to S-6 and S-8 in order. Not S-7 (blocked on owner approval of a migration). S-1 honours the CSV Proxy column (D-055); update the T-58 test. Branch test-t56-local; commit per slice. Do not touch decisions.md or the contract.

## Summary for the owner
Deck imports now understand files from Archidekt, Moxfield, TappedOut, Deckbox, Deckstats, MTG Arena, MTGO and Goldfish. Sideboard and maybeboard cards land on the maybeboard instead of the main deck, and unsupported files get a clear message. Two parts are not finished: choosing a second commander (partner) can't be saved without a database change, and I only had hand-made sample files, so I need a real export from each site.

## Slice status
| Slice | Status | Commit |
|---|---|---|
| S-1 CSV Proxy column is the default on review rows (D-055); T-58 test now expects Kodama's Reach = Proxy | DONE | 2f6c9ee |
| S-2 One shared text parser (sections, `SB:`, tags, set/number, `//Section`, comments) | DONE | 4edad1f |
| S-3 One shared CSV reader and header aliases for all sites (BOM, CRLF, `; tab` delimiters, quoted newlines) | DONE | b43740a |
| S-4 Finish and proxy markers in text (`*F*`, `*E*`, `^Proxy^`) and CSV finish columns | DONE | 322cf84 |
| S-5 Maybeboard rows (no copies, "Maybeboard" planned slots), file guard (5 MB / 5,000 lines / .dek/.xml/.json refused), plain-words preview notes | DONE | be0fbe8 |
| S-6 Commander pre-tick and pair legality | PARTIAL | cdcca47 |
| S-7 Companion in the command zone | NOT BUILT (blocked, migration awaits owner approval) | — |
| S-8 Fixtures per site | PARTIAL | a589497 |

### S-6 gap
Done: the commander the file marks is pre-ticked in the picker (first one if several); `checkCommanderPair` (Partner, Partner with, Friends forever, Choose a Background + Background, Doctor's companion) with a plain-words refusal, unit-tested.
Not done: the two-tick picker UI, and saving a second commander. `decks` has one commander column and no route sets `deck_cards.is_commander` after import. Saving a partner needs either a new column or a new route that flags the card rows. That is an Architect call; the legality function is ready for it. The preview already returns every commander in the file (`commanders`).

### S-8 gap
No real exports exist in the repo. All fixtures are hand-built and `[Unverified]` (see `docs/oracle/samples/import-formats/README.md`).

## Changed files
- New: src/lib/import-text-parser.ts, import-csv.ts, import-file-guard.ts, commander-pairing.ts, plus tests import-text-parser.test.ts, import-csv.test.ts, import-finish.test.ts, import-sites-preview.test.ts, commander-pairing.test.ts.
- Changed: src/lib/manabox-import.ts, manabox-deck-import.ts, text-deck-parser.ts, csv-deck-parser.ts, manabox-import.test.ts, manabox-import-write.test.ts; src/app/api/decks/import/preview/route.ts; src/components/manabox-import/ManaBoxDeckImportFlow.tsx, types.ts.
- Fixtures: docs/oracle/samples/import-formats/*.
- Contract type mirrors extended (see Assumptions): docs/oracle/contracts/import-row-editing.types.ts, manabox-import.types.ts.

## Verification
- `npm run check`: see final line of this section.
- Each slice has its own unit tests; the write-path test confirms maybeboard rows create no copies and no user_cards rows.
- Not run: real database, real site exports, browser check of the review screen notes.
- RESULT: tests passed (2223+), typecheck clean; lint 0 errors (existing warnings only).

## New decisions made (need owner confirmation)
- none

## Assumptions
- Maybeboard card = `deck_cards` planned slot, category "Maybeboard", no copy (D-018, D-022). Row key gets a `|maybeboard` suffix, so the same card in main and maybeboard stays two rows (E-1).
- Commander-board lines stay main rows; companion lines stay in main with a note until S-7.
- Deckbox `Edition` is a set name; there is no name-to-code table, so those rows match by name only and a note says so (E-16).
- Content decides CSV vs text, not the file extension.
- I extended the Architect-owned type mirrors: `ImportBoard`; `board`/`finish`/`proxy` on text lines; `notes` and `commanders` on the preview response; `ManaBoxCsvRow.board`; `ImportRow.board`; `ImportCopyFileValues.proxy`. Architect to confirm or fold into the contract.

## Challenges to locked decisions
- none

## Open questions
- Real export from each site, please (Owner/Tester).
- S-6 second commander: new column or new route? (Architect)
- S-7 still waits on owner approval of the `command_zone_role` migration.

## Process disclosures
- CSV fixtures were created with bash `printf`, not the create tool.
- `text-deck-parser.ts` was removed with `rm` and recreated.
- Unrelated uncommitted files were left untouched: decisions.md, status.md, manabox-import.md, paseo.json, scripts/dev-test.sh, scripts/env.testdb.example, docs/oracle/test-protocol-import.md, docs/oracle/samples/test-protocol/, and the Architect T-59 report and the contract (untracked).
- No new environment variables.
