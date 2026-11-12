# Report: Deck health S5, chat answer
Role: Developer
Status: DONE (branch `deck-health-s5`, pushed, not merged)

Task as received: Build slice S5 ("Chat answer") of Phase 2 Deck health in the Oracle app. Branch deck-health-s5 off current main (S1-S4 and the chat restyle are all merged); push it; do NOT merge. Implement exactly S5: a read-only get_deck_health chat tool returning the same numbers as the Deck health route for the same deck (roles, typical numbers, source label, spare/other-deck/buy-idea summaries as the contract says); registered as read-only and in DECK_CHAT_ONLY_TOOLS; the panel's 'Chat about this' buttons open the Oracle chat panel (existing open mechanism) with a pre-filled/sent question about the deck or that role; card questions use the existing owned-copies tools; chat never offers to add a card (suggest-only). Chat answers must follow the brief's instructor/collaborator tone and show the source label. Check check_owned_copies / browse_spare_copies regression tests still pass. Tests per contract section 7 S5 with fixtures, never the owner's live data. Run typecheck, lint, unit tests. (Remaining instructions: report, status, commit, push.)

## Summary for the owner

You can now ask Oracle's chat "what is my deck missing?" and it answers with the same numbers as the Deck health panel, and says where the typical numbers come from (for example "EDHREC average deck, 21,789 decks" or "General guide"). The panel now has a small "Chat about this" button in the top card, and another inside each role you open; clicking one closes the panel, opens the Oracle chat and asks the question for you. The chat only suggests: it never adds, swaps or removes a card, and for specific cards it checks what you own first.

## Owner check steps

1. Open a deck, then Deck health. Note the headline and the numbers (for example "Removal 3 of 8").
2. Click the small "Chat about this" button in the top card. The panel closes, the chat opens and the question "What is my deck missing? Check my deck health." is sent.
3. Compare the answer with the panel: same Light roles, same numbers, and the source line is mentioned.
4. Also type "what is my deck missing?" yourself in the chat while viewing the deck; the answer should match.
5. Open a Light role (for example Removal), click its "Chat about this". The answer should list spare cards first, then cards in another deck (deck name), then buy ideas with "estimate" prices.
6. Ask "add Swords to Plowshares for me". It should not claim it added anything; it can only suggest.
7. If the chat is already answering something, the button's question is ignored until it finishes (existing chat behaviour); click again after.

## Changed files

- `src/lib/deck-health-chat.ts` (new): the chat answer (verdict, source line, Light roles, closing line) and the optional per-role summary; uses the same loaders as the health and gap routes.
- `src/lib/deck-health-chat-question.ts` (new): the two questions the buttons send.
- `src/lib/tool-registry.ts`: new read-only `get_deck_health` tool; added to `DECK_CHAT_ONLY_TOOLS`; the two sets are now exported for tests; `browse_spare_copies` description names `wipes`.
- `src/lib/deck-chat-prompt.ts`, `src/lib/oracle-prompt.ts`: new `DECK_HEALTH_RULES` (call the tool first, say the source, collaborator and instructor tone, owned-copies tools for cards, suggest only), added to both the per-deck chat and the Oracle panel prompt.
- `src/contexts/OracleContext.tsx`: `useOracleOptional` (returns nothing outside the chat provider).
- `src/components/HealthStrip.tsx`, `DeckHealthPanel.tsx`, `GapDetail.tsx`: the small "Chat about this" buttons (verdict card; role header). No button where the chat is unavailable.
- Tests: `src/lib/deck-health-chat.test.ts` (19 with the UI file below), `src/components/HealthStrip.chat.test.tsx` (4).
- `docs/oracle/status.md`.

## New decisions made (need owner confirmation)

- The per-role "Chat about this" button sits in the role detail header (under the source line), not on the overview rows, because those rows are already buttons.
- In the Oracle chat the answer is plain text. The contract's "each gap as a button" in chat is not built; the structured result is returned to the model and it writes the answer.
- With a role, the tool returns at most 8 names per group (spare, other deck, buy ideas); the owned-copies tools give more.

## Assumptions

- "Read-only" is enforced by behaviour and tests (only selects run; not an editing tool; deck chat only); there is no separate read-only flag in the registry.
- The Oracle side panel (not the old Chat tab) is the chat that opens, as the existing open mechanism.

## Challenges to locked decisions

- none

## Open questions

- Should chat answers show each Light role as a clickable button, as the spec section 6 describes? It would need a custom chat message type; deferred.

## Verification

- `npx vitest run`: 2,773 passed, 42 skipped (including the existing `check_owned_copies` / `browse_spare_copies` tests and the 23 new ones).
- `npx tsc --noEmit`: only the known error in `docs/oracle/contracts/card-state-actions.examples.ts`.
- `npx eslint src`: 0 errors (248 warnings, existing).
- S5 contract tests: tool returns the same numbers as the route for the same deck (EDHREC source and General guide); registered in `DECK_CHAT_ONLY_TOOLS`, offered only in the deck chat, read-only (a recording fake database sees selects only); another user's deck gives not found; a failure gives an error, never an all-fine answer.
- Not run: browser E2E (no separate test account), a live chat with the real model, and screenshots (the button is small and uses existing button styling; I did not render it).
- No migrations. No EDHREC calls added.

## Process slips

- I trimmed one just-created file with a short python script instead of the edit tool; visible in the diff, no other effect.
