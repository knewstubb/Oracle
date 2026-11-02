# Report: uwio-slice-b (Use what I own, slice b)
Role: Developer
Status: DONE (live chat and real database untested, see Verification)
Task as received: Build slice (b) of the approved brief docs/oracle/briefs/use-what-i-own.md, using the audit docs/oracle/reports/2026-11-02-architect-use-what-i-own-audit.md, contract docs/oracle/contracts/advisor-tools.md and the slice (a) report docs/oracle/reports/2026-11-02-developer-uwio-slice-a.md. Slice (a) is merged to main. Work ONLY in a new worktree (`../oracle_app-uwio-b`, branch `uwio-slice-b` from main). Scope: a read-only lookup the deck chat can call that, for a list of card names (by oracle identity, not printing; respect colour identity of the viewed deck's commander where known), sorts each into SPARE / IN ANOTHER DECK (with deck names and a plain warning; planned slots must not count) / UNOWNED (Scryfall estimate labelled, explicit "no price" when unknown; D-035, D-040). Proxies never count as owned (D-037). Fix audit findings 2-3 in the new lookup. Add a short prompt instruction (Spare first, In another deck with warning shown, then Buy; suggest-only). Keep edit tools gated off. No migrations, data changes, screens or import code. Mock-client tests only. `npm run check`, commits with trailer. This report. Do not merge; do not start slice (c).

## Summary for the owner
The deck chat can now check a list of cards against your collection and sort them into three piles: spare real copies, real copies that are sitting in another deck, and cards you don't own. For cards in another deck it names the deck and says, for example, "Using it here leaves Korvold short by one". For cards you don't own it gives a price only as a Scryfall estimate, or says "no price available" (never zero). Proxies don't count as owned, and a card merely planned in another deck's list doesn't count as being in that deck. The chat still only suggests; it can't change decks. I have not tried it in the live app yet; that needs the test account.

## Changed files
- src/lib/owned-copy-lookup.ts — new read-only lookup (new, the whole feature)
- src/lib/tool-registry.ts — registers `check_owned_copies`, offered in the deck chat only (not in other chats or the unfiltered list)
- src/lib/tool-types.ts, src/lib/tool-executor.ts, src/app/api/decks/[id]/chat/route.ts — the viewed deck's id is passed to the tool by the server (the model cannot set it)
- src/lib/deck-chat-prompt.ts — new short block: use the lookup for replace-a-proxy / fill-a-gap; order Spare, In another deck (warning always shown), Buy (estimate only); never claim a swap
- src/lib/deck-chat-facts.ts — one sentence updated: it no longer says the chat "cannot see" spare/other-deck copies; it points to the lookup
- src/lib/owned-copy-lookup.test.ts — 18 new tests (mock client only; also asserts only select queries are issued)
- docs/oracle/reports/2026-11-02-developer-uwio-slice-b.md — this report

## How it works (for the record)
[Confirmed: src/lib/owned-copy-lookup.ts]
- Names are resolved to `oracle_id` via `ref_printings` (exact name, then front face of a double-faced card). All owner queries are scoped by `user_id`. Matching is by card, never printing.
- Real copies = `user_copies.is_proxy = false`. A copy is "sleeved" only if a `deck_cards` row points at it by `copy_id`. Rows with no copy (planned slots) are ignored, so a plan never claims a copy. Spare = real copy referenced by no row (does not assume the database allows only one slot per copy, audit A1). All decks count (D-029); missing-marked copies count as ordinary (D-028).
- Result per card: SPARE, IN_ANOTHER_DECK (deck name, copies, warning), UNOWNED (price estimate or `usd: null` "No price available"), plus ALREADY_IN_THIS_DECK, OUTSIDE_COLOUR_IDENTITY, UNKNOWN_CARD. The warning and price label are built by the server so the model can't omit them (D-016).
- Colour identity: union of the viewed deck's commander(s) from `ref_printings`; if not known, no colour check is done and the result says so.
- Price: cheapest known non-digital USD price across printings; zero or missing becomes "no price"; flagged "may be out of date" using the existing `isPriceDataStale` (48 h).
- One batched call, up to 60 names, queries chunked by 100.

## Audit findings 2-3 (how addressed)
I read "findings 2-3" as the audit's table rows on spare copies and on copies held by other decks (the rows the brief's gaps hinge on). If different findings were meant, please say.
- Spare was wrong (owned counts ignored sleeving): the new lookup counts only real copies not sleeved anywhere.
- Other decks was weak (any row counted, status hard-coded, planned slots and proxies included): the new lookup uses only rows that point at a real copy, and names the deck.
- The old `collection_lookup` / `getOwnedCards` / `getDeckAllocations` are untouched (still used by other chats and the sidebar, per the audit).

## New decisions made (need owner confirmation)
- Added a fourth status, ALREADY_IN_THIS_DECK, for when every real copy is already in the deck being viewed (neither spare nor "another deck"). Also OUTSIDE_COLOUR_IDENTITY and UNKNOWN_CARD so nothing is hidden or guessed.
- When a spare exists, other decks holding a copy are still listed (information only, no warning needed).
- Price estimate = cheapest printing's price, not the owner's preferred printing.

## Assumptions
- `ref_printings.color_identity` is a letter array (e.g. `['B','G']`), as in the types; null means unknown. [Confirmed: src/types/supabase.ts]
- A copy on a maybeboard row still counts as sleeved if `copy_id` is set (it is physically assigned). Not filtered.
- Different-printing matches are returned as owned (matched by card); I do not list which printing. Audit risk 2 (show printing mismatch) is not done here.
- `deck_cards` has no `user_id`; it is scoped through the user's own copy ids and a `user_id` filter on `decks`.

## Challenges to locked decisions
- none

## Open questions
- Should the answer show which printing the spare copy is, so a different printing is flagged (D-021)? Not in this slice.

## Verification
- `npx vitest --run src/lib/owned-copy-lookup.test.ts src/lib/deck-chat` — 35 passed (spare vs in-deck, planned slot not counted, proxy-only is unowned, no-price never zero, stale price note, other user's copy ignored, colour identity known/unknown, unknown name, front-face match, two slots on one copy, read-only calls only, read failure is an error not zeros, tool scoped to deck chat, prompt order/warning/estimate/suggest-only).
- `npm run check` — tests: 155 files passed, 1736 tests passed (40 skipped, existing). Typecheck: clean. Lint: 0 errors (265 existing warnings).
- UNTESTED: the live deck chat (whether a real model calls the lookup once, keeps the order, shows the warnings, avoids claiming swaps), and the lookup against the real database (the query shapes, foreign keys and the `decks` filters were only run against a mock). No data is written anywhere. Please try on the test account: a proxy replacement with a spare copy, one with a copy only in another deck, and one unowned.
- Branch `uwio-slice-b`, not merged. `npm ci` was run inside the new worktree only.
