# Contract: Claude connector, slice A (read-only, hosted, signed-in) (CC-04a)

Status: DRAFT for owner approval. Nothing here is built or applied.
Inputs: brief `docs/oracle/briefs/claude-connector.md`, spec `docs/oracle/specs/claude-connector.md`, audit `docs/oracle/reports/2026-11-16-architect-claude-connector-audit.md` (sections 1, 5, 7), `docs/oracle/contracts/data-separation.md`, `docs/oracle/process.md`.
Types: `docs/oracle/contracts/claude-connector-slice-a.types.ts`. Migration drafts (NOT applied):

- `supabase/drafts/20261116130000_connector_connections.draft.sql` (required)
- `supabase/drafts/20261116130100_oauth_client_tokens_no_writes.draft.sql` (recommended hardening, optional)

## 0. Slice A in one paragraph

From any Claude app the owner adds Oracle as a connector, is sent to Oracle's normal sign-in, approves once, and then Claude can **read** the owner's collection and decks. Nothing can be changed. The owner can switch the connector off and Claude is locked out on its very next request. Out of scope for A: every write/edit tool, the "recent changes" screen, pending approvals, the setup guide, the connection-tab UI (the off-switch exists as a server route; its screen comes later).

## 1. Owner decision applied

Claude signs in with the owner's normal Oracle (Supabase Auth) account and acts as that user. Rules this contract enforces:

