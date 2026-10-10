# Report: next-delivery-after-approval
Role: Orchestrator
Status: DONE
Task as received: Great. So what is next?

## Summary for the owner
The product direction is settled enough to move into shared behaviour rules and a visual prototype, centred on the pick list. Measure current loading alongside that work, then implement the approved assembly journey. No further round of general terminology planning is needed.

## Changed files
- `docs/oracle/reports/2026-09-29-orchestrator-next-delivery-after-approval.md` - recorded the immediate deliverables and implementation gate.

## Immediate next work

| Work | Deliverable | Existing task |
|---|---|---|
| Shared behaviour contract | One precise set of availability, readiness, action and original-shortage rules; preserve automatic generic-land coverage and include both decks in transfer updates. | T-28, Architect |
| Loading baseline | Actual first/return timings for Collection, decks and pick-list assembly, compared with the approved 2-second/0.5-second goals. Use a verified safe target. | T-27, Architect |
| Visual prototype | A pick-list-first review board, using the behaviour contract: storage/source locations, copy choices, Sleeve/Move/Proxy actions, deck readiness, automatic generic basics, original shortages, and correctly shaped loading states. | T-25/T-26/T-29/T-30, UX/UI |

The contract and safe read-only baseline can proceed independently. The UX work must use the shared meanings rather than inventing a second state model. Prototype approval remains separate from the owner's approval of the plans.

## First implementation after prototype approval

Use the already specified Sol Ring journey through Collection and pick lists: sleeve an original, move it to another deck, create and sleeve a proxy in the donor, use an existing free proxy without creating another, and release copies without deleting ownership.

Completion must include:
- Accurate source locations and selected printing/finish.
- Both decks' pick lists and readiness refreshed after a transfer.
- Playable proxy-using decks still appearing in original shortages when original supply falls short.
- Generic basics automatically counting as Sleeved without fictional inventory or outstanding pulls.
- Consistent controls and error/loading feedback across the touched screens.

Then extend the same shared components and rules to remaining surfaces. Independent loading fixes can be delivered in bounded changes supported by the baseline.

## New decisions made (need owner confirmation)
- None. This is sequencing of approved plans, not new product scope or a launched task.

## Assumptions
- The user asks for the next step, not immediate dispatch, implementation or deployment.
- Existing plans are sufficient; no additional broad review/planning document is needed before the contract and prototype.

## Challenges to locked decisions
- None.

## Open questions
- Existing Missing-record disposition still needs a safe proposal before eligibility/data changes.
- Resolve the recorded milestone-marker discrepancy before unattended implementation dispatch.
- Verify the measurement environment before collecting runtime timings.
- No original-versus-proxy shortage question remains; O-009 is resolved.

## Verification
- Sequencing uses the current approved plans, decisions and backlog read and updated in the preceding turns.
- Report only. No implementation, mockup, measurement, agent dispatch, data mutation or deployment was performed.
