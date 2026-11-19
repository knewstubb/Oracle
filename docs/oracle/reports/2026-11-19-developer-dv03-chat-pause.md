# Report: dv03-chat-pause
Role: Developer
Status: DONE
Task as received: DV-03, pause the in-app AI chat, in the Oracle app (owner decision 2026-11-19: Claude through the connector is the advisor; the in-app chat is paused, not removed; one switch; stop all paid AI calls while paused; the pause also covers the new-deck brewing chat).

## Summary for the owner
The in-app chat is now paused. The Oracle button, the side panel, the "Chat about this" buttons, the "Help me find one" option in New Deck, the "Start a conversation with Oracle" card on Explore and the Brew Deck link are all gone, and the new-deck brewing page sends you to Explore. If an old browser tab is still open, the app answers "paused" and does not contact the paid AI service. Nothing was deleted, so bringing the chat back is one setting.

## How to bring the chat back (plain words)
In Vercel (Project, Settings, Environment Variables) add a setting called `NEXT_PUBLIC_AI_CHAT_ENABLED` and give it the value `true`, then redeploy. Locally, put the same line in the `.env.local` file and restart the app. Remove the setting, or set anything other than `true`, to pause again. If the setting is missing, the chat is paused. The redeploy is needed because the setting is read when the app is built.

## What to check in 3 minutes
1. Open any page: the top bar has no chat icon (desktop or phone width), and no panel opens with Cmd+Shift+O.
2. Open a deck and its health strip in the footer: no "Chat about this" button.
3. Click New Deck, pick Commander: only "Search for a commander" is offered, no "Help me find one".
4. Open Explore: no "Start a conversation with Oracle" card, and "Browse Commanders" starts right under the header with no gap. Picking a commander still creates the deck.
5. Go to the new-deck brewing page (`/new-deck`): it sends you to Explore.
6. The deck page, its tabs, the Strategy window and the connector are unchanged.

## Where the paid AI service is called from
Paused now (each returns HTTP 503 `{"error":"paused"}` as its first step, before login, database or any outbound call):
- `/api/oracle/chat` (side panel chat)
- `/api/oracle/sessions/[id]/generate-name` (names a chat session)
- `/api/decks/[id]/chat` (deck chat)
- `/api/brew/chat`, `/api/brew/extract`, `/api/brew/assess`, `/api/brew/skeleton` (new-deck brewing chat)
- `/api/ai/brew/start`, `/api/ai/brew/generate`, `/api/ai/brew/investigate`, `/api/ai/brew/refine` (older brew flow)

Left running because they do not call the paid AI service [Confirmed: search for provider factory, adapters, Anthropic/Gemini clients in src]:
- The Claude connector (`/api/connector/*`, pending changes, Undo, Recent changes). It lets Claude call the app; the app makes no paid call.
- Card-data jobs and prices (`/api/card-data/*`, `/api/cron/refresh-prices`, Scryfall, EDHREC, Archidekt, Card Kingdom).
- `/api/ai/search`, `/api/ai/recommend`, `/api/ai/build-deck`, `/api/ai/mana-analysis`, `/api/ai/brew/confirm|save|session`, `/api/brew-sessions`, `/api/oracle/sessions` (list, active, history), chat-proposals: own database or own logic only.
- `scripts/distill-single-commander.ts`: a manual script, not part of the running app. It still uses the key if someone runs it by hand.
- No background job calls the AI service (the only cron is the price refresh).

## Changed files
- src/lib/ai-chat-switch.ts (new) — the one place that reads the setting; `isAiChatEnabled()` and the plain "paused" answer.
- 11 route files under src/app/api (list above) — a two-line refusal at the top of each POST.
- src/app/layout.tsx — the side panel is not mounted while paused (page area keeps its full width).
- src/components/TopNav.tsx — Oracle button (desktop and phone) hidden while paused; neighbours close up.
- src/contexts/OracleContext.tsx — while paused: open, toggle, the Cmd+Shift+O shortcut and sendMessage do nothing, a stored "panel open" is ignored, no session is loaded. This also covers the auto-open on /decks/new and Explore.
- src/components/HealthStrip.tsx — "Chat about this" not offered while paused (it already hides itself when no handler is given; this feeds DeckHealthPanel and GapDetail).
- src/app/explore/page.tsx — the Oracle card is not shown while paused; the spacing above Browse Commanders is removed with it.
- src/components/NewDeckModal.tsx — "Help me find one" hidden while paused.
- src/components/MobileHeader.tsx — "Brew Deck" link hidden while paused (component is currently not mounted anywhere).
- src/app/new-deck/layout.tsx (new) — while paused, redirects /new-deck to /explore. This leaves the page itself untouched.
- src/test/setup.ts — tests default to the switch ON so existing tests keep checking the old behaviour.
- src/lib/ai-chat-switch.test.ts, src/components/ai-chat-pause.test.tsx, src/contexts/OracleContext.paused.test.tsx (new) — paused and on tests.

Deck page: not edited. The deck page has no chat tab, so no tab bar change was needed. The deck page still sets chat context, which now does nothing visible. `OracleChat`, `DeckChatTab`, `useDeckChat`, `OraclePromptCard` and the Picklist components are untouched.

## New decisions made (need owner confirmation)
- Setting name `NEXT_PUBLIC_AI_CHAT_ENABLED`, paused unless exactly `true`.
- Paused routes answer HTTP 503 with a short message "The in-app chat is paused. Ask Claude through the connector instead."
- Explore keeps its commander browser; only the chat card goes. Saved drafts that point at the brewing page (draft tiles) are not mounted anywhere today; if they get mounted later they would land on Explore.

## Assumptions
- "Ask Claude fills the chat" link refers to the HealthStrip "Chat about this" (the only link that sends a question into the chat). No other such link exists [Confirmed: search of src].
- `OracleChat` and `DeckChatTab` are not mounted on any page, so there was nothing to hide there; the side panel mount was the real entry point.

## Challenges to locked decisions
- none

## Open questions
- Should the "Settings" page get a line telling you the chat is paused? Not added.

## Verification
- `npx vitest run` — 317 files passed, 6 skipped; 3903 tests passed, 0 failed (includes the new tests; ImportIntentFlow flag test passed in this run).
- `npx tsc --noEmit` — only the 4 known AddToPicklist.test.tsx errors.
- `npx eslint src` — 1 error, pre-existing (`<a>` to /storage/missing in an untouched file); 0 errors in the files I changed.
- New tests: all 11 routes answer 503 "paused" with zero AI client constructions and zero fetch calls when paused, and are not refused when on; top bar, Explore card, HealthStrip button, context open/shortcut/send are covered both ways.
