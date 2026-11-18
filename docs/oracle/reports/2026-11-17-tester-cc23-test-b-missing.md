# Report: cc23-test-b-missing
Role: Tester
Status: DONE
Task as received: Task CC-23 (read-only): find out why Claude said there is no deck called TEST B when the owner has both TEST A and TEST B; check read-only (same signed-in, row-level-security path as docs/oracle/reports/2026-11-17-gene-cc18-live-check.md, delete any temporary script) that the list_decks tool returns TEST B for the owner today, and read src/lib/connector/tools/list-decks.ts and the tool text for anything that could hide or stale a newly created deck; do not edit product code. Done when: your report says whether list_decks returns TEST B (with the deck id and the number of decks returned), the most likely cause, and a recommended fix or none needed.

## Summary for the owner
Today the deck list does include TEST B, so the tool is not hiding it. Most likely Claude was working from an older deck list that was fetched before TEST B existed. No fix is needed in the app; the tool wording could be strengthened so Claude re-checks when you name a deck it cannot find.

## Result
- list_decks, run signed in as the owner through the row-level-security path: ok, 21 decks total, 21 returned, not truncated, no paging note. [Confirmed: temporary script, deleted]
- TEST B is present: deck id 1967182443, commander Trostani, Selesnya's Voice, status brewing, 1 card, not marked active. TEST A is also present: deck id 1188842340, commander Grenzo, Havoc Raiser, 1 card.
- The list is sorted by name and the page size is 50, so 21 decks fit on one page. Nothing is cut.

## Code review
- `src/lib/connector/tools/list-decks.ts` filters only by the owner's user id. It has no filter on status, active flag, card count or creation date. The `include_inactive` input is documented as having no effect; all decks are listed. [Confirmed: src/lib/connector/tools/list-decks.ts]
- No caching in the connector code: a search of `src/lib/connector` for cache, revalidate and stale found only price-staleness and edit-conflict text, none touching deck lists. Each call reads the database fresh. [Confirmed: grep]
- Tool text (src/lib/connector/tools/index.ts) says nothing about the list being a snapshot or about re-checking.

## Most likely cause
Claude (the chat) reused a deck list it had fetched earlier in the same conversation, before TEST B was created, or it answered from conversation memory without calling list_decks again. Server data is current. This is an inference: I could not see the conversation itself. A second, less likely factor: TEST B has one card and "brewing" status, which the tool does not hide, so it is not the cause.

## Recommended fix
None needed in the data or the tool code. Optional small wording change (Developer, not started): add to the list_decks description that decks can change during a conversation, and that if the owner names a deck not in an earlier list, Claude must call list_decks again before saying it does not exist. To confirm the cause, the owner can start a new Claude conversation and ask for TEST B; it should be found.

## Changed files
- docs/oracle/reports/2026-11-17-tester-cc23-test-b-missing.md — this report
- (temporary) `.tmp-live-list-decks.mts` — created, run, deleted; no product code touched

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The local auto-login account is the owner's account (it returned the decks, including TEST A and TEST B, as the owner described).

## Challenges to locked decisions
- none

## Open questions
- Was TEST B created in the same Claude conversation before Claude said it did not exist, or was it created earlier? (Would confirm the cause.)

## Verification
- `npx tsx .tmp-live-list-decks.mts` (temporary, deleted; signed in with the owner's local login, anon key plus the owner's token) — ok true, total 21, returned 21, truncated false; TEST B id 1967182443 present.
- `grep -rniE "cache|revalidate|unstable_|stale" src/lib/connector` — no deck-list caching.
