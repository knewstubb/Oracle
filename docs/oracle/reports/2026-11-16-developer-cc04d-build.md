# Report: CC-04d switch + setup guide
Role: Developer
Status: DONE
Task as received: CC-04 remaining slice: make the Connection tab switch fully working (off = revoke; ON from off re-enables if Claude's grant is still valid, else "Needs reconnecting"; status route distinguishes active / off / expired) and replace the Setup guide stub with the real tab (spec 3.1, 3.3). Branch cc04d-guide-switch.

## Summary for the owner
The Claude on/off switch now works both ways. Switching on re-enables the link when Claude's sign-in is still good; otherwise the page shows "Needs reconnecting" with a button that opens the Setup guide. The Setup guide is now a real step-by-step tab for web, desktop, phone and Claude Code, with a copy button for the connector address. One thing to know: switching off also signs Claude out on purpose, so in normal use switching back on will lead to "Needs reconnecting" and a reconnect from Claude (see Decisions).

## Changed files
- supabase/migrations/20261116170000_connector_reenable.sql — two new functions (additive): `connector_grant_alive`, `reenable_connector_connection`. No table or data change.
- supabase/drafts/20261116170000_connector_reenable.rollback.sql — undo script (drops the two functions).
- src/lib/connector/write-types.ts, write-gateway.ts — gateway gets `latestConnection`, `grantAlive`, `reenable`.
- src/lib/connector/owner-api.ts, api-types.ts — status now returns `state` (active | off | expired) and `can_reenable`; new `enableConnection`.
- src/app/api/connector/enable/route.ts — new POST route, cookie-only (same guard as approve/decline: Authorization header, Claude-token and wrong-Origin refused).
- src/components/connector/api.ts, ConnectionTab.tsx — switch-on flow, Needs reconnecting alert + "Show me how to reconnect".
- src/components/ui/accordion.tsx (Base UI), SetupGuideTab.tsx, connector-address.ts — the real guide.
- Tests: ConnectionTab.test.tsx (+5), connection-status.test.ts (new, 10), SetupGuideTab.test.tsx (new, 9), small.test.tsx (stub test removed), edit-tools.test.ts (mock gateway fields).

## How the status is decided
- Signal: Claude's grant is "alive" when `auth.oauth_consents.revoked_at` is null AND at least one `auth.sessions` row for that user and app exists that has not passed `not_after` (no session = dead refresh token). [Confirmed: live DB; owner's row reads alive = true.]
- Row on + grant alive = active. Row on + grant gone = expired ("Needs reconnecting"). Row off = off, `can_reenable` = grant alive. No row = off.
- A row younger than 2 minutes counts as active (the row is written at Allow; the session a moment later).
- If the check itself fails, the route returns 503 and the screen shows "can't check", never Off or Expired.
- Auth tables are not exposed to the API, so the check runs in a service-role-only function.

## New decisions made (need owner confirmation)
- Switching off still revokes Claude's grant (existing hardening from CC-04a/b). So after a normal off, grant is gone and switch-on says "Needs reconnecting". Switch-on only truly re-enables when the grant revoke failed (the "saved sign-in may linger" warning case). If the owner wants true one-tap re-enable, off would have to stop revoking the grant (row check alone already blocks Claude); that is a security trade-off, so not changed.
- "Needs reconnecting" after a failed switch-on reuses the expired alert wording from spec 3.1.
- Setup guide steps use "Customize > Connectors > Add > Add custom connector". The Claude Code step says "follow the sign-in prompt" because naming its connection menu command would show the banned word.

## Assumptions
- `NEXT_PUBLIC_SITE_URL` (if set, non-local) is the site address; otherwise https://oracle-alpha-two.vercel.app. The server-only `siteUrl()` helper falls back to localhost and reads server env, so the client uses its own small helper with the same variable and the required fallback.

## Challenges to locked decisions
- none

## Open questions
- Spec 3.3 top notice says the phone app "can't add a new connector yet". Claude's help centre now says adding on mobile is in beta (web and desktop remain the main path). I kept the spec wording; the designer may want to soften it.
- Not confirmed: exact phone menu wording; Claude Code's own sign-in step after the one-line command (docs describe it via its connections menu); the "Sign in now / when needed" choices Claude shows (I tell the owner to leave defaults). Confirmed against support.claude.com custom connectors article (Customize > Connectors, "+ Add", "Add custom connector", name, URL, Continue, Add; connectors toggled per chat from "+") and code.claude.com docs (`claude mcp add --transport http <name> <url>`). Phone: "available on mobile after adding on web/desktop" per support.claude.com connectors article.
- Not tested live: the revoked-then-re-enable database path (would require changing the owner's row, which was forbidden). Covered by mocked tests only.
- Not checked in a browser (no visual check of the accordion).

## Verification
- DB: functions validated in a transaction that raised an error at the end (rolled back): owner row alive = true; re-enable on already-on row = already_on, no write; unknown id = not_found; wrong client = false. Then applied via apply_migration `connector_reenable`. Owner's row verified untouched (active, not modified).
- `npx tsc --noEmit` — clean.
- `npx eslint` on touched folders — clean.
- `npx vitest --run` — 273 files passed, 3204 tests passed, 46 skipped, 0 failed.
- `npx next build --webpack` — success; `/api/connector/enable` listed.
- State coverage: Connection — loading, active, off, status error, switch-off ok/failed, switch-on ok, switch-on needs reconnecting (alert, badge, guide button), switch-on failed, never-connected, expired. Guide — top notice, address + copy + toast, copy failure toast, four sections with web open, keyboard open, Claude Code block + copy, footer, banned-words and emoji check.
