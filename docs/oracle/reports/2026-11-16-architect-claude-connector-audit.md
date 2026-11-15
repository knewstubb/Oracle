# Report: claude-connector-audit (CC-02, Gate 2)
Role: Architect
Status: DONE
Task as received: Task CC-02: Gate 2 audit (read-only, no code or migration changes) for the approved brief docs/oracle/briefs/claude-connector.md (section 0 "Approved decisions" first, plus docs/oracle/process.md Gate 2 and docs/oracle/decisions.md). Cover (1) AUTH today, (2) UNDO/HISTORY of edits, (3) MULTI-USER DATA SEPARATION, (4) the unverified assumption that Claude apps' per-action approval prompts can be switched off, (5) existing code usable by a connector plus dead/half-built code, (6) locked decisions touched or in conflict and what would be deleted when it ships, (7) enforcement points for brief rules (>10-card edits, cross-deck moves, destructive actions not exposed). Do not edit decisions.md. Do not run migrations.

## Summary for the owner
A Claude connector is feasible, but not safe to build on the data layer as it is today. Oracle has a normal login and most screens check you are signed in, but on the live database the main tables (decks, deck cards, cards, copies) have no database-level separation between users, and several "delete everything"-style database functions can be called by anyone who has the public site key. That must be fixed before any connector goes online, even with one user. Undo exists only for Oracle chat adds (24 hours) and "Move here"; there is no general "made by AI" history, so the "recent changes by Claude" list needs a new record. Claude's approval prompts can be turned off per tool by the owner ("Allow always"), so Oracle must enforce its own limits (confirmed in Claude's help pages).

Decisions needed from the owner are in "Open questions" (three, behaviour only).

## 0. Headline findings (read these first)
| # | Finding | Severity | Tag |
|---|---|---|---|
| H1 | Live database: row-level security (RLS) is OFF on `decks`, `deck_cards`, `user_cards`, `user_copies` and about 17 other per-user tables. `user_copies` has 4 policies but RLS is disabled, so they do nothing. | Blocker for S8/S9 | Confirmed (live catalog query, see Verification) |
| H2 | Live database: `anon` (the public site key, which is shipped to every browser) has EXECUTE on destructive security-definer functions that take a `p_user_id`: `delete_deck_with_release`, `replace_collection`, `replace_deck_with_new_cards`, `delete_user_copies`, `release_deck_copies`, `apply_ai_deck_delta`, `apply_collection_sync`, etc. Combined with H1, anyone with the site key and a user id could read or wipe data. | Blocker, also true today | Confirmed (live `proacl` query) |
| H3 | At least two deck routes (status, notes) use the service-role client and filter only by deck id, not by owner. Any signed-in user could read or change another user's deck. `/api/collection/stats` counts all users' copies. | Blocker for S9 | Confirmed: `src/app/api/decks/[id]/status/route.ts`, `src/app/api/decks/[id]/notes/route.ts`, `src/app/api/collection/stats/route.ts` |
| H4 | There is no edit log. Only `chat_card_proposals` (adds by Oracle chat) and `deck_cards.placement_source` (copy placements) record "who". Removals, collection adds/removes and proxy/original changes record nothing. | Needs new table | Confirmed |
| H5 | Per-action approval can be switched off by the owner in Claude. Confirmed from Anthropic help pages. | Design for it | Confirmed (web) |

## 1. AUTH today

**How users sign in.** Email and password through Supabase Auth; a login page and a logout server action. [Confirmed: `src/app/login/login-form.tsx`, `src/app/actions/auth.ts`]. Invite and password-reset links return via `/auth/callback`, which exchanges a PKCE code for a session cookie. [Confirmed: `src/app/auth/callback/route.ts`]. A dev-only auto-login exists (NODE_ENV=development plus two env vars). [Confirmed: `src/lib/local-auto-login.ts`]. No OAuth provider, no magic link UI, no sign-up page found. [Approximate: not exhaustively searched beyond the login form]

