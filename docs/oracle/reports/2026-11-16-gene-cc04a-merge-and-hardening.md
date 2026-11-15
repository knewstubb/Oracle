# Report: cc04a-merge-and-hardening
Role: Gene
Status: PARTIAL
Task as received: Merge the connector (CC-04a) and the brew-sessions privacy fix into main the normal way after confirming build/tests pass; apply the optional extra safety rule to live with undo script and verify; prepare Vercel rate-limiting steps; remind owner of the two owner-only steps; update status.md and report.

## Summary for the owner
The Claude connector and the brew-session privacy fix are now in main. The extra safety rule is live: a Claude sign-in can read your data but the database refuses any change from it. Claude still cannot connect until you do two settings (steps below), and rate limiting needs you to click one setting in Vercel.

## Changed files
- Merged to main: branches brew-owner-fix, cc04a-connector and build-fix-route-export (merge commits, no force push)
- supabase/migrations/20261116130100_oauth_client_tokens_no_writes.sql — the applied rule (copied from the Architect draft; draft kept)
- supabase/drafts/20261116130100_oauth_client_tokens_no_writes.rollback.sql — undo script
- docs/oracle/status.md — CC-04 and CC-03e rows

## New decisions made (need owner confirmation)
- none

## Assumptions
- The token claim name `client_id` is from Supabase docs, not yet seen on a real token. If wrong, the rule does nothing harmful (browser sessions unaffected) but would not block Claude's direct writes. Must be confirmed at the first real connection (tester live check 3 and 6 in the contract).
- The app writes only through the server key, so the rule cannot affect normal use.

## Challenges to locked decisions
- none

## Open questions
- Owner-only steps below not yet done. Daily Scryfall sync job points at an undeployed edge function (unchanged).

## Verification
- Applied live in one transaction: 66 policies (3 per table on 22 tables). Row counts unchanged (decks 9, copies 4259).
- Simulated in a rolled-back transaction: signed-in browser-style session updated 8 own decks (works); a token with a client_id claim updated 0 rows (blocked) and could still read 8.
- Merged main: full unit suite 3107 passed (one earlier run showed a single flaky failure, two reruns clean); `next build --webpack` passes.
- Vercel command-line tool is broken on this machine (its Node path is missing), so rate limiting was not set by me.

## Owner-only steps (click paths)
1. Supabase OAuth server: supabase.com dashboard, project "The Oracle", Authentication, OAuth Server. Turn it on. Authorization path: /oauth/consent. Turn on "Allow dynamic OAuth apps" (dynamic registration). Save.
2. Site address: the app falls back to Vercel's own production address automatically, so this is only needed if you use a custom domain. Vercel dashboard, the Oracle project, Settings, Environment Variables, add NEXT_PUBLIC_SITE_URL = your public address (https, no trailing slash), tick Production, Save, then Redeploy.
3. Also in Supabase: Authentication, URL Configuration: Site URL and Redirect URLs include your Vercel address.
4. Rate limiting: Vercel dashboard, the Oracle project, Firewall, Configure, Add Rule. Name "Limit Claude connector". If Request Path equals /mcp, then Action: Rate Limit, 60 requests per 1 minute per IP (fixed window), Save, then Review Changes and Publish. Adjust higher if Claude hits it.
