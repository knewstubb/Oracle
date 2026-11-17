# Report: fix-deck-delete-ai-log
Role: Developer
Status: DONE
Task as received: Fix the bug where deleting a deck that Claude edited (for example TEST A) fails with "Failed to delete deck: ai_change_log_is_append_only". Deleting a deck must always succeed, even if Claude created or edited it. Keep the log append-only for everything else, keep the history, add a new migration, do not apply anything to the live database, prove it on a throwaway database.

## Summary for the owner
Deleting a deck that Claude touched failed because Oracle tried to blank out the deck name link in Claude's change history, and the history is locked against any edit. The fix lets that one link go empty when its deck is deleted, and nothing else in the history can be changed. After the fix, deleting a deck works, the history of what Claude did stays (with the deck link empty), and the delete screen no longer shows the error. The fix is not on your live database yet. It needs your approval to switch on (see "Open questions").

## Changed files
- supabase/migrations/20261117120000_ai_change_log_allow_deck_delete.sql — new; replaces the history lock so a deck link may become empty only when that deck no longer exists. Not applied to live.
- src/lib/__tests__/ai-change-log-deck-delete.db.test.ts — new; runs the real migrations on a temporary local database (skips itself if Postgres is not installed).

## New decisions made (need owner confirmation)
- A history row whose deck was deleted keeps its saved deck name and card, only the deck link is empty.

## Assumptions
- The Developer notes say migrations belong to the Architect; the task explicitly asked for this migration, so it was written here.

## Challenges to locked decisions
- none

## Findings
- Cause confirmed [Confirmed: supabase/migrations/20261116150000_ai_change_log_and_pending.sql]: foreign keys deck_id and other_deck_id on ai_change_log are ON DELETE SET NULL; that update ran the BEFORE UPDATE guard, which raised ai_change_log_is_append_only. Reproduced on a throwaway database with the old guard (both new tests fail), passing with the fix.
- A second trap was found and fixed: a history row already undone would have raised ai_change_log_already_undone on deck delete. Covered by a test.
- Other things that could block a deck delete [Confirmed: supabase/migrations]: the only update-guard trigger on a deck-linked table is the ai_change_log one. ai_pending_changes has no guard, so its SET NULL already worked (tested). deck_card_alerts.caused_by_deck_id, move_items from/to deck ids, oracle messages and sessions context ids are SET NULL with no guard. Other deck links (deck_cards, deck versions, import claims, chat proposals, alerts, locations) cascade. The triggers on deck_cards and user_copies only fire on insert or copy changes, not on delete. The delete route [Confirmed: src/app/api/decks/[id]/route.ts] and the delete_deck_with_release function [Confirmed: supabase/migrations/20260925220000_placement_source.sql] need no change.
- Limit: the test deletes the deck row directly in a minimal throwaway database. It does not run delete_deck_with_release or the other app tables, because the full schema is not available locally.

## Open questions
- Owner approval needed before running on the LIVE database: run only the file supabase/migrations/20261117120000_ai_change_log_allow_deck_delete.sql (one function replacement, no data changes, additive and reversible by re-running the guard from 20261116150000). Nothing else must be run. Until it is run, deleting a deck Claude edited will still fail on the live app.

## Verification
- npx vitest --run src/lib/__tests__/ai-change-log-deck-delete.db.test.ts — 2 passed. With the new migration disabled, 2 failed with ai_change_log_is_append_only (reproduction).
- npm run check — tests: 2 failed (ImportIntentFlow.test.tsx "Import deck" button; registry-and-isolation.test.ts get_deck description "estimate"), 3456 passed. These are the known failures (TIDY-01/TIDY-02, as named in the task), none in touched files.
- npm run typecheck — 4 errors, all in src/components/AddToPicklist.test.tsx, unrelated.
- npm run lint — 4 errors (storage/missing link, tools.test.ts any x2, list-decks.ts prefer-const), unrelated, none in touched files.