**Session handling.** Cookie-based Supabase session. Middleware refreshes the session on every request via `auth.getUser()`, redirects pages to `/login`, and returns 401 JSON for `/api/*`. Public paths: `/login`, `/auth/callback`, `/api/cards/search`, `/api/cards/autocomplete`. [Confirmed: `src/middleware.ts`]. Middleware only understands cookies. A request carrying `Authorization: Bearer <token>` and no cookie is rejected.

**Do API routes check a user?** Yes, almost all. The helper `requireAuth()` returns the user or a 401. [Confirmed: `src/lib/auth.ts`]. Route handlers that do not call it directly: `commanders/names`, `commanders/[id]/insights`, `commanders/[id]/builds`, `scryfall/commanders`, `cards/names`, `cards/autocomplete`, `commander-summaries` (reference data, middleware still gates all but autocomplete/search), the three `chat-proposals/*` routes (they call `requireAuth` through `readProposalRequest`, so they are fine), and the two cron routes (secret header). [Confirmed: grep over `src/app/api/**/route.ts`; `src/lib/chat-proposal-route.ts`]. There are no page-level server actions other than logout.

**But "signed in" is not "scoped to you".** About 165 files use `createAdminClient()` (service role, bypasses RLS) [Confirmed: `src/lib/supabase.ts`; grep]. Data separation therefore depends on every route remembering to filter by `user_id`. 46 of those route files contain no `user_id`/`userId` text at all; some are reference-data or delegate to a helper that takes the user id, but status and notes demonstrably do not filter by owner (H3). [Confirmed: `src/app/api/decks/[id]/status/route.ts`, `.../notes/route.ts`]. The other 40 or so were not each read. [Approximate]

**RLS on user tables (live DB, queried read-only).**
- RLS ON: `chat_card_proposals`, `deck_card_alerts`, `deck_folders`, `oracle_messages`, `oracle_sessions`, `user_locations`, and the `ref_*` reference tables. [Confirmed: live `pg_class.relrowsecurity`]
- RLS OFF with a `user_id` column: `decks`, `deck_cards`, `user_cards`, `user_copies` (policies exist but are inert), `brew_sessions`, `debrief_*`, `deck_*` (combos, documentation, health, mana_analysis, notes, overview_content, priority, ratings, strategy, upgrades, versions), `import_sleeve_claims`, `precon_mod_state`, `upgrade_change_log`. [Confirmed: live catalog]
- The repo migrations contain RLS only for newer tables; the core tables were created before migrations were tracked, so the repo cannot be trusted to show their state. [Confirmed: `grep ENABLE ROW LEVEL SECURITY supabase/migrations` lists 11 files, none for core tables]

**What a hosted remote connector with sign-in needs.** Anthropic's connector docs: Claude connects from Anthropic's cloud (not the phone or laptop) over public HTTPS on port 443, using Streamable HTTP; supports OAuth 2.0 per the 2025-03-26, 2025-06-18 and 2025-11-25 MCP authorization specs; can register itself by Dynamic Client Registration; redirect `https://claude.ai/api/mcp/auth_callback` for hosted surfaces and a loopback redirect for Claude Code; refreshes tokens. [Confirmed: web, claude.com/docs/connectors/building; support.claude.com custom connectors article]

Reuse:
- Supabase Auth users and the existing login screen (the sign-in step of the OAuth flow can show `/login`). [Confirmed: above]
- The `requireAuth` pattern and the `userId`-from-session convention. [Confirmed: `src/lib/auth.ts`]
- Next.js on Vercel can host a `/mcp` route; `@modelcontextprotocol/sdk` is already a dependency (client side only, see section 5). [Confirmed: `src/lib/mcp-client.ts`]

