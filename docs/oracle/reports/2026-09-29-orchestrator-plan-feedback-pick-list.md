# Report: plan-feedback-pick-list
Role: Orchestrator
Status: BLOCKED
Task as received:
> b1: agree
> B2: this sounds right but consider it in terms of the picklist too
> B3: yes, sleeved to maybe board should release
> U1: Lets make it so that any generic basic land is automatically considered sleeved
> U2: Agree
> U3: only shortages (which includes proxies)
> P1: this order is good
> P2: agree
> P3: agree. Also, the use of appropriate loading Spinners and correctly shaped skeletons where appropriate
>
> The pick list screen is important for assembling decks as this is where the user Can go to see exactly where the cards they need are

## Summary for the owner
Updated all three plans with the approved feedback and made the pick list central to assembly, including actual copy locations and actions. Generic basics now automatically count as Sleeved, and loading examples must match each screen. Only the shortage-counting rule is blocked: it is unclear whether a free proxy removes a shortage of originals.

## Changed files
- `docs/oracle/decisions.md` - incorporated B1 priority/ownership meaning, B3 release, shortages-only scope, P3 loading feedback, D-032 generic-land coverage, and D-033 pick-list/transfer requirements.
- `docs/oracle/status.md` - updated task scope and approvals, added pick-list baseline work, and isolated shortage counting as O-009/T-29's blocker.
- `docs/oracle/plans/01-behaviour-and-actions.md` - recorded B1-B3, added source-aware pick-list assembly, revised generic-land semantics and acceptance examples.
- `docs/oracle/plans/02-components-and-screens.md` - put the pick list on the review board, replaced generic-land manual sleeving with automatic coverage, added tracked-land distinction and shaped loading states.
- `docs/oracle/plans/03-loading-performance.md` - recorded P1-P3, approved first/return goals, included pick-list usability and refresh, and scoped spinner/skeleton requirements.
- `docs/oracle/reports/2026-09-29-orchestrator-plan-feedback-pick-list.md` - recorded feedback, applied decisions and the precise remaining question.

## Applied feedback

| Feedback | Recorded outcome |
|---|---|
| B1 | Requested original, alternate original, then proxy for the headline; retain other choices. Unowned means no owned originals or proxies. |
| B2 | Move from/to wording applies coherently in the pick list, not only popovers. Show actual source and the donor effect, and refresh both decks. |
| B3 | Moving a Sleeved card to Maybeboard releases its assigned copy. |
| U1 | Generic basics are automatically considered Sleeved with no assigned/created inventory. Specifically tracked basics keep normal copy behaviour. |
| U2 | Useful primary action plus a consistent secondary menu. Actual visual examples still require approval. |
| U3 | Only shortages, including proxies. The original-versus-proxy substitution calculation is not assumed. |
| P1 | Collection first, then deck journeys; explicitly include the important pick-list assembly journey. |
| P2 | Record 2-second first usable content and 0.5-second return goals; no claim they are achieved. Supporting search/action budgets remain for baseline review. |
| P3 | Primary content first, prices/analysis later; correctly shaped skeletons and appropriately scoped spinners. Pick-list source and eligibility information is essential, not optional enrichment. |

## Generic-land consequences

- Updated the approved readiness rule and import description so they do not contradict the new automatic coverage exception.
- Generic main-list quantities count towards the deck size and covered/sleeved count.
- Generic basics do not require pulling/sleeving or enter shortage demand as unresolved slots.
- Do not create fictional user-owned originals/proxies or assign real copies merely to make the display say Sleeved.
- Existing specific/tracked lands are not automatically converted to generic.
- A tracked-to-generic conversion involving an assigned copy needs a deliberate release design; this feedback did not authorise data deletion, automatic bulk conversion, or loss of tracking.

The current UI already has generic-land grouping and a no-copy exemption, but that does not prove the full app already meets the new display/readiness rule. [Confirmed: src/components/generic-land-badge.tsx] [Confirmed: src/components/CardGroupSection.tsx] [Confirmed: src/lib/card-status.ts]

## Pick-list acceptance added

The first delivery now performs the Sol Ring sleeve/transfer/proxy journey through pick lists. It must show the real storage location or source deck for the chosen original/proxy, identify relevant printing/finish, distinguish an existing proxy from the new-proxy action, and update both donor and destination after a transfer.

Current pick-list actions and shared supply already provide starting points, but old status-field checks and destination-only refresh identified in the prior review must not carry forward. This turn did not change or re-test those paths. [Confirmed: src/components/PicklistV2.tsx] [Confirmed: src/lib/allocation-candidates.ts] [Confirmed: src/hooks/useDeckQueryKeys.ts] [Confirmed: docs/oracle/reports/2026-09-29-orchestrator-card-deck-state-permutations.md]

## New decisions made (need owner confirmation)
- None beyond the owner's explicit feedback. D-032 and D-033 record that feedback, not newly invented product choices.
- Shortage-counting alternatives are deliberately left unresolved. B1's display priority does not answer whether original and proxy supply should be combined to remove a shortage.

## Assumptions
- The user is reviewing plans, not requesting application implementation or deployment.
- U1 is an exception for generic basic lands, not permission to assume every specifically tracked basic land is already sleeved.
- P2 approves the named first/return goals. No new timing measurements were performed.

## Challenges to locked decisions
- D-002 / D-021 - amended only to reflect the owner's explicit generic-land exception; per-copy tracking remains unchanged for actual tracked copies.
- D-005 / D-025 / D-027 / D-030 / D-031 - extended with the approved feedback and cross-references; no independent reinterpretation of the unresolved shortage arithmetic.

## Open questions
- **Blocking shortage calculation only:** two decks need Sol Ring and there is one free original plus one free proxy. Should this disappear from shortages because both decks can be covered, or remain because only one original is free?
- Existing Missing-record disposition and the safe measurement target remain earlier gates; no approval was inferred for either.
- Actual mockups still need owner approval. No implementation or agent dispatch started.

## Verification
- Re-read all three current plans, the locked decisions, backlog, and working-tree state before editing.
- Reviewed the updated plans for consistent generic-land exceptions across Add, Break down, readiness, imports and pick-list scope.
- Verified documentation links and saved changes; no application files or stored data changed.
- Documentation-only feedback incorporation. No runtime tests, performance measurements, migrations or deployments.
