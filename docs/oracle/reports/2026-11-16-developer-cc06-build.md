# Report: cc06-build
Role: Developer
Status: PARTIAL
Task as received: Owner approved CC-06 (brief in docs/oracle/briefs/, contract and slices in docs/oracle/contracts/ and the 2026-11-16 architect report). Owner confirmed: (1) rules text always on search results, opt-in on deck lists; (2) if first live deck health for a never-checked commander takes >8s, stop and report instead of letting the connector persist shared data. Build all eight CC-06 slices in order, running tests/typecheck/lint per slice. No stored-data changes, no destructive DB ops, do not touch CC-07/CC-08. Do the final live check if possible; otherwise say what remains. Write a report.

## Summary for the owner
Claude now sees card facts (type, cost, colours, rules text, Commander legality, estimated price) on search results and deck lists, runs a real deck health check every time, and is told who sets a deck's bracket when none is set. Nothing stored was changed and nothing can be written by these tools. The live check against your real account could not be done from here, and early timing suggests the first health check for a commander nobody has checked before may take longer than 8 seconds, so I stopped short of any change to let Claude save shared data and need your call.

## Slice results (in order)
- **a Facts lookup: done.** One batched lookup of the card library by name (exact, then front face of double-faced cards), banned versus not legal from printings, price through the existing estimate helper. Missing cards say unavailable; database errors are real errors.
- **b Facts on search: done.** Every search card carries facts with rules text. An empty saved type now shows the library type. Not-in-library shows "facts unavailable".
- **c Facts on deck cards: done, with a size finding (see Challenges).** `get_deck` items carry facts; rules text only with `include_rules_text`. Ownership-tool rows carry facts; their prices and totals are unchanged.
- **d Live deck health: done.** Runs the same calculation as the Deck health screen on every call, read-only, through the owner-scoped handle. Old saved-only code and its tests deleted. A parity test shows identical output to the app's loader (apart from the time).
- **e Bracket: done.** Strategy screen value first, then the deck row, else null with the plain explanation. No tool can set it.
- **f Descriptions and safety tests: done.** Tool descriptions updated; tests assert the tool list is unchanged, no write calls exist in the new files, and every owner-table query carries the user id.
- **g Live check: NOT done** (see below).
- **h Close-out: this report.** Status and vocabulary left to Gene/Scribe.

