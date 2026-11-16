# Report: import-unsorted-copy-ids
Role: Architect
Status: DONE
Task as received: Draft the additive change to insert_user_copies_to_deck (20261116062746) so it also returns the copy ids that landed in Unsorted; confirm what the box/Unsorted path provides. Additive, owner-scoped, server-only, idempotent, checked offline and against the live schema; draft into supabase/drafts/, update contract/types, do NOT apply.

## Summary for the owner
No database change is needed, so no draft was written. The deck import already reports the id of every saved card and where it went; the app was simply discarding the ids. After a small app-side fix, "Add all" on the import result can cover exactly the cards from that import.

## Changed files
- docs/oracle/contracts/know-where-cards-are.types.ts — `ImportPlacementResult.unsortedCopyIds`
- docs/oracle/contracts/know-where-cards-are.md — addendum to 4c with the server steps
- docs/oracle/status.md — one update line
- docs/oracle/reports/2026-11-16-architect-import-unsorted-copy-ids.md — this report

## New decisions made (need owner confirmation)
- none (implements the owner's "only this import" choice)

## Assumptions
- Unsorted copies are those with outcome kind `unsorted`; a box/binder destination has none.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- Live project udocxsyzzvrceiuupprj, read-only queries: `insert_user_copies_to_deck(uuid, integer, jsonb, integer)` and `insert_user_copies(uuid, jsonb)` exist, SECURITY DEFINER; execute is service_role only (anon and authenticated false). The live deck routine's source contains the outcome entry with `copy_id` and `inserted_ids` in its return. [Confirmed: supabase/migrations/20261116062746_insert_user_copies_to_deck.sql]
- The gap is in `RpcOutcome` / `parseDeckRpcAnswer` which drop `copy_id` [Confirmed: src/lib/import-deck-result.ts].
- Box/Unsorted path: `insert_user_copies` returns `inserted_ids` in file order [Confirmed: src/lib/card-identity-store.ts].
- No SQL drafted, so no offline syntax check or smoke test was needed; nothing applied, no writes to the live project.