Add:
1. An MCP endpoint (Streamable HTTP) and the OAuth discovery documents (protected-resource and authorization-server metadata, normally under `/.well-known/`). Middleware currently blocks anything not in its short public list, so these paths must be added to the public list and the endpoint must do its own token check. [Confirmed: `src/middleware.ts`; need derived from the spec, Approximate]
2. An OAuth 2.1 authorization server: authorize, token, refresh and revoke, DCR or a pre-registered Claude client. Supabase Auth offers an OAuth 2.1 server feature; whether the hosted project can enable it was **not verified** in this audit. [Approximate] Otherwise Oracle issues its own tokens. This is a Gate 3/slice (a) design item.
3. A per-connection token store so the owner can see the connector is active and switch it off (brief section 7). Nothing exists today. [Confirmed: no such table in live catalog]
4. A rule that the user id comes only from the verified token, never from a tool argument. Today's RPCs take `p_user_id` as an argument and trust the caller (section 3).
5. An expiry response the connector turns into "please reconnect" (D-030 style: say the failure aloud).

## 2. UNDO / HISTORY of edits today

| Mechanism | What it does | Gap for the connector | Tag |
|---|---|---|---|
| `deck_cards.placement_source` | Text, `manual` / `ai` / `import`, set on every placement that fills a slot with a copy; NULL when `copy_id` is NULL. D-009. | A **planned** slot (what an "add card" creates) has no copy, so its source is NULL. Not a history: it holds only the latest value, no time, no actor. There is no separate "claude" value; `ai` is shared with Oracle chat. Adding one means changing a CHECK constraint (migration). | Confirmed: `supabase/migrations/20260925220000_placement_source.sql`, `src/types/placement-source.ts` |
| `chat_card_proposals` | One row per card Oracle chat proposed; status `pending/added/dismissed/undone/blocked/expired`; `source` fixed to `'ai'` by CHECK; stores `created_deck_card_id` and `created_categories`. Lives 24 h (`PROPOSAL_LIFE_MS`); Undo removes the slot only if still an unchanged planned slot. RLS on, SELECT own. Confirm/undo are service-role-only RPCs. | Covers **adds only**. No removals, moves, collection or proxy edits. The 24 h limit conflicts with "recent changes" on a phone. Tied to the Oracle chat's propose/click flow. | Confirmed: `supabase/migrations/20261112120000_chat_card_proposals.sql`, `src/lib/chat-proposal-types.ts`, `src/lib/chat-proposal-confirm.ts` |
| Move here + Undo | `reassign_to_deck` moves one copy; undo goes through `POST /api/allocation/undo` → `undo_copy_move` with the caller supplying the previous slot ids; refuses if the old slot was claimed since. | Undo needs the client to hold the "restore to" ids; nothing is stored server-side, so a later "undo that" from Claude has nothing to look up. | Confirmed: `src/app/api/decks/[id]/move-here/route.ts`, `src/app/api/allocation/undo/route.ts` |
| `deck_versions` | Whole-deck snapshots (`manual`, `import`, `bulk_change`, `session_end`, `milestone`) with a restore route and a Version History panel. | Coarse (whole deck), not per change, no "ai" trigger type, and removing a card returns a copy to storage, which a restore does not reverse exactly. | Confirmed: `supabase/migrations/20260812000000_create_deck_versions.sql`, `src/app/api/decks/[id]/versions/[versionId]/restore/route.ts` |
| `upgrade_change_log` | Cut/add pairs from the upgrade feature. | Feature-specific; not a general log. | Confirmed: `src/lib/upgrade-changelog.ts`; table present live |
| `move_items` (DRAFT) | Checklist with `source IN ('manual','import','ai')`, plan and audit of moves. | Draft, **not applied** live (not in live catalog). Not an edit log. | Confirmed: `supabase/migrations/20261113100100_move_items.sql`; absent from live table list |
| Direct AI edit paths | `POST /api/decks/[id]/cards/batch` and upgrade apply call `apply_ai_deck_delta` (atomic add planned slots / remove with release). | Records nothing about who or what was changed, no undo. D-034 says undo is required; "AI edit ability switched off in deck chat by default" per status. | Confirmed: `src/app/api/decks/[id]/cards/batch/route.ts`, `docs/oracle/status.md` |

**Is there a general edit-log table?** No. [Confirmed: live table list; no `audit`/`edit_log`/`changes` table]

