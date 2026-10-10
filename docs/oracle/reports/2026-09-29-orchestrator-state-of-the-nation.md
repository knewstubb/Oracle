# Report: state-of-the-nation
Role: Orchestrator
Status: DONE
Task as received:
> I have been given a month worth of tokens to use in two days before my allocation resets
> When prompting agents feel free to use better models for this work as I am setting this up to run and will be leaving
> Do a quick review of the oracle app and give me a state of the nation so we can work out what to do next. I would like more consistancy on naming conventions (claimed vs used by other decks, etc) as this is confusing.
> I also want standardised components
> Some of the load times are slow and feel like they could be improved
> What should we work on next?

## Summary for the owner
Oracle has substantial functionality, but its screens do not yet speak or behave consistently. The best next investment is a bounded pass on trustworthy card statuses, shared components, and faster collection/deck loading before expanding the advisor. This review changed no app behaviour or stored data; the proposed work still needs prioritisation and design approval.

## Changed files
- `docs/oracle/status.md` - recorded three proposed, unstarted quality tasks and two integration/planning follow-ups.
- `docs/oracle/reports/2026-09-29-orchestrator-state-of-the-nation.md` - recorded evidence, recommendations, limitations, and verification.

## Review scope and confidence
- Reviewed local main at `0a74e8e`, with a clean worktree at the start. Read the current roadmap, decisions, status, latest session summary, and the earlier AI audit needed to assess advisor readiness.
- Traced collection loading/filtering, deck detail loading, card-status calculation and presentation, reconciliation presentation, shared components, and selected current AI parsing paths.
- This is a source-backed review, not a complete feature audit, accessibility assessment, security review, production benchmark, or visual browser review. No authenticated browser session, live database request, import, AI call, deployment, or data mutation was performed.
- Historical deployment/performance results below are explicitly attributed to prior reports, not presented as new measurements.

## State of the nation

| Area | Assessment | Evidence |
|---|---|---|
| Collection and exact-copy tracking | Substantial foundation worth preserving. Current pages distinguish deck membership from physical-copy assignment, and recent import work preserves printing-level decisions. This does not establish that all displayed availability is correct. | [Confirmed: src/app/api/decks/[id]/route.ts] [Confirmed: src/lib/card-status.ts] [Confirmed: docs/oracle/decisions.md] |
| Import reconciliation | Recent work distinguishes used copies from available alternate printings and displays load failures rather than an empty success state. The 28 September report records the database fix deployed and a 2.6-second live read; that is not today's page-load timing. | [Confirmed: src/components/reconciliation/ConflictCard.tsx] [Confirmed: src/components/reconciliation/ReconciliationSummary.tsx] [Confirmed: docs/oracle/reports/2026-09-28-orchestrator-reconciliation-timeout-followup.md] |
| Naming and components | Several competing descriptions and visual treatments exist for closely related facts, including within desktop/mobile versions of the same experience. A useful component library already exists; adoption and shared meaning are the gaps. | [Confirmed: src/components/CardSlotBadge.tsx] [Confirmed: src/components/CardGroupSection.tsx] [Confirmed: src/app/settings/components/page.tsx] |
| Loading | Caching, pagination, lazy expansion, and list virtualisation already exist. However, some paginated responses still read the full collection, and several screens perform avoidable duplicate or sequential work. | [Confirmed: src/components/providers.tsx] [Confirmed: src/hooks/useCollectionRollup.ts] [Confirmed: src/components/collection/PrintingListView.tsx] [Confirmed: src/app/api/collection/printings/route.ts] |
| Advisor | Existing infrastructure should be hardened, not replaced wholesale. The structured-output issue identified in the earlier AI audit remains in sampled current paths; correct shared availability should precede expanding recommendations. | [Confirmed: docs/oracle/contracts/ai-audit-2026-09.md] [Confirmed: src/app/api/brew/skeleton/route.ts] [Confirmed: src/app/api/ai/brew/refine/route.ts] [Confirmed: src/lib/adapters/deepseek-adapter.ts] |
| Integration readiness | Existing automated expectations disagree with current component behaviour, and application type checking is not clean. A successful build is not proof that these issues are absent because type errors are explicitly ignored during builds. | [Confirmed: src/components/OwnershipBadge.test.tsx] [Confirmed: src/components/collection/CollectionToolbar.test.tsx] [Confirmed: next.config.ts] |

