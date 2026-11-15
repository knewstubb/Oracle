# Report: cc04a-contract
Role: Architect
Status: DONE
Task as received: Task CC-04 slice A: write the contract at docs/oracle/contracts/claude-connector-slice-a.md for a READ-ONLY, hosted, login-protected Claude connector (remote MCP over Streamable HTTP at /mcp on the Vercel deployment) with sign-in. Inputs: brief, spec, audit (sections 1, 5, 7), process.md, data-separation.md. Owner decision (new): Claude signs in with the owner's normal Oracle (Supabase Auth) account; the connector acts as the signed-in user, user id comes ONLY from the verified token, server key never used to read user data without scoping by the verified user id (prefer a user-scoped client so RLS applies). Decide and justify the OAuth approach, exact middleware public paths, read-only tool list (all readOnlyHint), per-connection token store table (draft migration only, in supabase/drafts, do not apply), result size caps, error shapes, test plan. Slice A excludes write tools, the "recent changes" screen and the setup guide. Do not edit decisions.md or application code. Commit both with the draft migration.

## Summary for the owner
Claude will sign in with your normal Oracle login and can then only look at your collection and decks; it cannot change anything, and you can switch it off so Claude is locked out on its next request. One thing needs your yes: Oracle's database provider has a built-in sign-in service for this, but it is currently switched off, and turning it on is a dashboard setting for you. Nothing has been built or changed yet.

## Changed files
- docs/oracle/contracts/claude-connector-slice-a.md — the contract (OAuth decision, public paths, tools, caps, errors, tests)
- docs/oracle/contracts/claude-connector-slice-a.types.ts — reference types for Developer (no handlers)
- supabase/drafts/20261116130000_connector_connections.draft.sql — DRAFT, not applied: the on/off switch table (RLS on, server-only writes)
- supabase/drafts/20261116130100_oauth_client_tokens_no_writes.draft.sql — DRAFT, not applied, optional: blocks a Claude token from writing around Oracle
- docs/oracle/reports/2026-11-16-architect-cc04a-contract.md — this report

## New decisions made (need owner confirmation)
- Use Supabase Auth's OAuth 2.1 server (not an Oracle-built one). Verified available (tables present, ES256 JWKS live) but **disabled** today (`feature_disabled` 404 on the discovery URL). Enabling it is a prerequisite. It is a beta feature.
- Switch-off is a new table `connector_connections`, checked on every request, fail-closed; revoke sets the row first, then Supabase `revokeGrant`.
- Slice A reads use a user-scoped client and plain selects only (no RPCs, since they are service_role-only after CC-03a); the service-role key touches only the switch table.
- Browser-session tokens (no `client_id` claim) are refused at `/mcp`.
- Middleware public paths: `/mcp`, `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp`, exact match only.
- Recommended extra: RESTRICTIVE RLS policies so any OAuth-client token cannot insert/update/delete on the 22 own-row tables. Without it, "read-only" holds only through Oracle's tool list, because a Claude token plus the public key can call Supabase's table API directly.
- Five tools: `get_collection_summary`, `search_collection`, `list_decks`, `get_deck`, `get_deck_health` (cached only). Caps: 40 KB per response, 25/50/150 row pages.
- D-034 amendment is not touched (no writes in slice A).

## Assumptions
- Supabase OAuth access tokens carry a `client_id` claim and `aud=authenticated` (docs say so; not seen on a real token). [Approximate] The hardening draft and token check both depend on it.
- Claude uses the protected-resource document and does not need authorization-server metadata on Oracle's own host. [Approximate] Fallback described in the contract.
- `user_locations` columns, and indexes on `user_copies(card_id)`, `deck_cards(copy_id)`, `deck_cards(deck_id)`, were not checked.
- `NEXT_PUBLIC_SITE_URL` may not exist; Developer confirms the env name.

## Challenges to locked decisions
- none. Two corrections to earlier docs: (1) the audit said `@modelcontextprotocol/sdk` is "already a dependency"; it is only a transitive package in `node_modules`, not in `package.json` [Confirmed: package.json], as are `jose` and `zod`. (2) `/login` ignores any return address and middleware sends none, so the consent step needs a small login change [Confirmed: src/app/login/login-form.tsx, src/middleware.ts].

## Open questions
1. May the Supabase OAuth server (beta) be enabled on project "The Oracle", with open client registration and approval only from the owner's signed-in account?
2. Apply the optional hardening migration with the connection table? (Recommended yes.)
3. Turn on Vercel rate limiting for `/mcp`? (Recommended yes.)
4. If Supabase's OAuth server cannot be enabled, Gene should re-plan: the fallback (Oracle-issued tokens + registration) is a much larger slice.

## Verification
- git status — clean apart from pre-existing untracked files from other agents; only my files are staged.
- Supabase MCP, read-only SELECTs on project udocxsyzzvrceiuupprj — RLS on with policies for decks/deck_cards/user_cards/user_copies/deck_health; `auth.oauth_*` tables exist, 0 clients, 3 users; anon cannot select user tables; column lists read.
- curl discovery endpoint — 404 `feature_disabled`; JWKS — 200, one ES256 key.
- Supabase docs search — OAuth 2.1 server, MCP authentication, flows, revokeGrant, token claims.
- No tests or builds run (documents and unapplied drafts only).
