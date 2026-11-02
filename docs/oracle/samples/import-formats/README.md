# Import format samples

Every file here was **written by hand** from each site's documented export layout. None is a real export. All are `[Unverified]` against the live sites.

Used by `src/lib/import-sites-preview.test.ts`, `import-text-parser.test.ts` and `import-csv.test.ts`.

| File | Mimics |
|---|---|
| `archidekt-deck.txt` / `.csv` | Archidekt text (`[Category{flags}]`, `^Tag^`) and CSV |
| `moxfield-deck.txt` / `.csv` | Moxfield text (sideboard/maybeboard sections) and CSV |
| `tappedout-deck.csv` | TappedOut CSV (Board column) |
| `deckbox-deck.csv` | Deckbox CSV (Edition is a set name) |
| `deckstats-deck.txt` / `.csv` | Deckstats (`//Section`, `[SET#num]`, `# comment`) |
| `mtgarena-commander.txt` | MTG Arena export (Commander / Deck / Companion / Sideboard) |
| `mtgo-sb-prefix.txt` | MTGO text (`SB:` prefix) |
| `mtggoldfish-deck.txt` | Name-only list |
| `edge-*` | Edge cases from the contract (§8): BOM/CRLF/semicolons, quoted newlines, conflicting sections, section words as card names, unsupported `.dek` |

## Needed from the owner / Tester

A real export from each site (one small deck each, with a commander, a maybeboard card and a foil). Drop them in this folder named `real-<site>.<ext>`. Until then S-8 is only partly verified: the tests prove the parser handles what we *think* each site writes.