## Findings that determine the next work

### 1. Standardise facts first, then their wording

Current examples:
- Import reconciliation says **Already claimed** and **Claimed by**. [Confirmed: src/components/reconciliation/ConflictCard.tsx]
- Deck badges say **In decks**; the desktop status grouping says **Planned · In decks**, while the mobile status indicator says **Planned · Claimed**. [Confirmed: src/components/CardSlotBadge.tsx] [Confirmed: src/components/CardsTab.tsx] [Confirmed: src/components/CardGroupSection.tsx]
- Collection cards say **Used**, while its filter menu uses **Fully Placed**, **Partially Available**, **Unplaced**, and **Over-Allocated**. [Confirmed: src/components/collection/CollectionGridView.tsx] [Confirmed: src/components/collection/CollectionToolbar.tsx]
- Some ownership badges say **Not owned**; deck badges say **Unowned**. [Confirmed: src/components/OwnershipBadge.tsx] [Confirmed: src/components/CardSlotBadge.tsx]

Recommended vocabulary for owner review, not an approved specification:

| Fact | Suggested wording | Important boundary |
|---|---|---|
| A suitable free real copy exists | Available | This does not mean it has been assigned to the deck. |
| Usable real copies are all assigned elsewhere | Used by another deck | Name the deck(s) where space permits. Do not use this for unassigned competing requests. |
| The requested printing is unavailable but another printing is free | Other printing available | Do not call the card unowned; do not switch printing silently. |
| No real copy of any printing is owned | Not owned | Keep proxy supply distinguishable; define the treatment of missing copies explicitly. |
| Multiple import requests compete for insufficient supply | Not enough copies | Separate this from copies already being used by another deck. |
| A deck slot has no assigned physical copy | Planned | Keep separate from ownership and availability. |
| A physical copy is assigned to the slot | Sleeved | Keep copy type, Original or Proxy, separate rather than replacing it with an ownership label. |
| An import decision has been handled | Resolved | This is import workflow state, not a claim that the deck now has a real copy. |

Example: one Sol Ring is in Korvold and Prosper wants it: Prosper says **Planned - Used by Korvold**. If neither deck has received the single copy yet and both are competing during reconciliation, that is **Not enough copies**, not **Used by another deck**. If another printing is free, offer that distinct choice.

The approved import rules already distinguish those cases and say that unfinished assignments become normal Planned slots after finalisation. Preserve that behaviour; do not globally replace identifiers or collapse states. [Confirmed: docs/oracle/import-reconciliation-states.md] [Confirmed: docs/oracle/status.md]

There is also a correctness issue beneath the labels: `computeUnresolvedStatuses` initialises results as `unowned` and returns those results after logging database lookup failures. A failed lookup can therefore appear as a factual ownership answer. The shared contract should require an explicit unavailable/error state rather than translating failure into "Not owned". Missing-only copies are also classified as unowned today; the vocabulary work must distinguish ownership from usable supply instead of silently redefining them. [Confirmed: src/lib/card-status.ts] [Confirmed: src/lib/card-status.test.ts]

### 2. Reuse the component library, but make it authoritative

The existing library displays tokens, buttons, badges, inputs, cards, status, layout, and feedback. It is a better starting point than creating a second design system. [Confirmed: src/app/settings/components/page.tsx]

The same Proxy fact is blue in deck-slot badges, amber in ownership badges used by Upgrade, and purple in the card-detail popover. These are active consumers, not merely unused files. [Confirmed: src/components/CardSlotBadge.tsx] [Confirmed: src/components/OwnershipBadge.tsx] [Confirmed: src/components/UpgradeTab.tsx] [Confirmed: src/components/ProxyBadge.tsx] [Confirmed: src/components/CardPopover.tsx]