**Do 'made by AI' source values exist?** Yes on `deck_cards.placement_source`, `chat_card_proposals.source` and the draft `move_items.source`. There is **no value that distinguishes Claude-through-connector from Oracle's own chat**, and no source at all on: removing a deck slot, adding/removing a collection copy, changing Original/Proxy, creating a proxy copy (the RPCs take `p_source`, but the copy row itself carries no actor), or moving a card to the maybeboard. [Confirmed: grep of migrations and types]

**Missing for "recent changes by Claude" with Undo.** A new append-only `ai_change_log` (user_id, connector/client id, action type, deck_id, card/copy ids, before/after snapshot enough to reverse, `created_at`, `undone_at`, group id for one chat turn). Each connector write goes through one RPC that does the edit and writes the log row in the same transaction (a failed log means no edit). Undo RPCs per action type, each refusing with a plain reason if the target changed since (same rule as `undo_chat_card_proposals`). A retention policy longer than 24 h. RLS select-own policy. A read route for the in-app list. Design note: the list's new-screen shape is Gate 3.

## 3. MULTI-USER DATA SEPARATION

- **user_id columns:** present on every per-user table above (76 `user_id uuid` columns across migrations) and live. Not on `ref_*`, `precon_cards`, `sync_meta`, `commander_*`, which are shared reference data by design. [Confirmed: live catalog]
- **RLS:** see section 1. Off on the tables that matter most (H1). `user_copies` has 4 policies written but inert; `chat_card_proposals` and `move_items`(draft) define SELECT-only policies and rely on service-role writes. [Confirmed: live `pg_policies`]
- **Service-role bypass:** 165 files use `createAdminClient()`; it is the default data client for routes, so RLS would not protect these even if switched on. A connector must not copy this pattern without the user id check (H3). [Confirmed: `src/lib/supabase.ts`, grep]
- **RPCs and user id:** nearly every write RPC is `SECURITY DEFINER` and takes `p_user_id` as a plain argument; inside they check `deck.user_id = p_user_id`, which is only as safe as the caller. Live EXECUTE grants: `anon` can run most of them (H2); `authenticated` cannot; `service_role` can. The chat-proposal and command-zone/import-with-intent RPCs are already restricted to service_role (the `revoke_anon` migration did this for the chat ones only). [Confirmed: live `proacl`; `supabase/migrations/20261113130000_chat_card_proposals_revoke_anon.sql`]
- **`get_collection_rollup(p_user_id uuid)`:** SECURITY INVOKER, takes a user id, EXECUTE for PUBLIC/anon/authenticated. With RLS off on `user_copies`/`user_cards`, passing any user's id returns that user's rollup. `get_shared_cards(p_user_id)` and `get_deck_conflict_counts(p_user_id)` have the same shape. [Confirmed: live `proacl`; function arg list]
- **Hardcoded single-user assumptions:** the price-refresh cron says it "falls back to the first user" and is a single-user app; `/api/collection/stats` counts all rows in `user_copies` with no user filter. [Confirmed: `src/app/api/cron/refresh-prices/route.ts` header; `src/app/api/collection/stats/route.ts`] No hardcoded UUID found. [Approximate: grep for common patterns only]
- **Write-race risk (O-002):** the main multi-row RPCs lock the deck row (`SELECT ... FOR UPDATE` on `decks`) before changing slots (27 `FOR UPDATE` in the atomic-movements migration), so two writes on one deck serialise. Cross-deck moves of one copy and collection-level edits do not take a lock on a shared parent, and connector calls can arrive concurrently with the owner's clicks and with other Claude calls. No pooling or load validation exists; O-002 is still open. [Confirmed: `supabase/migrations/20260912150000_atomic_collection_movements.sql`; Approximate for the cross-deck/copy-level lock gap, I did not trace every RPC]