1. The user id comes **only** from the verified token (`sub`). No tool has a user id argument; extra arguments are rejected.
2. Reads use a **user-scoped Supabase client** (anon key + the caller's own token), so row-level security applies. The service-role key is **not** used to read user data in slice A at all. Its only use is the `connector_connections` switch table (connection metadata, not user data), always filtered by the verified user id.
3. Therefore no `.rpc()` calls: the user-data functions are service_role-only since CC-03a `[Confirmed: data-separation.md section 4]`, and a user-scoped client would be denied. Slice A reads are plain table selects.

Live check 2026-11-16 (read-only, project "The Oracle"): RLS is ON with own-row policies on `decks`, `deck_cards`, `user_cards`, `user_copies`, `deck_health`; `anon` cannot select them; `authenticated` can; `ref_cards` is readable by both. `[Confirmed: live pg_class / has_table_privilege]`

## 2. OAuth approach: decision

**Decision: use Supabase Auth's built-in OAuth 2.1 server. Oracle does not issue tokens.**

Verified:
- Supabase documents an OAuth 2.1 server (authorization code + PKCE, refresh tokens, dynamic client registration, JWKS, MCP-targeted guide). Beta, free on all plans. `[Confirmed: supabase.com/docs/guides/auth/oauth-server, .../mcp-authentication, .../getting-started]`
- The hosted project has the feature's database tables (`auth.oauth_clients`, `oauth_authorizations`, `oauth_consents`, `oauth_client_states`; 0 clients registered), so the project is new enough. `[Confirmed: live information_schema]`
- **The feature is currently switched OFF.** `GET https://udocxsyzzvrceiuupprj.supabase.co/.well-known/oauth-authorization-server/auth/v1` returns `404 {"error_code":"feature_disabled","msg":"OAuth server is disabled"}`. The owner (or whoever holds dashboard access) must enable it: Authentication > OAuth Server. `[Confirmed: live curl 2026-11-16]`
- Token signing is asymmetric (ES256, public JWKS at `/auth/v1/.well-known/jwks.json`, HTTP 200), so Oracle verifies tokens locally with no secret and no extra network call per request. `[Confirmed: live curl]`

Why this and not an Oracle-issued-token OAuth with our own Dynamic Client Registration:
1. The owner's wish is "the owner's normal Oracle account". Supabase's server issues tokens for exactly that account, reuses the existing login, and does refresh rotation and PKCE for us. Hand-rolling an OAuth server (codes, PKCE, refresh rotation, registration, redirect-URI validation) is the most security-sensitive code in the project; not worth owning.
2. Tokens are real Supabase user JWTs, so RLS works with no extra plumbing (rule 2 above).
3. Fallback exists: if Supabase cannot be enabled (beta flag, plan), the slice returns to a minimal Oracle-issued OAuth (DCR + `/login` reuse + a hashed-token table). That is a materially bigger slice; Gene should re-plan rather than Developer improvising.

Costs and risks the owner should know (details in section 7):
- It is a **beta** feature. Mitigation: only the `/mcp` connector depends on it; the rest of Oracle is unaffected.
- **Dynamic registration** must be on so Claude can register itself, which means any program on the internet can register a client name. It gets nothing without the owner signing in and approving the consent page, which is Oracle's own page. Registered clients are listed in the Supabase dashboard for monitoring.
- A Claude token is also a valid signed-in token for Supabase's own table API. Slice A's read-only promise must therefore not rest only on the tool list: see the optional hardening draft (section 7.4).
- Supabase's token lifetime defaults to 1 hour; Claude refreshes silently. A connection switched off in Oracle takes effect on the **next request** regardless of token life (section 5).

### 2.1 Flow

1. The owner adds the connector in Claude with the URL `https://<vercel-domain>/mcp`.
2. Claude calls `/mcp` without a token. Oracle answers `401` with `WWW-Authenticate: Bearer resource_metadata="https://<vercel-domain>/.well-known/oauth-protected-resource"`.
3. Claude reads that document (section 3), which names Supabase Auth as the authorization server (`https://udocxsyzzvrceiuupprj.supabase.co/auth/v1`), finds Supabase's discovery document, registers itself (DCR), and sends the owner to Supabase's authorize endpoint (PKCE).
4. Supabase redirects the browser to Oracle's **`/oauth/consent?authorization_id=...`** (set as the project's "authorization path"). This is a new, small Oracle page:
   - Not signed in: middleware sends the owner to `/login` carrying a return address; after login they land back on the consent page. **Developer change needed:** today `/login` always goes to `/` and the middleware redirect carries no return address `[Confirmed: src/app/login/login-form.tsx line 33, src/middleware.ts]`. Add a `next` parameter, accepted only if it is a same-site path starting with `/` (not `//`).
   - Signed in: the page loads the request details (`supabase.auth.oauth.getAuthorizationDetails`), shows the client name and plain words: "Claude wants to read your Oracle decks and collection. It can't change anything." Buttons: Allow, Deny. (Visual design is Designer's; slice A may ship a plain page, content fixed here.)
   - Allow: a server action (a) takes the user id from the cookie session, (b) inserts the `connector_connections` row (user id, client id, client name), (c) calls `approveAuthorization` and redirects to the returned URL. If (c) fails, (b)'s row is deleted again in the same action. Deny: `denyAuthorization`, no row.
5. Claude exchanges the code for tokens at Supabase and calls `/mcp` with `Authorization: Bearer <access token>`. Every request goes through section 4.

Slice A also needs a way to switch off: `POST /api/connector/revoke` body `{ connectionId }`, cookie-authenticated (a normal signed-in browser request, not a Claude token: it rejects any token with a `client_id` claim so Claude cannot disconnect-and-reconnect or revoke others). It sets `revoked_at = now()` for that user's row, then calls `supabase.auth.oauth.revokeGrant(clientId)` with the owner's session so refresh tokens die too. Order matters: set `revoked_at` **first** so access is cut even if the second call fails. Its screen is a later slice.

## 3. Public paths (middleware)

Current middleware only understands cookies and redirects/401s everything not in `PUBLIC_ROUTES`; matching uses `startsWith` `[Confirmed: src/middleware.ts]`. Add exactly these, matched **exactly** (not by prefix), and short-circuit before any cookie/session work:

| Path | Why public | Who checks auth |
|---|---|---|
| `/mcp` | Claude has no browser cookie | The route itself (section 4); returns 401 + `WWW-Authenticate` |
| `/.well-known/oauth-protected-resource` | Discovery must work before sign-in | Nobody; static JSON |
| `/.well-known/oauth-protected-resource/mcp` | Path-suffixed form some clients request first | Nobody; same JSON |

Not public (cookie session still required, unchanged): `/oauth/consent`, `/api/connector/revoke`, everything else. Do **not** add `/oauth` or `/.well-known` as prefixes. The matcher in `config` needs no change (it already runs on these paths); `/.well-known/*` must not be swallowed by the static-file exclusion (it is not: no extension).

Protected-resource document (static, no secrets):
```json
{ "resource": "https://<vercel-domain>/mcp",
  "authorization_servers": ["https://udocxsyzzvrceiuupprj.supabase.co/auth/v1"],
  "bearer_methods_supported": ["header"],
  "resource_name": "Oracle" }
```
Domain and Supabase URL come from env (`NEXT_PUBLIC_SITE_URL` [new, confirm what exists], `NEXT_PUBLIC_SUPABASE_URL`), never hard-coded. `[Approximate: older MCP spec revision 2025-03-26 looks for authorization-server metadata on the MCP host itself. If the live check (section 11) shows Claude does that, add a public `/.well-known/oauth-authorization-server` that proxies Supabase's document; do not add it speculatively.]`

Also: the Supabase project's **Site URL** and redirect allow-list must include the Vercel domain (owner/dashboard step, section 8).

## 4. The `/mcp` endpoint: per-request sequence

Transport: MCP **Streamable HTTP**, **stateless** (new server+transport per POST, no session id, JSON responses; fits Vercel serverless). `GET` and `DELETE` return `405` with `Allow: POST`. Use the SDK's web-standard transport `[Confirmed: node_modules/@modelcontextprotocol/sdk 1.29.0 has server/webStandardStreamableHttp.js]`. Route handler `src/app/mcp/route.ts` with `export const runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.

Dependency note: `@modelcontextprotocol/sdk`, `jose` and `zod` exist in `node_modules` only as transitive packages; none is in `package.json` `[Confirmed: package.json]`. Developer must declare them explicitly (the audit's "already a dependency" was loose).

Every request, in this order, any failure stops with the error shown:

1. **Origin check.** If an `Origin` header is present and is not `https://claude.ai` or `https://claude.com`, return `403 FORBIDDEN_ORIGIN`. No Origin (server-to-server) is allowed.
2. **Bearer token present** (`Authorization: Bearer`), else `401 UNAUTHENTICATED` with `WWW-Authenticate: Bearer resource_metadata="..."`.
3. **Verify the JWT locally** with `jose` against the project JWKS (cached): algorithm ES256 only, `iss` = `<supabase-url>/auth/v1`, `aud` = `authenticated`, `exp`/`nbf` with 30 s tolerance. Require a `sub` (uuid) and a `client_id` claim. A normal browser session token has no `client_id` and is **refused**: the connector accepts only tokens issued through the OAuth flow. Failure: `401 invalid_token`, description "Your Oracle sign-in expired. Please reconnect Oracle in Claude." (expired) or "Invalid token".
4. **Connection check (the off-switch).** With the service-role client: `select id from connector_connections where user_id = <sub> and client_id = <client_id> and revoked_at is null`. None found: `401 CONNECTION_REVOKED`, description "This connection was switched off in Oracle. Reconnect from Claude to allow it again." This runs on **every** request (one indexed lookup). If the lookup itself errors, fail **closed** with `503 LOOKUP_FAILED` (never let a request through unchecked).
5. **Bump `last_used_at`** at most once a minute: `update ... set last_used_at = now() where id = <id> and (last_used_at is null or last_used_at < now() - interval '1 minute')`. Best effort; failure is logged, request continues.
6. **Build the user-scoped client**: `createClient(url, anonKey, { global: { headers: { Authorization: 'Bearer <token>' } }, auth: { persistSession: false, autoRefreshToken: false } })`. This is a new helper (`createUserScopedClient(token)`); it must be the only client handed to tool code. Tool functions receive `{ db, userId }` where `userId` is the verified `sub`; they use it for explicit `.eq('user_id', userId)` **as well** as RLS (belt and braces: a missing policy must not become a leak).
7. Dispatch the MCP message. Tools in section 5.

The service-role client is never passed to tool code. Add a unit test that asserts tool modules do not import `createAdminClient`/`SUPABASE_SERVICE_ROLE_KEY` (lint-style grep test).

## 5. Tool list (all read-only)

Every tool: `annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`, strict zod input (unknown keys rejected, so a smuggled `user_id` is an `INVALID_INPUT` error, not ignored). No tool takes a user id. No write, delete, import, sync or propose tools are registered, and none can be called by name (the server only dispatches registered tools).

| Tool | Input | Returns |
|---|---|---|
| `get_collection_summary` | none | Counts: distinct cards, total copies, original, proxy, in decks, in storage, marked missing (`CollectionSummary`). |
| `search_collection` | `query?` (name contains, 1-100 chars), `only_free?` (copies not in any deck), `include_proxies?` (default true), `limit?` (1-25, default 25), `offset?` | Owned cards matching, each with exact `copyCount` and up to 20 `CopyView`s: printing (`scryfall_id`), finish, original/proxy, **where it is** (deck name or storage location), missing flag. Case-insensitive name match via `ilike` with `%`/`_` escaped. |
| `list_decks` | `include_inactive?` (default false), `limit?` (1-50, default 50), `offset?` | `DeckSummary[]`: name, commander, format, status, bracket, card count, sleeved count. |
| `get_deck` | `deck_id` (int), `limit?` (1-150, default 150), `offset?` | `DeckDetail`: summary, commander, mainboard cards (name, qty, categories, ownership, sleeved?, printing, finish), `maybeboardCount`. Maybeboard cards are those whose `categories` contain "Maybeboard" `[Confirmed: src/app/api/decks/[id]/cards/route.ts, explicit category "Maybeboard"]`; list them with `include_maybeboard: true` (default false) on the same paging. A deck that is not the caller's returns `NOT_FOUND`, identical to a missing deck. |
| `get_deck_health` | `deck_id` | The **cached** row from `deck_health` only (overall status, computed time, trimmed result). Never computes (computing is expensive and writes). If no row: `status: 'not_computed'`, plain words saying so; this is a statement, not "healthy". Cheap, so included. |

Left out of slice A on purpose: shortages/spare (D-027/D-037, needs the reconcile helpers, which use service-role RPCs; later slice), card facts and prices (outside data, D-035 labelling), `browse_spare_copies` (service-role path). `search_collection` with `only_free` covers "spare copies" for now.

Query shape (so Developer does not invent joins): `user_cards` (name, oracle_id, type_line) -> `user_copies` by `card_id` (printing, finish, proxy, missing, `location_id`) -> placement via `deck_cards.copy_id` -> `decks.name`; storage name via `user_locations` `[Approximate: its columns were not read; confirm]`. Do these as 2-3 bounded selects with `in(...)` lists, not per-row queries. Index check: `user_copies(card_id)`, `deck_cards(copy_id)`, `deck_cards(deck_id)` should exist `[Approximate: not verified]`; Developer to `EXPLAIN` before shipping.

Identifier rule (D-003): results label `oracleId` (card) and `printingId` (a `scryfall_id`, a printing) separately and never reuse one for the other. Finish is its own field (AGENTS.md).

## 6. Per-connection store: `connector_connections` (draft migration)

Columns: `id uuid pk`, `user_id uuid not null -> auth.users on delete cascade`, `client_id text not null` (Supabase OAuth client id, not a card id), `client_name text not null`, `created_at`, `last_used_at`, `revoked_at`. Unique: one **active** row per `(user_id, client_id)` (partial unique index where `revoked_at is null`); revoked rows are kept as history. RLS on; owners may `select` their own rows only; nobody except service_role can insert/update/delete (so a Claude token cannot un-revoke itself). Writes are single-row statements, so each is atomic; the consent step's two actions (insert row, approve) are compensated in code (section 2.1 step 4) rather than in one transaction because the second half is a call to another service.

Why a table when Supabase already records consents (`auth.oauth_consents` has `revoked_at`)? `[Confirmed: live columns id, user_id, client_id, scopes, granted_at, revoked_at]` That table is in the `auth` schema (not ours to read or query from the app and not covered by our RLS), and has no "last used". Our table is the thing the request path checks and the owner screen lists. Both are set on revoke.

Tokens are **not** stored by Oracle. Revocation = `revoked_at` (immediate, checked per request) plus Supabase `revokeGrant` (stops refresh).

## 7. Safety model

1. **Not signed in:** no/invalid token gives 401 and nothing else (brief S8, success criterion 5).
2. **Other people's data:** token `sub` is the only identity; RLS own-row policies plus explicit `user_id` filters; no tool takes an id of a person. Two-account test in section 11.
3. **Read-only:** tool list has no writes; the user-scoped client could write under RLS, so tool code only calls `select` (add a unit test that the db helper handed to tools exposes `select`/`count` only, via a thin wrapper that omits `insert/update/upsert/delete/rpc`).
4. **Direct-API gap (recommended hardening):** a Claude token + the public anon key could bypass Oracle and write the owner's rows through Supabase's table API. Draft `20261116130100_oauth_client_tokens_no_writes.draft.sql` adds RESTRICTIVE policies on the 22 own-row tables so a token carrying a `client_id` claim cannot insert/update/delete. The claim name must be confirmed on a real token first (Approximate). **Recommendation: apply it with the connection table.** If the owner declines, slice A is "read-only by tool list only", which is weaker, and the report says so.
5. **Switch-off** is per request (section 4 step 4). **Fail closed** on any check error.
6. **Logging:** log connection id, tool name, outcome, duration. Never log tokens, never log card/deck content.
7. **Rate:** no limiter in slice A beyond the size caps; note for Developer: Vercel's built-in firewall/rate limiting can be turned on per path `/mcp` at no code cost (owner decision, section 13 Q3).

## 8. Owner / dashboard prerequisites (nothing here is done)

1. Enable Authentication > OAuth Server on project "The Oracle"; set authorization path `/oauth/consent`; enable dynamic client registration.
2. Site URL and redirect allow-list include the Vercel domain.
3. Approve and apply the migration draft(s) (Developer applies after approval; Architect does not).
4. Set `NEXT_PUBLIC_SITE_URL` (or confirm the existing equivalent) on Vercel.

## 9. Result size caps

- Hard response cap: **40 KB serialised JSON** per tool call (about 10k tokens). If over, drop rows from the end until under, set `truncated: true`, and say so in `note`. If a single row cannot fit: `TOO_LARGE`.
- Page caps: `search_collection` 25 cards (default and max) x 20 copies each; `list_decks` 50; `get_deck` 150 cards per page; `get_deck_health` result trimmed to 20 KB.
- Strings: any free-text field cut at 300 characters with an ellipsis; names are never cut.
- Every list returns `total` (exact count via `count: 'exact'`) so Claude can say "showing 25 of 212". Truncation is always stated; never silent (D-030).
- Request body cap 32 KB.

## 10. Error shapes

Transport level (the three the client must act on):

| Situation | HTTP | Body / header |
|---|---|---|
| No or bad token, or expired | 401 | `WWW-Authenticate: Bearer error="invalid_token", error_description="...", resource_metadata="..."`; JSON `{ ok:false, error:{ code:'UNAUTHENTICATED', message:'Your Oracle sign-in expired or is missing. Please reconnect Oracle in Claude.', retryable:false } }` |
| Connection switched off | 401 | same header, `CONNECTION_REVOKED`, message "This connection was switched off in Oracle. Reconnect it from Claude to allow it again." |
| Bad Origin | 403 | `FORBIDDEN_ORIGIN` |
| Switch-table lookup failed | 503 | `LOOKUP_FAILED`, `retryable: true` |

Tool level (HTTP 200, MCP result with `isError: true`, `content[0].text` = the plain-words message, `structuredContent` = `ConnectorErrorBody`): `INVALID_INPUT` (message names the field), `NOT_FOUND` ("No deck with that id in your Oracle."), `LOOKUP_FAILED` ("Oracle could not read your collection just now. This is not an empty collection. Try again."), `TOO_LARGE`. A database error is **never** mapped to an empty list or zero count (D-030).

## 11. Test plan

**Unit tests (mocks, run in CI, no network):**
1. Token verification with a locally generated ES256 key pair and a stubbed JWKS: valid; expired; wrong `iss`; wrong `aud`; wrong alg (HS256, `none`); missing `sub`; missing `client_id` (browser-session token refused); tampered signature.
2. Middleware: the three public paths pass without cookies; near-miss paths (`/mcp/x`, `/mcpfoo`, `/.well-known/other`, `/oauth/consent`) do not; existing public routes unchanged.
3. Connection check: active row -> ok; no row -> `CONNECTION_REVOKED`; revoked row -> `CONNECTION_REVOKED`; the lookup errors -> 503 and the tool is **not** called; `last_used_at` update throttled to once per minute.
4. User id source: tool handlers receive `sub` only; a tool call with `user_id`/`userId` in arguments is `INVALID_INPUT`; the mock db asserts every query carries `.eq('user_id', <sub>)`.
5. Read-only: the db wrapper given to tools has no write methods or `rpc`; static test that `src/lib/connector/**` does not import `createAdminClient` or read `SUPABASE_SERVICE_ROLE_KEY` outside the connection-store module.
6. Each tool: happy path; empty result is explicit (`total: 0`) and distinct from a mocked database error (`LOOKUP_FAILED`); caps (25/50/150, 40 KB truncation sets `truncated` and `note`); string cut; wildcard characters in `query` escaped; `deck_id` for another user's deck returns `NOT_FOUND` identical to a missing deck; `get_deck_health` with no row returns `not_computed`.
7. Consent action: approve inserts then approves; approve failure deletes the row; deny inserts nothing; unauthenticated call is refused; `next` parameter accepts `/oauth/consent?...` and rejects `//evil.com`, `https://evil.com`, `/\evil`.
8. Revoke route: cookie user can revoke only their own row; a request with a `client_id`-bearing token is refused; sets `revoked_at` before calling `revokeGrant`; `revokeGrant` failure still leaves the row revoked.
9. Registered tools are exactly the five in section 5, all `readOnlyHint: true` (snapshot test; adding a tool fails it until the contract is changed).

**Needs a live check (Tester, against the test account, after owner enables Supabase OAuth; never the owner's real data):**
1. Supabase discovery URL returns 200 after enabling; DCR on.
2. Real connect from Claude (web) and from Claude Code (loopback redirect): sign-in, consent page, tools appear. Also confirm whether Claude requests the path-suffixed and/or host-level well-known documents (section 3 note).
3. Real token inspection: `client_id` claim present, `aud` = `authenticated`, access-token lifetime, refresh works after expiry.
4. Two accounts: B's connection never returns A's decks/copies; `get_deck` on A's deck id as B is `NOT_FOUND`; direct Supabase table API with B's token and A's ids returns nothing.
5. Switch-off: revoke, then the very next `/mcp` call is refused; reconnect creates a new row.
6. If the hardening draft is applied: a Claude token calling Supabase's table API with insert/update/delete is rejected; the normal browser session still works (smoke: open a deck, change status).
7. Expired token: Claude shows "please reconnect" rather than empty data.
8. Cap behaviour on the owner-shaped large collection (test account seeded with several thousand copies): response under 40 KB, `truncated` set, latency acceptable on a cold Vercel function.
9. Existing app unaffected: login, logout, a deck page, in-app AI chat.

## 12. Developer task list (slice A)

1. Declare `@modelcontextprotocol/sdk`, `jose`, `zod` in `package.json`.
2. Middleware: exact-match public list (section 3); pass a return address from the redirect to `/login`; login form honours a safe `next`.
3. `src/app/.well-known/oauth-protected-resource/route.ts` (+ `/mcp` suffixed form).
4. `src/lib/connector/` : `verify-token.ts`, `connection-store.ts` (the only module allowed service-role), `user-client.ts`, `limits.ts`, `errors.ts`, `tools/*.ts`; `src/app/mcp/route.ts`.
5. `src/app/oauth/consent/page.tsx` + server actions; `src/app/api/connector/revoke/route.ts`.
6. Tests per section 11 (unit), live test file in the existing `*.live.test.ts` style.
7. Apply migration only after owner approval.

## 13. Open owner questions (behaviour only; also in the report)

1. OK to switch on Supabase's "OAuth server" setting (beta) on the Oracle project, with registration open to any Claude app but approval only from your signed-in account?
2. Apply the extra safety rule so a Claude sign-in can never change your data even by going around Oracle? (Recommended: yes.)
3. Turn on request rate-limiting for the connector address at Vercel? (Recommended: yes, it costs no code.)
