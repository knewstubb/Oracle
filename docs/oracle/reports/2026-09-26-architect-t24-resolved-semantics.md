# Report: t24-resolved-semantics
Role: Architect
Status: DONE
Task as received: The contract was just updated with owner decisions. The draft migration's `get_import_reconciliation` currently computes row-level `resolved` with the old rule `planned_count = 0 AND NOT has_unsatisfiable_sleeve`. It does not compute per-instance `resolved`, and it does not evaluate alternate-printing room for `planned` slots. Revise the migration file so that: 1. Every instance in the returned `instances` JSON includes a `resolved` boolean computed per contract §5. 2. Row-level `resolved` is true only when every instance in the row is resolved. 3. Tab counts, deck `conflictPrintingCount`, and the `p_include_resolved` row filter all use the new row-level `resolved`. 4. Update `get_deck_conflict_counts` to use the same slot-level resolved predicate (contract §7.6). Do not change the table schema or other functions unless necessary. Keep the file's DRAFT header until owner approval. Preserve SECURITY DEFINER, `SET search_path = public`, and explicit `p_user_id` ownership checks.

## Changed files
- `supabase/migrations/20260926140000_import_reconciliation_redesign.sql` — revised `get_import_reconciliation` to compute per-instance `resolved` per contract §5, derive row-level `resolved` from `bool_and(instance_resolved)`, and updated `get_deck_conflict_counts` to use the same slot-level predicate per contract §7.6.

## New decisions made (need owner confirmation)
- None. Implementation follows the approved contract §5 and §7.6 as updated by the owner.

## Assumptions
- "Room" for a planned instance is evaluated against every owned printing of the card (imported printing if owned, plus all owned alternates), using `available_supply > sleeved_intent`. This matches the contract's definition of "has room" and the task's wording that a planned instance is unresolved if any owned printing has room.
- `get_deck_conflict_counts` groups unresolved pairs by the imported `(card_name, printing_id)` conflict-printing key, consistent with reconciliation row grouping, and considers open or settled claims with `deck_cards.copy_id IS NULL` per contract §7.6.
- The `cards` array in `get_deck_conflict_counts` is retained for response-shape compatibility even though the route only consumes `deckId` and `count` [Confirmed: src/app/api/decks/route.ts].

## Challenges to locked decisions
- None.

## Open questions
- None.

## Verification
- `npx tsc --noEmit` — 158 TypeScript errors (baseline; no increase).
- `npm test -- src/lib/__tests__/import-reconciliation.test.ts src/lib/__tests__/import-reconciliation-rpc.test.ts src/lib/__tests__/import-sleeve-claims.test.ts src/app/api/onboarding/reconciliation/reconciliation.routes.test.ts src/app/api/onboarding/finalize/route.test.ts src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` — 42 tests passed.
