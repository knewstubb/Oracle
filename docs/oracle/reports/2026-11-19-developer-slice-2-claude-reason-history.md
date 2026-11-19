# Report: slice-2-claude-reason-history
Role: Developer
Status: DONE
Task as received: Part B, slice 2 (DV-04 plus the unified History): the brief is docs/oracle/briefs/claude-change-reason.md; also read docs/oracle/plans/2026-11-19-deck-page-tags-slice-plan.md (slice 2), docs/oracle/specs/deck-rail-strategy-tags.md, docs/oracle/reports/2026-11-19-architect-audit.md (the History versus Recent changes finding, the ai_change_log reason column) and docs/oracle/reports/2026-11-19-architect-conflict-list.md. Owner decisions (binding): one line of reason is stored with every Claude write and shown beside 'Changed by Claude' in Recent changes and in History; the existing approval-hold reason column (over_ten, recent_total, busy, card_move) must NOT be reused, so add a new column or equivalent through a stored-data change; use the existing ai_change_log and Undo, no second history. 'See in History' must show one History per deck: Claude's changes first (with reason and Undo), then the saved versions that the deck page's Version History window shows today. The slice 1 Strategy window's 'See in History' link must open this unified History. Claude's connector write tools must accept and require a short reason (decide the length limit from the brief; refuse an empty reason with a plain message that tells Claude what to send), and Claude's tool descriptions must tell it to give a one-sentence plain reason. Existing changes without a reason show nothing extra (no 'No reason' clutter) unless the brief says otherwise. Slice 1 added a Claude write path for dated Strategy paragraphs; that path needs the reason too. (Full constraints as given in the handoff: stored-data change as a DRAFT only, rehearsed on a throwaway database with all earlier drafts, nothing applied.)

## Summary for the owner
Every change Claude makes now has to come with a one-line reason (up to 200 characters). The reason shows under the change in Recent changes, in the deck's History, and on a request that is waiting for your yes. The deck's History button now opens one window: "Changes Claude made" first (with the reason and Undo), then "Saved versions" (what the Version History window showed before). The Strategy window's "See in History" link opens that window. Nothing is applied: until you apply the stored-data update, Claude's changes still work and Claude is told plainly that the reason could not be saved, and you see no reason line.

What to test in 5 minutes (after you apply the S4 stored-data update; steps 1 and 2 work today):
1. Open a deck, press History. You see "History" with two parts: "Changes Claude made" on top, "Saved versions" below. Your saved versions are the same as before.
2. Open the Strategy window and press "See in History". The window closes and the same History opens.
3. Ask Claude to add a card to the deck. Claude should say why in one sentence. Open History: the row says what Claude did, then "Reason: ...", and has an Undo button.
4. Open Settings, Claude connector, Recent changes. The same change shows the same reason. Older changes show no reason line and nothing else different.
5. Ask Claude to cut more than 120 cards, so it waits for your yes. The waiting card shows "Reason: ..." under its title. The tag "Big edit · waiting" is the hold, separate from the reason. Approve it: the change shows the reason in Recent changes.
6. Ask Claude to change something without giving a reason (it will refuse and tell Claude what to send). Press Undo on a change with a reason: it works as before.
To decide: see "Open points" below (one list or two groups; changes older than 7 days).

## Changed files
- supabase/drafts/20261119110000_s4_claude_change_reason.draft.sql: new DRAFT, not applied. A new table for the reasons (one row per Claude request), thin front doors on `ai_submit_change` and `ai_approve_pending`, a small function for create deck and set deck setup.
- supabase/drafts/20261119110000_s4_claude_change_reason.rollback.sql: puts the two functions back byte for byte, drops the table (refuses while reasons exist unless told otherwise).
- docs/oracle/reports/evidence/roles-db/test_s4.sh, test_s4.out, README.md: the throwaway rehearsal (38 checks) and its result.
- src/lib/connector/change-reason.ts: new. The 200 limit, the required `reason` field and the plain messages.
- src/lib/connector/tools/edit-tools.ts, tools/index.ts: all eleven write tools take a required `reason`; each description tells Claude to send one plain sentence; list_recent_changes returns the reason.
- src/lib/connector/write-gateway.ts, write-types.ts, api-types.ts, owner-api.ts: carry the reason to the database, read it back for the change list and waiting requests, filter the change list by deck.
- src/app/api/connector/changes/route.ts: optional `deckId` filter (the same list, one deck).
- src/components/connector/ClaudeReason.tsx (new), ChangeRow.tsx, PendingCard.tsx, RecentChangesTab.tsx, api.ts: the "Reason:" line.
- src/components/connector/DeckClaudeChanges.tsx: new. "Changes Claude made" for one deck, with the same rows and Undo.
- src/components/VersionHistoryPanel.tsx: now "History": Claude's changes first, then "Saved versions" (save, list, restore unchanged).
- Tests: src/lib/connector/__tests__/claude-reason.test.ts (new, 60), src/components/VersionHistoryPanel.test.tsx (new, 8), src/components/connector/ClaudeReason.test.tsx (new, 8); existing edit-tools, strategy-window-connector and registry-and-isolation tests now send a reason.

