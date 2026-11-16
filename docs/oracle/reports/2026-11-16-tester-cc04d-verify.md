# Report: cc04d-verify
Role: Tester
Status: DONE
Task as received: Verify branch cc04d-guide-switch (switch on/off + Setup guide, spec 3.1 and 3.3) without touching owner account da7ccf96-2c73-431c-9d03-952463f82dcc. Checks: type check, tests, build; live read-only review of the two new database functions and the status route; throwaway-user UI run of the Connection tab states, off/on, off cancels pending, Setup guide; confirm owner data untouched.

## Summary for the owner
The on/off switch and the Setup guide work as specified, and your real data was not touched (deck, card and copy counts and your Claude connection row are identical before and after). One thing to know: after a normal "off", switching back on always says "Needs reconnecting", because off also signs Claude out on purpose. This is what the developer reported and it matches the spec's wording.

## Results
| # | Item | Result |
|---|------|--------|
| 1a | `npx tsc --noEmit` | PASS (exit 0) |
| 1b | `npx vitest --run` | PASS: 273 files, 3204 tests passed, 46 skipped, 0 failed |
| 1c | `npx next build --webpack` | PASS (exit 0); `/api/connector/enable` listed |
| 2a | New functions: service_role only | PASS. Live: `connector_grant_alive` and `reenable_connector_connection` are SECURITY DEFINER with fixed search_path; anon, authenticated and PUBLIC cannot execute; service_role can (acl = postgres + service_role only) |
| 2b | No deletes, additive | PASS. Neither function body contains delete/truncate/drop; the migration only creates functions and changes grants. `reenable` only sets `revoked_at` to null, and only when the grant is alive and no other active row exists |
| 2c | Status route never says Off on a failed check | PASS. `connectionStatus` in owner-api.ts returns a 503 if the row read or the grant check fails. Live UI with status forced to 503: badge "Can't check", switch disabled, "We couldn't check whether Claude is connected. It may still be." plus Try again. (Forced by intercepting the request in the browser, because breaking the real function would affect the owner's account.) The only "off" without a row is the genuine never-connected case |
| 3a | State: active | PASS. Badge "Active", switch On |
| 3b | State: off | PASS. Badge "Off", switch Off, notice "Claude can no longer reach Oracle... Anything waiting for your yes was cancelled." |
| 3c | State: needs reconnecting | PASS. Row on, grant dead: badge "Needs reconnecting", alert text per spec, "Show me how to reconnect" button |
| 3d | State: can't check | PASS (forced 503, see 2c) |
| 3e | Never connected | PASS. "Off", "Claude isn't connected." |
| 3f | Switch off, then on | PASS in both paths. Off revoked the row and the grant (consent revoked, Claude sessions gone), so on gave "Needs reconnecting" and stayed Off. With the grant artificially revived while the row was off, on turned the switch On and the status became active |
| 3g | Off cancels pending | PASS. A waiting request became `cancelled` with cancel_reason `switched_off` |
| 3h | Setup guide accordion | PASS. Four sections; web open by default; Enter opens, Space closes, ArrowDown moves focus to the next header, Tab moves on; headers are real buttons inside h3 with aria-expanded, and open panels have role region labelled by the header. Sections open independently (web stays open when another opens) |
| 3i | Copy address and Claude Code command | PASS. Copy address puts `https://oracle-alpha-two.vercel.app/mcp` on the clipboard and shows toast "Address copied". Claude Code "Copy command" copies `claude mcp add --transport http oracle https://oracle-alpha-two.vercel.app/mcp` |
| 3j | Forbidden words | PARTIAL, see Defect D-1. The words MCP, OAuth and token never appear in the prose, but "mcp" appears in the connector address and in the Claude Code command |
| 3k | No emoji | PASS (no pictographic characters on the page) |
| 3l | 360px, no horizontal scroll | PASS on guide and connection tabs (scroll width 360 equals viewport 360); Copy address button is 44px high; tabs bar scrolls on its own |
| 3m | Headings and aria | PASS. Headings: connector address, then one h3 per section; tabs report aria-selected correctly |
| 4 | Owner data untouched | PASS. Before and after identical: user_cards 1315, decks 19, user_copies 2419 (no change, so the import did not add rows during the test window). Owner connector row id 9ba823d4-e3ce-44df-93ac-daca084b6a7b, created_at 2026-11-16 00:10:24.188238+00, revoked_at null, last_used_at 2026-11-16 01:42:01.449+00, all unchanged. Owner consent still not revoked. I made only SELECT queries on owner rows |

## Defects and notes
- D-1 (low, probably accepted): the connector address ends in `/mcp` and the Claude Code command starts `claude mcp add`. These are literal strings the owner must paste, so they cannot avoid the letters. Spec 3.3 says the word never appears; Gene/Designer should confirm the spec means prose only. Files: `src/components/connector/connector-address.ts`, `SetupGuideTab.tsx`.
- N-1 (design, not a defect): after a normal off, switch on cannot re-enable (grant revoked on purpose). Spec 3.1 says on "re-enables the link"; the developer's report documents the trade-off. Real one-tap re-enable only occurs when the grant revoke failed. Needs owner decision if one-tap is wanted.
- N-2 (cosmetic): in the needs-reconnecting state the switch shows Off and the page reads "Claude isn't connected" in the card above the alert; fine but slightly repeats the alert.
- N-3 (spec wording): phone notice still says the phone app "can't add a new connector yet"; developer flags Claude's help now says it is in beta.
- Not tested: real Claude connecting (consent screen, real tokens); `npm run lint` (task listed tsc, vitest and build only); visual review of screenshots (checked by text and measurements).

## Limits of how I tested
- Port 3000 already had a development server running for this folder (not mine; I left it alone), and Next allows only one dev server per folder, so I used the production server (`next start`) on port 3217 from the fresh build. Auto sign-in is dev-only, so the owner account was never signed in.
- The throwaway user (id 2e620785-5414-4bdb-b480-63e98c5c5de1) got a hand-made connection row, consent row, Claude sign-in sessions and one waiting request, all by direct database writes. The user was deleted via the admin API; afterwards zero rows remain for it in connector_connections, ai_pending_changes, auth.users, auth.oauth_consents and auth.sessions. Server stopped, port 3217 free.
- The `npx next build --webpack` I ran rewrote the `.next` folder that the port 3000 dev server also uses; if that dev server misbehaves, restart it.
- No product code was edited. Two untracked migration files (20261113100000, 20261113100100) already existed in the working tree and are not mine.

## Changed files
- docs/oracle/reports/2026-11-16-tester-cc04d-verify.md — this report

## New decisions made (need owner confirmation)
- none

## Assumptions
- Spec ban on "MCP" is meant for explanatory text, not the pasteable address and command.

## Challenges to locked decisions
- none

## Open questions
- D-1 and N-1 above.

## Verification
- tsc, vitest, next build — all pass (above)
- Live read-only DB queries on function ACLs and owner rows — as above
- Browser run (Chrome, Playwright) against the production server on port 3217 as the throwaway user — as above
