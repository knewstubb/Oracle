# Report: cc04a-verify
Role: Tester
Status: PARTIAL

Task as received: Verify CC-04 slice A on branch cc04a-connector (commit c00de3d) against contract sections 3-11 and the developer report. Full tests + build, code review for rule violations, curl probes, live table check. No real Claude connect.

## Summary for the owner
The Claude connector's code and safety checks hold up in every test I could run without really connecting Claude. The one thing that fails is the production build. That failure comes from an older price-refresh file that this slice did not touch, but it still has to be fixed before shipping. Real Claude connection could not be tested because Supabase's sign-in server is still off.

## Changed files
- docs/oracle/reports/2026-11-16-tester-cc04a-verify.md — this report. No product code was changed.

## New decisions made (need owner confirmation)
- none

## Assumptions
- The branch is checked out in the main checkout, so I used a detached worktree at c00de3d (symlinked node_modules, copied .env.local). Both were removed afterwards, and so was the worktree.
- The dev server ran with the local auto-login variables blanked. Otherwise every page counts as signed in and the near-miss tests are meaningless.

## Results per check
1. **Tests and build — PARTIAL**
   - `npx vitest --run`: PASS. 263 files passed, 3094 tests passed, 46 skipped (6 files). The skips include `mcp.live.test.ts`, which needs a real token.
   - `npm run build`: FAIL. Two causes, only the first is a code defect:
     - D1 (real defect, outside slice A): `src/app/api/collection/refresh-prices/route.ts` exports `parsePositiveUsd`, which Next.js does not allow from a route file. The type check fails. The file is not in this branch's diff and was last changed in commit 86fc31c (t47-t50-prices), so the failure is probably already on main. I did not run a build on main to confirm this. The compile step itself succeeded.
     - Turbopack refused the symlinked node_modules ("points out of the filesystem root"). This is an artefact of my test setup. I fell back to `next build --webpack`.
   - I did not run typecheck or lint separately. The webpack build's type check stopped at D1 only.
2. **Code review — PASS**
   - The user id comes only from the verified token's `sub` (UUID-checked). Tokens without a `client_id` are refused. ES256 only, issuer and audience checked.
   - Admin client use: the only connector file that references it is `connection-store.ts`. The registry-and-isolation test also references it, only to assert this. No `.rpc(` anywhere in the connector code.
   - The tool database handle exposes `select` only. Every tool file filters on `user_id`.
   - Exactly five tools, all read-only: get_collection_summary, search_collection, list_decks, get_deck, get_deck_health. All carry readOnlyHint annotations.
   - Public paths in middleware are an exact-match list of three. They are checked before any cookie work.
   - Fail closed: a connection lookup error returns 503 LOOKUP_FAILED, a revoked connection returns 401, and a body over 32 KB returns 413.
   - `safeNextPath` rejects `//`, `/\`, control characters, anything not starting with `/`, and anything over 2000 characters.
   - The revoke route refuses any request with an Authorization header (403) and any session token carrying `client_id` (403).
   - The only console output is two fixed-text messages in connection-store. Nothing logs tokens or secrets.
3. **Live probes (dev server, webpack, port 3107) — PASS**
   - POST /mcp with no token: 401 with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`.
   - Garbage Bearer token: 401 with `error="invalid_token"` and `resource_metadata`.
   - Origin https://evil.com: 403 FORBIDDEN_ORIGIN.
   - GET /mcp: 405 with `Allow: POST`, as the contract says.
   - /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/mcp: 200 JSON with `authorization_servers: ["https://udocxsyzzvrceiuupprj.supabase.co/auth/v1"]`.
   - Signed out, these near-misses all redirect to /login?next=…: /mcp/x, /mcpfoo, /.well-known/oauth-protected-resource/x, /.well-known/other, /oauth/consent, /decks. / redirects to /login. /api/decks returns 401. /login returns 200 and /login?next=//evil.com returns 200.
   - /mcp/ and /.well-known/…resource/ (trailing slash) get a 308 to the exact path. That is Next's normal behaviour.
   - POST /api/connector/revoke with a Bearer token or with no auth: 401 (stopped by middleware before the 403 logic runs). It is rejected either way.
   - The next-redirect handling is only unit-tested. I did not browser-test the post-login redirect.
4. **Live table — PASS**
   - connector_connections exists. An anon REST read returns 42501 "permission denied for table". A read with the service key returned `content-range: */0`, so the table is empty. The service key was not printed or stored.

## Minor observations (not blocking)
- `resource_metadata` and `resource` use `http://localhost:3000` when NEXT_PUBLIC_SITE_URL is unset. Make sure that variable is set in Vercel. Otherwise Claude would be pointed at the wrong address.
- Revoke with a Bearer header gets 401 from middleware rather than the handler's 403. It is still rejected.

## Not tested
- A real Claude connect, consent screen end to end, token verification against live keys, and the five tools against real data. Supabase's OAuth server is off, so the owner has to enable it. The live test file `mcp.live.test.ts` stays skipped until then.

## Challenges to locked decisions
- none

## Open questions
- Does `npm run build` already fail on main with D1? Gene should confirm. If so, it is a separate fix.

## Verification
- `npx vitest --run` — 3094 passed, 0 failed
- `npm run build` — Turbopack failed on the symlink (setup artefact). `next build --webpack` compiled but the type check failed on D1.
- `next dev --webpack -p 3107` with curl probes — all as described above
- anon and service REST probes against connector_connections — as described above
