# Contract: get_buying_list (CC-18a)

Owner approved 2026-11-17: Scryfall price estimates are enough (no Card Kingdom prices). Source: `docs/oracle/reports/2026-11-17-architect-cc15-18-claude-primary.md` section 5. Types: `claude-connector-cc18-buying-list.types.ts`.

- **Read-only, no database change, no migration.** Everything is scoped to the signed-in owner (`user_id` on every query); a deck that is not the owner's returns `NOT_FOUND`.
- **Input:** `deck_id?`, `include_proxies?` (default false), `include_maybeboard?` (default false), `sort?` (`price` default, or `name`), `limit?` (1-100, default 50), `offset?`. Strict: unknown keys are refused.
- **Definition of "missing":** main-deck slots whose ownership is `not_owned`; with `include_proxies`, also `proxy` slots, shown as "would upgrade" (an original is wanted). Generic placeholders never count. Maybeboard only on request.
- **Shape:** one line per card across decks (a card two decks want is two buys: each deck wants its own copy), with the per-deck split, unit price and cost. Most expensive line first; unpriced lines last. Totals: copies to buy, estimated cost (not owned and upgrades separately), copies and cards with no known price.
- **Empty is not the whole answer (CC-19, 2026-11-17):** when `totals.notOwnedCopies` is 0, Claude must say plainly that no not-owned cards are missing, never only that there is nothing. When `include_proxies` was not set, it checks again with it; if `totals.proxyUpgradeCopies` is above 0, it must say how many proxy copies across how many cards are in decks and offer the upgrade list.
- **Prices:** same loader as `list_deck_cards_by_ownership` (cheapest known paper printing in `ref_printings`). Unknown is `null`, never free, and is left out of the cost, so the cost is a minimum. The answer states they are Scryfall estimates and that Card Kingdom prices are not available. Stale data is flagged.
- **Size:** inside the 40 KB cap; cut rows are stated with the next `offset`.
- **Not built:** the wishlist (needs a stored-data change and an Oracle screen; CC-18b).
