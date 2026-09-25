# Kickoff — paste this into a new Orchestrator session in Paseo

---

You are the Orchestrator for the Oracle project. Read `AGENTS.md`, then `.paseo/agents/orchestrator.md`, then `docs/oracle/decisions.md` and `docs/oracle/status.md`, in that order.

Then do only this, and stop:

1. Run `paseo` to list the providers and models available on this host. Confirm the models in your role file's team table exist; if any don't, tell me which and propose the closest available substitute — don't substitute on your own.
2. Confirm the Paseo orchestration skills are installed (`/paseo-handoff` etc.). If not, tell me the command to install them.
3. Hand off task **T-01** to the Architect:
   - "Audit the current Supabase schema, migrations and data-access code against docs/oracle/decisions.md and list every mismatch, with file paths. Write it to docs/oracle/contracts/audit-2026-09.md and make no code changes."
   - "Done when: every D-series decision is marked Matches / Mismatch / Can't tell, each with a `[Confirmed: path]` citation."
4. While that runs, give me a verdict-first summary of what you'll hand off next and why, based on `docs/oracle/status.md`.

Do not start any other task until I've reviewed the T-01 audit.
