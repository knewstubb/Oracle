# Report: owner-answers-round-2-dispatch
Role: Gene
Status: DONE
Task as received: "1. Dont worry about data. I will just reimport 2. Decks that use proxies should be in the reconcile. If a single deck uses a card that is a proxy and the is no original owned that should show as short of that card 3. Yes — Yes, start the tasks"

## Summary for the owner
Your three answers are recorded. Cards marked missing need no special handling. Reconcile will also show cards you have only as proxies. Casual decks count as complete, so they're Playable once every card is sleeved. Four jobs have started: the advisor plan update, the Reconcile page design, removing Missing and Graveyard, and the random test fix. The Reconcile design will come back to you for approval before it is built.

## Changed files
- docs/oracle/decisions.md — D-002 Casual rule; D-028 no transition needed (owner will reimport); D-037 no-original cards appear, card-level matching
- docs/oracle/status.md — T-28 G-D1/G-O1 resolved; T-37/T-38 dependencies updated; T-29, T-36, T-38, T-39 IN PROGRESS with agent IDs; O-008 note
- docs/oracle/reports/2026-10-10-gene-owner-answers-round-2-dispatch.md — this report

## Agents started (all branched from main at 4d7ca96)
| Task | Role | Model | Agent | Worktree |
|---|---|---|---|---|
| T-36 | Architect | opencode-go/kimi-k2.7-code | bed535bb-4710-410f-9e44-da67e700e515 | ~/.paseo/worktrees/03dz1jp4/task-t36-advisor-contract-revision |
| T-29 | Designer | copilot/claude-opus-5.5 | 37d94a68-afb4-4913-80d7-ee77b9393c0a | ~/.paseo/worktrees/03dz1jp4/task-t29-reconcile-shortage-spec |
| T-38 | Developer | opencode-go/deepseek-v4.1-flash | e43f82dd-4138-42b5-bf8f-b72096d0ce8f | ~/.paseo/worktrees/03dz1jp4/task-t38-remove-missing-graveyard |
| T-39 | Developer | opencode-go/deepseek-v4.1-flash | aee61e96-c748-48c4-8529-7abcac26fcf0 | ~/.paseo/worktrees/03dz1jp4/task-t39-flaky-deck-list-test |

File overlap check: T-36 covers advisor contract docs only, and T-29 covers specs and mockups only. T-38 covers the collection, status and pick-list components, and T-39 covers only src/lib/deck-list-generator.property.test.ts. No two tasks edit the same file. T-36 reads the T-28 contract from the kept t28 worktree as read-only. Any changes it finds the T-28 contract needs go in its report.

T-37 (Reconcile calculation) is not started. It waits on owner approval of the T-29 spec.

## New decisions made (need owner confirmation)
- D-037 matching is by card rather than printing. This is Gene's reading of "short of that card". It is flagged for confirmation at T-29 spec review.

## Assumptions
- For D-002, an empty Casual deck has nothing to sleeve. Its readiness is left to the T-28 readiness implementation to define. It was not asked.
- "Don't worry about data" means existing Missing-marked copies may behave as ordinary owned copies, with no migration. A migration would still go through the owner gate.
- Casual readiness needs no separate task now, because readiness implementation (D-002) is still pending under T-28.

## Challenges to locked decisions
- none

## Open questions
- Confirm card-level (not per-printing) matching on Reconcile at T-29 review.
- The Collection click-through from the I-01 report is still outstanding.

## Verification
- `paseo inspect` on all four agents — running, correct models, no pending permissions
- `git status` — clean after commit
