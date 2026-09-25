# Report: confirm-models-and-start-t02

Role: Orchestrator

Status: DONE

Task as received: "The Paseo CLI and orchestration skills are now installed. Please confirm the models and skills again, then proceed to T-02."

## Changed files

- `docs/oracle/status.md` — T-01 moved from REVIEW to DONE, T-02 moved from TODO to IN PROGRESS.

## New decisions made (need owner confirmation)

- None.

## Assumptions

- Your instruction to "proceed to T-02" means T-01 is approved, so I updated its status to DONE.
- The Architect role (T-02) uses `opencode-go/kimi-k2.7-code`, which is available, so no model substitution was needed for this handoff.

## Challenges to locked decisions

- None.

## Open questions

1. The team table lists `OpenCode · DeepSeek` for Backend and Frontend, but Paseo does not expose an exact model with that name. Available DeepSeek variants under OpenCode Go are:
   - `opencode-go/deepseek-v4-flash-vision-exp`
   - `opencode-go/deepseek-v4-flash`
   - `opencode-go/deepseek-v4.1-flash`
   - `opencode-go/deepseek-v4-pro`
   
   **Proposed substitute:** `opencode-go/deepseek-v4.1-flash` for general Backend/Frontend work, escalating to `opencode-go/kimi-k2.7-code` for Brew Canvas drag/snap work as the role file already directs. Confirm before I hand off any Backend or Frontend task.

2. The `/paseo-handoff` skill is installed but appears to be a prompt template only (no executable tools). I used the Paseo CLI (`paseo run`) for the actual handoff, which is the primary mechanism referenced in the Orchestrator role file. Confirm this is the intended workflow.

## Verification

- `paseo provider ls` — OpenCode provider is `available`; Kiro CLI is also available; others are unavailable.
- `paseo provider models opencode` — confirmed `opencode-go/kimi-k2.7-code` is listed. No exact `OpenCode · DeepSeek` model; variants listed above.
- `npx skills list -g` — confirmed `paseo-handoff` is installed globally at `~/.agents/skills/paseo-handoff`.
- `paseo ls` — confirmed agent `512ad39` `[T-02] Validate V2 allocation resolver` is running with provider `opencode/opencode-go/kimi-k2.7-code` in worktree `~/.paseo/worktrees/03dz1jp4/t02-allocation-resolver`.

## T-02 handoff details

- **Agent ID:** `512ad39`
- **Provider/model:** `opencode/opencode-go/kimi-k2.7-code`
- **Workspace:** `wks_2be80a3574d2a298` / `~/.paseo/worktrees/03dz1jp4/t02-allocation-resolver`
- **Task:** Validate the V2 allocation resolver against real deck data, read-only, no destructive RPC calls.
- **Expected outputs:** `docs/oracle/contracts/allocation-resolver-validation-2026-09.md` and a report in `docs/oracle/reports/`.
