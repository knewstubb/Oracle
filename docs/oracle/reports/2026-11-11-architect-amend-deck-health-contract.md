# Report: amend-deck-health-contract
Role: Architect
Status: DONE
Task as received: Owner decisions: Q1 = option 1 (EDHREC average deck, fall back to EDHREC estimate, then General guide). Q2 = show last saved numbers marked "may be out of date"; if none saved, "General guide (couldn't reach EDHREC)". Amend docs/oracle/contracts/deck-health-phase2.md accordingly, including the slice plan and a Developer task to test ~15 commanders (some obscure) before relying on the average-deck source. Do NOT apply the cache table migration. Update the brief section 19 if it fits your lane, otherwise note it for Gene. Short report, commit and push.

## Summary for the owner
The deck health plan now takes each commander's typical numbers from EDHREC's average deck first, then EDHREC's estimate, then the general guide. If EDHREC can't be reached, it shows the last saved numbers marked "may be out of date", or "General guide (couldn't reach EDHREC)" if nothing is saved. Before building relies on the average deck, the Developer must test about 15 commanders, including obscure ones. Nothing is built and the database is unchanged.

## Changed files
- docs/oracle/contracts/deck-health-phase2.md — source order (average deck, estimate, guide), new source labels, stale wording, cache table draft gains a `source` column, S2 slice and tests, 15-commander Developer task
- docs/oracle/reports/2026-11-11-architect-amend-deck-health-contract.md — this report

## New decisions made (need owner confirmation)
- Average-deck qualify rule A5 (99 or 100 cards, at least 50 decks, at most 10% unmatched cards) is a starting value, to be tuned by the 15-commander test.

## Assumptions
- Average-deck JSON exists and is well-formed for most commanders; only Atraxa was probed. The Developer task checks this.

## Challenges to locked decisions
- none

## Open questions
- For Gene: brief section 19 (`docs/oracle/briefs/daily-use-deck-advisor.md`) is not in the Architect's lane, so I did not edit it. Please add: "Typical numbers come from EDHREC's average deck, then EDHREC's estimate, then the general guide (owner, 2026-11-11). Archidekt is not used (its terms forbid automated requests). When EDHREC is unreachable, show last saved numbers marked 'may be out of date'; if none, 'General guide (couldn't reach EDHREC)'."
- The migration remains an unapplied draft inside the contract; the owner must approve it before slice 2.

## Verification
- `git diff --stat` — contract changed only (32 insertions, 16 deletions); no code, migration file or database touched
