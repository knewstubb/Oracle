# Report: supply rule apply and picklist tick review
Role: Architect
Status: DONE
Task as received: Apply the owner-approved in-hand function patch to hosted project udocxsyzzvrceiuupprj, verify; review (do not apply) the picklist tick draft; update status.md, commit, push.

## Summary for the owner
The older import and conflict routines now treat a card in your hand as not free. Nothing is in hand yet, so nothing changes on screen. The Found / Placed / Can't find routine is reviewed and tightened but not applied; it needs your go-ahead.

## Changed files
- supabase/migrations/20261116032204_supply_rule_in_hand_functions.sql — draft moved here, named to match the applied version
- supabase/drafts/20261116180100_picklist_ticks.sql — review fixes and notes
- docs/oracle/status.md — status updated

## Review of the patch
- Live check: 10 routines (9 names; finalize_import_claims has two overloads). The "<10" guard counts routines, so 9 vs 10 is names vs routines; correct as written.
- Every replaced test sat in an AND chain, so adding AND uc.in_hand = false cannot change precedence. in_hand is NOT NULL default false. Idempotent (already-patched skipped, raises on no match). Signature, security definer, search_path and grants unchanged (no anon/authenticated access).
- Caveat: the skip test is "mentions in_hand anywhere", so a routine that mentions it for another reason would be skipped silently; the final count would then catch it.

## Verification
- Post-apply: 19 in-hand tests across the 10 routines (matches the 19 missing tests before); read-only get_deck_conflict_counts and get_import_conflicts return normally.

## Tick draft changes
Input guards, planned-slot ownership check, safe repeat of Can't find, pg_temp in search_path, one redundant update removed. User scoping and service-role-only access confirmed. Parses cleanly offline; never executed. Notes at bottom of the file.

## Open questions
- Owner go-ahead to apply the tick routine.
