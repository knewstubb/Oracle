# Report: cc18-live-check
Role: Gene (Orchestrator)
Status: DONE
Task as received: "Could you run this test" (in reply to: the buying list is built and tested but has only been tested against a mock, not through Claude itself; it is in the test plan as step 13 of G2).

## Summary for the owner
The buying list reads your real decks correctly. Nothing in your decks is unowned, so a plain "what am I missing" answer is legitimately empty; asking to include proxies shows 100 cards, 137 copies and about $1,201 of upgrades. The only part left is how Claude phrases the answer, which needs your signed-in window.

## What was tested, and the result
A temporary script signed in through the app's own read-only path (anon key plus the owner token, so row-level security applied), then called the real `get_buying_list` handler against the hosted database. The script was deleted after the run; nothing was written.

All 26 checks passed:
- Default call: one line per card, most expensive first, unpriced last, no proxies counted, totals equal the independently counted not-owned slots.
- Today's data: 0 unowned copies in main decks (so an honest empty list), 137 proxy copies across 100 distinct cards, estimated $1,201.29; no unpriced cards on the owner's data (the unpriced path is covered by unit tests only).
- Proxies on: per-line "would upgrade" counts, separate not-owned and proxy subtotals, total equals the sum of the two.
- One line per distinct card (100 distinct proxy names, 137 copies).
- Paging: 50 per page with the note "Showing 50 of 100. Ask for the next page with offset 50."; page 2 repeats no card; limit 100 returns 100.
- Maybeboard switch: no change today (no proxy cards on a Maybeboard), so this stays unit-test-only.
- Single deck: totals match an independent count for that deck; every line names only that deck.
- A card wanted by two decks counts twice (Smothering Tithe, 1 proxy in "Big Zurgs" plus 1 in "Sliver me timbers" = 2 to buy).
- Unknown deck id returns NOT_FOUND (never an empty success).
- Answer size: 881 bytes for an empty list, 23,892 bytes at 100 lines (fits one Claude answer).

Not run: the Claude-conversation half (asking Claude the question and checking its wording). Only the owner is signed in to the connector, so this remains TEST-02. The dev server was already listening on port 3000 at the time of the check.

## Changed files
- docs/oracle/status.md — CC-18 line records the live check result and the proposed empty-list follow-up
- docs/oracle/test-plan-2026-11-17.md — step 13 records what has been checked and what is still the owner's
- docs/oracle/reports/2026-11-17-gene-cc18-live-check.md — this report
- (temporary) `.tmp-live-buying-list.mts` — created, run, deleted; no product code touched

## New decisions made (need owner confirmation)
- None. One recommendation: when nothing is unowned but proxy copies exist, the tool should tell Claude to say so and offer the upgrade list. Otherwise a plain "what am I missing" reads as "nothing" even though 137 proxy copies exist. Small wording change in the tool description; not started.

## Assumptions
- The local auto-login account is the owner's real account: it showed 19 decks and 137 proxies, matching the test plan's checked figures. `SUPABASE_DEFAULT_USER_ID` in `.env.local` holds a different id; that variable is not used by this path.
- "Live" for the data half means the same tool code, the same RLS-scoped client and the hosted database that a Claude request uses. The only untested layer is Claude's conversation on top.

## Challenges to locked decisions
- None.

## Open questions
- Do you want the one-line improvement so an empty unowned list also mentions the proxies waiting to be upgraded?
- The wishlist stays blocked on your database approval (unchanged).

## Verification
- `npx tsx .tmp-live-buying-list.mts` (temporary, deleted) — 26 checks passed; probe totals: 19 decks, 0 unowned, 137 proxies / 100 cards / $1,201.29, page note at offset 50, 2-deck card counted twice.
- `npx vitest run src/lib/connector/__tests__/buying-list.test.ts src/lib/connector/__tests__/registry-and-isolation.test.ts` — 18 pass, 1 fail: the known TIDY-01 check (get_deck description no longer says "estimate"). Unrelated to this tool and already backlogged.
