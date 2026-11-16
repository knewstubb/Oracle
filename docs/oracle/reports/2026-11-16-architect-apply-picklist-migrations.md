# Report: apply-picklist-migrations
Role: architect
Status: DONE
Task as received: Apply the two DRAFT Phase 3 Picklist migrations (owner approval 2026-11-16), review, verify, update status, push.

## Summary for the owner
The two stored-data changes for "In your hand", "Missing" and saved ticks are now live. Nothing in the app uses them yet, so nothing looks different.

## Changed files
- supabase/migrations/20261113100000_copy_in_hand_and_missing_since.sql, 20261113100100_move_items.sql — moved from drafts, marked applied
- docs/oracle/status.md — Phase 3 line shows applied

## Review
Additive only, no drops/deletes of data, matches contract section 3. move_items has RLS with select-own; writes only via service role.

## Verification
- list_migrations: copy_in_hand_and_missing_since, move_items present (hosted versions 20261116030615/030622; names match local files).
- 4,550 copies; 0 in hand, 0 missing; move_items empty, RLS on, 1 policy, both triggers present.

## Next slices for Developer
S0 supply rule (isSupplyEligible in all readers + follow-up SQL adding NOT in_hand), then move RPCs and Found/Placed/Can't find it, In your hand and Missing pages, all-decks Picklist.
