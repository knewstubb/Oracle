# Report: dispatch-quality-pass
Role: Orchestrator
Status: DONE
Task as received:
> Okay. Allocate work as you see fit
>
> Remember to use better modles than specified in the general agent instructions if appropriate

## Summary for the owner
Two agents have started: one is defining consistent card and deck behaviour, and the other is investigating slow loading. The pick-list visual prototype follows the reviewed behaviour contract; nothing changes in the app or stored collection during this preparation.

## Changed files
- docs/oracle/status.md — records the actual active tasks, stronger models, dependency gates and dispatch authorisation.
- docs/oracle/roadmap.md — records the owner's scoped preparation exception without changing milestone markers or permitting other parked work.
- docs/oracle/reports/2026-09-29-orchestrator-dispatch-quality-pass.md — records actual handoffs and safe continuation.

## Actual handoffs

| Task | Provider/model | Reasoning | Agent ID | Workspace ID |
|---|---|---|---|---|
| T-28 shared behaviour contract | copilot/claude-opus-5.5 | high | 0a31b64d-6208-4de4-b8f3-f792f72b9fe6 | wks_ee30a7c253ebee30 |
| T-27 loading investigation | copilot/gpt-6-astra | high | 43a8b166-8075-4ff4-8e93-f4f7e7837747 | wks_80128d9fcb9c0212 |

Both returned `running` from the actual launch command. A subsequent one-time launch inspection confirmed each model, reasoning setting and parent agent `c3f14e05-5dae-4530-a342-5ff1dec17019`. This report completes allocation, not either delegated deliverable.

| Task | Branch | Worktree | Bounded repository output |
|---|---|---|---|
| T-28 | task/t28-state-contract-20260929 | /Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t28-state-contract | docs/oracle/contracts/card-state-actions.md; justified companion types; Architect completion report |
| T-27 | task/t27-loading-baseline-20260929 | /Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t27-loading-baseline | docs/oracle/reports/2026-09-29-architect-t27-loading-baseline.md |

Both worktrees branch from explicit local `refs/heads/main`, at `0a74e8e3604dddc69d8e9976229b3a4a9186af00`. The current `docs/oracle/` input snapshot was copied into each before launch because the owner-approved decisions and plans are uncommitted and otherwise absent from HEAD. The decisions, roadmap, status and all three plans were compared byte-for-byte against the main checkout before each launch. No credentials were intentionally copied; only the documentation tree was transferred. Agents were instructed not to treat these copied input changes as their own output.

The CLI does not expose the skill's named-profile discovery surface. Selection therefore used the previously verified Copilot model listing; actual settings were then checked after launch. This parent is running through Copilot, not either of the older role file's Kiro/OpenCode Gene variants.

## Handoff content and continuation

The exact three-line initial prompts and full bounded briefs are retained in the session workspace:

- /Users/bradknewstubb/.copilot/session-state/4b576cd9-ef04-4761-858e-24689c8338ff/files/t28-prompt.txt
- /Users/bradknewstubb/.copilot/session-state/4b576cd9-ef04-4761-858e-24689c8338ff/files/t28-brief.txt
- /Users/bradknewstubb/.copilot/session-state/4b576cd9-ef04-4761-858e-24689c8338ff/files/t27-prompt.txt
- /Users/bradknewstubb/.copilot/session-state/4b576cd9-ef04-4761-858e-24689c8338ff/files/t27-brief.txt
- /Users/bradknewstubb/.copilot/session-state/4b576cd9-ef04-4761-858e-24689c8338ff/files/quality-pass-continuation.txt

T-28 covers the approved vocabulary, physical-copy actions and atomic transfer effects, readiness, automatic generic basics, pick-list source information, imports, original shortages including already proxy-filled slots, and the explicitly unapproved legacy Missing-data transition. It must return a source-backed contract and acceptance matrix, not production handlers or migrations.

T-27 begins with source-backed investigation and verification of the measurement prerequisite. Runtime baselines require a verified safe target and dedicated fixture; existing E2E safeguards must not be bypassed. If unavailable, the agent must return an explicit measurement blocker plus useful bounded findings, not fabricated timings. No live write, mutable shared-environment test, owner-session reuse, or stress test is authorised.

After T-28 passes coordinator review, one Opus UX/UI handoff is queued for the compact pick-list-first board and related T-25/T-29/T-30 examples. It has **not** been launched; no contract output exists yet. T-26 still waits for owner approval of T-25. Any newly proposed product rule must go back to the owner before dependent work relies on it.

Paseo recorded both children under this parent, using normal Agent mode and its agent-scoped completion/permission notifications. Initial permission requests for reading the task brief/documentation and read-only Git inspection were individually approved. No Allow All mode or blanket future-command approval was enabled. Subsequent permission requests require the same scoped review; an unresolved permission may pause an agent. No polling loop or heartbeat was created.

## New decisions made (need owner confirmation)
- None. Task/model selection and the scoped roadmap note implement the owner's existing allocation instruction; no product decision or milestone was changed.

## Assumptions
- The explicitly approved quality-pass preparation may proceed without reopening the stale milestone-marker discrepancy. Other feature work retains its existing gate.
- Completed agent outputs remain uncommitted in their isolated worktrees until reviewed. Copied planning inputs must not be merged back over newer coordinator changes.
- A verified runtime measurement environment is not yet established; the performance task must establish it or report that portion blocked.

## Challenges to locked decisions
- None.

## Open questions
- Safe disposition of legacy Missing records remains an owner decision before a stored-data transition.
- Runtime baseline safety/fixture availability is being investigated, not assumed.
- Actual interaction design, visual layout, contracts requiring new product choices, migrations and merges retain their approval gates.

## Verification
- `paseo workspace create --isolation worktree ... --base refs/heads/main` — created two separate workspaces and returned their actual IDs/paths.
- `rsync -a docs/oracle/ <worktree>/docs/oracle/` plus explicit status refresh — transferred current approved documentation without committing main.
- Inline Node byte comparison of decisions, roadmap, status and three plans in both worktrees — both snapshots matched before launch.
- `paseo run -d --provider copilot/claude-opus-5.5 --thinking high ...` — returned T-28 agent ID and `running`.
- `paseo run -d --provider copilot/gpt-6-astra --thinking high ...` — returned T-27 agent ID and `running`.
- `paseo inspect <known-agent-id> --json` for both children — confirmed requested models/high reasoning, normal Agent mode, running status and correct parent ID; surfaced initial pending tool permissions.
- `paseo logs <known-agent-id> --tail 6` and scoped permission listing — identified initial documentation reads and read-only Git inspection.
- `paseo permit allow <agent-id> <request-id> --json` — individually approved three initial requests; no broad permission change.
- `git --no-pager diff --check` and inline Node documentation check — passed; three changed documents have trailing newlines and four local Markdown links resolve.
- `git --no-pager status --short` — the main checkout contains documentation changes only; application code and migrations remain unchanged.
