# Report: T-21 migration review — exact-printing assignment on built-deck import

Role: Architect
Status: DONE
Task as received: Review the migration written by the Backend agent for T-21: `~/.paseo/worktrees/03dz1jp4/t21-exact-printing-import/supabase/migrations/20260926130000_exact_printing_import.sql`. The Backend agent modified `reconcile_built_deck` so it only assigns a physical copy when the owned copy's printing exactly matches the deck's listed `scryfall_id`. Check it against D-020, D-021, the T-13 findings, and existing migration patterns. Approve it or list required changes. Subsequent owner decisions added D-023 (basic lands are fungible on import) and D-024 (`printing_mismatch` conflict reason).

## Verdict

**Approve.** After applying the owner decisions, the migration and its TypeScript contract satisfy D-020, D-021, D-023, and D-024. The DRAFT header remains in place until the Orchestrator removes it at deploy time.

## Required changes applied during review

1. **D-023 — Basic-land fungibility.**
   - Added `is_basic_land` to the `reconcile_built_deck` JSON payload [Confirmed: `src/lib/deck-import.ts`, lines 97-100 and 127-138].
   - Updated the RPC to treat any basic land as exempt from exact-printing rules: existing basic-land assignments are preserved regardless of printing, and any owned basic land of the same name can fill a basic-land slot [Confirmed: `20260926130000_exact_printing_import.sql`, lines 150-153, 165-168, 189-196, 275-281].
   - Generic basic-land rows (no `scryfall_id`) keep their existing untracked behavior.

2. **D-024 — `printing_mismatch` conflict reason.**
   - Extended the `AllocationConflict.reason` union and parser to accept `'printing_mismatch'` [Confirmed: `src/lib/deck-import.ts`, lines 29-37 and 199-203].
   - Updated the RPC to count exact-printing copies separately and return `printing_mismatch` when the card is owned but no copy exists in the requested printing [Confirmed: `20260926130000_exact_printing_import.sql`, lines 349-411].

3. **Header polish.**
   - Kept the `DRAFT` marker per Architect output standards.
   - Updated the header comment to describe D-023 and D-024 and removed a drifting line-number reference to the old fallback.

## Changed files

- `~/.paseo/worktrees/03dz1jp4/t21-exact-printing-import/supabase/migrations/20260926130000_exact_printing_import.sql` — added `is_basic_land` handling, exact-printing conflict counts, `printing_mismatch` reason, and updated header comments.
- `~/.paseo/worktrees/03dz1jp4/t21-exact-printing-import/src/lib/deck-import.ts` — added `is_basic_land` to the built-import row payload and `printing_mismatch` to the conflict reason contract.

## What was reviewed and why it passes

- **D-021 (exact printing).** The new `reconcile_built_deck` body removes the old `ORDER BY CASE … THEN 0 ELSE 1 END` fallback that preferred a printing match but accepted any owned copy of the same name [Confirmed: `20260925220000_placement_source.sql`, lines 1403-1407]. Non-basic inserts now require `v_row.scryfall_id IS NOT NULL AND uc.printing_id = v_row.scryfall_id` [Confirmed: `20260926130000_exact_printing_import.sql`, lines 275-281]. Existing mismatched non-basic assignments are released to default storage and left Planned [Confirmed: `20260926130000_exact_printing_import.sql`, lines 198-221].
- **D-020 (no automatic allocation).** When no eligible copy is free, the slot stays Planned. The function never swaps in a different printing or back-fills existing unassigned rows.
- **D-023 (basic lands are fungible).** Basic lands are excluded from exact-printing matching in both the existing-row preservation path and the new-slot allocation path. Any owned basic land of the same name can fill a basic-land slot.
- **D-024 (`printing_mismatch`).** The conflict object now distinguishes "owned, but not in this printing" from "no free copy" and "claimed." The TypeScript contract accepts the new reason.
- **T-13 section 6 (124 printing mismatches).** The re-import path will clear those 124 non-basic slots on the next built-mode import because any existing assignment whose `printing_id` does not equal the imported `scryfall_id` is released.
- **Existing patterns.** The migration is forward-only (with a reversibility note), keeps the same SQL function signature and JSON return shape, uses the same advisory-lock and `FOR UPDATE` patterns as T-12/T-20, and preserves the maybeboard/generic-land/proxy exemptions introduced in T-20 [Confirmed: `20260926120000_import_maybeboard_relation.sql`].

## New decisions made (owner confirmed)

- **D-023:** Basic lands are fungible during built-deck import. Any owned basic land of the same name can fill a basic-land slot, regardless of the source printing.
- **D-024:** A new conflict reason, `printing_mismatch`, is returned when a card is owned but not in the exact printing requested by the imported deck.
- Re-importing a slot with a wrong-printing copy releases that copy to storage and leaves the slot Planned; there is no automatic swap to a correct-printing copy (confirmed against D-020).

## Assumptions

- The imported `deck_cards.scryfall_id` is the source of truth for "the printing listed in Archidekt."
- `reconcile_built_deck` is the only built-mode copy selector, so no additional TypeScript guard is needed.
- Generic basic-land rows (no `scryfall_id`) remain exempt from both exact-printing matching and individual copy tracking, consistent with the existing `is_generic_land` handling.
- Proxy copies in storage remain eligible for built-mode allocation if they match the requested printing (or are basic lands). This is unchanged from prior behavior.

## Challenges to locked decisions

None.

## Open questions (not blockers)

1. **Proxy-copy preference in built mode.** The insert-eligibility query does not exclude `user_copies.is_proxy = true`. If the only free exact-printing copy is a proxy, the slot will be assigned as a proxy. This is consistent with prior behavior, but built mode may want to prefer real copies in the future.
2. **Legacy `finalize_import_claims`.** That RPC still allocates by card name without checking `scryfall_id`. It is outside the built-mode path and outside the scope of T-21, but it should be reviewed separately if it remains in use.

## Verification

- Structural check on `20260926130000_exact_printing_import.sql`: 1 `CREATE OR REPLACE FUNCTION`, 1 `AS $function$`, 1 `$function$;` terminator, 0 occurrences of the old `THEN 0 ELSE 1 END` fallback, 7 `is_basic_land` references, 4 `printing_mismatch` references.
- `node_modules/.bin/vitest --run src/lib/__tests__/deck-import-built.test.ts src/lib/__tests__/deck-import-proxy.test.ts src/lib/__tests__/deck-cards-diff.maybeboard.test.ts src/lib/__tests__/deck-normalizer.test.ts src/lib/__tests__/deck-cards-diff.preservation.test.ts src/lib/__tests__/deck-cards-diff.property.test.ts` — 6 files passed, 47 tests passed.
- `node_modules/.bin/tsc --noEmit` — 292 error lines, matching the pre-existing baseline reported in the T-20/T-21 reports.
- No database apply was attempted (no credentials in this environment), consistent with T-12/T-20/T-21. Runtime SQL verification is deferred to the normal deploy path.
