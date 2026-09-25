# Oracle — shared agent context

Every agent working in this repo reads this file first, then its own role file in `.paseo/agents/`.

## What Oracle is
A Magic: The Gathering Commander/EDH collection and deck manager. Replaces Archidekt as the owner's primary deck platform. Covers collection tracking, proxy management, deck brewing, allocation of physical cards to decks, and post-game debrief. Currently single-user; a multi-user public version is under consideration, so do not make choices that block it.

## Stack
- Next.js (App Router), TypeScript, Tailwind, shadcn/ui
- Supabase / Postgres (migrations in `supabase/migrations/`, numbered; 007–012 are deployed)
- Hosted on Vercel
- External: Scryfall, EDHREC, Archidekt, Commander Spellbook, Card Kingdom, Anthropic API

## Core data model (locked — see docs/oracle/decisions.md)
- `card_definitions` — one row per card identity
- `physical_copies` — one row per physical card owned; proxies are rows with `is_proxy = true`
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
