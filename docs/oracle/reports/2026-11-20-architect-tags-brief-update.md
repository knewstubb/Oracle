# Report: tags-brief-update
Role: Architect
Status: DONE
Task as received: Update the Gate 1 brief docs/oracle/briefs/card-tags-and-deck-slot-why.md to record the owner decisions of 2026-11-20 taken from docs/oracle/reports/2026-11-20-architect-tag-frequency-proposal.md: 1. Agree (40 Tags); 2. Agree but treat them as regular tags because the owner wants an AI pass across all cards to check the tags and clean up errors; 3. Agree (refresh Scryfall's Tag data just before the fill, as its own approval). Docs only; edit the PROPOSED RQ-12 row in status.md; no decisions.md edit; commit to main, no push.

## Summary for the owner
The Tags brief now says the app starts with 40 Tags, with Fixing and Stax / tax as ordinary Tags and no "incomplete" label. It also describes a new AI check over all Commander cards to find and fix wrong Tags. That check could cost roughly $30 to $60 (my estimate, not a quote). The brief lists five questions about it for you: check-only or also correct, where corrections are kept, how your own finds are fed back, how often to re-run, and the cost approval.

## Changed files
- docs/oracle/briefs/card-tags-and-deck-slot-why.md — scope, 40-Tag allow-list, source order, closed and open questions, new section 9A (AI verification pass), what the owner sees, success checks, dependencies, risks, next gates
- docs/oracle/status.md — RQ-12 row only, marked PROPOSED
- docs/oracle/reports/2026-11-20-architect-tags-brief-update.md — this report

## New decisions made (need owner confirmation)
- The five AI pass questions in brief section 9A (recommendations given).

## Assumptions
- Cost: pipeline contract section 5.4 prices ($0.50 / $2.50 per million tokens, 900 to 1,200 input and 100 to 200 output tokens per card) times 32,643 cards gives about $23 to $36, about $29 to $45 with its 25% allowance. The $30 to $60 range is my guess for the extra input of sending the Tag list and Scryfall's answer. Time (hours to a day) is also a guess from the contract's batch notes. Prices date from 2026-10-02.
- The pipeline contract still describes the old fallback; I did not edit it (not named). Listed as a dependency.
- Open question 7 (land Tags) was reworded because Fixing is now an ordinary Tag; the old question 1 to 3 and 8 were closed or merged. Remaining questions were renumbered.

## Challenges to locked decisions
- none

## Open questions
- The five questions in brief section 9A.

## Verification
- Read the proposal report, brief and pipeline contract; checked the edited brief for the words "role" and "job" in new text (none left).
- No code, data, migration or push. Committed only the three files above on main.
