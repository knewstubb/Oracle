# Report: cc19-empty-buying-list
Role: Developer
Status: DONE
Task as received: Task CC-19: work directly in this repository (the CC-18 buying list is uncommitted here; do not use a worktree) and make the get_buying_list tool tell Claude that when totals.notOwnedCopies is 0 but proxy copies exist it must say so plainly and offer the upgrade list (include_proxies) instead of reporting only "nothing"; edit the description in src/lib/connector/tools/index.ts, the CC-18 contract docs/oracle/contracts/claude-connector-cc18-buying-list.md, and the wording test, with context in docs/oracle/reports/2026-11-17-gene-cc18-live-check.md.
Done when: the description and contract say it, a test checks the wording, npx vitest run src/lib/connector passes apart from the known TIDY-01 get_deck failure, and a report is at docs/oracle/reports/2026-11-17-developer-cc19-empty-buying-list.md.
For Brad (plain words): Make Claude tell you when a deck has nothing left to buy but proxy cards worth upgrading, instead of just saying there is nothing.

## Summary for the owner
When your decks have no unpurchased cards, Claude is now told to say that plainly and then check for proxies, offering the list of proxy copies you could upgrade to real cards. Nothing about how the list is built or priced changed; this is guidance to Claude about how to answer an empty list.

## Changed files
- src/lib/connector/tools/index.ts — `get_buying_list` description now forbids answering only "nothing": at `totals.notOwnedCopies` 0 it must say no not-owned cards are missing, re-check with `include_proxies` when that was not set, and offer the upgrade list with proxy copy and card counts when `totals.proxyUpgradeCopies` is above 0
- docs/oracle/contracts/claude-connector-cc18-buying-list.md — new "Empty is not the whole answer (CC-19)" bullet recording the same rule, dated 2026-11-17
- src/lib/connector/__tests__/registry-and-isolation.test.ts — new wording test asserting the description mentions `totals.notOwnedCopies is 0`, the ban on answering only nothing, the `include_proxies` re-check, `totals.proxyUpgradeCopies is above 0`, and offering the upgrade list
- docs/oracle/reports/2026-11-17-developer-cc19-empty-buying-list.md — this report

## New decisions made (need owner confirmation)
- None. The owner-approved change is the empty-list behaviour recorded in CC-19.

## Assumptions
- The description is the only place the rule can be enforced: a default call loads only `not_owned` slots [Confirmed: src/lib/connector/tools/get-buying-list.ts:39], so the tool cannot know whether proxies exist without a second call with `include_proxies: true`. The new wording therefore tells Claude to make that second call rather than changing the tool's query behaviour, which the task did not ask for.
- The tool's response shape and note are unchanged; the empty result remains an honest zero with `total: 0` and zero totals [Confirmed: src/lib/connector/__tests__/buying-list.test.ts:89-94].

## Challenges to locked decisions
- None.

## Open questions
- Should the tool itself also add a response `note` in the empty case (for example "nothing unowned; ask for proxies to see upgrades")? That would be a behaviour change beyond this wording task and would still not know the proxy count on a default call. Not done; flagged for Gene if a runtime hint is wanted.

## Verification
- `npx vitest run src/lib/connector` — 17 files passed, 1 skipped; 252 passed, 1 failed: only the known TIDY-01 `get_deck` description check (`/estimate/i` missing). Unrelated to this change and already backlogged.
- `npx eslint src/lib/connector/tools/index.ts src/lib/connector/__tests__/registry-and-isolation.test.ts` — no output (clean).
- `npm run typecheck` — fails with 4 pre-existing errors in `src/components/AddToPicklist.test.tsx` (lines 45, 57: fetch mock tuple/body types). That file is unmodified by this task and not in the uncommitted CC-18 change set; no errors in the files touched here.
