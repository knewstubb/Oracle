# Report: cc13-limits
Role: developer
Status: PARTIAL
Task as received: Build CC-13 per docs/oracle/reports/2026-11-17-architect-cc13-limits.md, the contract amendment docs/oracle/contracts/claude-connector-cc13-amendment.md (+ .types.ts) and the status.md row CC-13. Owner decisions (2026-11-17): a single request up to 120 cards goes straight through (over 120 waits for owner approval; over 200 refused); hourly cap 500; card moves between decks go straight through with 7-day Undo; only the owner (not Claude) undoes moves; NO new 'fill deck' tool; instead make Claude group a whole deck build into ONE request/group so Oracle Undo is one click (via tool descriptions / existing tool inputs, check existing tools support it). 'Unused' builds use only free copies. Use 120 where the Architect draft says 100. Do not apply the migration (update the draft to 120, stop and report). Do not edit decisions.md. Run tests, tsc, eslint. Write this report.

PARTIAL because the code is done but nothing works live until the owner approves applying the database change. Until then the app's code and the database disagree, so do not ship the code before applying it.

## Summary for the owner
Claude is set up to build a whole deck in one request (up to 120 cards, each Undo one click), move cards between decks without asking, and make 500 changes an hour. The screens and Claude's instructions now say so. Please approve applying the database change (limits 120 / 200 / 500, moves no longer wait, longer Recent changes list), and then it needs applying before the code goes live.

## Changed files
- src/lib/connector/edit-config.ts — AI_LIMITS: direct_max 120, split_max 200 (new), hourly_max 500, max_request 200, claude_undo_max 200
- src/lib/connector/tools/index.ts — tool text: 120 limit, "send all cards for one job in ONE call", free copies only, moves go straight through and only the owner can undo, undo cap 200
- src/lib/connector/change-sentences.ts — move sentence says "you approved this" only when the owner did; limits quoted from AI_LIMITS (no literals)
- src/components/connector/ConnectionTab.tsx — can / can't lists
- src/components/connector/SetupGuideTab.tsx — one line about one-request deck builds, single Undo, 120 limit
- src/components/connector/RecentChangesTab.tsx — Undo message for a multi-card group ("Undone. N changes reversed.")
- src/lib/connector/__tests__/edit-tools.test.ts — limits test now reads the last `_ai_limits` in migrations (or the draft until applied) and the contract types; new tests (120-card build is one submit, 201 refused, move applied, tool text, move sentence)
- supabase/drafts/20261117100000_cc13_loosen_limits.draft.sql — 100 -> 120 (NOT applied)
- docs/oracle/contracts/claude-connector-cc13-amendment.types.ts and .md — 100 -> 120, owner decisions noted (contract is Architect's; only the numbers and a note changed)
- docs/oracle/specs/claude-connector.md — move sentence and a CC-13 update note

## Existing tools support a one-click deck build
- `add_cards_to_deck` takes many cards (entries plus quantity) in one call; the database counts total quantity and writes ONE group, so one Undo [Confirmed: edit-tools.ts addCardsToDeck; migration 150100 deck_add sums quantity]. Tool text now tells Claude to always send a whole job in one call.
- `sleeve_free_copy` is one copy per call and one group per call [Confirmed: edit-tools.ts]. So sleeving copies one by one is not one Undo. The tool text now says it is for single cards and that deck builds use add_cards_to_deck. Result: a build adds Planned slots in one group; attaching copies to them stays a separate, per-card step. If the owner wants copies attached in the same one-click build, that needs the bulk tool the owner declined.

## New decisions made (need owner confirmation)
- Test-only: limits test accepts the draft file as the expected values until the migration is applied (then the last migration must match). Once applied, move the draft file and this stays correct.
- Kept `request_card_move` tool name (as Architect proposed).

## Assumptions
- Owner-only undo for moves is unchanged in the database (Architect confirmed `OWNER_ONLY_UNDO`), so no code change was needed.
- "In your hand" copies are not checked in `sleeve_copy` SQL (Architect's unverified gap 1); not addressed (SQL is Architect's).

## Challenges to locked decisions
- D-034a — superseded second sentence per Architect's wording; Gene to record with 120 in place of 100 (and 121 to 200 waits).

## Open questions
- Owner: approve applying the draft migration (branch first, then live)?
- Architect: the "In your hand" check in sleeve/move plans (gap 1) still open.
- Tester: speed of 120 and 200 row submit / undo / list is unmeasured; test plan G10/G11 location.
- Docs not in my lane and not changed: spec vocabulary, mockup (Designer), CC-04b row and D-034a (Gene), drafts-gate5 click-through.

## Verification
- `npx tsc --noEmit` — only 4 errors, all in src/components/AddToPicklist.test.tsx (not touched; existing)
- `npx eslint src/lib/connector src/components/connector` — 3 errors, all existing and in files I did not touch (tools.test.ts any x2, list-decks.ts prefer-const)
- `npx vitest run src/lib/connector src/components/connector` — 299 passed, 1 failed: registry-and-isolation "descriptions match CC-06" expects "estimate" in get_deck text; it failed identically before my changes (checked with changes stashed)
- No endpoint run (database change not applied; no live request possible).
