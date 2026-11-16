# Report: cc04b-contract (CC-04b, slice B: safe edits with Undo)
Role: Architect
Status: DONE (contract and DRAFT migrations; SQL not run against any database)
Task as received: write `docs/oracle/contracts/claude-connector-slice-b.md` for safe edits with Undo on top of the merged read-only connector, with fixed owner decisions (<=10 cards direct, bigger edits and cross-deck moves pending 24 h, cookie-only approval, 7-day all-or-nothing undo, no delete tools, owner-only collection-add undo, moved card keeps a planned slot, off-switch cancels waiting requests, one server-side sentence module). Plus draft migrations with rollbacks.

## Summary for the owner
Claude can make small changes (up to about 10 cards) by itself, and each has an Undo for 7 days. Bigger changes and any move of a card between decks only become a request. You approve or decline them from Oracle while logged in; Claude cannot approve anything, and a request nobody answers disappears after 24 hours. Claude has no way to delete cards or decks. Switching Claude off cancels every waiting request. A moved card leaves a "Unavailable · In {deck}" slot behind in the old deck, with a line about who moved it and when. Nothing has been applied yet.

## Contract and files
- `docs/oracle/contracts/claude-connector-slice-b.md` and `.types.ts`
- `supabase/drafts/20261116140000_ai_change_log_and_pending.draft.sql` + `.rollback.sql`
- `supabase/drafts/20261116140100_ai_connector_edit_rpcs.draft.sql` + `.rollback.sql`
- No final copies in `supabase/migrations`: I am not certain, the SQL has never been executed (no local Postgres). Gene should run it on a throwaway branch first; expect small syntax fixes. Contract section 11 step 1.

## Findings
1. `reassign_to_deck` does leave the source slot planned. [Confirmed: supabase/migrations/20260925220000_placement_source.sql] The owner's concern is already met.
2. Gap: `reassign_to_deck` and `assign_free_copy` can pick a Maybeboard slot as the open slot. Slice B avoids them by choosing the slot itself. The existing functions deserve a separate fix (not in scope; no existing function was changed).
3. `replace_proxy_with_original` does not check the original is the same card; slice B adds that check.
4. `apply_ai_deck_delta` logs nothing and returns counts only, so it is not used.

## New decisions needing the owner's confirmation
1. Undo of "create proxy" is owner-only (like collection add), because it deletes a copy.
2. Claude cannot remove or move a commander or command-zone slot.
3. No "mark an Original as Proxy" tool (D-026 forbids silent conversion; challenges brief S5). Offered instead: swap a proxy for a free original, and create a proxy for an open slot (owned cards only).
4. An expired login does not cancel waiting requests (the spec said it would); only switch-off and the 24 h expiry do.
5. Claude may undo only its own groups of 10 changes or fewer; larger or owner-approved groups need you.
6. Extra guards beyond "10 cards": changes to one deck within 30 minutes add up (stops 10+10+10), and more than 40 in an hour waits for approval. Max 60 cards per request, 20 waiting at once.
7. Collection add is one copy per call, always direct, counted only in the hourly cap.

## Uncertain
- [Approximate] whether live `deck_cards` has an `updated_at` column (not used).
- [Approximate] the existing UI maybeboard move releasing the copy; the contract defines Claude's move as releasing it (D-005/D-039).
- The SQL is a draft, untested.

## Not touched
decisions.md, app code, the untracked tester report and the `copy_in_hand`/`move_items` drafts. Nothing pushed or merged.
