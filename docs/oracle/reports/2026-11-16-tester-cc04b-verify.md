# Report: CC-04b slice B verification
Role: Tester
Status: DONE (no blocking defects; 4 small defects and 3 gaps listed)

Task as received: Verify CC-04 slice B (safe edits with undo and pending approvals) on branch cc04b-edits: tsc, vitest, next build; code review against the owner rules; live end-to-end on throwaway users; browser check; owner counts before and after. Do not edit product code, push or merge; never touch the owner account.

## Summary for the owner
Claude's edit powers work as promised. Small edits go through with Undo, big edits and any move between decks wait for your yes, and only you (signed in to Oracle) can say yes. Claude has no way to delete cards, copies or decks. I tried everything on two throwaway accounts, which are now deleted, and your own account was not changed by me. A few wording and layout details on the approval screen need polish.

## Results
| # | Item | Result |
|---|------|--------|
| 1a | `npx tsc --noEmit` | PASS (exit 0, 2 s) |
| 1b | `npx vitest --run` | PASS (270 files, 3173 passed, 46 skipped, 21 s). No hang |
| 1c | `npx next build --webpack` | PASS (exit 0, 27 s) |
| 2 | Code review of owner rules | PASS (notes below) |
| 3 | Live end to end, throwaway users | PASS (all behaviours correct; see list) |
| 4 | Browser check | PASS with 4 small defects |
| 5 | Owner data untouched | PASS for my actions. Counts changed because of an import running on the owner's account (see below) |

### 1. Hang report
No hang. tsc and vitest each ran separately under a 7-9 minute limit and finished in seconds. The earlier hang did not reproduce. A likely cause is two heavy jobs run at once, or an older half-finished state of the branch, but I could not reproduce it so this is a guess. `timeout` does not exist on this Mac, so I used a Python wrapper. `next build` was green and `/settings/claude-connector` and all nine `/api/connector/*` routes are in the build output.

### 2. Code review
- **No delete tools.** The registered list in `src/lib/connector/tools/index.ts` (`CONNECTOR_TOOLS`) is 16 names: get_collection_summary, search_collection, list_decks, get_deck, get_deck_health, add_cards_to_deck, remove_cards_from_deck, set_card_zone, add_card_to_collection, sleeve_free_copy, make_slot_original, create_proxy_for_slot, request_card_move, undo_change, get_change_status, list_recent_changes. None deletes a copy, card or deck. `runTool` in `src/lib/connector/server.ts` refuses blocked names via `isBlockedToolName` in `src/lib/connector/edit-config.ts` (delete_deck, remove_from_collection, delete_card, delete_copy, replace_collection, clear_deck, release_deck_copies, and prefixes import_, sync_, bulk_; case-insensitive). Live: all 11 tried names returned `tool_not_allowed`.
- **RPC deletes.** In `supabase/migrations/20261116150100_ai_connector_edit_rpcs.sql` the only DELETEs are inside `ai_undo_group`: `deck_add` (removes the planned slot Claude added, only if it has no copy), `create_proxy` and `collection_add` (owner only, one copy named in the log row and tagged `source_tag='claude_connector'`; the card record only if Claude created it and no copies use it). Claude's own undo is blocked for those kinds (`_ai_kind_owner_only`). The gateway calls owner undo only from the cookie route. Note for the owner: `remove_cards_from_deck` deletes the deck-list slot (the copy goes to storage), by design in the contract; it is the one tool marked destructive.
- **Big edits and moves.** `_ai_gate` limits come from `_ai_limits()`; live runs confirmed: 12 cards = pending `over_ten`; 6 then 6 within 30 min on the same deck = pending `recent_total`; any move = pending `card_move`.
- **Cookie only.** `guardOwnerRequest` in `src/lib/connector/cookie-guard.ts` refuses any Authorization header (403), a cookie token carrying `client_id` (403), POSTs without a matching Origin (403) and no session (401). The user id comes from the cookie session only. Tools take the user id from `ctx.userId` (verified token), and no tool has a user id argument. `createAdminClient` is used only in `write-gateway.ts` and `connection-store.ts`.
- **Off switch, expiry, undo window, planned source slot.** `revoke_connector_connection` cancels waiting items in the same transaction; 24 h expiry in `ai_pending_changes.expires_at` and `_ai_expire_pending`; 7 days in `undoable_until`; the source slot is cleared of `copy_id`, `ownership_status`, `placement_source` in `_ai_execute`.

