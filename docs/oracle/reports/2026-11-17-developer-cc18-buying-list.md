# Report: cc18-buying-list
Role: developer
Status: DONE
Task as received: Build the read-only buying-list part of CC-18 per docs/oracle/reports/2026-11-17-architect-cc15-18-claude-primary.md. Owner approved 2026-11-17: Scryfall price estimates are enough (no Card Kingdom prices). New read-only connector tool that, for a given deck, lists the cards the owner is missing (not owned, or only proxy where an original is wanted; follow the report's definition) with price estimates, labels unpriced cards, and gives totals; reuse the existing price loader and the ownership tool patterns (list-deck-cards-by-ownership.ts); everything scoped to the signed-in owner; no database change and no migration; keep answers small. Do NOT build the wishlist. Register the tool, add tests, update the tool registry test and the connector contract/specs wording, and the setup guide Can/Can't list. Run tsc, eslint and connector tests.

## Summary for the owner
Claude can now give you a buying list: the cards your decks are missing, one line per card, most expensive first, with a price estimate and a total. A card two decks both need counts as two to buy, and proxies can be shown as "would upgrade". Cards with no known price are labelled, not counted as free, and every answer says prices are Scryfall estimates, not shop prices. The wishlist is not built; it still needs your go-ahead on a screen for it.

## Changed files
- src/lib/connector/tools/get-buying-list.ts — new read-only tool `get_buying_list`
- src/lib/connector/tools/index.ts — registered the tool with its description
- src/lib/connector/__tests__/buying-list.test.ts — 10 new tests
- src/lib/connector/__tests__/registry-and-isolation.test.ts — tool list now includes it; description wording checks
- docs/oracle/contracts/claude-connector-cc18-buying-list.md and .types.ts — new contract and result types
- docs/oracle/contracts/claude-connector-slice-a.md — tool table row added
- docs/oracle/specs/claude-connector.md — CC-18a update section
- src/components/connector/ConnectionTab.tsx — Can list gets the buying list; Can't list gets "Buy cards for you, or keep a wishlist (not built yet)" (this is the Can/Can't panel on the Connection tab; the Setup guide tab has no such list)

## New decisions made (need owner confirmation)
- Added `limit` (1-100, default 50) and `offset` to the architect's input list, to keep answers small and consistent with other tools.
- Proxy "would upgrade" is counted in the totals with its own subtotals only when `include_proxies` is on.

## Assumptions
- "Missing" = main-deck slots with ownership `not_owned`; with include_proxies also `proxy`. Generic placeholders are never counted; Maybeboard only on request.
- No-price cards are left out of the cost, so the total is a minimum (the tool description tells Claude to say so).

## Challenges to locked decisions
- none

## Open questions
- Wishlist (CC-18b) remains blocked on the Designer screen and database approval.

## Verification
- `npx tsc --noEmit` — no errors in my files; 4 existing errors in src/components/AddToPicklist.test.tsx (not touched)
- `npx eslint` on touched files — clean; existing errors remain in tools.test.ts and list-decks.ts (not touched)
- `npx vitest run src/lib/connector src/components/connector` — 309 pass, 1 fail: registry test expects get_deck's description to say "estimate"; it fails the same way without my changes (checked)
- Endpoint example: no live request run; the tests exercise the handler against a mocked database (totals example: 5 copies to buy, $232.26 estimated, 1 unpriced).
