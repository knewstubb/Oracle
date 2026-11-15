# Report: claude-connector-brief
Role: Product
Status: DONE
Task as received: Write a feature brief per docs/oracle/process.md, saved in docs/oracle/briefs/, then your usual report in docs/oracle/reports/. Feature: an online MCP connection (a "connector" that lets Claude chat apps use Oracle's data) so the owner can use their existing Claude subscription (Claude on web, phone, desktop, Claude Code) to work with Oracle instead of paying for separate API-based AI. Owner decisions: reachable from anywhere (hosted, with login); editing from the start (add/remove cards in decks, collection, proxies, maybeboard); single user today but must not block multi-user (each user sees/edits only their own data); Oracle's in-app AI (Anthropic API) out of scope. Cover problem, goals, user stories, scope, read vs edit actions, safety (rule 5), login/access, success criteria, max a few behaviour-only open questions, risks; respect decisions.md and flag conflicts under Challenges; do not design implementation; end with plain-language summary.

## Summary for the owner
The brief is written and waiting for your approval. It lets your Claude apps read and edit Oracle from anywhere after logging in, with every change undoable and nothing destructive offered. Please answer three behaviour questions (large edits, moving cards between decks, a "recent changes" list) and confirm how the "AI may change decks without asking" rule should apply to Claude.

## Changed files
- docs/oracle/briefs/claude-connector.md — the Gate 1 brief (new)
- docs/oracle/reports/2026-11-16-product-claude-connector-brief.md — this report (new)

## New decisions made (need owner confirmation)
- Proposed: edits that are small happen straight away with undo; large edits (about 10+ cards) need a "yes"; destructive actions (delete deck, clear, wipe, replace-style import) are not offered to Claude at all in v1.
- Proposed: moving a physical copy between decks is suggest-only at first (open question 2).
- Proposed: a "made by AI" record and an on/off switch for the connector.

## Assumptions
- "Edit" includes: add/remove deck cards, main list to maybeboard, single collection add/remove, Original/Proxy marking, creating proxies, sleeving. This is my reading of "add/remove cards in decks, manage collection, proxies, maybeboard".
- Claude apps' own per-action approval cannot be relied on, because users can turn it off. [Approximate: general knowledge of Claude apps, not verified in this task]
- Sign-in already exists as a real account session, so the connector uses the same accounts. [Confirmed: docs/oracle/reports/2026-10-20-developer-local-auto-signin.md]
- Plan and app support for connectors varies; to be verified at audit. [Approximate]

## Challenges to locked decisions
- D-034 — it allows AI changes without confirmation if undoable, but was written for Oracle's own advisor, and the chat-add-cards report (2026-11-12) already moved to a per-suggestion click and asked for amendment (not yet recorded) — owner should confirm the rule for external Claude edits; I propose "small edits direct with undo, large need a yes, destructive not offered".
- O-002 (open, not locked) — multi-user write races are unvalidated; more relevant once outside edits exist.
- No other conflicts found. D-001, D-005, D-009, D-020, D-026, D-033, D-039, D-050 are respected.

## Open questions
- Q1 Large edits: ask first always, above a size (recommended ~10), or never?
- Q2 Moving copies between decks: Claude does it, or only suggests? (recommend suggest only)
- Q3 "Recent changes by Claude" list with Undo in Oracle on day one? (recommend yes)
- For Gene: reconcile D-034 with the chat-add-cards rule before Gate 2.

## Verification
- Read AGENTS.md, process.md, decisions.md (D-001 to D-059, open items), the use-what-i-own brief for format, and the chat-add-cards and local-auto-signin reports. No code or data touched; documentation only.
- No tests run (documentation only).
