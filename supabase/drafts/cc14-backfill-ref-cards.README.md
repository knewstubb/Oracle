# CC-14 card library backfill (NOT applied, needs owner approval)

## What this does, in plain words
About 100 cards you own have no entry in the shared card library, so filters and rules-text search skip them. This script adds them from Scryfall and fixes two-faced cards already in the library.

- **Adds about 100 cards** to the library: 43 single-faced new cards and 57 two-faced cards (a card with a front and a back).
- **Fills in the missing rules text** on the 132 two-faced cards already in the library, and **respells their creature types** so the subtype filter sees "Human, Scientist, Hero" and not one odd word.
- Only rows with empty rules text are touched, and only the rules text and type line. Existing text is never overwritten.

## What does NOT change
- Your decks, collection, copies, locations and proxies.
- Any library card that already has rules text.
- The database structure. No migration.

The numbers above come from a read-only check on 2026-11-18. The dry run prints the real ones.

## Dry run (safe, reads only)
```
npx tsx supabase/drafts/cc14-backfill-ref-cards.ts --user-id <your user id>
```
It prints counts by cause, every card it would add, before and after for every card it would change, and any problems (for example a card Scryfall cannot find). It also writes the planned change list to `cc14-backfill-ref-cards.manifest.json`, marked as a dry run. Nothing is written to the database.

## Rehearse on a throwaway database
1. Make a separate test Supabase project. Copy `scripts/env.testdb.example` to `.env.testdb.local`, fill in its values and set `TEST_DB_CONFIRMED=yes` in that file.
2. Run:
```
CC14_OWNER_APPROVED=yes npx tsx supabase/drafts/cc14-backfill-ref-cards.ts --user-id <test user id> --env-file .env.testdb.local --apply
```
3. Run it again: the second run changes nothing.

## Apply to the live project (only after the owner approves)
Writing is refused unless all of these are present: `--apply`, `CC14_OWNER_APPROVED=yes`, and either the throwaway-database setup above or the extra `--live` flag. Agents must never run it with `--apply`, `--live` or `--rollback`.

## Undo
Every apply writes an undo list (`cc14-backfill-ref-cards.manifest.json`, or a dated copy if that file already holds an earlier apply). Undo with:
```
CC14_OWNER_APPROVED=yes npx tsx supabase/drafts/cc14-backfill-ref-cards.ts --rollback <manifest file> --live
```
It removes the added cards and puts back the previous type line and empty text. `cc14-backfill-ref-cards.rollback.sql` does the same by hand if the script is not available. A dry-run list cannot be used to undo.

## Known limits
- Only "Time Lord" is kept as one two-word creature type. Other two-word subtypes would be split into two.
- "Can be commander" is an approximation of Scryfall's own commander rule (legendary creatures, text saying the card can be your commander, legendary vehicles and spacecraft with power and toughness).
- The "default category" of new cards is left empty.
- New sets add new cards, so this needs re-running after each release until the library loader itself is fixed.
- Cards Scryfall does not return, or returns under a different name, are listed as problems and skipped, never guessed.
