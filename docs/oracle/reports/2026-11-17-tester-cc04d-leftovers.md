# Report: tester-cc04d-leftovers
Role: Tester
Status: DONE
Task as received: Verify commit ee2108a (deck listing shows all decks with wording; sync-scryfall cron removed; phone note softened); run connector and SetupGuide tests, tsc, confirm 2 failing tests unrelated. Read-only, no live DB writes.

## Summary for the owner
All three small fixes check out and nothing they touched broke. Two import tests fail, but they are in code this commit never touched. One connector test fails only because of someone else's unfinished edit in the working folder.

## Results
1. **PASS** Deck listing. [Confirmed: src/lib/connector/tools/list-decks.ts] has no active filter, sets "marked active by you" / "not marked active by you", and adds Draft/Assembling/Playable readiness. The word "inactive" appears only in the name of the ignored `include_inactive` input, whose description says it has no effect; Claude is never shown "inactive" as a status. [Confirmed: list-deck-cards-by-ownership.ts] no longer filters on active; description says "all of your decks". Note: the list-decks.ts and tools.test.ts changes are not in ee2108a's own diff; they are present in its tree (they landed in an earlier commit, 7b408ea). The Developer report overstates what ee2108a contains. Behaviour is correct at ee2108a.
2. **PASS** vercel.json has only the refresh-prices cron (daily 06:00). The sync-scryfall route is deleted; nothing in src or config imports it (only comments mentioning an unrelated script of similar name).
3. **PASS** Setup guide note: "Adding a connector from the phone app is still in beta, so it's easiest to start on the web or desktop. Once it's added, it shows up on your phone." No technical words. Test updated to match.
4. **PASS** SetupGuideTab.test.tsx and connector tools.test.ts: 34/34 pass.
5. **PASS** Typecheck: 4 errors, all in AddToPicklist.test.tsx; none in connector files.
6. **PASS** The 2 failures (basic-lands-import, import-destination) reproduce; ee2108a changes no import files. Unrelated.

## Other findings
- Full connector + connector-components run: 1 failure in MovedSlotNote.test.tsx (text "Was sleeved here. Claude moved this copy…"). MovedSlotNote.tsx has an uncommitted edit from another agent, not part of ee2108a. Unrelated to this commit; flag to Gene.
- Did not run lint or hit live endpoints (read-only, no DB writes).

## Changed files
- docs/oracle/reports/2026-11-17-tester-cc04d-leftovers.md — this report

## New decisions made (need owner confirmation)
- none

## Assumptions
- Uncommitted tree changes belong to other agents and were ignored, as instructed.

## Challenges to locked decisions
- none

## Open questions
- Should MovedSlotNote's owner fix its test before merge?

## Verification
- npx vitest run src/lib/connector src/components/connector — 290 pass, 1 fail (MovedSlotNote, uncommitted edit)
- npx vitest run SetupGuideTab + tools.test.ts — 34 pass
- npx vitest run basic-lands import-destination — 2 fail (pre-existing)
- npx tsc --noEmit — 4 errors, AddToPicklist.test.tsx only
