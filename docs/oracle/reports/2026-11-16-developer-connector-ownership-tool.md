# Report: connector-ownership-tool
Role: Developer
Status: DONE
Task as received: Add read-only Oracle connector support for "which cards are proxies / unowned across my decks", "which deck has the most proxies", "how much to buy them all": new tool list_deck_cards_by_ownership (filter proxy / not_owned / both, optional deck_id, per-deck totals, safe paging), per-deck original/proxy/not_owned counts in list_decks, and two labelled price figures ("current value" with proxies = $0, "value if bought") reusing existing price data, with source/currency stated and unknown prices marked, not free. Follow connector patterns; BLOCKED if a new brief or schema change is needed.

## Summary for the owner
Claude can now list every proxy and not-owned card across your decks, say which deck has the most, and say what buying them all would cost. Each card and each deck shows "current value" (always $0 for these cards) and "value if bought" (Scryfall estimate, USD). Cards with no known price are marked "unknown" and counted separately, never treated as free. The deck list also shows how many original, proxy and not-owned cards each deck has. Collection value elsewhere is unchanged.

## Changed files
- src/lib/connector/tools/list-deck-cards-by-ownership.ts — new read-only tool; also exports `countByDeck` used by list_decks
- src/lib/connector/tools/list-decks.ts — adds `ownershipCounts` (original/proxy/notOwned, by quantity, main deck only, generic slots excluded)
- src/lib/connector/tools/index.ts — registers the tool (read-only annotations), updates list_decks description
- docs/oracle/contracts/claude-connector-slice-a.types.ts — the file already held an uncommitted draft of these types (not mine); I revised it to the two labelled figures (`currentValueUsd`, `valueIfBoughtUsd`, `unpricedCards`, `priceSource` incl. `stale`)
- src/lib/connector/__tests__/ownership.test.ts — new tests (11)
- src/lib/connector/__tests__/registry-and-isolation.test.ts — expected tool list includes the new tool

## New decisions made (need owner confirmation)
- "Current value" is always $0 for matching cards (proxies and unowned alike), shown explicitly so it is never confused with "free to buy".
- Price = cheapest known non-digital printing above zero (same rule as the existing buy-idea/advisor price), looked up by card name.
- Maybeboard cards and generic placeholder slots are excluded from counts and lists. Without deck_id, only active decks are covered.
- Counts and totals are by quantity; `total`/paging counts card rows.

## Assumptions
- No brief or schema change needed: the tool is the "see proxies / look up prices" reads in brief section 5, and uses plain selects. Live read-only check on project "The Oracle": `ref_printings` has RLS on with an authenticated read-all policy, so the user-scoped client can read prices. [Confirmed: pg_policies, has_table_privilege]
- `ref_printings` is shared reference data with no user_id, so its queries (only those) do not carry the `user_id` filter; all user-data queries do.
- Price lookups use the existing `estimatePrice` and `isPriceDataStale` (pure when given a timestamp) rather than `price-store`'s admin-client reads, because the connector must not use the service key. `toPrice` in deck-health-buy was not imported (heavy module chain); same "unknown not zero" rule. Importing owned-copy-lookup pulls price-store into the connector's module graph (it is only imported, not called); isolation test still passes.
- Double-faced cards stored as "Front // Back" are matched by a follow-up lookup, capped at 40 names per call; beyond that they show as unknown (stated as unpriced).

## Challenges to locked decisions
- none

## Open questions
- Should a later slice add the same figures to get_deck? Not requested, not done.
- Prices use the cheapest printing, so "value if bought" is a floor; say if you want the median instead.

## Verification
- `npx vitest run src/lib/connector` — 139 passed, 4 skipped (live tests need a deployed server)
- `npm run typecheck` — clean
- `npx eslint src/lib/connector` — clean
- Example request/response: only against mocked data in tests (no live connector call made; no test account). Tool output for `{state:"both"}` verified to give decks ordered Prosper (4 cards, 3 proxy, 1 not owned, $230.26 if bought, 1 unpriced) before Korvold, with items, totals and priceSource. Live end-to-end call untested.
