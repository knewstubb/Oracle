# Report: deck-order-draft
Role: Architect
Status: DONE
Task as received: Task B of "rename a deck and reorder decks" (UX-05, UX-03): draft migration in supabase/drafts (position column, fill from A to Z, all-or-nothing move function, undo script), contracts update, offline rehearsal, shared-name count read-only. No production code, nothing applied to the hosted database.

## Summary for the owner
The stored-data change is drafted and rehearsed on a scratch copy only. Decks get a saved position, starting in today's A to Z order, new decks go to the end, and a drag is saved all-or-nothing. Nothing was applied. Existing decks sharing a name: 0 (live check of 2026-11-20 recorded in the brief; not re-run). Needs your approval before it is applied.

## Changed files
- supabase/drafts/20261122120000_deck_order.draft.sql — position column, backfill, new-deck trigger, move_decks
- supabase/drafts/20261122120000_deck_order.rollback.sql — undo (refuses once the order has been changed, unless confirmed)
- supabase/drafts/20261122120000_deck_order.rehearsal.sql — the rehearsal, rerunnable on a scratch database
- docs/oracle/contracts/deck-rename-and-reorder.md, .types.ts — rename and reorder interface, order for every deck list

## New decisions made (need owner confirmation)
- Name uniqueness is checked by the rename route, not by a database index (other create paths do not check names).
- Undo script refuses to drop saved order unless confirmed.

## Assumptions
- Number 20261122120000: latest applied migration is 20261121100000_deck_health_settings; nothing later in status.md or migrations.
- "Today's A to Z" = name, then id, as the library query orders by name. Database collation may differ from a plain sort in edge cases (capitals, accents); the draft uses the same database ordering as the live query [Approximate].
- decks columns in the rehearsal stub are approximate, taken from src/types/supabase.ts.

## Challenges to locked decisions
- none

## Open questions
- Add a unique index on lower(name) per user later? (Not in this draft.)
- Shared-name count: 0 of 24 decks, from the brief (read-only check 2026-11-20). Not re-run now. To re-check read-only, the owner can approve: `select user_id, lower(name), count(*) from decks group by 1,2 having count(*) > 1;`

## Verification
- Postgres 17 (Homebrew) initdb in /tmp, port 54399, scratch database; `psql -v ON_ERROR_STOP=1 -f supabase/drafts/20261122120000_deck_order.rehearsal.sql` — all PASS: apply and backfill per user; new decks go to end; move; five bad lists refused with no change; failure halfway through the write leaves old order; only service_role can run it; undo refused when order was changed, then succeeds when confirmed and all decks remain.
- Throwaway server stopped and deleted. Hosted database not contacted.
