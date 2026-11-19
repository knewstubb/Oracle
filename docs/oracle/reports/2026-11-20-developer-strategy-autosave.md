# Report: strategy-autosave
Role: Developer
Status: PARTIAL
Task as received: Strategy window autosaves instead of using Save buttons; Claude can rewrite the whole Strategy and keep refining it; typing and Claude changing the Strategy at the same time is handled (FEAT-001 to FEAT-004).

## Summary for the owner
The Strategy window now saves by itself when you pause typing or close it, and shows a short line saying "Saving", "Saved" or "This didn't save". There are no Save or Cancel buttons. Claude can now replace the whole Strategy with a cleaned-up version instead of adding paragraphs, but only after you apply the new database change (S5). Until then, Claude's rewrite is refused with a plain message saying the update has not been applied yet. If Claude rewrites the Strategy while you are typing, your text stays and you choose "Use Claude's" or "Keep mine".

You need to decide: approve and apply S5 (see the separate S5 note). The other modals still have Save buttons; they were out of scope for this slice.

## 3-minute test
1. Open a deck and open its Strategy window. Type a sentence and stop for a moment. The status line should say "Saving" and then "Saved". No Save button exists.
2. Type another change and close the window straight away. Reopen it. The change is still there.
3. Turn off your internet, type, then close the window. You should see "This didn't save" with "Keep editing" and "Close anyway".
4. Ask Claude to rewrite the Strategy. Before S5 is applied, Claude says the update is not applied yet and nothing changes. After S5 is applied, the Strategy is replaced and the window shows "Updated by Claude".
5. Start typing in the Strategy window, then ask Claude to rewrite it. Your typing is kept and a note shows Claude's version with "Use Claude's" and "Keep mine". Nothing is overwritten until you pick.

## Deliberately deferred
- Undo and History entries for your own edits. You said not to worry about undo. Claude's changes can still be undone as before, and that restores the Strategy already.
- Autosave for the other modals. This slice covers the Strategy window only. The shared saving line and saving behaviour are ready for them to reuse.

## Notes and Strategy are the same text
Strategy and Notes are one stored text, so "Notes stays add-only" has nothing separate to protect. Claude's rewrite replaces that one text.

## Other writers that skip the rewrite check
Two other places write the Strategy text: the old Deck Intent save, and the Strategy window's own save. Both are your own edits, so neither needs the check that guards Claude's rewrites.

## Changed files
- src/hooks/useAutosave.ts — shared autosave behaviour (pause or leave, status, conflicts)
- src/components/SaveStatus.tsx — the "Saving / Saved / This didn't save" line
- src/components/deck-strategy/StrategyWindow.tsx — window rebuilt on autosave, no Save/Cancel, conflict choice
- src/components/deck-strategy/StrategyBlock.tsx — passes only changed fields
- src/hooks/useLiveRefresh.ts — waits while the window is saving
- src/lib/live-refresh-holds.ts — simplified to the "busy" signal
- src/lib/connector/tools/edit-tools.ts — Claude sends a full Strategy plus the version it read
- src/lib/connector/tools/deck-strategy-read.ts — shows Claude the Strategy version
- src/lib/connector/change-sentences.ts — plain messages for refused or out-of-date rewrites
- src/lib/deck-strategy-window.ts — removed the add-a-dated-paragraph helper
- supabase/drafts/20261119120000_s5_strategy_replace.draft.sql — S5, NOT applied
- supabase/drafts/20261119120000_s5_strategy_replace.rollback.sql — undo for S5
- docs/oracle/reports/evidence/roles-db/test_s5.sh — database rehearsal for S5
- docs/oracle/reports/evidence/roles-db/test_s5.out — rehearsal result
- tests/e2e/strategy-autosave.spec.ts — browser test (not run, see Verification)
- Tests for all of the above under their matching test files.

## New decisions made (need owner confirmation)
- The change-log sentence for a Strategy rewrite is generic ("Claude changed the setup of the deck"), because the log does not record which field changed. A specific "Claude rewrote the Strategy" sentence would need S5 or a later change to record the kind of change.
- While a conflict is unresolved, typing in the Strategy is not autosaved, so Claude's version is never silently overwritten. Closing then shows "This didn't save".

## Assumptions
- Before S5, the database refuses a replace with the same code the connector already handles.
- Claude reads a version marker (the Strategy's last-updated time) and its rewrite is refused if the Strategy changed since.

## Challenges to locked decisions
- none

## Open questions
- Apply S5? (see the S5 note)
- Should the other modals get autosave next?

## Verification
- S5 database rehearsal (test_s5) — 34 pass, 0 fail. test_s3 38/0, test_s4 38/0, test_chain 16/0.
- npx vitest run src/lib/connector — 446 passed, 4 skipped.
- npx vitest run src/hooks src/components — 1066 passed, 9 skipped.
- Playwright strategy-autosave spec — written, not run: no signed-in test session and the isolated mode is off.
- npm run check — see the final result recorded in the commit message.
- Known flake: a random-input test in upgrade-engine.property.test.ts failed once and passed on rerun. It is not touched by this work.
- Known failures that exist on main too: 4 type errors in AddToPicklist.test.tsx and 1 lint error in PicklistV2.tsx.
