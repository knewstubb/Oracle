# Report: cc04a-build
Role: Developer
Status: PARTIAL
Task as received: Task CC-04 slice A: implement docs/oracle/contracts/claude-connector-slice-a.md section 12 exactly (read-only, hosted, signed-in Claude connector). Hard rules: user id only from the verified token; user-scoped client, no service key for user data (only the connection-store module may use it); exactly the five read-only tools with readOnlyHint; no write tools; no edits to decisions.md. Write all unit tests in contract section 11; full suite green; tsc and build. Do not apply any migration; finalise the connections migration (copy to supabase/migrations as the final step, not applied); keep the hardening draft in drafts. No live-data writes.

## Summary for the owner
The part where Claude signs in with your Oracle login and can only read your collection and decks is built and tested with simulated data. It cannot be tried for real until you switch on Supabase's sign-in service and approve the small database change, and I have not connected a real Claude to it.

## Changed files
- package.json, package-lock.json — declared `@modelcontextprotocol/sdk`, `jose`, `zod` (were only transitive)
- src/middleware.ts — three exact-match public paths; sign-in redirect now carries a `next` return address
- src/lib/safe-next.ts — accepts only same-site paths for `next`
- src/app/login/page.tsx, src/app/login/login-form.tsx — login honours a safe `next`
- src/app/.well-known/oauth-protected-resource/route.ts and .../mcp/route.ts — public discovery document
- src/app/mcp/route.ts — the `/mcp` endpoint (POST only; GET/DELETE give 405)
- src/app/oauth/consent/page.tsx, actions.ts — consent page (Allow / Deny) and its actions
- src/app/api/connector/revoke/route.ts — switch-off route (cookie sign-in only)
- src/lib/connector/ — errors, limits, verify-token, connection-store (only module using the service key), user-client (select-only wrapper), consent, revoke, handle-request (per-request sequence), server, resource-metadata, public-paths, tools/ (five tools + registry)
- src/lib/connector/__tests__/ — unit tests per contract section 11, plus a skipped-by-default live test file (`mcp.live.test.ts`)
- supabase/migrations/20261116130000_connector_connections.sql — copy of the draft, NOT applied
- docs/oracle/contracts/card-state-actions.examples.ts — one added `@ts-expect-error` comment line (pre-existing build blocker; the `.ts` import extension is needed for Node type stripping, so I suppressed rather than renamed)
- docs/oracle/reports/2026-11-16-developer-cc04a-build.md — this report

## New decisions made (need owner confirmation)
- Consent page wording uses the contract's words ("Claude wants to read your Oracle decks and collection. It can't change anything."), buttons Allow / Deny, plain unstyled-beyond-login layout. Designer may restyle later.
- `/mcp` accepts GET/DELETE only to answer 405 (before any auth check), as the contract says.
- `search_collection` with `only_free` or `include_proxies:false` scans up to 3000 matching cards and says so in `note` when it hits that cap; `copyCount` then counts only the copies matching the filter.

## Assumptions
- Supabase OAuth tokens carry `client_id` and `aud=authenticated` [Approximate, from docs; not seen on a real token]. If the claim is named differently, every `/mcp` call will be refused as invalid.
- `NEXT_PUBLIC_SITE_URL` did not exist in the repo [Confirmed: grep]. New env variable named in this report: `NEXT_PUBLIC_SITE_URL` (falls back to `VERCEL_PROJECT_PRODUCTION_URL`, then localhost). Must be set on Vercel.
- `decks.card_count` is used as the deck card count; it may lag real contents [Approximate].
- `deck_cards.categories` is a JSON-array string; maybeboard = contains "Maybeboard" [Confirmed: src/app/api/decks/[id]/cards/route.ts].
- Indexes on `user_copies(card_id)`, `deck_cards(copy_id)`, `deck_cards(deck_id)` not checked (no DB access used); contract asked for an EXPLAIN before shipping.

## Challenges to locked decisions
- none

## Open questions
- If a Supabase consent still exists but Oracle's connection row was revoked (only possible if `revokeGrant` failed during switch-off), reconnecting auto-approves at Supabase and the owner stays locked out until the grant is removed in the Supabase dashboard. Rare; flagging for Architect.
- Owner decisions still open from the contract: enable Supabase OAuth server, apply hardening draft (left in `supabase/drafts`, not applied), Vercel rate limit on `/mcp`.

## Cannot be verified yet
Needs the owner to enable Supabase's OAuth server (and apply the migration):
- That Supabase's discovery document returns 200 and dynamic client registration works.
- The consent page working end to end: `getAuthorizationDetails` / `approveAuthorization` / `denyAuthorization` / `revokeGrant` calls are written from the library's types only; never run.
- That a real access token has `client_id` and `aud=authenticated`, its lifetime, and that refresh works.
- The `connector_connections` table in use (insert on consent, per-request check, `last_used_at` update, revoke). The migration is untested against a live database.
- Two-account isolation against real row-level security, including `get_deck` on another account's deck id; and the direct Supabase table API check.
- Switch-off taking effect on the very next real request; reconnect creating a new row.
- The hardening draft (not applied) and that normal browser use still works after it.
- Index/EXPLAIN checks and result-size/latency on a large collection on a cold Vercel function.

Needs a live Claude connection (web and Claude Code):
- That Claude accepts the 401 `WWW-Authenticate` header and the protected-resource document, and whether it also asks for the path-suffixed or host-level `/.well-known/oauth-authorization-server` (contract section 3 fallback).
- Tools appearing and working in Claude; `readOnlyHint` being honoured; Claude's "please reconnect" message on an expired token; the Origin check against real Claude requests.
- The streamable-HTTP stateless handling beyond my in-process request tests.
- Existing app after deploy (login, deck page, AI chat) — only the full unit suite was run.

## Verification
- `npx vitest --run` — 263 files passed, 6 skipped; 3094 tests passed, 46 skipped (includes about 90 new connector tests; live file skipped).
- `npx tsc --noEmit` — clean (after the one-line docs fix).
- `npx eslint` on the new/changed connector, oauth, login and middleware files — clean.
- `npm run build` — succeeded; routes `/mcp`, `/oauth/consent`, `/login` listed. Before the docs fix it failed on the pre-existing `card-state-actions.examples.ts` TS5097 error.
- Endpoint example requests: in-process only (tests drive `handleMcpRequest` with fakes). No token → 401 with `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"`; revoked → 401 `CONNECTION_REVOKED`; lookup error → 503 `LOOKUP_FAILED`; `tools/call list_decks` with a `user_id` argument → `isError`, `INVALID_INPUT`. No live request was made; no live data was read or written; no migration applied.
