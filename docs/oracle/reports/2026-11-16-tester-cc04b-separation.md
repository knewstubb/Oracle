# Report: CC-04b separation check
Role: Tester
Status: DONE

Task as received: CC-04 "separation" check (contract `docs/oracle/contracts/claude-connector-slice-a.md` section 11 live checks 3-6 and `docs/oracle/reports/2026-11-16-gene-cc04a-merge-and-hardening.md`): confirm the real Claude token claim name; two-account separation; "Claude-style token cannot change data around Oracle" rule; clean up everything.

## Summary for the owner
One person's account cannot see or change another's decks and cards, and a Claude sign-in can read your data but cannot add, change or delete it outside Oracle. All test accounts and rows were removed. One thing to know: the stored counts were not the numbers in the brief, and they grew during the test because something else was importing (details below).

## Results
| # | Item | Result |
|---|------|--------|
| 1 | Claim name is `client_id` | PASS |
| 2 | Account B cannot see or touch account A's data | PASS |
| 3 | Claude-style token blocked from writes; normal session still writes | PASS |
| 4 | Cleanup of everything created | PASS |
| 4b | Owner counts equal 9 / 795 / 2650 / 4259 before and after | NOT CONFIRMABLE (see below) |

## 1. Claim name: `client_id` is correct (confident)
- Live connection exists: `connector_connections` has 1 active row, client name "Claude", client id `deb3bb9b-…` (not revoked). `auth.oauth_clients` has 2 clients, `auth.oauth_consents` has 1 consent, for that same client id. No secrets were read.
- Supabase Auth logs (2026-11-16 00:09–00:10 UTC): `POST /oauth/clients/register` 201, `GET /oauth/authorize` 302, consent `approve` 200, then `POST /oauth/token` 200 with `grant_type=authorization_code`, `login_method=oauth_server` and `client_id=deb3bb9b-…`. So Supabase tags this login with `client_id`.
- Supabase docs (OAuth server, token claims): "All OAuth access tokens have full access to user data (same as regular session tokens), with the addition of the `client_id` claim. Use Row Level Security policies with the `client_id` claim…"
- `src/lib/connector/verify-token.ts` requires a `client_id` claim and the live /mcp connection works, which means the real token carries it. [Confirmed: src/lib/connector/verify-token.ts]
- Policies already use `auth.jwt() ->> 'client_id'`. No change needed.
- Not directly inspected: the raw token text (not minted by me, and not printed on purpose).

## 2. Two-account separation: PASS
Method: two throwaway users created through the admin API (`cc04b-a@example.invalid`, `cc04b-b@example.invalid`); A given 1 deck, 1 deck card, 1 user card, 1 user copy (ids 990001). B signed in with the public site key + B's own token, via the table API.
- A control: sees all 4 of its own rows.
- B reads of `decks`, `deck_cards`, `user_cards`, `user_copies`, `connector_connections`: every query returned `[]` (all rows, by A's ids, by A's `user_id`).
- `get_deck`-style lookup (deck cards by A's deck id): `[]` (reads as not found).
- B updates and deletes of A's rows on all 4 tables: HTTP 200, 0 rows affected. A's rows verified unchanged afterwards (name and proxy flag intact).
- B inserts of rows owned by A (deck, copy): HTTP 403 "violates row-level security policy".
- Not tested: the /mcp endpoint itself as B (needs a real OAuth token); the table-level result is what protects it.

## 3. Claude-style token cannot write: PASS
Method: SQL as role `authenticated` with `request.jwt.claims` set to A's `sub` plus `client_id`, inside a DO block that always raises (rolls back).
- With `client_id` claim: reads on all 4 tables = 1 row each (reads still work). Update on decks, deck_cards, user_cards, user_copies = 0 rows each. Delete on user_copies and decks = 0 rows. Insert on decks and user_copies rejected with 42501 by `decks_no_oauth_insert` and `user_copies_no_oauth_insert`.
- Same user without the claim (a normal browser session): update on all 4 = 1 row each, insert into decks and user_copies OK, delete on user_copies = 1 row.
- Caveat: simulated claims, not a real Claude token. The only variable is the claim name, confirmed in item 1. Only 4 of the 22 protected tables were exercised; the policies come from one loop in the migration. [Confirmed: supabase/migrations/20261116130100_oauth_client_tokens_no_writes.sql]

## 4. Cleanup: PASS, with a discrepancy to flag
- Deleted by id: the 4 rows (990001) and both throwaway users (admin delete returned 200 each). Verified: no `cc04b-%` users, no leftover rows. Rolled-back test inserts left nothing.
- Owner's connection row and consent untouched (still 1 and 1).
- **Counts differ from the brief.** Live, before my first write: decks 2, deck_cards 113, user_cards 85, user_copies 100 (all tables, all users; owner `knewstubb@gmail.com` had 1 / 100 / 85 / 100). After cleanup: decks 3, deck_cards 213, user_cards 159, user_copies 200 (owner 2 / 200 / 159 / 200). The counts rose between my checks, and I wrote only the 990001 rows, so something else (an import or another agent) is writing to the owner's account right now. I touched none of those rows. The 9 / 795 / 2650 / 4259 figures were never seen. Gene should check whether an import is running, or whether the data was reset since the brief.
- Side note: the first insert attempt failed because `id` is "generated always"; I used OVERRIDING SYSTEM VALUE with ids 990001/990002 and removed them.

## Changed files
- docs/oracle/reports/2026-11-16-tester-cc04b-separation.md — this report (no product code changed)

## New decisions made (need owner confirmation)
- none

## Assumptions
- A signed-in account using the public site key stands in for a Claude-style user-scoped client.

## Challenges to locked decisions
- none

## Open questions
- Why do owner counts differ from 9 / 795 / 2650 / 4259 and why did they grow during the test?
- Live checks 5 (revoke then next /mcp call refused), 7 (expired token) and a real-token claim dump remain untested here.

## Verification
- Supabase `query_logs` (auth_logs), `search_docs`, `execute_sql` read-only counts and the rolled-back DO blocks — results above.
- Table API run with Node (`/tmp/cc04b.mjs`, not in repo) — results above.
- `npm run typecheck`, `lint`, `test` not run: no product code changed.
