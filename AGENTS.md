# Oracle — shared agent context

Every agent reads this file first, then its base role in `~/agents-shared/<role>.md`, then its project additions in `.agents/project/<role>.md` (additions win on conflict).

Role names changed in October 2026: Orchestrator is now Gene, UX/UI is Designer, Backend and Frontend are both Developer, Session Scribe is Scribe, and there is a new Tester. Older reports and docs use the old names.

## Audience and communication style

The owner works in BA/UX/UI and does not read code. Anything the owner reads must pass this test: could a designer who has never opened the codebase understand it and decide from it?

- **Short.** Answer first, in 1–3 sentences. Add detail only if it changes the decision. No preamble, no recap.
- **Describe the app, not the code.** Say what the user sees or does ("the import screen shows no conflicts"), not how the code works. If a technical term is unavoidable, explain it the first time: "migration (a change to how data is stored)".
- **Give an example whenever something is abstract.** "For example: you own one Sol Ring, it's in Korvold, and Prosper also wants it."
- **Options:** recommendation first, then what the owner would see differently with each option, then the trade-off. Three options at most.
- **Ask about behaviour and priorities, never implementation.** Ask "When a card is already in another deck, should it show as a conflict?", not "Should planned instances count as unresolved?"
- **Translate the owner's requests yourself.** The owner describes screens, clicks and what looks wrong. Turning that into technical tasks is the agents' job; never ask the owner to do it.
- **No code, SQL, file paths or line numbers in owner-facing messages** unless the owner asks. Put them in the report.

## What Oracle is
A Magic: The Gathering Commander/EDH collection and deck manager. Replaces Archidekt as the owner's primary deck platform. Covers collection tracking, proxy management, deck brewing, allocation of physical cards to decks, and post-game debrief. Currently single-user; a multi-user public version is under consideration, so do not make choices that block it.

## Stack
- Next.js (App Router), TypeScript, Tailwind, shadcn/ui
- Supabase / Postgres (migrations in `supabase/migrations/`; check `docs/oracle/status.md` for what is deployed)
- Hosted on Vercel
- External: Scryfall, EDHREC, Archidekt, Commander Spellbook, Card Kingdom, Anthropic API

## Core data model (locked — see docs/oracle/decisions.md)
- `user_cards` — one row per card identity the user owns (D-001)
- `user_copies` — one row per physical card owned; proxies are rows with `is_proxy = true` (D-001)
- `deck_cards` — a card's membership in a deck; the maybeboard is a separate `deck_cards` relation
- `get_collection_rollup` RPC is live and confirmed working

## Identifier rules (these have caused real bugs)
- `scryfall_id` identifies a specific printing. `oracle_id` identifies the canonical card across all printings. Never use one where the other is meant.
- Finish (normal / foil / etched) is NOT encoded in `scryfall_id`. It is its own attribute.
- Archidekt exports give `scryfall_id` directly. Moxfield gives set code + collector number and must be resolved via Scryfall `/cards/{set}/{collector_number}`.
- Identifier resolution lives in small, discrete, unit-tested functions. No inline resolution logic.

## Repo layout for agent work
- `docs/oracle/decisions.md` — locked decisions register. Read-only for everyone except the Orchestrator, and the Orchestrator only edits it after the owner approves.
- `docs/oracle/status.md` — current backlog and task state, maintained by the Orchestrator.
- `docs/oracle/contracts/` — schema and API contracts (Architect writes).
- `docs/oracle/specs/` — UX/UI component and interaction specs (UX/UI writes).
- `docs/oracle/mockups/` — HTML mockups for owner review (UX/UI writes).
- `docs/oracle/reports/` — completion reports from every agent.

## Rules for every agent
1. Stay in your lane. Your role file says what you own. If the task needs something outside it, stop and report instead of doing it.
2. Do not re-open locked decisions. If one looks wrong, say so in your report under "Challenges" with the evidence. Do not work around it.
3. Ground claims in code. When you describe existing behaviour, tag it `[Confirmed: path/to/file]` or `[Approximate]`.
4. Never guess to get unblocked. Missing input, contradictory spec, or an unclear requirement means status BLOCKED with a precise question.
5. No destructive database operations (drop, truncate, delete-all, clear-and-recompute) unless the task explicitly names them and cites owner approval.
6. Finish every task by writing a report to `docs/oracle/reports/<YYYY-MM-DD>-<role>-<slug>.md` in the format below, then stop.

## Report format
```
# Report: <task slug>
Role: <role>
Status: DONE | PARTIAL | BLOCKED
Task as received: <the handoff, verbatim>

## Summary for the owner
<2–3 plain sentences: what changed in the app, and anything the owner must decide. No technical terms.>

## Changed files
- path — one-line reason

## New decisions made (need owner confirmation)
- ...

## Assumptions
- ...

## Challenges to locked decisions
- decision ID — evidence — suggested change (or "none")

## Open questions
- ...

## Verification
- command run — result
```
