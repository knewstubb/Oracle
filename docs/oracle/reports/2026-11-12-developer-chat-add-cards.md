# Report: chat-add-cards
Role: Developer
Status: PARTIAL
Task as received: Build all four slices of docs/oracle/contracts/chat-add-cards.md on branch `chat-add-cards`, committing after each slice. Owner answers (approved 2026-11-12): chat can add cards the owner does not own (planned slot plus a "you don't own this" note); keep the small "+" but give it the same checks; past 100 cards allowed with a warning; cuts and swaps out of scope; proposals and Undo live 24 hours. Nothing changes until the owner clicks Add; the model can never confirm; the write route is not a model tool. Do not edit decisions.md. Any database change needs owner approval: write the migration, do not apply it.

## Summary for the owner
The chat can now suggest cards with an Add button on each one, plus "Add all", "Not now" and Undo. Nothing changes in a deck until you click Add, and the chat cannot click for you. It will not work end to end until you approve and apply one database migration, which I wrote but did not apply. Until then the chat falls back to suggesting cards in words only. The look of the suggestion cards is my own first pass, because no Designer spec existed.

## Changed files
- supabase/migrations/20261112120000_chat_card_proposals.sql — DRAFT, NOT APPLIED. New table for suggestions plus two functions that add or undo a batch in one step.
- src/lib/chat-proposal-types.ts, chat-proposal-check.ts, chat-card-proposals.ts — suggestion types, the server-side card checks, and the model's propose tool logic.
- src/lib/chat-proposal-confirm.ts, chat-proposal-route.ts — confirm, dismiss and undo logic and shared request handling.
- src/app/api/decks/[id]/chat-proposals/confirm, undo, dismiss routes — the only places a suggestion becomes a deck change. They need a logged-in owner and are not model tools.
- src/lib/tool-registry.ts, tool-executor.ts, tool-types.ts — the `propose_deck_cards` tool (deck chat only, results go to the page, never carry an id to the model).
- src/lib/deck-chat-prompt.ts, oracle-prompt.ts — the chat now proposes cards with Add buttons, never claims an add before the click, and outside a deck says "Open a deck and I can add cards to it."
- src/components/ChatProposalCards.tsx — the suggestion cards and their states.
- src/components/OracleSidebar.tsx, brew-v2/ChatPanel.tsx, DeckChatTab.tsx, src/contexts/OracleContext.tsx, src/hooks/useDeckChat.ts, src/lib/debrief-types.ts — show proposals in both chats; the sidebar's old automatic add/remove handler is removed.
- src/app/api/oracle/chat/route.ts, src/app/api/decks/[id]/chat/route.ts — forward proposal events only.
- src/app/api/decks/[id]/cards/route.ts — optional `checked` flag so the small "+" gets the same checks; also returns the new card count.
- Tests: chat-card-proposals.test.ts, chat-proposal-confirm.test.ts, ChatProposalCards.test.tsx, chat-add-slice4.test.ts, plus four existing tests updated for new wording; tests/e2e/chat-add-cards.spec.ts (written, not run).

## New decisions made (need owner confirmation)
- Proposals are capped at 10 per call and 30 pending per deck.
- A blocked card (already in deck, in maybeboard, outside colours, not legal, not found, colours unknown) shows its reason and has no Add button. Unknown colours fail closed.
- The "+" now blocks duplicates and off-colour cards with a short message instead of adding silently.
- Extra table columns beyond the contract draft: created categories, undone time, and a `source` of 'ai'.
- The confirm path does not take the "reached N cards" version snapshot that the plain add route takes.

## Assumptions
- Planned slots are rows with no copy and no ownership status, so a chat add never moves a copy you own.
- Chat adds are recorded in the new table (source 'ai'), since the existing placement source only covers copies.
- Visuals reuse existing Tailwind and shadcn styling and are provisional.

## Challenges to locked decisions
- D-034 — it says chat edits are applied without a per-card click. The owner's rule now is an explicit click per proposal. Suggested change: amend to "adds need an explicit per-proposal click; undo and source='ai' remain". I did not edit decisions.md.

## Open questions
- Please approve and apply the migration. Without it the propose tool's count/insert fails and the chat suggests in words only.
- Should the Designer produce a spec and mockup for the suggestion cards? The contract asks for it first; none was found.
- Should the confirm path also take the milestone version snapshot?

## Verification
- npm test (vitest run) — 242 files passed, 2877 tests passed, 42 skipped.
- tsc --noEmit — only the known error in docs/oracle/contracts/card-state-actions.examples.ts.
- eslint src tests (errors only) — clean.
- The SQL in the migration is NOT tested; tests use a plain-code copy of its rules.
- Browser check on port 3100 not done: it needs the unapplied migration, a login and a live AI key. The Playwright spec is written but not run.
- No new environment variable names. The old chat-edit setting stays off.

## Owner check steps
1. Approve the migration, apply it, then start the app on this branch.
2. Open a deck and ask the chat for 3 cards. Check the deck is unchanged.
3. Click Add on one. See "Added", then see the card in the deck as a planned slot; a copy you own elsewhere stays where it was.
4. Click Undo. The card disappears again.
5. Ask for a card already in the deck, or outside its colours. It shows a reason and no Add button.
6. Ask for a card you do not own and click Add. It is added with the "you don't own this" note.
7. Click the small "+" next to a card already in the deck. You get a short message and nothing is added.
8. In the sidebar chat with no deck open, ask it to add a card. It tells you to open a deck.
