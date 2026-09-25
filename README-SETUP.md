# Oracle × Paseo — setup

## What goes where
Copy everything in this kit into the root of the Oracle repo, keeping the folder structure:

```
AGENTS.md                      shared context every agent reads (OpenCode reads this automatically)
CLAUDE.md                      one line that imports AGENTS.md, so Claude Code reads the same thing
.paseo/KICKOFF.md              the first message you paste into the Orchestrator
.paseo/agents/orchestrator.md  role files — each agent is told to read its own on every handoff
.paseo/agents/architect.md
.paseo/agents/uiux.md
.paseo/agents/backend.md
.paseo/agents/frontend.md
docs/oracle/decisions.md       locked decisions register (D-001 … D-017, open items O-001 … O-004)
docs/oracle/status.md          backlog, seeded with the known outstanding work
docs/oracle/contracts/         Architect output (empty to start)
docs/oracle/specs/             UX/UI output
docs/oracle/mockups/           UX/UI HTML mockups
docs/oracle/reports/           every agent's completion report
```

Commit these before the first run so every worktree Paseo creates gets a copy.

## One-time setup
1. Install Paseo (desktop app, or `npm install -g @getpaseo/cli`).
2. Make sure OpenCode is installed and signed in with your Go subscription, and Claude Code is signed in with your Claude plan.
3. Install the orchestration skills: `npx skills add getpaseo/paseo`.
4. Add the Oracle repo as a project in Paseo.

## First run
1. Start one agent in Paseo using the Orchestrator's model (Kimi K2.7 Code via OpenCode).
2. Paste the contents of `.paseo/KICKOFF.md`.
3. Review the T-01 audit it produces before letting anything else start.

## How the role files get loaded
Paseo itself doesn't store per-role system prompts in the repo. The mechanism here is simpler and works with any agent CLI: every handoff message starts with "Read AGENTS.md and .paseo/agents/<role>.md before anything else." The role file travels with the repo, so it's versioned and you can edit it like any other file.

## Model allocation
| Role | Model | Why |
|---|---|---|
| Orchestrator | Kimi K2.7 Code | Judgement on sequencing and review |
| Architect | Kimi K2.7 Code | Schema and identifier logic is where Oracle's real bugs have come from |
| UX/UI | Kimi K2.7 Code | Specs are reviewed by a designer; weak reasoning here costs you review cycles |
| Backend | DeepSeek | Implementation against a written contract |
| Frontend | DeepSeek (Kimi for Brew Canvas) | Implementation against an approved spec; drag/snap is the exception |
| Fallback | Claude (your Claude plan) | When a Kimi/DeepSeek agent loops or produces a bad contract twice |

## Where you step in
The Orchestrator is instructed to stop and wait for you at: any migration, any UX/UI spec or mockup, any challenge to a locked decision, any destructive database operation, and any merge to main.