**Required before slice (b) (separation test):** enable RLS with own-row policies on all per-user tables; revoke `anon` EXECUTE on all user-data RPCs; stop passing a caller-trusted `p_user_id` for connector paths (derive from the verified token; either use a user-scoped client so RLS applies, or keep service-role RPCs with `p_user_id` taken from the token only); fix status, notes, stats and a re-audit of the ~40 other routes lacking a user filter. These are Architect/Developer migration drafts that need owner approval before applying (AGENTS.md rule 5; nothing was run here).

## 4. UNVERIFIED ASSUMPTION: approval prompts can be switched off

**Result: CONFIRMED for claude.ai-family apps; NOT confirmed as a guarantee either way for "destructive" tools.** Oracle must treat prompts as absent.

Confirmed by Anthropic help pages (read 2026-11-16):
- Claude's own guidance tells users: "Review Claude's tool approval requests carefully and only click 'Allow always' when using a server and tool that you trust to run unsupervised." [Confirmed: support.claude.com/en/articles/11175166]
- Connector settings have per-tool and per-category permission controls: "For each permission category or individual permission, select Always allow, Needs approval, or Blocked." [Confirmed: support.claude.com/en/articles/11176164] Note that page frames it as an owner/Team feature to restrict actions org-wide; for individual accounts the "Allow always" choice and tool menu are in the first article.
- Research mode: "Claude can invoke tools from your connectors automatically without further approval." [Confirmed: support.claude.com/en/articles/11175166]
- Directory checklist: tools must carry `readOnlyHint` / `destructiveHint` annotations, which "determine auto-permissions in Claude. Read-only tools can run without per-call confirmation, and destructive tools always prompt." [Confirmed text: claude.com/docs/connectors/building/review-criteria.md]. **Not confirmed:** that this applies to custom (non-directory) connectors, or that a destructive-hinted tool can never be set to Allow always. [Approximate]

Support per app and plan:
| App | Custom remote connectors | Per-action approval can be disabled | Tag |
|---|---|---|---|
| Claude web (claude.ai) | Yes, Free (one connector), Pro, Max, Ultra, Team, Enterprise. On Team/Enterprise an Owner adds it; members then connect individually. | Yes, "Allow always" / per-tool permission | Confirmed: web |
| Claude desktop | Yes, same plans; remote connectors are brokered through the account, not the local machine | Yes, same settings | Confirmed: web |
| Claude phone (iOS/Android) | Connectors added on web/desktop show up on mobile after connecting; installing connectors on mobile is "currently in beta" and desktop/web remain "the primary path for custom connectors" | Same settings inherited. Not verified separately on mobile. | Confirmed (availability); Approximate (prompt behaviour on mobile) |
| Claude Code | Yes, `claude mcp add --transport http <name> <url>`; OAuth with a loopback redirect, or a static bearer header | Yes. MCP tools can be pre-allowed with `mcp__<server>__<tool>` rules, and permission modes can skip prompts (the docs say rules and modes decide, and "auto mode" uses a classifier instead of the user). Not verified whether any user setting cannot override a destructive hint. | Confirmed: web, code.claude.com/docs/en/mcp and /permissions |

Also confirmed: tool results capped at ~150,000 characters on claude.ai/Desktop (25,000 tokens in Claude Code); 240 s per tool call; the server must be public and on port 443; Claude's servers, not the user's device, make the calls. Remote MCP free users: 1 custom connector.

**Design implication (all Approximate until slice a is tried live):** every limit in brief section 6 must be enforced inside Oracle's server, not by Claude's prompt. Do annotate tools honestly (`readOnlyHint` on reads, `destructiveHint` on removals) because that is free and may add friction, but never depend on it. Plans, app support and the "beta" status of mobile install can change; the owner should be told that the phone path (S1) depends on adding the connector from web or desktop first.

## 5. Existing code a connector can reuse; dead or half-built code

