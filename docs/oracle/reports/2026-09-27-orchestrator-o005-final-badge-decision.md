# Report: O-005 final badge decision
Role: Orchestrator
Status: DONE
Task as received: The badge should disappear. This is the appropriate solution

## Summary for the owner
The final rule is now clear: clicking Allocate Cards finishes the import decision, so any cards left Planned remain Planned normally but no longer show as import conflicts on the deck badge. I recorded this decision and handed the contract correction to the Architect; nothing has been deployed.

## Changed files
- docs/oracle/status.md — records the final badge decision and Architect follow-up.
- docs/oracle/reports/2026-09-27-orchestrator-o005-final-badge-decision.md — records the decision and handoff reason.

## New decisions made (need owner confirmation)
- None. The owner explicitly confirmed the existing recommended solution.

## Assumptions
- The deck conflict badge is the per-deck badge on the Decks view, not the reconciliation screen's unresolved-count tabs.
- Finalization remains the point at which leftover Planned slots stop being outstanding import decisions.

## Challenges to locked decisions
- None.

## Open questions
- Architect must determine and document the exact contract and draft-migration changes needed to exclude finalized/settled Planned claims from the deck conflict badge while preserving the reconciliation state rules.

## Verification
- The prior Backend review independently passed 42 targeted tests and found no Backend server-code changes required.
- No database migration has been deployed.
