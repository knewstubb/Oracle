# Report: cc05-gate5-prep
Role: Gene
Status: PARTIAL (awaiting owner approval of draft wording)
Task as received: Finish the Claude connector: merge CC-04d, apply deck-list wording fix, remove broken Scryfall sync cron, leave switch-on as Needs reconnecting, soften phone note, tester verify, then draft Gate 5 close-out (D-034 amendment, false rollup line, vocabulary, owner checklist) without editing decisions.md, AGENTS.md or vocabulary.md.

## Summary for the owner
The last piece of the Claude connector is finished: Claude's deck list now shows every deck as "not marked active by you" with its readiness, the broken daily sync is gone, and the phone note is softer. The wording for the official record is drafted and waiting for your approval.

## Changed files
- docs/oracle/drafts-gate5-claude-connector.md — DRAFT D-034 amendment, rollup correction, vocabulary rows, owner checklist
- docs/oracle/status.md — CC-04d, CC-04, CC-05 rows updated (file also holds other agents' uncommitted edits; left uncommitted)
- Developer commit ee2108a (vercel.json, list-decks tool, Setup guide, contract) — see developer report

## Findings
- Merge: CC-04d branch (652265b) was already an ancestor of main; nothing to merge, nothing forced. The unrelated collection/value route file and the 20261113100000 migration are not modified/untracked now (migration is already tracked); neither was touched.
- The tree held other agents' uncommitted work and one of their commits (7b408ea) swept in the deck-list edits; behaviour verified correct at ee2108a.
- The "live and confirmed working" rollup line exists only in AGENTS.md, not decisions.md.

## New decisions made (need owner confirmation)
- Deck listing now returns all decks by default (the old default hid decks not marked active); include_inactive is accepted but ignored.
- Draft text of D-034a and vocabulary rows (see draft).

## Assumptions
- "Merge CC-04d" was satisfied by the existing merge.

## Challenges to locked decisions
- D-059 names deck states Unowned cards / Assembling / Playable; the connector reuses Draft / Assembling / Playable. Suggest alignment follow-up.

## Open questions
- Approve draft wording.

## Verification
- Tester report 2026-11-17-tester-cc04d-leftovers.md: PASS on all three items; connector and Setup guide tests pass; 2 import tests fail on a clean tree (unrelated); one Moved Slot Note test fails from another agent's unfinished edit.
