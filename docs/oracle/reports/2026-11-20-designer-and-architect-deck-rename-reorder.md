# Report: deck-rename-reorder
Role: Designer and Architect
Status: DONE

Task as received: Feature "rename a deck and reorder decks" (UX-05, UX-03). Gate 3 design and the stored-data draft only; nothing applied to the hosted database.

## Summary for the owner
You can now review a clickable mockup of renaming a deck in place and dragging decks into a new order. The mockup is ready for your Gate 3 approval. The stored-data change that remembers the order is drafted and rehearsed on a scratch copy only, and needs your separate approval. One behaviour question is open (below).

## Changed files
- docs/oracle/mockups/deck-rename-and-reorder.html — mockup (drag, drop, rename, refusal, failed save)
- docs/oracle/specs/deck-rename-and-reorder.md — interaction spec
- docs/oracle/contracts/deck-rename-and-reorder.md — contract (new decks go last; all deck lists use saved order: position, name, id)
- docs/oracle/contracts/deck-rename-and-reorder.types.ts — contract types
- supabase/drafts/20261122120000_deck_order.draft.sql — draft: position column, fill from A–Z per user, trigger, all-or-nothing move function (service role only)
- supabase/drafts/20261122120000_deck_order.rollback.sql — undo; refuses once the order differs from A–Z unless confirmed
- supabase/drafts/20261122120000_deck_order.rehearsal.sql — rehearsal script
- docs/oracle/reports/2026-11-22-architect-deck-order-draft.md — architect report
- docs/oracle/status.md — UX-03 and UX-05 rows now say design drafted, awaiting owner approval; data change not applied
- this report

## New decisions made (need owner confirmation)
- Rename shows a quiet outline on hover, no pencil icon.
- No success message after rename or move; only failures and refusals.
- New decks go to the end of the order.
- Rename clashes are checked by the rename route, not by a database rule.

## Assumptions
- Reordering only within a status group (owner answer 2).
- Keyboard and touch reordering deferred; Claude renaming later (owner answer 6).
- Draft is numbered 20261122120000 because the latest migration is 20261121100000.

## Challenges to locked decisions
- none

## Open questions
- While a folder is open, tiles can't be reordered. Should a tile still be draggable onto another folder chip? A (recommended, shown in the mockup): yes. B: no, use right-click "Move to folder".
- Add a database rule against duplicate deck names later? Not in the draft.

## Verification
- Rehearsal: `psql -v ON_ERROR_STOP=1 -f supabase/drafts/20261122120000_deck_order.rehearsal.sql` on a scratch Postgres 17 in /tmp (Architect run) — all checks passed: apply and per-user fill, new decks last, move leaves other user untouched, five bad lists refused with nothing changed, mid-write failure keeps old order, service-role only, undo refused after a reorder then succeeds when confirmed. Not re-run in this step.
- Shared-name count: 0 of 24 decks share a name, from the read-only live check in the brief dated 2026-11-20. Not re-run; fresh check would need approval of: select user_id, lower(name), count(*) from decks group by 1,2 having count(*) > 1;
- Designer browser test: drag, drop, rename, status-group refusal, failed saves. Touch and keyboard not tested.
- This step: git log and `git diff --stat 0c374d5849bf5d9d27c1ab01188399456b3aae3b HEAD` show only docs and supabase/drafts files; no files in supabase/migrations/ and no app code changed. All listed files are committed on deck-rename-reorder.
