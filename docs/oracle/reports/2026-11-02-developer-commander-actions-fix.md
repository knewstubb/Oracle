# Report: commander-actions-fix
Role: Developer
Status: PARTIAL (instant updates done; "Add as commander" cause found for decks that never offer it, but I could not reproduce a click that does nothing; needs a live look)
Task as received: Owner live-test feedback on the merged commander card actions. (1) "Add as commander" is not working (owner clicks it on a card in another section and nothing happens / commander does not change). Find the root cause by tracing click -> hook -> request -> route -> database function (set_deck_command_zone) -> cache refresh -> render; read-only checks against the hosted DB allowed; test each variant (first commander on a deck with none, partner, background). (2) "Remove as commander" takes a few seconds; it must feel instant: update the UI optimistically, run the request in the background, roll back with a clear error on failure. Same for Add as commander/partner/background/companion. Fix cheap avoidable latency. Worktree `../oracle_app-cmd-fix` from main, branch `commander-actions-fix`. No merge, no migrations or data changes. Mock-only tests incl. a regression test for the root cause and optimistic apply/rollback; tsc, vitest, eslint; commit with Copilot trailer.

## Summary for the owner
**Add as commander:** I found one real cause. On a deck with no commander, a card was only offered "Add as commander" if its colours covered *every card in the deck*. Your "Tymna and Tana" deck has black/white and red/green cards, so neither partner covers it alone, and nothing was ever offered. Partner cards are now offered even when their colours don't cover the deck alone (their partner supplies the rest), and Tana then shows up as "Add as partner" next to Tymna. I traced the rest of the chain (click, save, database, refresh, redraw) and found nothing else wrong, so if you saw the item but clicking did nothing, that is not explained yet; please tell me which deck and which card.
**Instant:** all five actions now change the screen the moment you click (the card moves in or out of the Commander section, the header and slots follow). The save happens in the background. If it fails, the card goes back and a message says what happened. I also removed a full re-download of the deck after each save.

## Root cause (Add as commander)
Traced end to end:
- Click: the menu item calls the hook straight away, the menu closing does not cancel it. [Confirmed: src/components/CardGroupSection.tsx onClick, src/hooks/useCommanderActions.tsx]
- Request: body uses numeric card ids, route parses them as integers. [Confirmed: src/lib/command-zone-request.ts]
- Database function: `set_deck_command_zone` is live on the hosted DB. Read-only probes (bad card id, same card twice) returned the function's own errors (`card_not_in_deck`, `duplicate_card`), so the signature and the deck/user lookup work. Its source has no step that can fail an "add as first commander" for a valid card. No trigger fires on the columns it changes. [Confirmed: supabase/migrations/20261023170100_set_deck_command_zone.sql, live probe]
- Refresh and render: the cache key is the numeric one the page uses (no string/number mismatch). A mock end-to-end run (new tests) shows the card moving into the Commander section after Add. [Confirmed: new test]
- **Offer step (cause):** `eligibleLeadNames` required the candidate's colours to cover the colours of every card in the deck. [Confirmed: src/lib/commander-eligibility.ts] Against the hosted data, the deck "Tymna and Tana" (no commander, 60 cards) returned zero cards for "Add as commander" before the fix, and Tymna + Tana after it (Tana is then the only valid partner for Tymna). Decks that still have a commander never show "Add as commander" (they show "Add as partner" or nothing), so that wording only appears after a Remove or on a deck with none.
- Not reproduced: a visible item whose click fails. Browser behaviour is **untested**.

Variants checked (mock + real data, no writes): first commander on a deck with none (now offered, body `{primary}`), partner (body `{primary, second}`, server works out the role), background (saved with role `background`), companion (moved to Sideboard, not a commander).

## Changed files
- src/lib/commander-eligibility.ts — a commander that can take a second one (Partner, Friends forever, Choose a Background, Doctor's companion) skips the whole-deck colour test for the first commander.
- src/lib/commander-card-actions.ts — new pure `applyCommandZoneLocally` (mirrors the database function) and `secondRoleForAction`.
- src/hooks/useCommanderActions.tsx — optimistic apply to the deck cache, background save queued in click order, rollback plus plain error toast on failure, no whole-deck refetch on success (deck only marked out of date; legality and health reload), dropped the redundant eligibility refetch (its keys already change with the cards).
- src/lib/deck-colour-identity.ts — the two reads before the save answers now run together (one round trip less).
- src/lib/__tests__/commander-card-actions.test.ts — regression test for the Partner deck, tests for each variant of the local apply.
- src/components/CommanderActionsOptimistic.test.tsx — new: screen changes before the save finishes (add and remove), no second deck download, failed save rolls back with a message.

## New decisions made (need owner confirmation)
- A Partner-capable card is offered as first commander without the whole-deck colour check. Cards left off-colour will show in the legality banner afterwards instead of being blocked up front.
- On failure, the toast reads "Couldn't <action> for <card>. It has been put back. <server reason>". No success toast on click (the screen change is the feedback).
- The success toast was removed; say if you want it back.

## Assumptions
- The visible symptom was the missing item on a no-commander Partner deck. The other possible reading (item visible, click inert) was not reproducible.
- Server work stays awaited before the response (colour identity sync) because the legality reload right after depends on it; parallelising the reads was the cheap win.

## Challenges to locked decisions
- none

## Open questions
- Which deck and card did you click when nothing happened? If it was a deck that already had a commander, "Add as commander" is not offered there by design (it shows "Add as partner" only for a valid pair). Do you want a "Make commander" that replaces the current one?
- Follow-ups I did not do: removing the last commander leaves the deck's stored colours (`colour_identity`) and `commander_id` unchanged (stale colours keep colouring the legality check); the slot "Add"/"Clear" chips in the Commander section still save the slow way (not optimistic).

## Verification
- `node_modules/.bin/tsc --noEmit` — clean.
- `node_modules/.bin/vitest --run` — 215 files passed, 5 skipped; 2512 tests passed, 42 skipped (before the last test-type fix; re-ran the changed file and `tsc` after: pass).
- `eslint` on touched files — 0 errors, 51 existing-kind warnings.
- Hosted DB, read-only: function exists; error-path calls only (no successful write); Tymna deck lead offers before/after as above.
- Untested in a browser: menus, instant update, rollback toast, timing. Mock tests only.

## Process disclosures
- I appended the new lib tests with a shell heredoc instead of the edit tool (one file, `commander-card-actions.test.ts`). All other edits used the edit/create tools.
- A scratch repro test was created and deleted before commit.