**Reads already available (as server functions / routes, all taking `userId`):**
- Decks list and a deck's cards: `GET /api/decks`, `GET /api/decks/[id]/cards`; Oracle chat tools `list_user_decks`, `get_deck_cards`, `deck_context`. [Confirmed: `src/lib/tool-registry.ts` lines near 1217, 1294, 1501]
- Collection: `search_owned_cards`, `collection_lookup`, `check_owned_copies`, `browse_spare_copies` (spare copies and where they sit). [Confirmed: `src/lib/tool-registry.ts`; `src/lib/spare-copy-browse.ts`]
- Shortages: Reconcile route `src/app/api/reconcile/overused/route.ts` and `src/lib/reconcile-overuse.ts` (D-027/D-037). [Confirmed: file exists; behaviour not traced, Approximate]
- Deck health and gaps: `get_deck_health`, `loadDeckGap`. [Confirmed: registry; `src/app/api/decks/[id]/health/gap/route.ts`]
- Card facts and prices: `card_fuzzy_lookup`, `scryfall_search`, Scryfall price store. [Confirmed: registry; `src/lib/price-store.ts`]

**Edits already available:**
- Add planned slots / remove with release in one transaction: RPC `apply_ai_deck_delta` via `POST /api/decks/[id]/cards/batch`. [Confirmed]
- Remove one card with release to storage (D-039): `remove_deck_card_with_release` via `DELETE /api/decks/[id]/cards/[cardId]`. [Confirmed]
- Add proxy to slot: `add_proxy_to_slot` / `add_proxies_to_slots`; replace proxy with original: `replace_proxy_with_original`. [Confirmed: live function list; `src/app/api/collection/instances/add-proxy/route.ts`]
- Sleeve a free copy / cross-deck move: `assign_free_copy`, `reassign_to_deck` (via `move-here`), `assign_physical_copy`. [Confirmed]
- Add / remove a collection copy: `insert_user_copies`, `delete_user_copy`, `delete_user_copies`. [Confirmed: live function list]
- Original/Proxy flip: no dedicated "mark as" RPC found; D-026 forbids silently converting. [Approximate]
- Reuse the **propose-then-confirm token pattern** from `chat_card_proposals` (single-use id as token, 24 h life, atomic confirm RPC) for the connector's "owner confirms" steps. [Confirmed: `src/lib/chat-card-proposals.ts`]

**Existing MCP / Anthropic code:**
- Oracle only has an **MCP client** that spawns an external EDHREC MCP server over stdio. There is **no MCP server** and no Streamable HTTP endpoint. [Confirmed: `src/lib/mcp-client.ts` imports `StdioClientTransport`; `@modelcontextprotocol/sdk` in node_modules]
- Anthropic usage is Oracle's own paid chat (`@anthropic-ai/sdk`, `src/lib/adapters/anthropic-adapter.ts`, `/api/decks/[id]/chat`, brew routes); out of scope for this brief.
- Oracle's chat tool registry (`src/lib/tool-registry.ts`, 2,072 lines) is the closest thing to a ready-made tool list with JSON schemas, but it is coupled to the chat loop (display-only tools emit events) and to `{userId, deckId}` execution context. Reuse the pure functions underneath; do not expose the registry as-is. [Confirmed: `src/lib/tool-executor.ts`]

**Dead or half-built (relevant):**
- `add_cards_to_deck` / `remove_cards_from_deck` registry tools are "display" tools: `execute` just returns a success string and relies on the browser to call the deck API. They look like they edit but do not. A connector must not reuse them. [Confirmed: `src/lib/tool-registry.ts` 1994-2072]
- `replace_collection`, `replace_deck_with_new_cards`, `apply_collection_sync` and `release_deck_copies` RPCs exist live; whether any current route still calls `replace_collection` was not traced. Must never be reachable from the connector. [Approximate]
- `move_items` and the "copy in hand / missing" migrations are DRAFTs, not applied. [Confirmed: absent live]
- `createServerClient` in `src/lib/supabase.ts` is a deprecated alias for the admin client (a name that hides that it bypasses RLS). [Confirmed]
- Stale doc text in `/api/collection/rollup` mentions old table names ("collection", "cards"). [Confirmed: header comment]

## 6. Locked decisions touched or in conflict

