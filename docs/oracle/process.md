# Oracle feature process

How every new feature gets built. Gene runs it. The owner decides at gates 1, 3 and 5.

Why it exists: import was rebuilt six-plus times between July and October 2026. Each rebuild started from a feature request, not from the whole user journey. Old versions were never deleted, and locked decisions drifted into conflict.

## Gate 1 — Brief (Gene + owner)
One page at `docs/oracle/briefs/<feature>.md`. Owner approves before anything else starts.
- Every scenario: who, when, what they have, what they want. Example: import has three (migration, adding cards, adding a deck).
- What must never happen (for example duplicate copies, losing data).
- New words, defined once (also added to `vocabulary.md`).

## Gate 2 — Audit (Architect, read-only)
Report in `docs/oracle/reports/`.
- What already exists: screens, code, decisions, half-built and dead code. Do not assume something is missing; check.
- Locked decisions touched or in conflict.
- What will be deleted when the new version ships.

## Gate 3 — Design (Designer, owner approves)
- One mockup that covers every scenario in the brief.
- Questions to the owner are about behaviour, with an example, at most three options, recommendation first.
- Nothing is built until the owner approves.

## Gate 4 — Build in slices (Developer, Tester)
- A slice is one screen or one behaviour. The owner sees each slice before the next one starts.
- Commit as you go. If an agent is cancelled, the next one checks `git status` and `git diff` first.
- Tests run the real app against a **separate test account**, never the owner's live data. Until it exists, the Developer flags save-path testing as untested instead of guessing.
- The old version is deleted in the same task. A slice is not done while the old path still exists.

## Gate 5 — Close-out (Gene + owner)
- The owner does a final click-through using a test list built from the brief's scenarios.
- Gene (only with owner approval) updates `decisions.md`, and updates `vocabulary.md` and marks superseded docs.
- Then the owner approves the merge.

## Standing rules
- One feature per session. Start a session with "continue <feature>, brief is at <path>".
- State lives in the repo (`status.md`, briefs, reports), not in chat.
- Every few weeks Gene checks `decisions.md` against the code and reports conflicts.
- Agent tasks stay short and bounded.
- Owner-facing messages follow AGENTS.md: short, plain language, no code.

## Using Copilot (Agent and Plan modes)
Owner talks only to Gene, who dispatches the other roles.
- Gates 1–3: Plan mode (read-only and conversation).
- Gate 4–5: Agent mode.
- Long builds run in the background while the owner keeps talking to Gene.
