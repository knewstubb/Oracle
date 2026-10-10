# Report: next-planning-pack
Role: Orchestrator
Status: DONE
Task as received: Okay. So what do we need to plan next?

## Summary for the owner
The next step is a small implementation-ready plan and visual examples, not another broad audit. Prepare the shared behaviour rules, the reusable screen elements, and a measured loading-improvement plan. Then implement one complete card-management journey before extending the same patterns across the remaining screens.

## Changed files
- `docs/oracle/reports/2026-09-29-orchestrator-next-planning-pack.md` - recorded the planning deliverables, dependencies, approval gates, and suggested first delivery.

## Recommended planning work

### 1. Shared behaviour and transition contract

Existing task: T-28, Architect.

Translate D-002 and D-025 through D-031 into one finite, testable contract, using the permutation report as evidence rather than restarting discovery.

Deliverables:
- Inputs and outputs for the five availability labels, keeping existing-original, alternate-original, existing-proxy, and held-copy choices distinguishable.
- Sleeve, Unsleeve, Proxy, Remove, replacement, transfer, and Break down effects; which list entries, physical copies, and affected decks change.
- Commander readiness from list count, commander presence, and actual sleeving. Preserve separate Maybeboard and appropriate handling of other supported formats.
- Shared demand definition and quantities without changing deck assignments/readiness merely because demand exceeds supply.
- Import mappings for Sleeved/Unsleeved, retaining the explicit separate inventory effect of New cards.
- Existing Missing-data transition options and a safe inspection plan; no silent eligibility change or destructive migration.
- Basic-land quantity/physical-copy implications, preserving D-023 rather than inventing unlimited supply.
- Explicit failed/stale-data responses and cross-screen refresh requirements.

Acceptance: each approved state and action has one meaning across Collection, deck cards, pull list, imports, and shared demand. Identify remaining product questions for owner review instead of making implementation guesses.

Unsettled display priority, proxy-only Unowned wording, and transfer wording should be presented together with the UX examples for approval. They do not justify reopening already approved decisions such as the Proxy action or automatic Commander readiness.

### 2. Reusable UI and a small owner-review board

Existing tasks: T-25, T-26, T-29, T-30, UX/UI. Sequence their bounded outputs; do not launch several agents to independently redefine the same components.

Produce representative examples, not a redesign of every page:
- One card row in each approved placement/availability state, with a shared action menu and consistent compact/mobile treatment.
- One deck tile for Draft, Assembling, and Playable, including useful counts and neutral Assembling presentation.
- A basic-land quantity row, for example "12 Forests in list; 8 sleeved", including quantity sleeve/unsleeve and printing selection where relevant.
- The separate shared-demand list with card, free supply, proxy/alternate options, and requesting decks; evaluate reuse of the existing allocation overview.
- Sleeved/Unsleeved import controls and clear transfer/proxy/breakdown feedback.
- Common loading, empty, stale, failure, and pending-action examples.

Acceptance: the owner can approve wording, visual hierarchy, and action consequences from a small mockup. Production implementation must reuse the existing component library and semantic tokens; no new competing design system.

### 3. Loading baseline and bounded optimisation plan

Existing task: T-27, Architect. Can run independently of the design work once a safe read-only measurement target is verified.

Measure Collection list/grid, deck list, deck opening, and reconciliation. Separate first load from cached navigation and record time until cards are usable, request counts, and response sizes.

Rank the confirmed candidates from the review:
- Reading the whole collection to return one list page.
- Fetching rollup data for the hidden grid while displaying the list.
- The two consecutive 300 ms collection-search delays.
- Sequential and duplicate deck metadata reads, followed by later status/pull-list requests.

Acceptance: baseline results, a ranked scoped fix list, and agreed before/after targets. Do not promise a speedup from source inspection alone or use loading animation changes as a substitute for removing unnecessary work.

## Sequencing and first delivery

1. Align the recorded current milestone before dispatch, then prepare T-28 and the read-only T-27 baseline independently.
2. Use the contract to prepare the shared UI examples. Owner approves the remaining behavioural choices and mockup before implementation.
3. Divide Backend and Frontend implementation into bounded, non-overlapping handoffs against those approved inputs. No direct application changes by the Orchestrator.
4. Deliver one complete vertical slice: inspect Sol Ring in Collection, add/sleeve it in a deck, move the selected copy to another deck, fill the donor with a newly created proxy, then unsleeve or break down without losing owned copies.
5. Extend the same shared rules/components to remaining list/grid/mobile views, imports, shared demand, and basic lands. Migrate in reviewed batches, but do not declare standardisation complete until every relevant consumer agrees.
6. Keep independent measured loading fixes separate where possible, so their effects and regressions are attributable.

The first slice should prove that ownership totals stay correct, the donor's list entry remains after a transfer, new Proxy creates exactly one copy, existing Proxy available does not create a copy, both decks' readiness refreshes, and failures never look like success.

The two-day allowance is a prioritisation window, not a guarantee that all implementation and approval gates fit. Prefer a complete, safe slice and measured gains over an unattended whole-app rewrite.

## Release and safety gates

- Owner approval for UI/interaction examples and unresolved behaviour.
- Explicit approval for any migration or existing Missing-record disposition.
- Readiness and availability assertions must cover originals, alternate printings, proxies, repeated demand, and basic-land quantities; preserve existing copy identity and finish rules.
- Restore reliable integration checks for the touched flows and triage existing application type errors before release. Do not weaken tests or rely on the current build's ignored type errors to claim success.
- Compare measured loading before/after in the same environment; do not load-test the shared production database without agreement.
- Owner approval before merging to main, deploying, or changing the current milestone.

## New decisions made (need owner confirmation)
- None. This is a recommended work sequence using the already recorded tasks.
- The first delivery scenario and performance thresholds remain planning proposals, not a launched implementation task.

## Assumptions
- The user is asking what to plan next, not requesting agent dispatch or application implementation in this turn.
- The existing component library and allocation overview remain starting points, not automatically sufficient implementations.

## Challenges to locked decisions
- None. Use D-002 and D-025 through D-031 as approved inputs.

## Open questions
- Existing Missing-record disposition and the final basic-land interaction remain explicit design/data gates.
- O-006 still records conflicting current-milestone markers; resolve before unattended implementation.
- A safe measurement target must be identified before runtime performance work.

## Verification
- Based on the current decisions/status and the source-backed state/performance reviews completed in this session.
- Planning/report only; no application changes, runtime tests, live requests, migrations, deployments, or agent dispatch.
