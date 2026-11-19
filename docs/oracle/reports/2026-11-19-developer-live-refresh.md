# Report: live-refresh
Role: Developer
Status: DONE
Task as received: Make the Oracle app update by itself, within a few seconds, when Claude changes something. Size: medium (no database change). Owner chose Option 1: a quick check every few seconds while a deck is open and the tab is visible; if Claude changed anything since the last look, refresh the cards, the left rail and History. Build Option 1 only; no live feed from the database; no database change. Extend the existing refresh-on-tab-return mechanism. (Full brief as handed over: marker request owner-scoped and cheap; pause when hidden, check at once when visible; back off on errors and offline without banners; on change refetch the card list, rail, Strategy block and History through the existing cache invalidation and show a quiet "Claude just changed this deck" note with a way to History; never overwrite work in progress; no note for the owner's own changes; same idea for the deck list and Recent changes; no effect on the paused chat and no paid AI calls; say the request rate for an hour and the response size; flag change kinds the record does not cover.)
## Summary for the owner
While a deck is open, Oracle now checks every 8 seconds whether Claude changed anything. If so, the cards, the left column, the Strategy block and History update by themselves and a small note, "Claude just changed this deck. See in History", shows for a few seconds. If you are typing, or a card edit or delete confirmation is open, the update waits until you are done. If the Strategy window is open, nothing in it changes; it shows "Claude changed this deck. Refresh" and keeps your text until you press Refresh. The deck list and Recent changes update the same way.
## 3-minute test
1. Open a deck and leave it alone. Ask Claude to move a card (for example "move Sol Ring to the Maybeboard in this deck, reason: testing"). Within about 10 seconds the card moves, the counts in the left column change and a note "Claude just changed this deck" appears, then fades after about 5 seconds. Press "See in History" while it shows: History opens with Claude's change on top.
2. Open the Strategy window and type a few words in the Strategy box without saving. Ask Claude to change the deck again. Within about 10 seconds the window shows "Claude changed this deck. Refresh replaces what you've typed here." Your words are still there. Close the window with Cancel: the Strategy block behind it updates. Or press Refresh to load Claude's version.
3. Open the deck list in one tab and ask Claude to create a deck. It appears within about 10 seconds. Switch to another browser tab for a minute and back: it checks straight away.
## Changed files
- src/lib/connector/change-marker.ts — new: the marker question (newest change and newest undo, for one deck or the whole account)
- src/app/api/connector/changes/marker/route.ts — new: GET route, cookie sign-in guard, owner-only read with the signed-in session (no service key)
- src/components/connector/api.ts — fetchChangeMarker
- src/hooks/useRefreshOnTabReturn.ts — extended (same visibility handling): useClaudeChangeWatch, the 8 s check with pause, resume, offline and back-off
- src/hooks/useLiveRefresh.ts — new: what to refetch on a change, deferral while the owner is busy, the note
- src/lib/live-refresh-holds.ts — new: small shared flag so the open Strategy window is held and marked "Claude changed this deck"
- src/components/LiveChangeNote.tsx — new: the one-line note
- src/app/decks/[id]/page.tsx — mounts the deck watcher and the note
- src/app/page.tsx, src/components/connector/RecentChangesTab.tsx — mount the whole-account watcher
- src/components/deck-strategy/StrategyBlock.tsx, StrategyWindow.tsx — hold while open, banner with Refresh, refetch on close
- src/components/VersionHistoryPanel.tsx — one attribute so History is refreshed while open
- Tests: src/lib/connector/__tests__/change-marker.test.ts (9), src/hooks/useClaudeChangeWatch.test.tsx (12), src/hooks/useLiveRefresh.test.tsx (15), src/components/LiveChangeNote.test.tsx (3), two added cases in StrategyWindow.test.tsx
- docs/oracle/reports/evidence/live-refresh/ — browser check notes and two screenshots
## Request rate and size
- Rate: one check every 8 seconds per open deck page, so 450 per hour (7.5 per minute). Zero while the tab is hidden or the computer is offline. On errors the wait doubles (16 s, 32 s, 64 s, then 2 minutes) and the check stops after 5 errors in a row until the tab is shown again or the network returns. A 401 or 403 stops it at once.
- Why 8 s: inside the 5 to 10 s range, so a change shows after at most 8 s plus the answer time (measured 1.4 s from the check to the note on the local app). 5 s would make 720 an hour for little gain; 10 s risks passing "about 10 seconds".
- Size: the answer body is 39 bytes for a deck with no changes and about 90 bytes when there is one (measured). About 0.3 KB with headers, so around 150 KB an hour.
- Cost behind each check: two single-row reads of the change record, both on existing indexes, plus the sign-in checks the connector routes already do. The sign-in checks are the larger part (the shared guard asks the sign-in service up to three times). I left the guard alone; trimming it would also speed up Recent changes and is a possible follow-up.
- Several open pages or tabs each make their own checks. The deck list and Recent changes make one whole-account check each while on screen.
- The paused in-app chat and the paid AI service are not touched.
## How it works
- Marker: newest change id plus newest undo time, for the deck (as source or destination) or the whole account, with who made the newest event. The first answer is only the starting point.
- On change: the deck's cache entries (card list, card statuses, rail health, Strategy block), picklist and allocation entries, History for the deck, Recent changes, waiting requests and the pending count are marked for refetch with the existing invalidation. No page reload.
- Work in progress: refetch waits (re-checks every 1.5 s, several changes become one refresh) while a field has focus and was typed in during the last 3 s, while any window other than History and Strategy is open (card edit, delete confirmation), or while a save or delete is running. The Strategy window is never refetched while open (banner instead; it refetches when closed).
- Own changes: a change you approved in Recent changes, or an undo you pressed, refreshes quietly with no note. Your own edits in the app are not in the change record, so they never trigger anything.
- Tab return: the existing refresh-on-tab-return is unchanged and the new check also runs at once on return.
## New decisions made (need owner confirmation)
- 8 second check; note shows about 5 seconds; typing counts as "busy" for 3 seconds after the last key.
- The note shows only for Claude's changes (including Claude's undo), not for your approvals or undos. It is shown on the deck page only, not on the deck list or Recent changes, which just update.
- Refresh in the Strategy window replaces unsaved text (it says so when there is unsaved text). Pressing Save instead overwrites Claude's version as before.
## Assumptions
- Port 3000 on this machine serves the main checkout, not this worktree, so I checked on port 3137 and left the owner's server running.
- The deck's rail, cards and Strategy queries all sit under the deck's cache key [Confirmed: src/hooks/useDeckQueryKeys.ts, src/components/deck-strategy/StrategyBlock.tsx].
- The marker route reads the change record with the signed-in session, which the table's read rule allows for the owner's own rows [Confirmed: supabase/migrations/20261116150000_ai_change_log_and_pending.sql].
## Challenges to locked decisions
- none
## Open questions (flagged, not guessed)
1. What the change record covers. Every Claude write tool logs a row: add and remove cards, move zone, sleeve, make original, create proxy, add to collection, request card move, set card category, create deck, set deck setup (commander, bracket, strategy notes) [Confirmed: src/lib/connector/tools/edit-tools.ts, docs/oracle/contracts/claude-connector-slice-b.types.ts]. A category change is the "set card category" tool and is logged. There is no deck-wide category rename tool.
2. Not covered by the deck marker: "add to collection" has no deck, so it moves the whole-account marker (deck list, Recent changes) but not an open deck. If Claude adds a copy you own, an open deck's "available" counts update at your next tab return, not within 8 seconds. Say if that matters; the fix is to also watch the account marker on the deck page.
3. Not covered at all yet: card roles (labels) and the buying list are drafts, not applied, and have no change-record kind. Once applied they would need either a log row or a second marker. The summary and playgroup fields in the Strategy window (slice 3 draft) are written through set deck setup and so are covered once applied.
4. Changes made in other ways (another browser, an import you run) are not in the record, so they are not noticed until a tab return or reload.
## Verification
- `npx vitest run` (final, after all edits) — 335 files passed, 6 skipped; 4146 tests passed, 46 skipped; 0 failed
- `npx tsc --noEmit` — only the 4 known AddToPicklist test errors
- `npx eslint .` — 1 error (the known PicklistV2 "storage/missing" link) and 280 warnings; no errors in changed files
- Browser check on http://localhost:3137 with the worktree code, real Chrome, notes in docs/oracle/reports/evidence/live-refresh/browser-check.txt: note appeared 1.4 s after the check saw a new marker and faded by itself; 0 refetches with an unchanged marker; 0 checks while hidden or offline, 1 check at once on return; Strategy window kept typed text and showed the banner with 0 Strategy refetches; no note for an owner-made change. The database is hosted, so the change was simulated in the browser (marker and deck answers swapped); nothing was written and nothing needed undoing. The real marker route was called for real: 39 and about 90 bytes, 400 for a bad deck id.
- Not tested: a real Claude change end to end (needs the hosted database); the Recent changes and deck list pages in a browser (covered by unit tests only).

## Review fix
The deck list now actually calls the live check (DashboardPage uses useLiveUserRefresh); a test in src/app/page.test.tsx covers it. Browser-checked: not re-run; unit test only.