| ID | Status | Notes |
|---|---|---|
| **D-034** | Touched, amendment pending (brief section 0 item 5) | Written for Oracle's own advisor: AI may change a deck directly, every AI change undoable. Connector reading (small edits direct with undo; >10 cards and cross-deck moves need yes; destructive not offered) conflicts with chat-add-cards' "click Add per suggestion" and with D-034's "no confirmation". Gene records at Gate 5 with owner approval. Not edited here. |
| **D-009** | Touched | `placement_source` has only manual/ai/import and records only copy placements. The connector needs a source on every edit type, so it needs the new log table (section 2), not just a new enum value. |
| **D-033** | Touched | Cross-deck move = "explicit physical move, show effect before confirmation". The owner-confirmed move in brief section 0 item 2 implements this; a server-side two-step confirm is the way. |
| **D-039** | Touched, compatible | Remove returns the copy to storage; `remove_deck_card_with_release` and `apply_ai_deck_delta` already do this. Connector must use these RPCs only. |
| **D-050** | Respected | No import tool for Claude. `replace_collection` must be unreachable. |
| **D-020, D-025, D-026** | Respected | Adds create planned slots only; Proxy creates a new copy; no automatic allocation. |
| **D-030, D-035** | Respected, needs care | Connector tool errors must say "failed", never "none/empty"; prices labelled as estimates. |
| **D-001, D-003, D-004, D-021** | Touched | Claude must be given card name plus exact printing/finish in results to avoid wrong-copy edits (brief risk). |
| **O-002** | Open, becomes relevant | Section 3 write-race note; no conflict, flagged only. |
| **D-005** | Touched, compatible | Maybeboard move releases the copy. |

**Challenges:** none to locked decisions. The brief's statement "no other locked decision is in conflict" holds, but H1/H2 are infrastructure gaps rather than decision conflicts. D-034 should be amended before build, as already planned.

**What would be deleted or retired when it ships:** nothing in Oracle's own chat (out of scope). Candidates to retire, with owner approval: the misleading display-only `add_cards_to_deck` / `remove_cards_from_deck` tools if unused; anon EXECUTE grants on user-data RPCs; the deprecated `createServerClient` alias; the "first user" fallback in the price cron if a second user joins. The `chat_card_proposals` table stays (Oracle chat still uses it); a new log table is added rather than replacing it.

## 7. Enforcement points for the brief rules

All three rules must be enforced in Oracle's server, before the database write, because Claude's own prompt can be turned off (section 4).

1. **More than ~10 cards in one go needs the owner's yes.**
   - Where: a single connector write function that counts the distinct cards affected (adds plus removes plus moves in one call). Today `apply_ai_deck_delta` and the `cards/batch` route have **no count cap** [Confirmed: `src/app/api/decks/[id]/cards/batch/route.ts`]; the only cap is 10 per proposal call and 30 pending per deck in chat [Confirmed: `src/lib/chat-proposal-types.ts`].
   - How: above 10, the connector returns a pending change with a single-use token (reuse the `chat_card_proposals` pattern); Claude cannot apply it. The owner confirms in Oracle (needs a small screen or the "recent changes" list). Claude telling the owner "reply yes" is not enough, because Claude could then call confirm itself. Confirmation must be an owner action in Oracle's own UI, or a separate sign-in step. This is a **Gate 3 question** (where does the owner say yes when on a phone with only Claude open?).
2. **Cross-deck moves need the owner's confirmation with effect on both decks.**
   - Where: `reassign_to_deck` / `move-here`. The route already checks open slot, already-in-this-deck and source-changed, and does it without a dedicated RPC (route-level checks, then undo on mismatch) [Confirmed: `src/app/api/decks/[id]/move-here/route.ts` header]. The connector should call a preview that returns both decks' before/after readiness (reuse `computeDeckReadiness` and `playableWarning`) plus a token, and apply only through the confirmation path. A new atomic RPC doing the checks inside the transaction is recommended (the contract already wants it).