## New decisions made (need owner confirmation)
- Length: one line, at most 200 characters (the brief's recommendation). Longer or multi-line reasons are refused with a plain message, not shortened.
- Required on all eleven write tools, including a dry run (one rule). Not required on undo_change (an undo is not a new change in the log).
- The reason is stored in a separate table (`ai_change_reasons`, one row per request), not as a column on `ai_change_log`. Reason: the log is locked by a guard so only the undo fields can change, and a column would mean changing that guard and every function that writes the log. The owner asked for "a new column or equivalent". The brief says "one new reason field"; this is that field in another table.
- "Changed by Claude" is not printed as a new label; the row keeps its existing "time · Claude" line and gets "Reason: ..." under the sentence.
- History shows the last 7 days of Claude's changes for the deck (the same list as Recent changes). Older changes are not shown, as in Recent changes.
- Wording: the History window title is "History" (was "Version History"); "Snapshots" is now "Saved versions". The trigger button keeps its accessible name "View version history".

## Assumptions
- Live state: DB-1 to DB-5 applied, S3 and CC-25 drafted but not applied, DB-6 discarded (per status.md and the audit). I did not run a live query; I read the repo drafts. S4 does not touch any function those drafts replace, so it works with or without them.
- An unknown extra key in a request is ignored by the live plan functions (verified on the rehearsal base, before S4, for deck_add and card_label). That is why a request with a reason already works before S4 is applied.

## Challenges to locked decisions
- none. D-034, D-034a unchanged; the hold reason is not reused and not changed.

## Open points (not guessed)
1. One list or two stacked groups? Today History is two stacked groups: Claude's changes, then saved versions (as the owner decided). Recommendation: keep two groups. A saved version is a whole-deck snapshot you restore to, a Claude change is one edit with Undo; mixed in one time line, a restore button next to an Undo button invites confusing the two, and Undo (7 days) and Restore (any age) behave differently. A single time line becomes worth it only if you want to see "what happened between version 3 and 4"; that would be a small follow-up (interleave by time, same rows).
2. Changes older than 7 days: not covered by the brief. They are kept in the stored record but not shown in History (same as Recent changes). Do you want older ones listed without Undo?
3. Waiting requests in the deck's History: not shown there (they show in Recent changes under "Waiting for your yes"). The brief only asks for the reason on them. Say if you want them in the deck's History too.
4. Changes by your own hand are not in History's Claude part (reasons for your own edits are out of scope).
5. Create deck and set deck setup store their reason in a second step right after the change (two different database calls), because those two do not go through the shared submit function. If the second step fails the change stays and Claude is told the reason was not saved. The other nine kinds store the reason in the same step as the change.

## Verification
- `./run.sh test_s4` in docs/oracle/reports/evidence/roles-db (throwaway local Postgres 17, deleted at the end): 38 PASS, 0 FAIL. It covers S4 on the bare base (apply, rollback, exact restore), S4 on the live state with DB-1 to DB-5, CC-25 and S3 applied (reasons stored for deck_add, deck_category, deck_zone, deck_remove and card_label; bad reasons refused with nothing changed; waiting request keeps the reason, no reason row until approved, hold reason still over_ten; declined stores none; Undo by Claude and owner; create deck and set deck setup recording; owner-only reads; no write or call for signed-in users or anon), rollback refusal and exact restore (database fingerprint equal), re-apply, and S3, CC-25 and DB-5 to DB-1 rolled back with S4 still applied, then S4 last (fingerprint equals the base).
- Earlier drafts re-run unchanged on the throwaway database: test_db1 51/0, test_db2 84/0, test_db3 56/0, test_db4 52/0, test_db5 44/0, test_s3 38/0, test_cc25 18/0. (Their saved .out files are left as they were.)
- `npx vitest run`: 4063 passed, 1 failed, 46 skipped. The one failure is `upgrade-engine.property.test.ts` "returns 400 for invalid bracket values (outside 1-4)": a random-input test that fails only when it draws exactly 5, which has been a valid bracket since slice 1; it passed on four reruns alone. It is not caused by this change. The ImportIntentFlow flag test passed in this worktree.
- `npx tsc --noEmit`: 4 errors, all the known AddToPicklist test errors; none new.
- `npx eslint .`: 1 error and 278 warnings, identical to before my change.
- Nothing was applied to any database; no hosted query was run.
