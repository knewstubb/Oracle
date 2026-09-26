# Report: T-20 migration review — import maybeboard relation

Role: Architect
Status: DONE
Task as received: Review the migration written by the Backend agent for T-20: ~/.paseo/worktrees/03dz1jp4/t20-import-maybeboard-sideboard/supabase/migrations/20260926120000_import_maybeboard_relation.sql. The Backend agent added an is_maybeboard flag to reconcile_built_deck and replace_deck_with_new_cards so that Archidekt maybeboard/sideboard cards import as maybeboard relation without being allocated copies. Check it against D-005, D-018, D-022, and existing migration patterns. Approve it or list required changes.

## Changed files

- `~/.paseo/worktrees/03dz1jp4/t20-import-maybeboard-sideboard/supabase/migrations/20260926120000_import_maybeboard_relation.sql` — approved as drafted; no required changes.

## Approve/reject verdict

**Approve.** The migration correctly implements D-005, D-018, and D-022 and follows the existing migration style established in `20260925220000_placement_source.sql`.

## Review findings

### Decision compliance

- **D-005** — Maybeboard is modelled as a separate `deck_cards` relation. The migration preserves this by matching existing rows within the same relation (`card_name`, `scryfall_id`, plus whether `categories` contains `"Maybeboard"`) and by inserting new maybeboard rows with `copy_id NULL` and `ownership_status NULL`. A card that exists in both the main deck and the maybeboard therefore stays as two slots. [Confirmed: `20260926120000_import_maybeboard_relation.sql` lines 287–339, 341–365]
- **D-018** — Archidekt `Maybeboard` and `Sideboard` cards both collapse onto Oracle's single maybeboard relation. The normalizer handles the collapse and passes `is_maybeboard = true` with `categories = '["Maybeboard"]'`; the RPC simply respects the flag. [Confirmed: `src/lib/deck-normalizer.ts` lines 95–102, 127–128; `src/lib/deck-import.ts` lines 121–135, 537–551]
- **D-022** — In `new_cards` mode, maybeboard/sideboard cards are inserted as planned maybeboard slots only and do **not** create `user_copies` rows. The migration branches on `is_maybeboard` and skips the `user_copies` insert for those rows. [Confirmed: `20260926120000_import_maybeboard_relation.sql` lines 107–139]

### Pattern compliance

- The migration keeps the same function signatures (`p_rows jsonb`), so old callers that omit `is_maybeboard` continue to work because the field defaults to `NULL` and is coalesced to `false`.
- Header comment follows the T-12/T-13 style: task reference, decisions cited, behavioural description, and reversibility note.
- Uses `CREATE OR REPLACE FUNCTION`, `SECURITY DEFINER`, `SET search_path = public`, and `$function$` delimiters consistently with `20260925220000_placement_source.sql`.
- No schema changes are required because the maybeboard relation is already encoded in the existing `categories` text column, matching the current `deck_cards` schema. [Confirmed: `src/types/supabase.ts` lines 307, 325]
- File naming is sequential: `20260925220000_placement_source.sql` → `20260926120000_import_maybeboard_relation.sql`.

### Observations (not blocking)

- The relation detection in `reconcile_built_deck` uses `dc.categories LIKE '%Maybeboard%'`. This is consistent with the current encoding but is a substring match on a JSON-serialised array. If the category taxonomy ever grows a category whose name contains `"Maybeboard"` as a substring, matching could drift. This is acceptable for the current Archidekt category set and can be revisited if a dedicated `relation` column is ever added.
- The Backend agent wrote this migration, which is normally the Architect's lane. The migration itself is sound, so this review approves the technical content. The process note is recorded below for the Orchestrator.

## New decisions made (need owner confirmation)

- None. The migration implements already-locked decisions.

## Assumptions

- The maybeboard relation is encoded as a `deck_cards` row whose `categories` text contains `"Maybeboard"`. There is no separate `relation` column in `deck_cards`. [Confirmed: `src/types/supabase.ts` deck_cards Row]
- `is_maybeboard` is always supplied by the current callers; when omitted by older callers, the COALESCE to `false` preserves previous behaviour.

## Challenges to locked decisions

- None.

## Open questions

- Process only: the Backend agent authored the migration, which AGENTS.md assigns to the Architect lane. The migration is technically approved by this review, but the Orchestrator should confirm whether the lane boundary should be tightened for future tasks that need an RPC schema change.

## Verification

- Structural check on `20260926120000_import_maybeboard_relation.sql` — 2 `CREATE OR REPLACE FUNCTION`, 2 `AS $function$`, 2 `$function$;` terminators; balanced.
- Decision compliance check — D-005, D-018, D-022 satisfied per the findings above.
- Caller compatibility check — `src/lib/deck-import.ts` passes `is_maybeboard: true` for maybeboard rows in both `reconcile_built_deck` and `replace_deck_with_new_cards` paths, and `false` for main-deck rows. [Confirmed: `src/lib/deck-import.ts` lines 135, 530, 548]
- No database-level apply was attempted because no DB credentials are available in this environment, consistent with the Backend agent's T-12 pattern.
