# Report: uwio-oracle-chat (Use what I own, app-wide Oracle assistant)
Role: Developer
Status: DONE (live chat and real database untested, see Verification)
Task as received: Owner tested the chat on a deck page and asked "Which cards are proxies in this deck?". The answer said it had no proxy data (it called get_deck_cards). Cause: slices (a) and (b) of docs/oracle/briefs/use-what-i-own.md were built only into the per-deck chat route src/app/api/decks/[id]/chat (hook src/hooks/useDeckChat.ts), but the chat the owner uses is the app-wide Oracle assistant (src/contexts/OracleContext.tsx -> POST /api/oracle/chat). Confirm which UI surfaces call which route (and whether the per-deck route is reachable), then give the Oracle assistant the same behaviour when it has a deck context: (1) proxy/gap facts block, (2) the Spare / In another deck / Unowned lookup tool with the same prompt instruction and order, (3) suggest-only with edit tools gated behind ORACLE_DECK_CHAT_EDIT_TOOLS, kept in code, check whether the UI applies add_cards/remove_cards events; make get_deck_cards return proxy status. Outside a deck context keep behaviour. Share code, no import code, no migrations/data/screens. Worktree `../oracle_app-uwio-oc`, branch `uwio-oracle-chat` from main. Mock-only tests, `npm run check`, trailer, this report, no merge.

## Summary for the owner
The chat panel you use now behaves like the deck chat we built: when you are on a deck page it knows which cards are proxies, can sort suggested cards into spare / in another deck (with a warning) / not owned (estimate or "no price"), and it only suggests changes; it will not add or remove cards or claim it did. Outside a deck page nothing changes. I have not tried it in the live app; please test on the test account.

## Which screen uses which chat
- The app-wide Oracle assistant (sidebar, `OracleContext`) posts only to `/api/oracle/chat`. [Confirmed: src/contexts/OracleContext.tsx line ~495]
- The per-deck route `/api/decks/[id]/chat` is called only by `useDeckChat`, which is used only by `DeckChatTab`. `DeckChatTab` is not imported by any page or component (only mentioned in a comment in `DeckCanvas.tsx`). The only link to a `/decks/[id]/chat` screen is the Upgrade tab's "Discuss" button, and no such page exists (dead link). So **the per-deck chat route is not reachable from any screen today.** [Confirmed: grep of src; src/app/decks/[id]/ has only page, loading, error]
- Does the UI APPLY `add_cards` / `remove_cards`? **Yes.** `OracleContext` receives those stream events and calls `POST /api/decks/{id}/cards/batch` to change the deck for real, then refreshes. [Confirmed: src/contexts/OracleContext.tsx ~561-598] So gating the edit tools here matters: with the setting on, the assistant really edits decks (no undo). The per-deck route only forwarded status events, so it never applied anything.

## Changed files
- src/app/api/oracle/chat/route.ts — when context is a deck with an id: checks the deck belongs to the signed-in user, loads the proxy/gap facts (reusing `loadDeckSlotFacts`), passes the deck id to tools (server-set), and uses the deck-chat tool set. Any other context unchanged.
- src/lib/oracle-prompt.ts — optional deck-chat input: adds the facts block, the shared suggest-only rules and the shared Spare / In another deck / Buy rules (same text, imported from `deck-chat-prompt.ts`), placed last so they win over older tool guidance. The "MODIFYING THE DECK" text is kept in code but only included when the edit setting is on.
- src/lib/tool-registry.ts — `get_deck_cards` now returns `copy_status` per card (proxy / real / no_copy_sleeved / generic_basic_land / maybeboard / unknown); its description says proxy data is available. If the proxy lookup fails it returns `unknown`, never a guess.
- src/lib/deck-chat-facts.ts — new shared `classifyDeckCardCopy`; the facts block and `get_deck_cards` now use the same rule (facts output unchanged; existing tests pass).
- src/lib/oracle-deck-chat.test.ts — 11 new mock-only tests.
- docs/oracle/reports/2026-11-02-developer-uwio-oracle-chat.md — this report.

Reused as is: `check_owned_copies` (owned-copy-lookup.ts), the `ORACLE_DECK_CHAT_EDIT_TOOLS` gate, the executor refusal of gated tools, `DECK_CHAT_CONTEXT`. Not touched: import code, migrations, data, screens, the per-deck route.

## New decisions made (need owner confirmation)
- A deck-page Oracle chat now uses the `deck-chat` tool set, so edit tools (add/remove/update cards) are off there by default; previously the assistant could edit decks directly from the sidebar. Turn back on with `ORACLE_DECK_CHAT_EDIT_TOOLS=true` (also removes suggest-only wording). Other pages' behaviour unchanged.
- A deck id the user does not own falls back to the old behaviour (no facts, no lookup).

## Assumptions
- Context type `deck` with a numeric `deckId` is "a deck context". Brew/workbench contexts (also able to edit) are not changed.
- Everything else in the proxy/gap and lookup logic is as in slices (a) and (b).

## Challenges to locked decisions
- none

## Open questions
- Remove the unreachable per-deck chat route/hook/tab, or wire the dead "Discuss" link? Not done (out of scope, screens).
- If the setting is turned on, edits are applied with no undo (D-034 undo not built).

## Verification
- `npm run check` — exit 0: 209 test files passed (5 skipped), 2422 tests passed (42 skipped); typecheck clean; lint 0 errors (existing warnings).
- New tests (mock only): facts block present; suggest-only default; Spare, In another deck (warning), Buy order; modify text kept and suggest-only dropped when on; unchanged outside deck / without options; tool list (lookup offered in deck context, edit tools hidden, return when on, not offered elsewhere); `get_deck_cards` marks proxy / real / no copy and `unknown` on lookup failure.
- UNTESTED: the live assistant (whether the model now answers the proxy question, calls the lookup once, keeps order and warnings), the real database join, and the route handler itself (no route test; only its pieces). Please ask on the test account: "Which cards are proxies in this deck?", then a replace-a-proxy question, then "add Sol Ring" (should refuse and suggest only).
- Branch `uwio-oracle-chat`, not merged. `npm ci` run only in the new worktree.
