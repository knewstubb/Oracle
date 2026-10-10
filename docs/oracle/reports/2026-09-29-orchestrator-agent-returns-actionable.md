# Report: agent-returns-actionable
Role: Orchestrator
Status: DONE
Task as received: What have the agents returned that we can action?

## Summary for the owner

All three agents have returned: the card/deck rules and AI assessments are ready for review, while the loading investigation has useful findings but could not safely measure actual speeds. The most useful next work is to prevent advice from making unintended deck changes, give the AI accurate card/collection information, correct pick-list locations, and stop unnecessary Collection loading work. Nothing has been applied to the app, and some behaviour choices need approval before the pick-list designs or implementation can be accepted.

## Returned work

| Task | Returned result | Coordinator disposition |
|---|---|---|
| T-28, shared card/deck behaviour | Architect reports DONE. Draft behaviour contract, companion types, 22 acceptance cases, implementation gaps and explicit owner/data gates. | REVIEW. Read the completion report, contract status/core sections and gate inventory. This is not a fully accepted contract; reported executable checks have not been rerun by the coordinator. |
| T-27, loading investigation | Architect reports BLOCKED. Source investigation and ranked small changes complete; safe measurement prerequisite not established. No runtime timings collected. | BLOCKED on measurement, with actionable source-based candidates retained. Do not call a proposed optimisation a measured improvement. |
| T-19, AI and Jev | Architect reports DONE. Existing-system map, Jev assessment, 16-commander coverage matrix, worked/negative examples and evaluation plan. | REVIEW. Findings and priority sequence inspected; primary Jev capability independently checked. Full test/source/evaluation acceptance remains pending. |

Paseo inspection showed each known agent `idle`, with no pending permissions. Idle is not itself proof of success; the dispositions above come from the actual returned reports. [Confirmed: `paseo inspect` results for the three IDs below]

## What we can action next

### 1. AI: fix the information and safeguards before changing the model

**Recommendation:** keep the current model while repairing the information it receives and the checks on its output. Jev may later help classify cards, but is not a replacement for the advisor that explains recommendations.

The agent reports that the current new-deck generator can be instructed to use owned cards without receiving the collection; several paths lack current rules/legality facts, correct proxy/printing availability or paired-commander handling. It also reports that sidebar add/remove events are applied without a separate confirmation, and Upgrade refresh deletes stored suggestions without producing replacements. These findings warrant a bounded corrective plan before feature expansion. [Confirmed: T-19 assessment sections 0-3 and 10; delegated source evidence, not newly reproduced runtime observations]

For example, Prosper needs cards that let you play from exile, while Korvold cares about sacrificing permanents. A generic colour-matched list and one category per card cannot reliably distinguish their needs.

**Ready input:** the assessment can inform T-15's advisor-tool contract, T-16's suggestion presentation and a scoped safeguard fix proposal. Do not wire old unused AI routes back in unchanged: the assessment identifies gaps there too. The returned 16-commander matrix is a proposed evaluation foundation, not evidence that recommendations already meet its quality targets.

**Approval boundary:** confirm the proposal/accept behaviour and any preference defaults before implementing a changed experience. No new supplier, paid trial, private-data sharing or model switch is approved.

Jev's own documentation explicitly says it does not generate text or hold a conversation; it returns choices, scores and yes/no probabilities. This supports the narrow "not an advisor replacement" conclusion, not a blanket claim that it cannot help ranking/classification. Its value for Magic-specific decisions remains unmeasured. [Confirmed: https://docs.typesafe.ai/introduction/coding-agents.md, accessed 2026-09-29]

### 2. Pick list: use the shared rules to prepare the owner-reviewed design

**Recommendation:** progress the Commander pick-list design once the relevant contract proposals have been reviewed; do not treat the draft as an approved implementation instruction.

The returned contract covers the approved availability labels, Sleeved/Unsleeved, originals/proxies, readiness, source locations, movement, Maybeboard release, generic basics and original shortages. Both the behaviour and loading reports identify incorrect source-field handling that can replace real locations with "Unsorted", alongside stale donor-deck information after a transfer. [Confirmed: T-28 report and contract sections 6, 9 and 14; T-27 ranked fixes 6-7]

The useful next design slice remains T-25/T-29/T-30: demonstrate finding a card, sleeving it, deliberately moving it from another deck, creating versus reusing a proxy, and seeing original shortages without turning them into readiness warnings. T-26 still follows owner approval of T-25.

**Choices not yet approved:** whether retired-folder/Draft decks contribute to original shortages; how to handle previously Missing copies; the requested printing for a new proxy; conversion between generic and tracked basics; and rules for Casual-format readiness. The draft contains interim proposals, including counting all decks toward shortages. These must not be silently adopted.

Casual-format decisions need not force a redesign of the approved Commander rules. Existing-data conversions and full shortage scope can be explicitly gated rather than guessed, but the affected examples must not be presented as final.

### 3. Loading: small, bounded fixes are identified; actual gains remain unknown

**Recommendation:** prepare the smallest Collection-first changes and a safe measurement setup, rather than a broad database rewrite.

