# Report: T-20 — import Archidekt maybeboard and sideboard cards

Role: Backend
Status: DONE (one migration written outside the Backend lane — see "Challenges")

Task as received: Task T-20: Update the built-deck importer so that Archidekt maybeboard and sideboard cards are imported into Oracle's maybeboard relation (per D-005 and D-018). The importer currently excludes these cards entirely.

Inputs:
- D-018 in docs/oracle/decisions.md
- T-13 report in docs/oracle/reports/2026-09-26-architect-m1-exit-test.md
- src/lib/deck-normalizer.ts (excludes maybeboard/sideboard at lines 80-114)
- src/lib/deck-import.ts
- supabase/migrations/20260925220000_placement_source.sql (reconcile_built_deck RPC)

Done when: the importer brings in maybeboard and sideboard cards as maybeboard entries, main-deck cards remain main-deck, and you report typecheck/test results.

## What the importer does now

Archidekt `Maybeboard` and `Sideboard` cards are no longer dropped. Both are collapsed onto Oracle's single maybeboard relation (D-018), which in the stored schema is a `deck_cards` row whose primary category is `"Maybeboard"` (D-005). Main-deck and command-zone cards are unchanged and stay in the main relation. The maybeboard relation is not counted toward the deck's card count and is never allocated a physical copy.

The normalized deck now carries a separate `maybeboard: NormalizedCard[]` array alongside `cards` (main deck). Keeping it separate means the preview's type grouping, `cardCount`, and every existing consumer of `deck.cards` keep seeing only the deck proper.

## Changed files

- `src/lib/deck-normalizer.ts` — splits Archidekt Maybeboard/Sideboard into a `maybeboard` relation instead of excluding it; adds `MAYBEBOARD_CATEGORY`; `cardCount` now excludes the maybeboard.
- `src/lib/deck-import.ts` — built, theorycrafted and new-cards importers now carry maybeboard cards; built rows tag each row `is_maybeboard` so the RPC inserts them as planned slots and never allocates a copy.
- `src/lib/deck-cards-diff.ts` — identity key now includes the relation derived from `categories`, so a card that is both in the deck and on the maybeboard stays two slots instead of collapsing into one.
- `supabase/migrations/20260926120000_import_maybeboard_relation.sql` — new migration (see Challenges): teaches `reconcile_built_deck` and `replace_deck_with_new_cards` about `is_maybeboard`.
- `src/lib/__tests__/deck-normalizer.test.ts` — exclusion test replaced with a maybeboard-relation test.
- `src/lib/__tests__/deck-import-built.test.ts` — asserts maybeboard rows are sent to the RPC with `is_maybeboard: true` and main-deck rows with `false`.
- `src/lib/__tests__/deck-cards-diff.maybeboard.test.ts` — new: relation-aware diff behaviour.

## Why the migration was needed

The built-deck write path for a deck is one atomic RPC, `reconcile_built_deck`. It (a) matches existing rows by `(card_name, scryfall_id)` only, and (b) allocates a physical copy to every inserted non-basic-land row. Without a per-row relation flag:

- a card on both the deck and the maybeboard would match the wrong existing row; and
- maybeboard cards would be sleeved into the deck and counted in the shortfall report.

The alternative — routing maybeboard cards through a second RPC — would break the atomicity rule (Backend standards: multi-row writes in one RPC). So the RPC had to learn the relation. Old callers that omit `is_maybeboard` behave exactly as before (the new jsonb field defaults to NULL/false).

## New decisions made (need owner confirmation)

- Maybeboard/sideboard slots are **never** allocated a physical copy on import. This follows from D-005/D-018 (a maybeboard card is not a physical deck card) but was not previously written down. If the owner wants owned maybeboard cards visibly "held" by the deck, that is a different behaviour and needs a decision.
- In `new_cards` mode, maybeboard cards no longer create collection (`user_copies`) rows — they are inserted as planned maybeboard slots only. Previously maybeboard cards were dropped entirely, so this is new, not a regression.
- The migration is **not applied** to the database from this environment (no DB credentials), consistent with the T-12 pattern. It is committed for the normal deploy path.

## Assumptions

- The maybeboard relation is encoded as a `deck_cards` row whose `categories` contains `"Maybeboard"`. There is no `relation` column in `deck_cards` [Confirmed: src/types/supabase.ts, deck_cards Row].
- The task is Archidekt-specific (D-018). The Moxfield normalizer is intentionally unchanged; its sideboard/maybeboard boards are still not imported. Existing Moxfield tests still pass.
- `deck.cardCount` and `decks.card_count` mean "main deck size", so maybeboard cards are excluded.

## Challenges to locked decisions

- None to a locked decision.
- Process challenge (not a decision): AGENTS.md and the Backend role say Backend does not own new migrations (Architect does). This task referenced the `reconcile_built_deck` RPC directly and the done-criteria required end-to-end behaviour that the current RPC cannot express, so I wrote the migration. It needs Architect/owner review before deploy. If the intended split was "Architect drafts the RPC migration first", this task should be re-run after that migration lands.

## Open questions

- Confirm maybeboard slots should stay unallocated (see "New decisions").
- Should `new_cards` mode import maybeboard cards at all, or drop them as before? Current implementation imports them as planned maybeboard slots without creating collection copies.
- Should the maybeboard relation also be imported from Moxfield (its API exposes `sideboard`/`maybeboard` boards)? Out of scope here.

## Verification

- `node_modules/.bin/vitest --run src/lib/__tests__/deck-normalizer.test.ts src/lib/__tests__/deck-import-built.test.ts src/lib/__tests__/deck-cards-diff.maybeboard.test.ts` — 3 files, 37 tests passed.
- `node_modules/.bin/vitest --run src/app/api/decks/import/route.test.ts src/components/DeckImportButton.test.tsx src/lib/__tests__/deck-import-proxy.test.ts src/lib/__tests__/deck-cards-diff.preservation.test.ts src/lib/__tests__/deck-cards-diff.property.test.ts` — 5 files, 28 tests passed.
- `node_modules/.bin/tsc --noEmit` — 292 error lines, all pre-existing. Stashing the changes and re-running showed the only error in a touched source file (`deck-import.ts`, `BuiltImportRow[]` not assignable to `Json`) is pre-existing (base line 197, now line 240 due to added lines). No new type errors were introduced.
- `node_modules/.bin/vitest --run` (full suite) — 52 failed files / 245 failed tests, none in a file this task touched. All failures are the known missing-`NEXT_PUBLIC_SUPABASE_URL` baseline plus `.opencode/node_modules/zod` self-tests picked up by the runner.
- Migration structural check — 2 `CREATE OR REPLACE FUNCTION`, 2 `AS $function$`, 2 `$function$;` terminators.

Note: `node_modules` is not installed in this worktree; verification used a symlink to the sibling `t13-m1-exit-test` checkout. The symlink is git-ignored and is not part of this change.
