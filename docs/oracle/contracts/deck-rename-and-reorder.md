# Contract: rename a deck and reorder decks (UX-05, UX-03)
Author: Architect, 2026-11-22. Status: DRAFT, not applied. Brief: `docs/oracle/briefs/deck-rename-and-reorder.md`. Audit: `docs/oracle/reports/2026-11-20-architect-deck-rename-reorder-audit.md`. Types: `docs/oracle/contracts/deck-rename-and-reorder.types.ts`.
Stored data: `supabase/drafts/20261122120000_deck_order.draft.sql` (+ `.rollback.sql`, `.rehearsal.sql`). Needs owner approval before it is applied.

## 1. Stored data
- `decks.position integer NOT NULL, CHECK >= 1`. One saved order per user (`user_id`), across all statuses and folders. Not a card identifier (D-003 n/a). `decks` already has `user_id` and row policies; no new policy needed because writes go through the server (service role) with an owner check.
- Index `(user_id, position, id)`. No unique constraint on position: ties cannot break a save, and readers always add `name, id` as tiebreakers.
- Filled at apply time from today's order (name, then id), numbered 1..n per user.
- New decks: a database trigger sets `position = max(position) + 1` for that user when an insert does not supply one. Every create path (app create, import, brew save and skeleton, Claude create) therefore needs no change. A path must not pass its own position.
- Names: no stored-data change. Case-insensitive uniqueness is enforced by the route (section 2), not by an index, because other create paths (import, brew) do not check names today and an index would make them fail with a raw error. Open question for the owner: add a unique index on `(user_id, lower(name))` later? Live check on 2026-11-20: 24 decks, 0 share a name (brief, question 5).

## 2. Rename
- Route: extend the existing `PATCH /api/decks/[id]` ([Confirmed: src/app/api/decks/[id]/route.ts], today commander and build only) with a `name` field. Owner check as for the other fields.
- Rules: trim; 1 to 100 characters; compared ignoring capitals against the user's other decks (`lower(name)`, excluding this deck). Renaming to the same name with different capitals ("prosper" on "Prosper") is allowed on the same deck.
- Errors (HTTP 400/409, body `{ error: DeckRenameError }`): `name_empty` ("A deck needs a name."), `name_too_long`, `name_taken` ("You already have a deck with that name."), `not_found`, `save_failed`. On any error nothing changes and the screen restores the old name and shows the message (D-030).
- Atomic: one row, one column, single update. The clash check and the update should run in one statement or transaction; a same-moment clash between two renames is not defended (single user).
- Writes only `decks.name`. No History entry and no Recent changes entry for an owner rename (owner answer 4). Anything that copies a name (old Claude change rows with `deck_name`) keeps the old text; everything that reads `decks.name` shows the new one.
- Room for Claude renaming later (not built): a later task adds a `deck_rename` kind to `ai_change_log` (old name, new name, who made it), shown in Recent changes with Undo (D-034a), through the same name rules. `DeckRenameRequest.renamedBy` is `'owner'` only for now.

## 3. Reorder
- Database function `move_decks(p_user_id uuid, p_deck_ids integer[]) -> jsonb`. `service_role` only; called through the server after the owner check ([Confirmed pattern: src/lib uses createAdminClient for every .rpc]).
- Input: the owner's WHOLE deck list, first to last. Reordering is offered inside a status group, but the client sends the full list with the moved deck's new place in it; one list order is stored.
- All-or-nothing: one transaction, one per-user lock. It rewrites `position` for every deck or none. It refuses, changing nothing, with `deck_order_empty`, `deck_order_duplicate` or `deck_order_mismatch` (a deck is missing, unknown, someone else's, or a deck was added or deleted since the screen loaded). On any error the screen restores the old order and shows a message (D-030); on `deck_order_mismatch` it also reloads the list.
- Returns `{ ok: true, count }`. Writes only `decks.position`. Never deletes, never changes name, status or folder.
- Route: `PUT /api/decks/order`, body `{ deckIds: number[] }`, success `{ ok: true, count }`, error `{ error: DeckOrderError }`.
- Moving a deck between status groups stays impossible in the UI; the function does not know about status.
- Claude never changes the order (brief, question 4 note).

## 4. Every deck list uses the saved order
Order everywhere: `position ASC, name ASC, id ASC`.
- Library list: `GET /api/decks` (today `.order('name')`, [Confirmed: src/app/api/decks/route.ts line 53]). The page groups or filters on top of this order and must not re-sort by name ([Confirmed: src/app/page.tsx], "One A to Z grid" comment to update).
- Claude's connector deck list: `list_decks` (today ordered by name, and its paging uses that order, [Confirmed: src/lib/connector/tools/list-decks.ts line 64]). Paging must page over the new order. Any cursor that encodes a name must encode `(position, name, id)` instead.
- Other lists the owner reads as a deck list: deck picker popover, all-decks picklist, sidebar, Claude buying list and by-ownership tools. These select decks without order today [Approximate: src/lib/connector/tools/get-buying-list.ts, list-deck-cards-by-ownership.ts]. Developer traces each and applies the same order. Internal lookups (reconcile, card details, import ownership) need no order.
- New code that lists decks uses the same order. Put it in one shared helper so there is one place to change.

## 5. Failure and rehearsal
- Apply, backfill, new-deck-to-end, move, five refused lists, a failure halfway through the write (nothing changed), grants and the undo script were rehearsed on a throwaway Postgres 17 on 2026-11-22 (see the report). Not run against the hosted database.
- Undo: `.rollback.sql` drops the function, trigger, index, constraint and column. It refuses once the saved order differs from A to Z unless the session sets `oracle.confirm_drop_deck_order = 'yes'`, because dropping the column discards the owner's order.