The returned ranking identifies:

- Load only the chosen Collection view, including the saved/mobile view on first opening.
- Remove the second configured pause before search updates; keep one pause so rapid typing does not trigger a request per keystroke.
- Avoid reading the same price-freshness information twice.
- Later, combine independent deck-detail lookups and repair pick-list refresh/source handling in coordination with the shared contract.

These are inspected sources of unnecessary work, not measured causes of the owner's observed latency. The larger printing-list pagination change first needs a clear agreement on whether pages count physical copies or grouped printing rows; quantities, finishes and totals must remain correct. [Confirmed: T-27 ranked bounded next fixes]

**Measurement blocker:** no approved representative test deployment/backend, dedicated fixture access, background-write allowance and finite trial budget was established. Simply opening the app can create conversation records or calculate/store health information, so "we only opened a page" is not necessarily read-only. The team should prepare the technical setup; the owner should be asked only about using an isolated test copy and acceptable scope, not to supply implementation details. [Confirmed: T-27 safe-target prerequisite and navigation hazards]

No claim is made that the 2-second initial or 0.5-second warm-return targets have been achieved.

## Recommended sequence and outstanding review

1. Review and scope the unintended-edit/empty-upgrade-refresh safeguards and the small Collection duplicate-work fixes; retain all existing approval gates.
2. Review T-28's actual proposals, settle the choices affecting the first design examples, and then hand off the pick-list mockup.
3. Feed T-19 into the advisor contract: real card facts, current collection availability, commander mechanics and a shared evaluation set before any Jev trial.

The agents also reported user-isolation concerns in some data/action paths. These remain attributed findings, not a completed independent security review. They must be verified and addressed before allowing other users or reusing those paths in new features.

This task answers what returned and updates the ledger. It does not launch implementation, accept the unreviewed contracts, dispatch a new UX agent, merge child work or resolve owner choices by assumption.

## Output locations and provenance

Outputs remain in their original worktrees. Pre-existing copied input documents are not child deliverables and must not be merged over newer main documents.

| Task / agent ID | Worktree | Returned files |
|---|---|---|
| T-28 / `0a31b64d-6208-4de4-b8f3-f792f72b9fe6` | `/Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t28-state-contract` | `docs/oracle/contracts/card-state-actions.md`, `docs/oracle/contracts/card-state-actions.types.ts`, `docs/oracle/reports/2026-09-29-architect-t28-card-state-actions.md` |
| T-27 / `43a8b166-8075-4ff4-8e93-f4f7e7837747` | `/Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t27-loading-baseline` | `docs/oracle/reports/2026-09-29-architect-t27-loading-baseline.md`; external redacted prerequisite evidence in the session workspace |
| T-19 / `7d860b27-5910-40ee-8e49-b816812dff92` | `/Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t19-ai-assessment` | `docs/oracle/contracts/ai-recommendations-assessment-2026-09.md`, `docs/oracle/reports/2026-09-29-architect-t19-ai-recommendations.md` |

The agent-reported checks are not coordinator passes: T-28 reports a strict companion-type check and 22 reference checks; T-19 reports 252 passing and 10 failing tests, attributing eight to missing local environment and two to outdated expectations. Those explanations and complete output contracts require verification before acceptance. T-27 ran no app performance or test suite.

## Changed files

- `docs/oracle/status.md` - changes T-19/T-28 to REVIEW and T-27 to BLOCKED with source investigation complete; replaces stale running-agent wording.
- `docs/oracle/reports/2026-09-29-orchestrator-agent-returns-actionable.md` - returned-output summary, actionable recommendations, review limits and exact artifact provenance.

## New decisions made (need owner confirmation)

- None enacted. Child proposals are explicitly not accepted by this status update.
- Relevant product choices are listed above for the next owner review; no code/data/provider or milestone changes authorised.

## Assumptions

- The user's question requests a status/actionability summary, not approval to implement every returned recommendation.
- The original isolated outputs remain the evidence source until their full review is complete.

## Challenges to locked decisions

- None. Reported conflicts in current code should be corrected against the approved decisions, not used to change those decisions silently.

## Open questions

- Owner approval of the concrete safeguard behaviour and the T-28 proposals affecting initial UX examples.
- Safe test-copy/run approval for actual performance measurements.
- Full coordinator verification of the returned contract/types and AI assessment before marking T-19/T-28 accepted.

## Verification

- `paseo inspect <known-agent-id> --json` for all three IDs - all idle, no pending permissions; original worktree and parent relationships retained.
- `git -C <known-worktree> --no-pager status --short` - expected new report/contract outputs plus pre-existing copied inputs; no application edits shown.
- Read all three completion reports, the T-27 ranked fixes/measurement gate, T-28 contract core/gate inventory and T-19 system map/improvement sequence.
- Primary Jev capability documentation fetched - confirms classifier/structured-decision role and no text generation; no paid trial or private-data upload.
- Documentation whitespace, local report link and updated task states checked after writing. No application/runtime or child-test rerun is claimed by this task.