### 3. Live end to end
Two throwaway users (A with 2 decks, 20 slots, 1 copy; B empty), created and deleted through the admin API. The app was `next start` on port 3100 (the dev server on 3000 is another process and the repo's dev lock blocked a second `next dev`). Owner routes were called over real HTTP with a real cookie session. I could not get a real client_id token, so the connector tools were run through `runTool` in `src/lib/connector/server.ts` with the real write gateway and real database, with the throwaway user id as the verified id. A real `/mcp` call with no token and with a normal login token returned 401 (correct, since neither carries `client_id`).
PASS: small add then owner Undo; add, sleeve, then undo of the earlier add refused 409 `slot_sleeved` with nothing changed (Claude's own undo refused too); remove then Undo (slot back); Maybeboard then Undo; commander removal refused; dry run of 12 cards says `would_wait` and changes nothing (30 slots before and after); 12-card add pending then Approve from cookie applies 12; approve twice gives 409; owner-approved group cannot be undone by Claude; 6 then 6 gives second one pending `recent_total`, then Decline works and Approve-after-Decline gives 409 declined; move request pending (nothing moved), user B gets 404 on approve and decline and sees no pending or moved-slot lines; owner Approve moves the copy, source slot is planned (no copy, no status) and `moved-slots` gives "Sol Ring was moved to CC04B Beta on 16 Nov (you approved it). This slot is empty and planned."; Authorization header, missing Origin and no cookie are refused (403/403/401) on approve and undo; collection-add by Claude, Claude undo refused ("Only you can undo"), owner undo refused while the copy sits in a deck (`copy_in_deck`), then after taking it out the owner undo removed exactly that one copy (copy and card counts back to baseline, other copy untouched); backdated expiry shows `expired`, count 0, approve 409; revoke through `/api/connector/revoke` cancelled the waiting item (`switched_off`), later edits refused `connection_revoked`, approve of the cancelled item 409.
Three automatic checks of mine reported FAIL but were my own wrong assertions (the refusals were correct and worded as "Only you can undo this kind of change"; the dry-run slot count I assumed was off). I re-verified each by hand.
Not testable: the 7-day window by back-dating. `ai_change_log` is append-only (trigger `ai_change_log_is_append_only` rejected the update), which is good. The server developer covered it with rolled-back SQL earlier. A `client_id` cookie token over HTTP could not be minted; that path is covered only by unit tests plus the Authorization-header check.

### 4. Browser (Chrome via Playwright, 1280 and 360 px, throwaway user)
PASS: three tabs (Connection, Recent changes, Setup guide); Connection shows Active, switch On, "Claude can" list; header chip "2 Claude is waiting for your yes" appears and links to Recent changes, count drops after answering; pending cards for move and big edit (before/after counts, "Nothing is lost or duplicated"), Declined, Approved toast, Cancelled and Expired cards, applied rows with Undo; clicking Decline, Approve all 12 and Undo worked and matched the database (30 then 42 slots); the deck page shows the moved Sol Ring as Unavailable "In CC04B Beta" with the "was moved to" line; no horizontal scroll at 360 or 1280 on any of the three pages; no console errors; tab order is skip link, header, chip, tabs, then each card's Decline/Approve/See cards in reading order. The tab strip scrolls sideways at 360 ("Setup guide" is clipped, by design).

## Defects (none blocks the merge)
1. `src/components/connector/PendingCard.tsx` line 72: a cancelled card reads "Cancelled: Cancelled. You switched the connection off. Nothing changed.. Nothing changed." (reason text already says all of this; double full stop). Show the reason once.
2. `src/components/connector/PendingCard.tsx` line 183 (`formatClock`): "Disappears if nobody answers by 14:03" when the request was asked at 14:03. It is 24 hours later, so it reads as if it expires at once. Add "tomorrow" or the date.
3. `src/components/connector/RecentChangesTab.tsx` line 171: "Only you can approve these." runs straight into "Claude can ask" with no space on screen (flex layout drops the space after the bold part).
4. Header at 360 px: the "waiting" chip is crammed beside the title "Claude connector" (wraps to two lines; works but tight), and the header has icon buttons with no accessible name (three empty-name buttons seen in the button list; may pre-exist the slice; `src/components/PageHeader.tsx`).

## Gaps and notes
- `/status` cannot report an expired login, so the "Needs reconnecting" state is never shown (already noted by the UI developer).
- The migration `20261113100000/100100` files are untracked in the working tree (not part of this slice); live migration names for 150000/150100 differ from the repo files (noted by the server developer).
- Not run: `npm run lint` (not requested), screen reader and contrast checks.

## 5. Owner counts (owner da7ccf96-2c73-431c-9d03-952463f82dcc)
The "3 decks / 213 / 159 / 200" figures in the brief were stale. At the start of my run the owner already had 10 decks / 980 deck_cards / 657 user_cards / 980 user_copies. At the end: 12 / 1180 / 775 / 1180. The increase is not from me: the owner's newest decks are ManaBox imports ("Drake Expectations", "Sliver me timbers"), and the owner's copies kept being created after my cleanup (newest at 01:07 UTC, 298 created since 00:50 UTC). Proof that Oracle's edit tables never touched the owner: the owner has 0 rows in `ai_change_log` and `ai_pending_changes` (both tables are empty overall now), and every write I made used the throwaway user ids. The earlier separation report saw the same kind of growth.

## Cleanup
Both throwaway users and all their rows (decks, deck cards, cards, copies, connection, pending, log) were deleted and re-checked as 0. My port 3100 server was stopped. Temp scripts are in /tmp only. No product code, branch or remote was changed. New file: this report.

## Verification
- tsc, vitest, next build: results above.
- HTTP and tool runs and Playwright: results above.
