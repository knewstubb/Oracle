# Report: record-decisions-and-handoff-next-tasks

Role: Orchestrator

Status: DONE

Task as received: "- Keep the user_cards naming convention. That seems cleaner and needs no work - The delete all data button already exists. Its in the settings menu - https://www.langchain.com/blog/building-a-harness-with-jev"

## Changed files

- `docs/oracle/decisions.md` — recorded owner decisions: D-001 updated to `user_cards`/`user_copies` naming, D-002 marked under review, D-004 updated to `nonfoil`/`foil`/`etched`.
- `docs/oracle/status.md` — T-10 moved to DONE; T-03, T-12, and T-05a marked IN PROGRESS; T-05 split into T-05a (Backend) and T-05b (Frontend); T-19 added for Jev research.

## New decisions made (need owner confirmation)

- None. All decisions above were confirmed by the owner in this session.

## Assumptions

- The existing "delete all data" button in Settings satisfies the owner's need to purge everything for testing, so the old allocation-clear RPC can be safely retired.
- T-05 needed splitting into Backend (T-05a) and Frontend (T-05b) because one role should own each task.
- Jev research is an M2 advisor item, so it was added to the M2 task list as T-19.

## Challenges to locked decisions

- None.

## Open questions

- None.

## Verification

- Fetched the Jev article and confirmed it is a TypeSafe AI "System One" classification model (fast, structured decisions, not text generation) that could be evaluated for card recommendation classification.
- Confirmed `docs/oracle/decisions.md` reflects the owner's choices.
- Confirmed `docs/oracle/status.md` reflects the new task states.
- Handed off T-03, T-12, and T-05a to separate agents; all are running in their own worktrees.

## Jev summary for the owner

Jev is a fast, cheap classifier model. It doesn't write text; it answers structured questions like "Which availability group does this card fall into?" It could be useful for quickly labeling suggestions as owned-and-free, owned-in-another-deck, or buy. I added T-19 to the M2 list so the Architect can research whether it fits Oracle's recommendation flow after the AI audit (T-14) is done.

## Active agents after this session

| Agent | Task | Worktree |
|---|---|---|
| eb0e6509 | T-03 Allocation suggestion engine contract | t03-suggestion-engine |
| f5f223bb | T-12 Placement source contract + migration | t12-placement-source |
| e9892ff5 | T-05a Replace rollup placeholder IDs (Backend) | t05a-rollup-ids |
| 047c297 | T-14 AI code audit (read-only) | t14-ai-audit |