## Live check and the 8-second gate
- I have no connector sign-in for your account (it comes from Claude's own sign-in), and I did not use stored dev credentials or the service key to get around that. So scenarios S1 to S3 and the two-account isolation check remain for the Tester.
- Partial timing evidence, no owner data involved: asking EDHREC (the source of a commander's typical numbers) for one well-known commander took about 4.3 s for the average deck on a good run, and on another run failed after about 20 s and 32 s (the app's own retry delays). The page request was 0.2 s to 1 s when it worked. A first check for a never-checked commander therefore plausibly exceeds 8 s, before the card-library reads are added.
- Per the owner's rule, I did NOT add any way for the connector to save the shared commander-numbers cache. Decision needed (Gene and owner).

## Changed files
- src/lib/connector/tools/card-facts.ts — new facts lookup (slice a)
- src/lib/connector/tools/search-collection.ts — facts on search cards
- src/lib/connector/tools/get-deck.ts — facts, `include_rules_text`, bracket info
- src/lib/connector/tools/list-deck-cards-by-ownership.ts — facts on rows; price helpers exported (file was already untracked from earlier work)
- src/lib/connector/tools/list-decks.ts — bracket info
- src/lib/connector/tools/bracket.ts — new bracket rule
- src/lib/connector/tools/get-deck-health.ts — rewritten: live check, old saved-only branch removed
- src/lib/connector/deck-health-loader.ts — new connector loader (user id on every owner query)
- src/lib/connector/read-only-ref-client.ts — new card-library-only, no-write adapter
- src/lib/deck-health-server.ts — pulled the card-mapping step into a shared pure function so the app and Claude cannot drift (app behaviour unchanged)
- src/lib/connector/tools/index.ts — updated tool descriptions only (tool list unchanged)
- Tests: card-facts, facts-in-tools, deck-health-live, bracket (new); tools, ownership, registry-and-isolation (updated; old "not_computed" tests deleted; the user-id check now exempts shared card-library tables)

## New decisions made (need owner confirmation)
- Bracket is returned as a new field `bracketInfo`; the old `bracket` text field stays, since the contract could not use one name for both.
- Facts lookups use 100 names per request, not 200, to keep request addresses short.
- Failed health checks use error code HEALTH_FAILED through the existing error shape; the shared error-code type was not changed.
- Server logs one timing line per health check (for the 8 s question).

## Assumptions
- Card-library tables (including the commander-numbers cache) are readable by the signed-in user's token, as the Architect confirmed from migrations; not tested live.

## Challenges to locked decisions
- none. D-003 note: facts match by name (no oracle id in the card library), as the contract said.

## Open questions
- **Size cap vs. "whole deck in one call".** A typical card row with facts is about 430 bytes, so a 100-card deck is about 43 KB against the 40 KB answer cap. `get_deck` now returns roughly 90 cards a page and says more remain, so scenario S1 may take two calls. Options for Architect: raise the cap for `get_deck`, or slim the facts per card.
- **Slow first health check.** Options: accept the wait; give Claude a time limit and fall back to the general guide with a clear label; or the shared-cache save path (needs owner approval). Recommendation: time limit with honest fallback first.
- A different agent's picklist test file currently breaks the project-wide type check (four errors in a component test, committed at 17:05). Not CC-06; flagging so it is not blamed on this work.

## Verification
- Per slice: connector tests, `npm run typecheck`, eslint on touched files — all clean at each slice end (the final project-wide typecheck shows only the four picklist test errors above, none in CC-06 files).
- Full `npm test` — 3338 passed, 1 failed: the identity-resolver "no oracle_id" test times out at 5 s; unrelated to CC-06 files (it fails the same when run alone).
- Connector suite: 167 passed, 4 skipped (the live-only file).
- No example request against the real endpoint (no token); behaviour shown by tests with a faked database.
- No migrations, no stored-data changes, nothing committed.

## Follow-up (2026-11-17): the two owner-approved changes
- **Slow live deck health: done.** The live check now waits at most 8 seconds for a commander's typical numbers. On timeout it answers with the general guide, labelled "General guide (EDHREC took too long, so this is not this commander's average)", and the note field repeats that label so Claude says it out loud. It never reads as the commander's own average and never passes or fails silently. Nothing is saved (the connector still has no write path to the shared cache); a late EDHREC answer is simply dropped. Applies to any slow numbers lookup; saved fresh numbers return instantly so are unaffected. [Confirmed: src/lib/connector/deck-health-loader.ts]
- **Large decks: done.** Deck rows from the deck lookup no longer carry a price (type, cost, colours and legality stay; rules text still opt-in on decks, always on search). A 100-card deck now returns whole in one call, not truncated, under the 40 KB cap (test asserts all 100 returned). Prices remain on search results and the ownership tool. [Confirmed: src/lib/connector/tools/get-deck.ts]
- Tool descriptions updated to match (get_deck, get_deck_health). The unrelated "Planned slots" wording change another agent has in that file was left unstaged.
- New tests: slow numbers fall back with the label and a note and no writes; in-time numbers used normally; limit is 8000 ms; 100-card deck whole with no price.
- Verification: connector tests 236 passed, 4 skipped (live-only). eslint on all touched files clean. Project-wide lint still shows 3 older errors in list-decks.ts and tools.test.ts (not touched here). Not tested live (no account sign-in).
- Open: S1 to S3 live scenarios and the two-account check remain for the Tester; confirm the real first-check time for a never-checked commander is now bounded at about 8 s plus card-library reads.
