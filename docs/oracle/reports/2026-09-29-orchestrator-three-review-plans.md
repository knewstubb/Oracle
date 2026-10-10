# Report: three-review-plans
Role: Orchestrator
Status: DONE
Task as received: Can you create plans for each of these that I can review and give feedback on

## Summary for the owner
Created three separate review plans covering behaviour, shared components/screens, and loading speed. Each distinguishes agreed rules from recommendations, describes the intended app experience, defines completion, and provides three labelled feedback prompts. No implementation or visual mockup has started.

## Changed files
- `docs/oracle/plans/01-behaviour-and-actions.md` - shared rules, state/action scope, transition safeguards, first delivery journey, and B1-B3 feedback.
- `docs/oracle/plans/02-components-and-screens.md` - proposed visual board, reusable components, land quantities, demand overview, rollout, and U1-U3 feedback.
- `docs/oracle/plans/03-loading-performance.md` - measured journeys, proposed targets, fair baseline method, ranked fixes, correctness safeguards, and P1-P3 feedback.
- `docs/oracle/status.md` - linked the three draft review plans without advancing implementation task status.
- `docs/oracle/reports/2026-09-29-orchestrator-three-review-plans.md` - this report.

## Plan ownership and dependency mapping

| Plan | Existing tasks | Next role work | Dependency/gate |
|---|---|---|---|
| Behaviour and actions | T-28 | Architect contract, then scoped Backend/Frontend handoffs | Owner feedback; existing Missing-data treatment and basic-land implications remain explicit gates. |
| Components and screens | T-25, T-26, T-29, T-30 | UX/UI visual board/spec, then Frontend implementation | Shared behaviour contract and owner approval of actual visual/interaction examples. |
| Faster loading | T-27 | Architect baseline, then scoped Backend/Frontend fixes | Approved read-only/isolated measurement target; baseline/targets before implementation. Independent of wording work where files do not overlap. |

These are Orchestrator planning documents, not role-owned schema contracts or UI specifications. No new model or interaction has been silently approved through plan creation.

## Evidence supporting the plans

The current source was investigated earlier in this session. The owner-facing plans omit implementation paths; the grounding is recorded here:

- The current proxy action creates and assigns a physical proxy; using a free existing proxy must remain distinct. [Confirmed: src/app/api/allocation/add-proxy/route.ts] [Confirmed: src/components/StatusChipPopover.tsx]
- Remove/release, unassign, transfer, breakdown and replacement have distinct existing operations to preserve. [Confirmed: src/app/api/decks/[id]/cards/[cardId]/route.ts] [Confirmed: src/app/api/collection/instances/unassign/route.ts] [Confirmed: src/app/api/allocation/claim-from-deck/route.ts] [Confirmed: src/app/api/decks/[id]/breakdown/route.ts] [Confirmed: src/app/api/allocation/replace-with-original/route.ts]
- The component library and cross-deck overview already exist. Reuse is a starting point, not proof that the requested new states/demand list are implemented. [Confirmed: src/app/settings/components/page.tsx] [Confirmed: src/app/allocation/page.tsx]
- Generic land rows and quantity grouping exist, but physical-copy exemption needs a deliberate transition. [Confirmed: src/components/generic-land-badge.tsx] [Confirmed: src/components/CardGroupSection.tsx]
- Missing copies are excluded/handled differently across read paths; removing UI cannot safely imply automatic eligibility restoration. [Confirmed: src/lib/missing.ts] [Confirmed: src/lib/card-status.ts] [Confirmed: src/lib/allocation-candidates.ts]
- Collection status selections are not applied to displayed rows in the reviewed page, which is why the UI plan requires real filter behaviour rather than cosmetic replacement. [Confirmed: src/app/collection/page.tsx]
- Collection list reads all eligible copies before selecting a response page, the grid query remains active in list view, and toolbar/page each impose a 300 ms search delay. [Confirmed: src/app/api/collection/printings/route.ts] [Confirmed: src/hooks/useCollectionRollup.ts] [Confirmed: src/components/collection/CollectionToolbar.tsx] [Confirmed: src/app/collection/page.tsx]
- Deck loading includes successive metadata reads and later child status/picklist fetches. [Confirmed: src/app/api/decks/[id]/route.ts] [Confirmed: src/app/decks/[id]/page.tsx] [Confirmed: src/components/CardsTab.tsx]
- Current type-check failures and ignored build type errors remain integration risks, not permission to weaken validation in the eventual implementation. [Confirmed: next.config.ts] [Confirmed: docs/oracle/reports/2026-09-29-orchestrator-state-of-the-nation.md]

## New decisions made (need owner confirmation)
- None. All plans are labelled Draft, recommendations remain proposals, and each has a Pending review decision.
- Mixed-supply priority/Unowned meaning, Move wording, Maybeboard release, primary-action density, demand-list scope, detailed land presentation, and timing goals are explicitly presented for feedback.
- The component plan promises a future visual board, not a mockup delivered in this turn.

## Assumptions
- "Each of these" refers to the three work packages in the preceding response.
- The owner needs plain-language, independently reviewable documents, with code-level evidence separated into this report.
- Creating plans does not authorise agent dispatch, implementation, deployment, stored-data changes or a milestone transition.

## Challenges to locked decisions
- None. Plans preserve D-002 and D-025 through D-031 and do not reopen the owner-approved Proxy action, readiness simplification, Missing retirement or folder organisation.

## Open questions
- The nine labelled feedback prompts in the plans are the review surface; they are not implementation blockers to be guessed around.
- Before dispatch, resolve O-006's current-milestone discrepancy. No existing milestone marker was silently changed.
- Runtime performance work requires a verified measurement target and agreed request volume.
- Existing Missing-copy eligibility and generic-land physical confirmation require explicit handling before rollout.

## Verification
- Re-read current decisions, backlog, previous planning pack and worktree state before drafting.
- Reviewed the three documents against the latest owner-approved decisions, including that Proxy creates/sleeves a new copy and competing demand does not affect decks.
- Checked relative plan links and the documentation diff for consistency; no application files changed.
- Documentation/planning only. No runtime tests, application builds, live data requests, deployments or agent dispatch.
