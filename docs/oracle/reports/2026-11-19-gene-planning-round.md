# Report: planning round close-out (deck page, Strategy window, card Tags, Claude change reason)
Role: Gene
Status: DONE
Task as received: "You act as Gene (orchestrator) closing out the planning round. PLANNING ROUND, DOCS ONLY. Read in full the owner direction at .agents/tasks/planning-round-2026-11-19/owner-direction.md (binding OUT OF SCOPE list), AGENTS.md, docs/oracle/process.md and everything the earlier steps wrote in the worktree (audit, conflict list, three briefs, designer spec, mockup, designer report). Hard constraints: no build, no migration, no hosted write, no code changes; do not edit decisions.md or the card-roles spec. Nothing is approved by being written. DELIVERABLES: (e) a short plan document with the proposed slice order and dependencies ... (f) Update docs/oracle/status.md and docs/oracle/backlog-simple.md for IDs and statuses ... mark CC-26 as partly superseded ONLY as 'proposed, awaiting owner approval', never as done. Also add the three words Tag, Category and Why to docs/oracle/specs/vocabulary.md ONLY as PROPOSED additions ... Write a Gene-level report ... Commit in the worktree."

## Summary for the owner
The planning round is finished on paper only. There are three drafted briefs, a design proposal with a clickable mockup, an audit, a list of decisions the new direction conflicts with, and a slice plan. Nothing is built or approved. I need eight answers from you before the first slice can start; my recommendation comes first on each.

Decisions for you, recommendation first:
1. Approve the Strategy window brief and design. Recommendation: approve now, so slice 1 can start.
2. Approve a small stored-data change for the window (a one-line summary, "last changed by", and bracket 5). Recommendation: yes. No deck has any strategy saved, so nothing is converted or lost; it is tried on a throwaway copy first.
3. Bracket names: 1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized, 5 cEDH. Recommendation: use them everywhere.
4. What "See in History" opens. Today History (saved versions) and Recent changes by Claude are two different screens. Recommendation: one History per deck, with Claude's changes (reason and Undo) first, then saved versions.
5. When Claude edits your Strategy text. Recommendation: it adds a dated paragraph at the end and never replaces yours.
6. Win condition and budget. Recommendation: leave them out of the window; their stored values (all empty) stay.
7. Approve, in principle, dropping the parts of the card-roles plan (CC-26) that the new direction replaces. Recommendation: yes; the decisions file is only edited later, with your approval.
8. Slice order. Recommendation: Strategy window, then the reason on Claude changes, then the left panel, then card Tags; the chat pause runs alongside. Reason: the window and the reason both change the same Claude-edit code, so they are tested once, and Tags has the most approval steps and nothing waits on it.

Questions I have not decided for you: where the EDHREC build picker, guide and category manager end up long term; whether the History button should open the Recent changes screen (decision 4); whether Claude may set Keep; whether to store Scryfall's Game Changers flag; what to do with the unused CC-26 tables and the editable Tag chips in the card window; whether the pause covers the new-deck brewing chat too. Found: Why and Keep do not exist yet, and Scryfall does expose Game Changers but the app does not store them.

## Changed files
- docs/oracle/plans/2026-11-19-deck-page-tags-slice-plan.md — new: proposed slice order, dependencies, owner decisions before slice 1, open owner questions
- docs/oracle/status.md — DV-01 to DV-04, RQ-12, RQ-01, RQ-10, RQ-03 statuses and links; new CC-26 row ("proposed, awaiting owner approval", not done)
- docs/oracle/backlog-simple.md — same items with IDs and statuses in plain words
- docs/oracle/specs/vocabulary.md — new section 13: Tag, Category, Why as PROPOSED, awaiting owner approval; proposed retirement of "role", "job", "strategy point" in new documents. No other section changed
- docs/oracle/reports/2026-11-19-gene-planning-round.md — this report

## New decisions made (need owner confirmation)
- Recommended slice order differs from the direction (reason second, Tags last). Owner may keep the original; effects are in the plan, section 3.
- Status rows record RQ-01 and RQ-10 as "folded into RQ-12, proposed", and RQ-03 as "stays later".
- A CC-26 row was added to status.md because none existed (audit section 0).

## Assumptions
- The earlier steps' files in the worktree are the current state of the briefs, spec and audit; I read the audit, briefs, the spec header and the conflict list, and did not re-verify their code claims.
- The audit's corrected facts stand: 22 decks (the backlog says 21), the hold-reason column sits on the waiting-requests table, not the change log.
- The `plans/` folder already existed and is the nearest fit for the plan document.

## Challenges to locked decisions
- D-060 and the CC-26 owner answers D-a to D-d, Q4, Q5, Q6, Q8, Q10 — conflict with dropping jobs, strategy points, proposals-at-once and the health roll-up — see `reports/2026-11-19-architect-conflict-list.md`; amendments proposed there, none made. decisions.md and the card-roles spec are untouched.

## Open questions
- The eight decisions in the owner summary and the six undecided questions above; full text in `plans/2026-11-19-deck-page-tags-slice-plan.md` sections 2 and 4.
- The DB-1 to DB-5 draft files still say "NOT APPLIED" though they are applied live and empty (audit section 9). Recommendation: add a header note later; no file moved now.

## Verification
- `git -C <worktree> status` and diff reviewed: only the five files above changed in this step.
- No build, test, migration or hosted write was run (docs-only round); nothing was applied.
- Row edits in status.md checked by splitting the table cells; all edited rows keep five columns.