3. **Destructive actions are not exposed.**
   - Where: the tool list itself. Register only the read tools and the edit tools in brief section 5; do not register delete deck, break down, replace, clear, import or sync tools. The server must also refuse by name if called. Because RPCs like `delete_deck_with_release` and `replace_collection` are currently anon-callable (H2), revoking anon/authenticated EXECUTE and restricting these to service_role is part of enforcement, not optional.
   - "Remove a card" is a destructive-hinted (reversible) edit; remove-many is covered by rule 1.
4. **Every edit logged and undoable** (brief section 6.1): enforced by the single write function writing the log row in the same transaction (section 2).
5. **Never another user's data:** derive `userId` only from the verified token; use RLS plus an owner check in every RPC; add the two-account test of slice (b).
6. **Off-switch:** revoke the connector's token record; the MCP endpoint checks it on every request.
7. **Honest failure:** connector errors return explicit failure text (D-030).

## Changed files
- `docs/oracle/reports/2026-11-16-architect-claude-connector-audit.md` — this report. No code, migrations or decisions changed.

## New decisions made (need owner confirmation)
- None locked. Recommendations (not decisions): (a) fix H1–H3 (RLS on, revoke anon on user-data RPCs, owner filters) as a precondition slice before the connector; (b) a new append-only AI change log instead of widening `placement_source`; (c) confirmations for large edits and cross-deck moves happen in Oracle, not in Claude.

## Assumptions
- The Supabase project named "The Oracle" (id starting `udocxs…`, status ACTIVE_HEALTHY) is the hosted Oracle database; it contains Oracle's tables. [Approximate: not cross-checked against `.env`]
- Live state was read with read-only catalog queries only (no data rows read, no changes).
- Anthropic documentation was read on 2026-11-16; support pages say "Updated yesterday/over a week ago" so wording may change.

## Challenges to locked decisions
- none (D-034 amendment already pending per brief section 0).

## Open questions
1. **Where does the owner say "yes" to a big edit or a deck-to-deck move when using only the Claude app on a phone?** Options: (a) in Oracle's "recent changes" screen (recommended; one tap, effect shown on both decks); (b) by approving in Claude's own prompt (not reliable, can be switched off); (c) not allowed from Claude until the owner is at a computer. Trade-off: (a) needs one small new screen; (c) is safest but blocks the phone use you approved.
2. **How long should "recent changes by Claude" stay undoable?** Oracle chat undo is 24 hours today. Recommendation: 7 days, with undo refused (and said plainly) if the deck changed since. A longer window means more records and more refusals.
3. **Should fixing the data-separation gaps (turning on per-user protection for decks and collection) be approved as its own slice before the connector?** Recommendation: yes. It also protects the app today; one user sees no change.

## Verification
- Read AGENTS.md, base architect role, project architect additions, the brief, process.md Gate 2, decisions.md entries for D-001/003/004/005/009/020/021/025/026/027/030/033/034/035/037/039/050 and O-002 — done.
- Live catalog, read-only (`supabase execute_sql` on project The Oracle): `pg_class.relrowsecurity` and `pg_policies` for all `public` tables; `pg_proc` plus `has_function_privilege`/`proacl` for all public functions — results as cited above. No data rows selected; no DDL.
- `grep`/`view` of `src/middleware.ts`, `src/lib/auth.ts`, `src/lib/supabase.ts`, `src/lib/supabase-server.ts`, `src/lib/tool-registry.ts` (edit tools), `src/lib/chat-card-proposals.ts`, `src/lib/chat-proposal-confirm.ts`, `src/lib/move-here.ts`, `src/app/api/decks/**` (cards, batch, move-here, status, notes), `src/app/api/allocation/undo/route.ts`, `src/app/api/cron/refresh-prices/route.ts`, `src/app/api/collection/stats/route.ts`, migrations `20260925220000`, `20261112120000`, `20261113100100`, `20260912150000` — done.
- Web: support.claude.com articles 11175166 and 11176164; claude.com/docs/connectors/building and review-criteria; code.claude.com/docs/en/mcp and permissions — read.
- Not done: tests were not run (audit only); the ~40 routes without an explicit owner filter were not each read; Supabase OAuth server availability not verified; mobile prompt behaviour not tested on a device.
