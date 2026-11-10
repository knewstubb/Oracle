# Report: vector-trial-brief
Role: Product
Status: DONE
Task as received: Write an approved-for-owner-review brief for the vector recommendation trial at docs/oracle/briefs/vector-recommendation-trial.md (status: proposed, awaiting owner approval at Gate 1), plus this report. Sources: docs/oracle/contracts/vector-trial-2026-11.md and the four 2026-11-04 architect reports; owner decisions as listed in the request. No UI changes; do not edit decisions.md.

## Summary for the owner
The Gate 1 brief is written and waiting for your approval. It says plainly what the trial is, what you will do (about 2 hours of blind grading, no screen changes) and what result means go or stop. Before anything starts it needs your Archidekt links, and a check of whether Mendicant's and Wilhelt's builds still exist; if they don't, they are re-loaded first.

## Changed files
- docs/oracle/briefs/vector-recommendation-trial.md — new brief, status proposed
- docs/oracle/reports/2026-11-04-product-vector-trial-brief.md — this report

## New decisions made (need owner confirmation)
- None new. Owner decisions were recorded as given.
- Proposed (not decided): re-pulled Archidekt decks are used as read-only test lists, not written into the live app, until the test account exists.
- Proposed: Gate 3 (design) is skipped because the trial has no UI. Gene to confirm.

## Assumptions
- "Combo labels switchable per deck, off = lose label and boost only" answers the Architect's question 2 as its plan stated.
- "Ask first" rule covers combo-labelled infinite-combo cards, per the commander-swap report. Treated as already decided.
- The Archidekt links are meant to double as the ~30-card deck lists the contract needs. Not stated by the owner.
- Success and stop numbers are copied from contract §5.4 as they stand. The contract is still a draft.
- The brief tags nothing against code. Facts come from the Architect reports; hosted data was not verified by anyone.

## Challenges to locked decisions
- none. D-036(b) is clarified by the owner's answer. Gene may record it at close-out. `decisions.md` was not edited.

## Open questions
- Archidekt links (owner). Live app or read-only use?
- Kickoff data check: do Mendicant and Wilhelt builds exist on the hosted database? Owner says builds and decks were removed, so assume sync is needed.
- Identifier bug check: confirm printing ids stored under an oracle_id column in the old local database do not affect production.
- Hosted database: is pgvector available, and are the ten pending migrations still waiting?
- Where the per-deck combo answer is stored needs its own contract before production use.
- `vocabulary.md` additions are listed in the brief; Gene adds them after approval.

## Verification
- Read AGENTS.md, the product role files, process.md, both existing briefs for format, the contract (§5, §6, §7), and the four architect reports.
- Documentation only. No code, tests, or database access.
