# Report: picklist-supply-rule
Role: developer
Status: PARTIAL
Task as received: Build the Phase 3 Picklist stored-data slices in order (1 supply rule, 2 Found/Placed/Can't find it, 3 In your hand and Missing pages, 4 all-decks Picklist); each its own slice with tests, push to main; any needed RPC migration written additive, NOT applied, stop for owner approval.

## Summary for the owner
Slice 1 is done and pushed: a card marked In your hand or Missing no longer counts as free or spare anywhere in the app. Nothing is in hand or missing yet, so nothing looks different. Slices 2 to 4 are waiting: Found it / Placed it / Can't find it need a new stored routine, which I drafted but did not apply.

## Changed files
- src/lib/copy-availability.ts (+test) — one shared rule for "supply eligible / spare"
- spare-copy-browse, owned-copy-lookup, allocation-candidates (2 queries), card-status, supply-pool, reconcile-overuse, import-ownership, storage/copies (Unsorted count), ownership-batch and collection/allocation routes — filter missing and in_hand
- src/types/supabase.ts — in_hand and missing_since columns added to user_copies types
- existing test mocks (card-status, deck-health-*, owned-copy-lookup, spare-copy-browse, import ownership route) — treat the new columns as false when absent
- supabase/drafts/20261116180000_supply_rule_in_hand_functions.sql — DRAFT, not applied: patches the 10 older import/reconcile functions from their LIVE definitions
- supabase/drafts/20261116180100_picklist_ticks.sql — DRAFT, not applied, never run: picklist_tick routine (create tick + found/placed/cant_find in one transaction)
- docs/oracle/status.md

## New decisions made (need owner confirmation)
- Deviation from contract section 6: import-engine-v2 (replace/sync diff) and manabox-resolver (owned counts per printing) still count In-hand/Missing copies. Filtering them would make sync re-add owned copies. Contract section 6 itself says owned counts keep counting them.

## Assumptions
- The function patch relies on text replacement of `uc.missing = false` in live definitions; it raises if a function has no match.

## Challenges to locked decisions
- none

## Open questions
- Approve applying the two drafts? Slice 2 draft needs Architect review (untested SQL).

## Verification
- npm run typecheck — pass
- npx vitest --run — all pass (3205 before; new tests added for helper truth table, in-hand/missing never spare, reader guard)
- Not run: lint on whole repo (only new files linted, clean); no DB tests (no test account).
