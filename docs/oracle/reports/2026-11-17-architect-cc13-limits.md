# Report: cc13-limits
Role: architect
Status: PARTIAL
Task as received: Task CC-13 (see docs/oracle/status.md row CC-13, owner approved 2026-11-17). Plan only; do NOT apply any migration. Loosen Claude connector edit limits: (1) a single request may change up to 100 cards without approval (currently direct_max 10); max_request may also need raising; (2) hourly cap 500 (was 40) and check split_window_minutes / max_waiting still make sense; (3) request_card_move goes straight through with 7-day Undo, no pending approval; (4) Undo of a big batch must work in one click (claude_undo_max is 10 today; check Oracle-side Undo and Claude-side undo_change); (5) 'build from unused cards' uses only free copies; copies in another deck move only when explicitly asked. Audit code and SQL, find everything that must change, write the contract amendment and draft migration into supabase/drafts (not applied), list risks, slice the build for Developer and Tester. Do not edit decisions.md.

PARTIAL because: limits, move rule and one-click undo are fully drafted; the bulk "fill with free copies" tool needed for a one-click deck build is specified but its SQL is not written (needs owner OK, question 3).

## Summary for the owner
Claude will be able to change up to 100 cards in one request, make 500 changes an hour, and move cards between decks without waiting for you, each with Undo for 7 days. Undo works in one click for any size, but building a whole deck from unused cards would still take one Undo per card unless we add one small extra Claude tool; that needs your yes. Please also decide the three questions below.

## Changed files
- docs/oracle/contracts/claude-connector-cc13-amendment.md — the contract amendment (new values, moves, undo, free copies, tests, rollout)
- docs/oracle/contracts/claude-connector-cc13-amendment.types.ts — new `AI_LIMITS` (adds `split_max`), reason notes, proposed `sleeve_free_copies` input
- docs/oracle/contracts/claude-connector-slice-b.md — one "Amended by CC-13" pointer under the header (no other edit)
- supabase/drafts/20261117100000_cc13_loosen_limits.draft.sql — DRAFT, not applied: replaces `_ai_limits`, `_ai_gate`, `ai_list_recent_changes`
- supabase/drafts/20261117100000_cc13_loosen_limits.rollback.sql — restores the old three bodies (no data touched)
- docs/oracle/reports/2026-11-17-architect-cc13-limits.md — this report

## Audit: what exists today
- Limits: `AI_LIMITS` direct_max 10, split 30 min, hourly 40, undo 7 d, pending 24 h, max_waiting 20, max_request 60, claude_undo_max 10 [Confirmed: src/lib/connector/edit-config.ts]. Same numbers in `_ai_limits()` [Confirmed: supabase/migrations/20261116150100_ai_connector_edit_rpcs.sql] and the types file [Confirmed: docs/oracle/contracts/claude-connector-slice-b.types.ts]. Later migrations never redefined `_ai_limits` or `_ai_gate` (190000 only wraps `_ai_plan`/`_ai_execute`, replaces `ai_undo_group` and `ai_list_recent_changes`).
- Gate: `copy_move` always returns `card_move`; `> direct_max` returns `over_ten`; one-deck 30-minute total compared with `direct_max` (`recent_total`); hourly (`busy`) also counts changes Claude undid [Confirmed: 150100 `_ai_gate`].
- `max_request` is enforced in zod (`AI_LIMITS.max_request` in every list input) and in SQL (`too_many_cards`) [Confirmed: edit-tools.ts; 150100; 190000]. At 60 it would block the owner's 100, so it must rise.
- Claude undo cap is read from `_ai_limits()` in both `ai_undo_group` versions [Confirmed: 150100 ~line 730; 190000 ~line 285]. Owner-side undo has no cap. So raising the constant fixes Claude undo with no function change.
- `ai_list_recent_changes` reads `LIMIT 300` rows [Confirmed: 190000 section 7; same in 150300]. Breaks with 100-row groups (see Risks).
- Free copy rule: `sleeve_copy` refuses a copy already in a deck or missing; only open non-maybeboard, non-generic slots [Confirmed: 150100 `_ai_plan`]. The tool-side "free" filter also excludes "In your hand" [Confirmed: collection-filters.ts]; I found no hand check in the SQL plan.
- `sleeve_free_copy` handles one copy per call and one group per call [Confirmed: edit-tools.ts, plan has n = 1].
- Pending machinery (approve/decline routes, chip, `PendingCard` "Moving a card") stays needed for old waiting rows and 101-200 / busy cases.
- Test that keeps limits equal reads only `20261116150100` [Confirmed: src/lib/connector/__tests__/edit-tools.test.ts line ~28]. It will fail or stay green for the wrong reason after the new migration.
- "Test plan G10/G11": I could not find G10/G11 anywhere except the status row (not in test-plan-2026-11-17.md or reports). Tester should confirm where they live.

