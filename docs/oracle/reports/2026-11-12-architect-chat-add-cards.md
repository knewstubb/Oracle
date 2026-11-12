# Report: chat-add-cards
Role: Architect
Status: DONE
Task as received: Owner decision (2026-11-12, approved in chat): the Oracle chat should be able to ADD cards to a deck, but ONLY after the owner explicitly confirms each proposal. Owner problem: he said 'Chat cannot add' after the chat suggested cards. Deliver a short contract at docs/oracle/contracts/chat-add-cards.md covering (1) audit of reusable pieces, (2) behaviour, (3) safety boundary, (4) slice plan and tests. No code changes. Report with Challenges flagged, open questions listed.

## Summary for the owner
The chat will propose cards as small cards with an Add button; nothing changes until you click it, and every add can be undone. The chat currently says it cannot add because its instructions forbid it, and the only add control today is a tiny "+" next to card names that does no checks. The contract sets out four small builds, starting with checking that a card is real, not already in the deck and inside the commander's colours.

## Changed files
- docs/oracle/contracts/chat-add-cards.md — new contract
- docs/oracle/reports/2026-11-12-architect-chat-add-cards.md — this report

## New decisions made (need owner confirmation)
- Confirmation is a per-card (or Add all) click on a proposal card; the model never holds the means to write.
- Proposals live in a new table with a single-use id and 24-hour expiry (migration draft not written yet).
- Undo removes the exact slot added, only if it is still a plain planned slot; otherwise the owner removes it on the deck page.
- Over 100 cards after an add: allowed, with a note.
- Cards not in the owner's collection can be proposed and added (they show as Unowned cards, D-059).

## Assumptions
- The chat acts on the deck page currently open; no deck open means no Add.
- `apply_ai_deck_delta` does not record `source = 'ai'` on added slots [Approximate; body not fully read].
- Chat undo only needs single-slot removal because added slots are planned (no copy attached).

## Challenges to locked decisions
- D-034 — it says the advisor may change a deck directly with no confirmation step, undoable. The owner's 2026-11-12 decision requires confirmation for adds. Separately, the "suggest-only, edit kept but switched off" stance is recorded only in status.md (owner-approved 2026-11-02), not as a numbered decision, so there is nothing to reverse there, but the code and prompts enforce it [Confirmed: src/lib/deck-chat-prompt.ts, src/lib/tool-registry.ts]. Suggested change: amend D-034 to "adds need an explicit per-proposal confirmation click; undo and source = 'ai' remain required". decisions.md not edited.
- Finding, not a challenge: D-034's undo requirement was never built [Confirmed: no undo path found], so this slice is where it first appears.

## Open questions
- Q1: Should the existing small "+" next to card names keep working (with the new checks) or go away? Recommended: keep it, add the checks.
- Q2: If an add takes the deck past 100 cards, allow with a note (assumed) or block?
- Q3: Should cards the owner does not own be addable from chat (assumed yes, shown as Unowned)?
- Q4: Should chat later be able to propose cuts and swaps the same way?
- Q5: Is 24 hours the right life for a proposal and its Undo?

## Verification
- Read AGENTS.md, role files, decisions register, status, T-15 contract; read deck chat prompt, tool registry, both chat routes, sidebar, context, add routes, batch route, delete route — no code run; no files outside docs changed.
- process.md and the daily-use brief were not read in full (only listed/skimmed via grep); the contract was scoped from the task's request and the code.