Begin with shared status presentation, card identity/printing rows, preview conventions, filters, and loading/empty/error feedback. Keep desktop/mobile and list/grid variants where useful; standardisation does not require one giant component or identical layouts everywhere. Use the existing semantic colours and preserve D-012 through D-015, including quiet normal ownership and visible labels/icons. The current prominent green Original treatment should be brought into alignment with D-014, not treated as an implicit new decision. [Confirmed: docs/oracle/decisions.md] [Confirmed: src/components/CardSlotBadge.tsx]

A concrete integration defect should be included: collection status selections update `activeStatuses`, but that value is not sent to either query or used to filter the displayed rows. Selecting a status can make the control look active without changing the results. Standardisation must verify the control's effect, not merely its appearance. [Confirmed: src/app/collection/page.tsx] [Confirmed: src/hooks/useCollectionRollup.ts] [Confirmed: src/components/collection/CollectionToolbar.tsx]

### 3. Reduce work before adding more caching or loading animations

| Candidate | Confirmed implementation | Recommended direction |
|---|---|---|
| Collection list | Name sorting reads all eligible physical copies in batches, searches/sorts in memory, then slices a page. Other sorts and colour filters also load all matching copies, with sequential batches and metadata enrichment. | Filter, order, and paginate at the database boundary; preserve printing/finish grouping, correct totals, missing/proxy rules, and deterministic page boundaries. Any database change needs its normal approval gate. |
| Hidden collection view | The rollup query remains enabled while list view also fetches printing rows. | Fetch only what the active view or another visible consumer actually needs; preserve a coherent page header. |
| Collection search | The toolbar waits 300 ms before notifying the page, which then waits another 300 ms before changing its query. | Use one debounce boundary. The approximately 600 ms of configured waiting is code-derived, not a browser measurement. |
| Deck opening | The detail route awaits several successive lookups, including separate printing-price and printing-edition requests. Card-status and pull-list queries start in CardsTab after detail data allows it to mount. | Combine duplicate metadata reads, parallelise independent work after access checks, and avoid making basic deck interaction wait for secondary enrichment. Measure before choosing a larger API change. |
| Deck list | The home response fetches deck cards and computes availability and mana information before returning the deck list. Some initial queries already run in parallel. | Profile this next; do not claim that another generic Promise.all pass will solve it. Consider separating expensive enrichment if measurements justify it. |

Evidence: [Confirmed: src/app/api/collection/printings/route.ts] [Confirmed: src/app/collection/page.tsx] [Confirmed: src/components/collection/CollectionToolbar.tsx] [Confirmed: src/hooks/useCollectionRollup.ts] [Confirmed: src/app/api/decks/[id]/route.ts] [Confirmed: src/app/decks/[id]/page.tsx] [Confirmed: src/components/CardsTab.tsx] [Confirmed: src/app/api/decks/route.ts]

Do not reopen the already-addressed reconciliation timeout as the presumed cause of every slow screen. The latest report records successful live reconciliation reads; production measurements are still needed to identify today's remaining delays. [Confirmed: docs/oracle/reports/2026-09-28-orchestrator-reconciliation-timeout-followup.md]

## Recommended sequence and acceptance criteria

1. **Agree the language and status meaning.** T-25 produces a small mapping using the approved states and realistic examples, not an app rewrite. Cover free real copy, copy used elsewhere, competing Planned slots, alternate printing, proxy-only supply, missing copies, lookup failure, and completed import. Owner approves wording; Architect reviews meaning before implementation.
2. **Apply shared patterns in bounded slices.** T-26 starts with status presentation and collection controls, then card rows/previews and feedback. First prove one card has consistent facts in Collection, deck cards, pull list, and import reconciliation across desktop/mobile. Every visible filter must affect the correct result set, and the component library must use the same production components. Implementation is a later Frontend handoff after approval.
3. **Measure and improve loading in parallel with design work.** T-27 can run independently of T-25 on a verified read-only measurement target. Record cold and warm timings, request counts, transferred data, and time until cards are usable for Collection, deck list/detail, and reconciliation. Then commission small Backend/Frontend fixes from evidence, starting with the full-collection read and duplicate search/view work.

