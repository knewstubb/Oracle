# Report: connector-followup-briefs
Role: Gene
Status: DONE
Task as received: Owner answered YES: Claude should be able to log games in Oracle. Write draft briefs (status: awaiting owner approval, not approved) in docs/oracle/briefs/ for (1) connector card facts + live deck health, (2) filterable collection search, (3) game logging + playgroup (include owner-facing open questions about behaviour). Update status.md backlog as proposed. Write a report.

## Summary for the owner
Three draft briefs are written and none is approved. They cover showing Claude what cards do plus real deck health, filtering the collection, and logging games with a playgroup. Game logging has ten questions you need to answer first; the other two have four each.

## Changed files
- docs/oracle/briefs/connector-card-facts-and-deck-health.md — new draft brief (CC-06)
- docs/oracle/briefs/connector-collection-search.md — new draft brief (CC-07)
- docs/oracle/briefs/game-logging-and-playgroup.md — new draft brief (CC-08)
- docs/oracle/status.md — added CC-06 to CC-09 as PROPOSED
- docs/oracle/reports/2026-11-16-gene-connector-followup-briefs.md — this report

## New decisions made (need owner confirmation)
- Owner's YES to Claude logging games is recorded in the brief only, not in decisions.md.
- Proposal: pull the logging part of parked O-004 forward as CC-08. Needs owner confirmation.

## Assumptions
- Briefs are based on the earlier comparison report; I did not re-trace code.
- Game logging reuses the connector's small-edit-with-undo model (7 days) as the recommended default.

## Challenges to locked decisions
- none

## Open questions
- Card facts: fresh deck health vs saved; price labelling; Claude sets brackets or only reports; tidy empty saved types or not.
- Search: function tags now or later; whether In your hand / Missing count as free; proxies as separate rows; wishlist now or later.
- Games: record contents, who won, who can log, approval, edit/delete rights, pod and power level, opponent decks, playgroup person details, bulk past games, debrief prompt.

## Verification
- Read AGENTS.md, status.md and the earlier report; confirmed new files exist. No code or tests run (docs only).