## Everything that must change
Database (draft, not applied):
- `_ai_limits()`: direct_max 100, hourly_max 500, max_request 200, claude_undo_max 200, new split_max 200.
- `_ai_gate()`: remove "moves always wait"; split rule uses split_max.
- `ai_list_recent_changes()`: limit by groups (50), row cap 2000, blocker once per group.
- Not changed: pending reason `over_ten`/`card_move` stay valid (CHECK constraint); undo functions; tables.

Code (Developer):
- `src/lib/connector/edit-config.ts` AI_LIMITS (all values plus `split_max`).
- `src/lib/connector/__tests__/edit-tools.test.ts`: limits test must read the LAST `_ai_limits` definition across `supabase/migrations/*` (sorted), and also compare to the contract types file.
- `src/lib/connector/tools/index.ts` descriptions: add_cards_to_deck, remove_cards_from_deck, set_card_zone, sleeve_free_copy ("Up to 10", "more than 10 waits"), request_card_move ("always waits"), undo_change ("over 10 cards"). Add the free-copies-only wording.
- `src/lib/connector/tools/edit-tools.ts`: `requestCardMove` comment; `shapeOutcome` pending message fine but add to `applied` message nothing new; `listRecentChanges` note ("card moves can only be undone by the owner" stays true if question 2 = keep).
- `src/lib/connector/change-sentences.ts`: `copy_move` sentence drops "You approved this" unless `approved_by_owner`; `too_many_cards` says 60 -> 200 (build text from AI_LIMITS, not a literal); `group_too_big` says "10" -> from AI_LIMITS (200); `movedSlotSentence` already conditional; snapshot tests.
- `src/components/connector/ConnectionTab.tsx` CANT/CAN lists: "Do big edits (over about 10 cards) or move a card between decks without your yes" becomes "Do edits over 100 cards in one go without your yes"; add to CAN "Change up to 100 cards at once and move cards between decks; undo here for 7 days".
- `src/components/connector/RecentChangesTab.tsx`/`RecentChangesTab.test.tsx`: empty text fine; undo success message `Undone. {first.card_name} is off ...` is wrong for a 100-card group, use a count ("Undone. 100 changes reversed.") built in change-sentences.
- `src/components/connector/PendingCard.tsx`, `MovedSlotNote.tsx`: keep for legacy rows; MovedSlotNote line "Claude moved this copy" already conditional on approval.
- `src/components/connector/SetupGuideTab.tsx`: I found no limit wording in it; Developer to re-check once the new text exists; add a line "Claude can build a whole deck and every request has one Undo".
- Tests: `edit-tools.test.ts` (over_ten fixtures remain valid), `api.test.ts`, `small.test.tsx`, `RecentChangesTab.test.tsx`.
- Docs (not Developer): `docs/oracle/specs/claude-connector.md` sections 0, 4 (copy_move sentence), 5 (pending types), 6 (can/can't), `docs/oracle/specs/vocabulary.md` connector words, `docs/oracle/mockups/claude-connector.html` (Designer owns), slice-B contract sections (done: pointer only; full merge optional), `docs/oracle/drafts-gate5-claude-connector.md` click-through step about approving a move, and the CC-04b row in status (Gene).

D-034a wording (for Gene, after owner approval; do not edit decisions.md myself). Replace the second sentence with: "Edits of up to 100 cards in one request, and moving a card from one deck to another, go straight through and can be undone from Oracle's Recent changes screen for 7 days, in one click whatever the size (undo is refused, with a plain-words reason, if the deck has changed since). Larger requests (101 to 200 cards), or an unusually busy hour (over 500 changes), do not happen until the owner approves them in Oracle; they wait as pending for 24 hours, then expire. Requests over 200 cards are refused." Keep the rest. The sentence "A moved card is saved in its new deck and stays in the old deck's plan..." stays. Add: "Building from unused cards uses only free copies; a copy that is in another deck moves only when Claude is asked to move that copy." Also the line "Claude cannot approve its own pending changes" stays.

## Build slices
Slice 1 (Gene): approve the three questions; apply `20261117100000_cc13_loosen_limits.draft.sql` on a throwaway branch.
Slice 2 (Tester, SQL): run the live checks in the amendment section 7 against the branch, incl. timings. Any SQL fix returns to Architect.
Slice 3 (Developer): constants, limits test (last definition), tool descriptions, sentences (counts from AI_LIMITS), ConnectionTab text, undo message for big groups, tests. No behaviour code needed for moves/undo (they follow the database).
Slice 4 (Architect then Developer, only if question 3 = yes): CC-13b SQL for `sleeve_free_copies` (wrap `_ai_plan`/`_ai_execute`, one group, kind `sleeve_copy`), tool + zod + tests; add the "In your hand" check to sleeve/move plans if confirmed missing.
Slice 5 (Designer): spec, mockup and vocabulary text for the new rules (small).
Slice 6 (Tester): update test plan G10/G11 (locate first), then the end-to-end: build a 100-card deck, one Undo, move a card, Undo as owner, 101-card wait, 201 refusal.
Slice 7 (Gene): apply to live, record D-034a amendment, update status.

## Risks
1. Recent changes list loses or cuts groups at 300 rows (fixed in draft; Tester must verify with three 100-row groups).
2. Speed: a 200-row submit, undo, and list each loop per row in SQL (blocker per row now once per group). No measurement exists. Request timeouts are the failure mode. Tester must time 100 and 200 rows before live.
3. Quiet damage: a mistaken 100-card request is now applied without a look. Mitigation: 7-day Undo, never deletes collection data, dry_run still available, hourly cap 500 still bounds a runaway loop (but 500 cards of mistakes is a lot to undo: 5 groups).
4. Hourly cap 500 effectively removes the "runaway" brake that 40 gave. Consider a lower alert later; owner chose 500.
5. Deck build is many Undo clicks without the bulk free-copy tool (question 3).
6. "In your hand" copies could be sleeved by `sleeve_copy` if the SQL really has no hand check (unverified, see Slice 4).
7. Moves now change another deck with no look; owner-only undo means Claude cannot reverse its own mistaken move, so the owner must click Undo.
8. Test coupling: the equality test reads one fixed migration filename; without the fix it silently passes on stale numbers or fails.
9. Approved-by-owner groups stay owner-only for Claude undo (unchanged) and legacy waiting moves keep the old sentence "You approved this".
10. Concurrent requests: two 100-card requests at once serialize on deck locks as before; hourly count is read before the lock, so two simultaneous requests can both pass at 450 (small overshoot, harmless, same as before).
11. Rolling back SQL while code constants are 200: Claude gets "too many" refusals; rollback script note covers pairing.

## New decisions made (need owner confirmation)
- `max_request` 200 and `claude_undo_max` 200 (owner gave 100/500 only). Requests of 101-200 wait for approval; over 200 refused.
- New `split_max` 200: one deck, 30 minutes.
- The tool name `request_card_move` is kept though it no longer asks.
- Reason value `over_ten` kept as a historical name.

## Assumptions
- "Unused cards" means free copies: in no deck, not Missing, not In your hand.
- Owner-side Undo needs no cap (confirmed in SQL); Claude may undo only groups it made that the owner did not approve.
- Existing waiting requests at release time stay approvable.
- No local Postgres, so the SQL is not run; syntax read-checked against the existing migrations.

## Challenges to locked decisions
- D-034a — the second sentence (big edits over about 10 and every move wait for approval) is superseded by the owner's CC-13 approval — suggested wording above, to be recorded by Gene.

## Open questions
1. Owner: OK that requests of 101-200 cards still wait for your yes and anything over 200 is refused? (Alternative: refuse over 100.)
2. Owner: should Claude be able to undo its own card moves, or only you in Oracle? (Recommend: only you, as today.)
3. Owner: add one small Claude tool that fills a deck with free copies in one request, so a whole deck build is one Undo? (Recommend yes; without it a build is about 100 separate Undo clicks.)
4. Tester: where are test plan G10/G11? Not found in the repo.

## Verification
- Read-only audit with grep/view of edit-config.ts, edit-tools.ts, tools/index.ts, change-sentences.ts, ConnectionTab.tsx, SQL migrations 150000-190000 — done.
- SQL not executed (no database used; migrations not applied) — draft only.
- No code or tests were run; no source files under src/ were edited.
