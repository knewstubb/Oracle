# Report: picklist remaining routines
Role: Architect
Status: DONE

Task as received: Draft, in priority order: Add to Picklist / Add all; Turned up / Found it on Missing; "I checked here"; Undo a tick; Cancel a step. Additive, multi-user safe, idempotent, syntax-checked offline, read against the live schema; drafts in supabase/drafts/; update contract and types; apply nothing.

## Summary for the owner
Five stored routines are drafted and checked but not applied. Each is described in plain words in the final message; the owner approves each one separately before anything changes.

## Changed files
- supabase/drafts/20261116200000_create_move_list.draft.sql — Add to Picklist / Add all
- supabase/drafts/20261116200100_resolve_missing_copy.draft.sql — Turned up / Found it on Missing
- supabase/drafts/20261116200200_record_move_looked_in.draft.sql — I checked here
- supabase/drafts/20261116200300_cancel_move_item.draft.sql — Cancel a step
- supabase/drafts/20261116200400_undo_move_tick.draft.sql — Undo a tick
- docs/oracle/contracts/know-where-cards-are.md — new section 14
- docs/oracle/contracts/know-where-cards-are.types.ts — request/response and error types
- docs/oracle/status.md — update line

## New decisions made (need owner confirmation)
- Undo carries the state the screen showed, so a double tap cannot undo two steps.
- Cancel only works before a card is found.
- Turned up never chooses a place; the owner picks hand, box or deck.

## Assumptions
- `p_user_id` first in every routine (matches the live picklist_tick); the older argument order in contract section 5 is superseded.
- Add all is capped at 500 cards per call. [Approximate]

## Challenges to locked decisions
- none

## Open questions
- Turned up refuses if a stale waiting step still names the card (rare); owner or Developer may want a different rule.

## Verification
- Live schema read (read-only): move_items, user_copies, deck_cards columns, constraints, three guard triggers, unmark_copy_missing, grants — matched the drafts.
- pglast parse of all five files: OK. All five loaded and run in PGlite (real Postgres) on stand-in tables with the same constraints and trigger rules: compile, smoke runs of success, repeat, wrong-user and refusal paths behaved as designed.
- Not yet done: rolled-back smoke test on the live project (after approval). Nothing applied.