Suggested performance goals for approval, not claims of current results: initial usable collection/deck content within 2 seconds and warm navigation within 500 ms in at least 95% of repeated runs on a stated device/network and owner-sized data. Use at least 20 repetitions per journey, report cold/warm separately, and distinguish input debounce, server time, and browser rendering. Repeat with a larger synthetic fixture; do not generate load against the shared live database without explicit agreement.

Treat the two-day window as a bounded prioritisation envelope, not a promise that an app-wide refactor fits. Parallelise read-only performance diagnosis and wording/design proposals first; do not let agents independently invent competing status systems. Separate worktrees and non-overlapping handoffs should follow once implementation is approved.

Before broad merges, triage the current type errors and stale component expectations into focused fixes. Do not suppress checks or merely change tests to accept whichever wording happens to exist. After this consolidation, resume T-15/T-16 and advisor implementation; retain the roadmap's three-real-deck availability exit criterion. Brew Canvas expansion, broad Archidekt parity, and public/multi-user scale remain out of this proposed pass. [Confirmed: docs/oracle/roadmap.md] [Confirmed: docs/oracle/status.md]

## New decisions made (need owner confirmation)
- None enacted. T-25 through T-27 are unstarted proposals, not implementation approval.
- Proposed for approval: prioritise the consistency/performance pass before expanding the advisor; approve vocabulary and component examples before replacement; agree performance targets after seeing a baseline.

## Assumptions
- "Quick review" authorises investigation and recommendations, not application changes, deployments, or unattended implementation.
- UI standardisation should preserve the existing product direction and data model.
- This local revision is the review subject. Its equivalence to the currently deployed frontend was not verified.

## Challenges to locked decisions
- None. The proposed work should enforce the existing rules, not reopen them.

## Open questions
- Owner decision: approve the proposed priority order and vocabulary direction before implementation begins.
- Planning discrepancy: roadmap marks M1 CURRENT, while status marks M2 CURRENT. The T-24 row also retains a draft-deployment note while later records report deployment complete. Reconcile against recorded owner approval before unattended feature dispatch; no milestone or deployment claim was silently changed in this review.
- Measurement prerequisite: select a verified read-only deployment/data target and record device/network conditions. Existing end-to-end configuration deliberately requires an explicit safe target; it was not bypassed. [Confirmed: playwright.config.ts]

## Verification
- `git --no-pager status --short` - clean before review and after diagnostic commands; no application changes were made.
- `git --no-pager log -5 --format='%h %s'` - reviewed main at `0a74e8e`.
- `npm test -- src/lib/card-status.test.ts src/components/OwnershipBadge.test.tsx src/components/ProxyBadge.test.tsx src/components/collection/CollectionToolbar.test.tsx src/components/reconciliation/__tests__/ConflictCard.test.tsx src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx src/components/reconciliation/__tests__/StateButtonGroup.test.tsx src/lib/__tests__/import-reconciliation.test.ts src/lib/__tests__/import-reconciliation-rpc.test.ts src/app/api/onboarding/reconciliation/reconciliation.routes.test.ts` - 94 tests: 89 passed, 5 failed in 2 files. All six selected reconciliation files passed (44 tests). OwnershipBadge has two held-by versus claimed-by expectation failures and one typography-class expectation failure; CollectionToolbar has two list-versus-grid default expectation failures. These are pre-existing disagreements, not evidence that every tested feature is broken.
- `npx --no-install tsc --noEmit --incremental false --pretty false` - failed with pre-existing errors in application code, tests, and research scripts. Examples include Collection passing unsupported printing-list props, missing deck header/health props, and undefined names in the new-deck page. No claim of a clean application build is made; `next.config.ts` sets `typescript.ignoreBuildErrors: true`.
- Source traces confirmed the filter wiring gap, dual 300 ms debounce, hidden rollup request, full-copy list reads, successive deck enrichment, and competing status presentations.
- Production page latency, current deployment identity, full test suite, build output, and visual/accessibility behaviour were not validated in this quick review.
