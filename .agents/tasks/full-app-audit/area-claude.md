# Audit: Claude connector, in-app chat (paused), Anthropic API use
Role: audit subagent (read-only). Branch main. Date of audit: 2026-11-22 (latest repo activity seen: 2026-11-21).
Method: import graph and caller search with grep over `src`, `scripts`, `tests` (callers counted outside tests and outside the route's own folder), git log dates, reading the notes. No tool such as knip was run. Nothing in the repo was changed except this file.

Summary in plain words:
- The Claude connector is live, registered and tested: 22 tools, an `/mcp` endpoint, sign-in, a settings page with three tabs, a header chip and deck-page notes.
- Two of the connector's approved features have no tools yet: Claude running the Picklist and storage (CC-16) and Claude importing decks (CC-17). The backlog says "approved, planning underway", which matches the code.
- The in-app chat is paused by one switch that is off. The pause only hides the entry points and blocks 11 routes. Roughly 25 files of chat and brew code are either unreachable already or reachable only if the switch is turned on.
- About 13 AI routes have no caller anywhere. Three of them still need a separately installed server program (`uvx mtg-mcp-server`) that is not part of the app. None of the 13 can spend Anthropic money today.
- Paid AI calls (Anthropic, Gemini, DeepSeek) all go through the 11 paused routes plus one manual script. [Confirmed: src/lib/provider-factory.ts, src/lib/adapters/*, scripts/distill-single-commander.ts]

---

## 1 Inventory table

STATE key: LIVE = live and used; HIDDEN = live code behind a switch; DEAD = dead code (no caller / never mounted); SUPERSEDED; ABANDONED; HALF = half-built; NOT BUILT = approved or listed in notes, no code.
"Agree?" compares backlog / backlog-details / decisions with the code.

### 1A Connector: pages, endpoints and screens

| # | What it is | Where the user reaches it | STATE | Evidence | Notes | Agree? |
|---|---|---|---|---|---|---|
| 1 | The connector address Claude talks to (`/mcp`): read and edit tools, sign-in check, rate limits | Claude app / Claude Code, via the connector address shown in settings | LIVE | [Confirmed: src/app/mcp/route.ts, src/lib/connector/handle-request.ts] | backlog-details CC-04, CC-05; specs/claude-connector.md; contracts/claude-connector-slice-a/b | Yes |
| 2 | Sign-in discovery pages (`/.well-known/oauth-protected-resource` and `.../mcp`) | Claude's sign-in handshake, no screen | LIVE | [Confirmed: src/app/.well-known/oauth-protected-resource/route.ts, .../mcp/route.ts, src/lib/connector/public-paths.ts, src/middleware.ts] | CC-04a; reports/2026-11-16-architect-claude-connector-audit.md | Yes |
| 3 | "Allow Claude?" approval screen shown when Claude first connects | Opens from Claude during connecting | LIVE (live click-through never recorded as done) | [Confirmed: src/app/oauth/consent/page.tsx, actions.ts, src/lib/connector/consent.ts, __tests__/consent.test.ts] | CC-05 says one owner step remains: 12-step click-through in drafts-gate5-claude-connector.md | Mostly. CC-05 line still lists an open owner step; no later note closes it [Approximate] |
| 4 | Settings page "Claude connector" with tabs Connection (on/off, Needs reconnecting), Recent changes, Setup guide | Settings > "Open Claude connector" | LIVE | [Confirmed: src/app/settings/claude-connector/page.tsx, src/app/settings/page.tsx:52-60, src/components/connector/ConnectionTab.tsx, RecentChangesTab.tsx, SetupGuideTab.tsx] | CC-04d, CC-03; specs/claude-connector.md; mockups/claude-connector.html | Yes |
| 5 | Header chip showing how many Claude changes await a yes | Top of every page when something is pending | LIVE | [Confirmed: src/components/connector/PendingChip.tsx, mounted via PageHeader.tsx] | CC-04b | Yes |
| 6 | Pending approvals list (approve / decline big edits and card moves) | Recent changes tab; chip | LIVE | [Confirmed: src/components/connector/PendingCard.tsx, src/app/api/connector/pending/[id]/approve|decline/route.ts] | CC-04b | Yes |
| 7 | "Changed by Claude" notes on a deck: change list on the deck page, "moved to another deck" note on a slot, live banner when Claude changes the open deck | Deck page, History panel, card groups | LIVE | [Confirmed: src/components/connector/DeckClaudeChanges.tsx, MovedSlotNote.tsx, src/components/LiveChangeNote.tsx, src/hooks/useClaudeChangeWatch.ts, useLiveRefresh.ts; used in src/app/decks/[id]/page.tsx, CardGroupSection.tsx, VersionHistoryPanel.tsx] | CC-04b, CC-26 slice 2 ("reason on every Claude change"), D-063, plans live-refresh 2026-11-19 | Yes |
| 8 | "Why Claude did it" reason shown on each Claude change | Recent changes, deck History | LIVE | [Confirmed: src/components/connector/ClaudeReason.tsx, src/lib/connector/change-reason.ts, __tests__/claude-reason.test.ts] | briefs/claude-change-reason.md; reports/2026-11-19-developer-slice-2-claude-reason-history.md | Yes |
| 9 | Connector owner API: `/api/connector/enable` (switch on) | Connection tab | LIVE | [Confirmed: src/app/api/connector/enable/route.ts called from src/components/connector/api.ts] | CC-04d | Yes |
| 10 | `/api/connector/revoke` (switch off) | Connection tab | LIVE | [Confirmed: route + api.ts, __tests__/revoke.test.ts] | CC-04d | Yes |
| 11 | `/api/connector/status` | Connection tab | LIVE | [Confirmed: route + api.ts, __tests__/connection-status.test.ts] | CC-04d | Yes |
| 12 | `/api/connector/changes` (Recent changes list) | Recent changes tab | LIVE | [Confirmed: route + api.ts] | CC-04b | Yes |
| 13 | `/api/connector/changes/marker` ("seen up to here" marker) | Recent changes tab, chip | LIVE | [Confirmed: route + api.ts, __tests__/change-marker.test.ts] | CC-04b | Yes |
| 14 | `/api/connector/changes/[id]/undo` (owner's Undo) | Undo button | LIVE | [Confirmed: route + api.ts] | CC-04b | Yes |
| 15 | `/api/connector/moved-slots` | Deck page "moved" notes | LIVE | [Confirmed: route + api.ts] | CC-04b | Yes |
| 16 | `/api/connector/pending` and `/pending/count` | Chip, Recent changes | LIVE | [Confirmed: routes + api.ts] | CC-04b | Yes |
| 17 | `/api/connector/pending/[id]/approve` and `/decline` | Approve / decline buttons | LIVE | [Confirmed: routes + api.ts] | CC-04b | Yes |
| 18 | Live test against a real connector token (`mcp.live.test.ts`) | Developer runs by hand with `RUN_LIVE_CONNECTOR_TESTS=1` | LIVE but skipped by default | [Confirmed: src/lib/connector/__tests__/mcp.live.test.ts] | TEST-02 says live Claude scenarios were never run | Yes |

### 1B Connector tools (22 registered, one row each)
Registered in one list. A test fails if the list changes without the contract changing. [Confirmed: src/lib/connector/tools/index.ts, __tests__/registry-and-isolation.test.ts:24-39] "Tested" means a connector test file names the tool or its helper. "Documented" means a contract or backlog line describes it.

| # | Tool | What Claude can do with it | Reachable | Tested | Documented | STATE | Notes | Agree? |
|---|---|---|---|---|---|---|---|---|
| 1 | get_collection_summary | Counts of the collection, optionally grouped | Yes (/mcp) | collection-summary-groups.test.ts, tools.test.ts | contracts/claude-connector-slice-a, connector-collection-search | LIVE | CC-07 | Yes |
| 2 | search_collection | Search owned cards by name, type, colour, text, rarity and more | Yes | collection-search-filters/cc14, rules-text-match, card-tags-search, rarity-in-tools tests | connector-collection-search contract, CC-14 | LIVE | CC-07, CC-14 (build started per backlog "More Claude improvements"; code and tests exist) | Backlog says "build started", code looks built; wording is stale [Approximate] |
| 3 | list_decks | List decks with commander colours, format, status | Yes | list-decks-order.test.ts, deck-status-wording.test.ts | slice-a, CC-12, CC-14 | LIVE | | Yes |
| 4 | get_deck | One deck with its cards, status, facts | Yes | tools.test.ts, facts-in-tools, deck-rarity-pauper-why | slice-a, CC-06 | LIVE | | Yes |
| 5 | get_deck_health | Same Deck health check as the screen, six rows | Yes | deck-health-live.test.ts | connector-card-facts-and-deck-health contract, CC-06, D-061 | LIVE | | Yes |
| 6 | list_deck_cards_by_ownership | Proxy / not-owned cards, optionally per deck | Yes | ownership.test.ts, rarity-in-tools | slice-a ownership extension | LIVE | | Yes |
| 7 | get_buying_list | Shopping list for what decks lack, with price estimates | Yes | buying-list.test.ts | contracts/claude-connector-cc18-buying-list, CC-18, CC-19 | LIVE (not tried in a real Claude chat) | Wishlist half is NOT BUILT | Yes (backlog states the wishlist is not built) |
| 8 | add_cards_to_deck | Add cards as Planned slots (up to 120 at once) | Yes | edit-tools.test.ts | slice-b, CC-13 amendment | LIVE | | Yes |
| 9 | remove_cards_from_deck | Take cards off a list (destructive hint) | Yes | edit-tools.test.ts | slice-b | LIVE | | Yes |
| 10 | set_card_zone | Move cards between main list and Maybeboard | Yes | edit-tools.test.ts | slice-b | LIVE | | Yes |
| 11 | set_card_category | Change a card's categories | Yes | edit-tools.test.ts | contracts/claude-connector-deck-category, CC-22 | LIVE | | Yes |
| 12 | create_deck | Create an empty deck | Yes | edit-tools.test.ts | contracts/claude-connector-cc15-deck-create, CC-15 | LIVE (backlog: "not yet checked in a real Claude chat") | | Yes |
| 13 | set_deck_setup | Set bracket, one-line summary, strategy text in the Strategy window | Yes | strategy-window-connector.test.ts, bracket.test.ts | D-062, CC-15 | LIVE | | Yes |
| 14 | set_card_why | Set "Why it's here" on a card | Yes | card-why-write.test.ts | CC-26 slice 2 | LIVE | | Yes |
| 15 | add_card_to_collection | Add one copy to the collection | Yes | edit-tools.test.ts | slice-b | LIVE | | Yes |
| 16 | sleeve_free_copy | Sleeve a free copy into an empty slot | Yes | edit-tools.test.ts | slice-b | LIVE | | Yes |
| 17 | make_slot_original | Swap a proxy for a free original | Yes | edit-tools.test.ts | slice-b | LIVE | | Yes |
| 18 | create_proxy_for_slot | Make a proxy for an empty slot | Yes | edit-tools.test.ts | slice-b | LIVE | | Yes |
| 19 | request_card_move | Move a sleeved copy from one deck to another | Yes | trade-places.test.ts, edit-tools.test.ts | slice-b; D-034a | LIVE | Name says "request", but the tool text says the move goes straight through with no approval | Backlog still says "card moves" wait for approval in CC-04b; tool text says "no approval needed". See section 4 |
| 20 | undo_change | Undo an earlier Claude change within 7 days (destructive hint) | Yes | edit-tools.test.ts | slice-b; D-034a | LIVE | | Yes |
| 21 | get_change_status | Check whether a pending change was approved, declined or expired | Yes | edit-tools.test.ts | slice-b | LIVE | | Yes |
| 22 | list_recent_changes | List the last 7 days of Claude changes with reasons | Yes | edit-tools.test.ts, claude-reason.test.ts | CC-04b, change-reason brief | LIVE | | Yes |
| 23 | (not registered) Picklist and storage tools: build and tick Picklists, create boxes, move copies | None | NOT BUILT | grep of tools/index.ts: none | CC-16 "APPROVED ... audit with CC-15"; backlog.md "Approved; planning underway" | Yes |
| 24 | (not registered) Import a deck via Claude from pasted text or a link | None | NOT BUILT | none | CC-17; backlog.md | Yes |
| 25 | (not registered) Wishlist, game logging, playgroup, category rename/merge, per-deck notes and decision log | None | NOT BUILT | none | CC-18 (wishlist), CC-08 (games), CC-11, backlog "More Claude improvements" | Yes |

Tool helper files in `src/lib/connector/tools/` that are not tools themselves (bracket, card-facts, card-printing-facts, card-tags-tool, collection-*, deck-colours, deck-strategy-read, rules-text-match, common) are imported by the registered tools or by each other. I did not find an orphan among them [Approximate: import check was by file name only for these; see section 6].

### 1C In-app chat (paused) and related screens

Switch: `NEXT_PUBLIC_AI_CHAT_ENABLED` must equal `true`. [Confirmed: src/lib/ai-chat-switch.ts] It is not set in `.env.local` or `.env.test.local`, and is not listed in `.env.local.example`, so the chat is paused locally. Vercel setting could not be seen.

| # | What it is | Where the user reaches it | STATE | Evidence | Notes | Agree? |
|---|---|---|---|---|---|---|
| 26 | Oracle side panel and top-bar Oracle button (chat about the collection or a deck) | Hidden in top bar; Cmd+Shift+O does nothing | HIDDEN | [Confirmed: src/components/OracleSidebar.tsx (921 lines, mounted in src/app/layout.tsx), src/contexts/OracleContext.tsx, src/components/TopNav.tsx] | DV-03, D-063, report 2026-11-19-developer-dv03-chat-pause | Yes |
| 27 | Chat session history list inside the panel | Inside the side panel only | HIDDEN | [Confirmed: src/components/SessionHistoryPanel.tsx imported only by OracleSidebar.tsx] | | Yes |
| 28 | Proposal cards in chat (add this card? confirm / undo / dismiss) | Inside chat only | HIDDEN | [Confirmed: src/components/ChatProposalCards.tsx used by OracleContext, OracleSidebar, brew-v2/ChatPanel, useDeckChat] | contracts/chat-add-cards.md, reports 2026-11-12 chat-add-cards | Yes |
| 29 | "Chat about this" button in the deck health strip | Hidden while paused | HIDDEN | [Confirmed: src/components/HealthStrip.tsx, src/lib/deck-health-chat-question.ts] | DV-03 | Yes |
| 30 | "Help me find one" in New Deck | Hidden | HIDDEN | [Confirmed: src/components/NewDeckModal.tsx] | DV-03 | Yes |
| 31 | "Start a conversation with Oracle" card on Explore | Hidden | HIDDEN | [Confirmed: src/app/explore/page.tsx; OraclePromptCard has no importer, see 32] | DV-03 | Yes |
| 32 | `OraclePromptCard` component | Nowhere | DEAD CODE | [Confirmed: grep: no import anywhere. Last touched 2026-08-14] | DV-03 report says "untouched"; Explore now builds its own card | Notes say "kept"; code is unmounted since before the pause |
| 33 | `OracleChat` (full-page chat component) | Nowhere | DEAD CODE (326 lines) | [Confirmed: no importer except a comment in src/lib/render-card-links.tsx] | DV-03 report: "not mounted on any page" | Backlog DV-03 lists it as an entry to "keep"; it was never mounted |
| 34 | `DeckChatTab` (deck chat tab) | Nowhere (deck page has no chat tab) | DEAD CODE (216 lines) | [Confirmed: no importer; only used by itself in docs/comments] | DV-03 report | Same as 33 |
| 35 | New-deck brewing chat page `/new-deck` (chat plus canvas, pick commander, save draft) | `/new-deck` redirects to Explore while paused | HIDDEN | [Confirmed: src/app/new-deck/layout.tsx, page.tsx (uses brew-v2/*)] | DV-03; report 2026-11-18-developer-rename-draft-to-brewing | Yes |
| 36 | Saved brew drafts as tiles (`DraftSessionTile`) | Nowhere | DEAD CODE (214 lines) | [Confirmed: no importer. Calls `/api/brew-sessions/[id]`] | DV-03 report says "not mounted anywhere today" | Yes |
| 37 | `MobileHeader` with "Brew Deck" link | Nowhere | DEAD CODE (168 lines) | [Confirmed: no importer; DV-03 report says the same] | | Yes |
| 38 | Brew canvas components (BrewCanvas, CandidateCard, DecisionCard, ExplorationArchive, BrewChatView, BrewTopbar, ChatPanel, CommanderDetailModal, ModelSelector) | Only through `/new-deck` (paused) | HIDDEN | [Confirmed: imports from src/app/new-deck/page.tsx; 8,240 lines in src/components/brew-v2 plus page] | roadmap T-08/T-09 Brew Canvas PARKED | Yes. Backlog.md also lists "Brew Canvas" as parked |
| 39 | `DeckCanvas` with Free-form / Piled / Curve layouts, used by the deck Workbench tab | Deck page > Workbench tab > layout toggle (Free-form, Piled, Curve) | LIVE (shared with brewing) | [Confirmed: src/components/WorkbenchTab.tsx:11,227-234 imports brew-v2/DeckCanvas; CanvasToolbar.tsx:105-108 offers Curve] | briefs/daily-use-deck-advisor.md; backlog-details O-003 "mana curve slider" not specced | **This is the Curve view you named: it is still on screen.** Backlog does not record it as dropped. Deck-area audit should rule on it; see section 2, item 12 |
| 40 | `SuggestionsTab` (159 lines) and `InlineAssessment` (138 lines) in brew-v2 | Nowhere | DEAD CODE | [Confirmed: no importer outside their own file] | | n/a |
| 41 | Model picker (Claude / Gemini / DeepSeek) in the brew top bar | Only in paused `/new-deck` | HIDDEN | [Confirmed: src/components/brew-v2/ModelSelector.tsx, src/lib/ai-models.ts] | | Yes |

### 1D AI routes under src/app/api (all Anthropic-capable routes marked)

"Guard" = starts with `aiChatPausedResponse()` and returns 503 while paused. [Confirmed: grep of all route files]

| # | Route | What it does | Caller | Guard | STATE | Evidence / notes | Agree? |
|---|---|---|---|---|---|---|---|
| 42 | /api/oracle/chat (562 lines) | Side-panel chat, streams from Anthropic/Gemini/DeepSeek, runs tools | OracleContext (hidden) | Yes | HIDDEN | [Confirmed: route.ts imports provider-factory, tool-registry] | Yes (DV-03) |
| 43 | /api/oracle/sessions, /active, /[id], /history | Saved chat sessions | OracleContext, SessionHistoryPanel (hidden) | No (database only) | HIDDEN | [Confirmed: grep] | Yes. DV-03 report says they stay on because they make no paid call |
| 44 | /api/oracle/sessions/[id]/generate-name | Names a chat session using the AI | OracleContext | Yes | HIDDEN | [Confirmed] | Yes |
| 45 | /api/decks/[id]/chat (224 lines) | Deck chat with tools | `useDeckChat` -> only `DeckChatTab` (dead) | Yes | DEAD (no mounted caller) | [Confirmed: useDeckChat imported only by DeckChatTab] | Backlog DV-03 says "keep"; nothing can reach it even with the switch on |
| 46 | /api/decks/[id]/chat-proposals/confirm, /undo, /dismiss | Accept, undo, dismiss a proposed card from chat | ChatProposalCards via chat-proposal-confirm.ts (hidden) | No | HIDDEN | [Confirmed] | Yes |
| 47 | /api/brew/chat (666 lines) | New-deck brewing chat (Anthropic) | new-deck page | Yes | HIDDEN | [Confirmed] | Yes |
| 48 | /api/brew/skeleton (498 lines) | Draft deck skeleton (Anthropic) | new-deck page | Yes | HIDDEN | [Confirmed] | Yes |
| 49 | /api/brew/extract (205) | Pull decisions out of the brew chat (Anthropic) | none (only referenced by ai-chat-switch.test.ts) | Yes | DEAD (no caller) | [Confirmed: grep over src, scripts, tests] | DV-03 report lists it as paused; it has no caller at all |
| 50 | /api/brew/assess (216) | Assess a brew draft (Anthropic) | none | Yes | DEAD | [Confirmed] | same |
| 51 | /api/brew/commit (205), /api/brew/positions (92) | Commit commander; save card positions | none | No | DEAD | [Confirmed: no string match in src/scripts/tests; `lib/brew-v2-session.ts` calls other routes] | Not mentioned in notes |
| 52 | /api/brew/save (228), /api/brew/session (175), /api/brew/session/[id] (165) | Save / load a brew draft | new-deck page, useBrewAutosave | No | HIDDEN (via paused page) | [Confirmed] | Yes |
| 53 | /api/brew-sessions/[id] (51) | Load a draft for a tile | DraftSessionTile (dead) | No | DEAD | [Confirmed] | |
| 54 | /api/ai/brew/start, /generate, /investigate, /refine | "Older brew flow" (Anthropic) | none | Yes | DEAD (superseded by /api/brew/*) | [Confirmed: no caller anywhere; sizes 151, 560, 432, 455 lines] | DV-03 report calls it "older brew flow". roadmap T-14 audited it. Nothing says it was replaced |
| 55 | /api/ai/brew/confirm, /save, /session | Same older flow | none | No | DEAD | [Confirmed: 67, 226, 69 lines] | |
| 56 | /api/ai/recommend (127), /api/ai/build-deck (111), /api/ai/mana-analysis (158) | EDHREC-based suggestions via a local helper program | none (AnalysisTab imports `lib/mana-analysis`, not the route) | No | DEAD | [Confirmed: grep of "/api/ai/..." strings; mcp-client.ts starts `uvx mtg-mcp-server`] | contracts/ai-audit-2026-09.md, ai-recommendations-assessment-2026-09.md describe them; D-040 etc. unrelated. Backlog "Load EDHREC suggestions" is a future item |
| 57 | /api/ai/search | Smart search for commanders (Scryfall query, no paid AI call) | SmartSearch, CommanderSearch, CommandZoneSlots, manabox-import/CommanderPicker | n/a | LIVE | [Confirmed: grep shows 4 callers; route fetches Scryfall] | Name says "AI"; it makes no AI call [Confirmed: src/app/api/ai/search/route.ts] |
| 58 | /api/decks/[id]/upgrade/refresh | Upgrade tab suggestions refresh | UpgradeTab | n/a | LIVE (not an AI route) | [Confirmed: UpgradeTab.tsx; the word "claude" matched only text] | Belongs to decks audit |

### 1E Supporting AI code and switches

| # | What it is | STATE | Evidence | Notes |
|---|---|---|---|---|
| 59 | Provider layer: `provider-factory`, `provider-adapter`, `adapters/anthropic|gemini|deepseek`, `ai-models`, `tool-registry`, `tool-executor`, `tool-types` (about 9,000 lines together with the chat lib/UI below) | HIDDEN (reached only from the 11 guarded routes) | [Confirmed: importers listed in grep: oracle/chat, brew/chat, decks/[id]/chat, generate-name] | Gemini and DeepSeek exist as extra providers; model chosen in ModelSelector (also hidden) |
| 60 | Prompts: `oracle-prompt`, `brew-prompts` (532), `brew-tool-prompt`, `deck-chat-prompt`, `deck-chat-facts`, `deck-health-chat` | HIDDEN | [Confirmed] | `brew-prompts` is used only by the dead `/api/ai/brew/*` routes, so it is dead too |
| 61 | `mcp-client.ts` (854 lines + 359 test lines): runs a local `uvx mtg-mcp-server` (EDHREC data) over stdin/stdout | DEAD | [Confirmed: importers are only the three dead routes in row 56 and tool-registry.ts] | Not the same as the app's own connector. Easy to confuse with it. Would not run on Vercel [Approximate] |
| 62 | `NEXT_PUBLIC_AI_CHAT_ENABLED` switch | LIVE (off) | [Confirmed: src/lib/ai-chat-switch.ts, setting absent in `.env.local`] | Not documented in `.env.local.example`; documented only in the DV-03 report |
| 63 | `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY` | Keys listed in `.env.local.example`; read by the paused routes and `scripts/distill-single-commander.ts` | [Confirmed] | `.env.local.example` says "required for brew chat and decision extraction" (both paused) |
| 64 | Connector settings: `CONNECTOR_BASE_URL`, `CONNECTOR_TEST_TOKEN`, `RUN_LIVE_CONNECTOR_TESTS` (tests only), `NEXT_PUBLIC_SITE_URL`, `VERCEL_PROJECT_PRODUCTION_URL` (address shown to the owner) | LIVE | [Confirmed: grep of process.env in connector code] | None listed in `.env.local.example` |
| 65 | `scripts/distill-single-commander.ts` | Manual script using the Anthropic key | LIVE by hand only | [Confirmed: grep] | DV-03 report notes it |
| 66 | npm packages `@anthropic-ai/sdk`, `@google/generative-ai`, `openai` (DeepSeek client), `@modelcontextprotocol/sdk` | LIVE (SDK for connector); others HIDDEN | [Confirmed: package.json; imports in adapters and mcp-client] | `@modelcontextprotocol/sdk` is also used by the connector server side [Approximate: not checked file by file] |
| 67 | Docs about the in-app advisor: contracts/advisor-tools.md (678 lines, status "acceptance pending"), roadmap Phase 8 "AI advisor", briefs/daily-use-deck-advisor.md | Notes only | [Confirmed: docs] | T-15 to T-18, T-36 are PARKED 2026-11-11 in backlog-details; D-063 says Claude through the connector is the advisor | Drift, section 4 |

Row counts: 1A 18 + 1B 25 + 1C 16 + 1D 17 + 1E 9 = 85 rows (numbered 1 to 67 because some rows group routes).

---

## 2 Removal candidates

None of these were removed. Approximate sizes use `wc -l`.

| # | Candidate | Size | Evidence | Safe / what could break | Locked decision or brief that depends on it | Recommendation |
|---|---|---|---|---|---|---|
| 1 | AI routes with no caller: `/api/ai/brew/{start,generate,investigate,refine,confirm,save,session}` (7 routes) and `lib/brew-prompts.ts` + its test | 7 route files, about 1,960 lines + 532 + tests | [Confirmed: no string match in src, scripts, tests; only the paused-route test names them] | Safe at run time; the chat-pause test `ai-chat-switch.test.ts` lists 4 of them and must be edited | DV-03 says "keep `api/brew` and deck chat routes". It does not name `api/ai/brew`. D-063: chat is paused, not removed | Confirm with owner (they were not the "kept" set; older flow replaced by /api/brew/*) |
| 2 | `/api/ai/recommend`, `/api/ai/build-deck`, `/api/ai/mana-analysis` plus their 3 tests and `lib/mcp-client.ts` (+test) | 3 routes about 400 lines, tests about 400, mcp-client 854 + 359 | [Confirmed: no caller; AnalysisTab uses lib/mana-analysis] | Safe; needs a program (`uvx mtg-mcp-server`) that is not in the repo. `tool-registry.ts` also imports mcp-client, so clear that import first | contracts/ai-audit-2026-09.md, ai-recommendations-assessment-2026-09.md (docs only). Backlog future "EDHREC suggestions" would use a different route | Confirm with owner |
| 3 | `/api/brew/commit`, `/api/brew/positions` (no callers) | 297 lines | [Confirmed: no string match] | Safe | none found | Remove now |
| 4 | `/api/brew/extract`, `/api/brew/assess` + their tests, `lib/brew-v2-decisions.ts`, `brew-v2-assessment-cache.ts` | about 420 + tests + 242 | [Confirmed: no caller] | Safe; DV-03 test refers to them | DV-03 report lists them as paused (not as kept on purpose) | Confirm with owner (grouped with chat decision, item 8) |
| 5 | `OraclePromptCard`, `OracleChat`, `DeckChatTab`, `useDeckChat`, `useSSEChat`, `/api/decks/[id]/chat`, `DraftSessionTile`, `/api/brew-sessions/[id]`, `MobileHeader`, brew-v2 `SuggestionsTab`, `InlineAssessment`, `format-relative-time` (only user is DraftSessionTile) | about 1,900 lines + tests | [Confirmed: each has no importer outside this group] | Safe: unreachable even with the switch on | DV-03 says "Keep the code (`OracleChat`, `DeckChatTab`...)" and D-063 pauses rather than removes | Confirm with owner. Keep list was written assuming they were reachable |
| 6 | `SuggestionsTab.tsx`, `InlineAssessment.tsx` | 297 lines | [Confirmed] | Safe | none | Remove now |
| 7 | `MobileHeader.tsx` + tests | 168 lines | [Confirmed: no importer; DV-03 report says unmounted] | Safe | none | Remove now |
| 8 | Whole paused chat stack: side panel, session routes, brew page and canvas, provider layer, prompts, tool registry, three AI SDKs | Roughly 25,000 lines [Approximate, sum of wc on the listed files; brew-v2 8,240, new-deck, OracleSidebar 921, routes about 4,500, lib about 4,000, tests] | [Confirmed: all reached only via the switch] | Removing needs the owner to give up the option of bringing chat back; also drops 3 npm packages and the 3 API keys | D-063 (paused, "one switch"), DV-03 | Keep for now; owner decision. Report in plain words: "do you still want the chat as a possible comeback?" |
| 9 | `/api/oracle/*` (sessions, history, generate-name) and `OracleContext` | about 1,300 lines | [Confirmed] | Safe only together with item 8 | D-063 | Keep (part of item 8) |
| 10 | Duplicate/"stale" docs: contracts/advisor-tools.* (3 files), roadmap Phase 8 text, briefs/daily-use-deck-advisor.md | docs | [Confirmed] | Docs only; the brief is the source for the deck Workbench (live) | D-034/D-035/D-036 refer to the advisor | Keep, add a "superseded by D-063" note (needs owner; decisions.md is not touched by me) |
| 11 | `.env.local.example` text for AI keys; add the missing `NEXT_PUBLIC_AI_CHAT_ENABLED` line | tiny | [Confirmed] | none | none | Remove/edit now (docs hygiene, not code) |
| 12 | Curve layout in the deck Workbench: `CurveView`, `CurveColumn`, `CurveCardRow`, `useCurveBuckets` and the "Curve" option in `CanvasToolbar` | 199 lines | [Confirmed: DeckCanvas.tsx:387; CanvasToolbar.tsx:108; reachable from Workbench tab] | Removing the toggle option removes the view; Piled and Free-form stay | briefs/daily-use-deck-advisor.md (not checked whether it requires Curve) | Confirm with owner (this is the item you named; no note says it was dropped) |
| 13 | `useClaudeChangeWatch` test only, `mcp.live.test.ts` | | | | | Keep |

Totals: 12 candidates (rows 1 to 12). Item 13 is a "keep" note and not counted.

Tests that only test dead code: `src/app/api/ai/*/route.test.ts` (4 files: build-deck, mana-analysis, recommend, search; search is live, the other three are dead) and `src/app/api/brew/{assess,extract}/route.test.ts`, `src/lib/mcp-client.test.ts` (359 lines). About 2,366 test lines under `src/app/api/ai` and `src/app/api/brew` in total, some of which test live routes.

---

## 3 Started-and-left

| Item | Started | Last activity | Where it stands | Recommendation |
|---|---|---|---|---|
| In-app AI advisor (M2, T-15 to T-18, T-36) | 2026-09-29 (Astra design), M2 current 2026-10-10 | Paused 2026-10-11; PARKED 2026-11-11; chat code paused 2026-11-19 (DV-03) | Plan and contract written, never built as designed. The older chat exists but is switched off | Drop or park explicitly. Claude connector replaced it (D-063). Say so in roadmap |
| Brew Canvas (T-08, T-09) and the `/new-deck` brewing chat | 2026-07 to 2026-08 | Rename draft to Brewing 2026-11-18; paused 2026-11-19 | Built, hidden, redirects to Explore | Park (owner) or remove with item 8 |
| Older brew flow `/api/ai/brew/*` | 2026-07 [Approximate] | File dates 2026-07-14 (checkpoint); guarded 2026-11-19 | No caller | Drop |
| EDHREC helper program route trio (`recommend`, `build-deck`, `mana-analysis`) + `mcp-client` | 2026-07-05 | 2026-11-02 (commander-equals change touched them) | No caller; needs an outside program | Drop (or rebuild properly as connector tools; backlog lists "Load EDHREC suggestions") |
| Claude runs Picklist/storage (CC-16) | Approved 2026-11-17 | Not touched since | Not started; planning underway | Finish (owner picked it) |
| Claude imports decks (CC-17) | Approved 2026-11-17 | Not touched since | Not started | Finish |
| Wishlist (CC-18 second half) | 2026-11-17 | | Not built | Finish or park; ask owner |
| Game logging and playgroup (CC-08) | 2026-11-16, approved, "last in order" | | Not built | Park (scheduled last) |
| CC-05 owner click-through of the connector (12 steps) | 2026-11-17 | | Not recorded as done | Finish: owner step |
| TEST-02 live Claude scenarios (CC-06/07/18) | 2026-11-17 | | Never run | Finish |
| CC-24 overlap warning | 2026-11-17 | Dropped 2026-11-18 | Dropped by owner | Done, nothing to remove (check code left behind: none found) |
| Mana-curve slider (O-003) | roadmap | | Not specced; backlog "parked" | Drop or park |
| Curve layout in Workbench | with Brew Canvas, 2026-07 [Approximate] | Still in the Workbench toolbar | Built and visible, no note | Owner to say keep or drop |
| Gemini and DeepSeek providers | [Approximate] earlier than 2026-10 | | Built for the chat; only reachable if chat resumes | Park with item 8 |

---

## 4 Decisions drift (report only)

1. **D-063** pauses the in-app chat. Roadmap `roadmap.md` still says the product goal is "an AI advisor" inside the app (Phase 8) and the M2 advisor is described as "paused". D-034, D-035, D-036 are still worded as "the advisor" for the in-app chat. Code matches D-063. Notes are not updated to say that the advisor is now Claude through the connector.
2. **DV-03 "keep" list vs code.** DV-03 says to keep `OracleChat`, `DeckChatTab`, the `api/brew` and the deck chat routes. `OracleChat` and `DeckChatTab` were never mounted, so even with the switch on those chats cannot appear (the only live chat entry would be the side panel and new-deck page). The "bring it back with one setting" promise therefore restores the side panel and `/new-deck` only, not the deck chat. [Confirmed: grep, DV-03 report assumptions]
3. **D-034a vs request_card_move.** D-034a and CC-04b say card moves and big edits wait for approval. The tool text says "The move goes straight through, no approval needed, and the owner can undo it in Oracle for 7 days". The pending-approval list in the app still exists for over-120-card edits. [Confirmed: tools/index.ts request_card_move; backlog-details CC-04b] The CC-13 amendment (limits 120) may have changed this; I could not find a note that explicitly says moves no longer need approval.
4. **CC-14 / CC-07 search** is "build started" in backlog.md but the code and tests for the filters exist. Wording is stale rather than code being missing.
5. **backlog.md "Updated 19 November"** header, while the footer says "recorded on 22 November". Not a code issue.
6. **AGENTS.md** says the old `get_collection_rollup` function was removed; `src/hooks/useCollectionRollup.ts` still exists. That belongs to the collection audit.
7. **D-016** (structured AI data via tool use) applies to chat routes that are paused.
8. **TIDY-03**: connector database change (CC-03d) lives only on an old branch per backlog-details. I did not verify against the migrations folder (other agent).

---

## 5 Open questions (for the owner, in plain words)

1. Do you want the in-app chat to stay as a possible comeback, or should it be removed? If it stays, the unreachable pieces (deck chat tab, chat page card, draft tiles) can still go. If it goes, about 25,000 lines and three AI helper libraries go with it.
2. The "Curve" layout in the deck Workbench is still on screen. Do you want to drop it, along with the Piled layout?
3. The three suggestion routes that need an outside EDHREC program (recommend, build-deck, mana analysis) are not used by any screen. Drop them, or rebuild as Claude connector tools later?
4. Should Claude's "move a card to another deck" go straight through (as the tool says) or wait for your yes (as the older notes say)?
5. Did you ever finish the 12-step connector click-through, and the real Claude chats for creating decks and the buying list?
6. Is `NEXT_PUBLIC_AI_CHAT_ENABLED` set anywhere in Vercel? (I could only see local files.)

---

## 6 Could not verify

- Vercel environment settings, and whether the chat switch is set there.
- Whether the hosted database migration history includes connector-related migrations (other agent's area).
- Whether the connector actually responds when called from Claude (no live run); TEST-02 says live scenarios were never run.
- Whether the helper files in `src/lib/connector/tools/` (bracket, card-facts, card-printing-facts, card-tags-tool, collection-*, deck-colours, deck-strategy-read) all have importers: I checked file imports by name only for the registered tools, and no knip/ts-prune run was made.
- Whether `@modelcontextprotocol/sdk` is used by the connector server (or only by `mcp-client.ts`). If only by `mcp-client.ts`, it goes with item 2.
- Which tests currently pass; I ran no test commands.
- The first-introduced date of the older brew routes (I used the 2026-07-14 checkpoint commit as the nearest evidence).
- Whether briefs/daily-use-deck-advisor.md requires the Curve layout.
