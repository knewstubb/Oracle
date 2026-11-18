# Report: cc19-close
Role: Gene (Orchestrator)
Status: DONE
Task as received: "Agree with your suggestion" (after Gene recommended: when nothing is unowned but proxies exist, Claude should say so and offer the upgrade list).

## Summary for the owner
Done. When a buying-list answer has nothing unowned, Claude is now told to say that plainly and offer the proxy upgrades, with how many copies and cards. Nothing about which cards are listed or how prices are worked out changed.

## What changed
- `src/lib/connector/tools/index.ts` — the `get_buying_list` description now forbids answering only "nothing": at `totals.notOwnedCopies` 0 it must say no not-owned cards are missing, re-check with `include_proxies` when that was not set, and offer the upgrade list with counts when `totals.proxyUpgradeCopies` is above 0.
- `docs/oracle/contracts/claude-connector-cc18-buying-list.md` — new "Empty is not the whole answer (CC-19)" bullet.
- `src/lib/connector/__tests__/registry-and-isolation.test.ts` — wording test for the rule.
- `docs/oracle/reports/2026-11-17-developer-cc19-empty-buying-list.md` — Developer report.
- `docs/oracle/status.md`, `docs/oracle/test-plan-2026-11-17.md` — CC-19 recorded DONE; step 13 notes the new behaviour.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- Changing the tool description is enough: a default call only loads `not_owned` slots, so the tool cannot know the proxy count without a second call, and the description now tells Claude to make it. No query behaviour changed.
- Developer ran in the main working copy, not a worktree, because the CC-18 buying list is uncommitted and a fresh worktree from main does not contain it. A first worktree run was stopped and its workspace archived before any edit.

## Challenges to locked decisions
- None.

## Open questions
- The wording can only be seen in a real Claude chat (only the owner is signed in): TEST-02 remains. Test plan step 13 now says what to expect.
- Developer's optional idea, not taken: add a runtime `note` in the empty case. It would still need the second call to know the proxy count; not worth a behaviour change now.

## Verification
- `npx vitest run src/lib/connector` — 252 passed, 1 failed (only the known TIDY-01 `get_deck` "estimate" wording check), 4 skipped; 17 files passed, 1 skipped.
- Diff reviewed: only the `get_buying_list` description, the CC-18 contract, the tests and reports changed; the CC-13 description edits already in the working tree were left as they were.
