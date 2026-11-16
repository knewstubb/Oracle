# Contract: CC-06 Claude connector, card facts and live deck health

Brief (approved 2026-11-16, all defaults accepted): `docs/oracle/briefs/connector-card-facts-and-deck-health.md`. Audit: `docs/oracle/reports/2026-11-16-architect-cc06-audit-and-slices.md`. Types: `docs/oracle/contracts/connector-card-facts-and-deck-health.types.ts`. Extends `claude-connector-slice-a.md`.

## 0. Plain words
Every card Claude sees gets a facts block: type, cost, mana value, colours, rules text, Commander legality and an estimated price. Deck health from Claude runs the same check as the Deck health screen, every time. If a deck has no bracket, Claude is told who sets it. **No stored data changes. No migration. Read-only.**

## 1. What exists today (audit)
- Search tool shows the card's type from the owner's own card table, which is empty for imported cards that arrived without one `[Confirmed: src/lib/connector/tools/search-collection.ts; src/lib/card-definition-resolver.ts]`.
- The shared card library `ref_cards` holds type line, rules text, mana cost, mana value, colour identity and a yes/no Commander legality. It is keyed by card NAME (no oracle id column) `[Confirmed: src/types/supabase.ts ref_cards]`. The existing name lookup tries the exact name, then the front face of a double-faced card `[Confirmed: src/lib/ref-card-text.ts]`. It lacks mana cost, mana value, colours and legality, so a new lookup is needed (section 3).
- Legality detail (legal / banned / not legal) lives on `ref_printings.legality_commander`; prices on `ref_printings.price_usd` `[Confirmed: src/types/supabase.ts; src/lib/connector/tools/list-deck-cards-by-ownership.ts]`. The ownership tool already picks a price estimate with `estimatePrice` and states "unknown is not free" `[Confirmed: same file]`. Reuse it.
- The card library tables allow reads by any signed-in user, so the connector's per-user read-only handle can read them, and already does for prices `[Confirmed: migration 20261116110100_reference_tables_hardening.sql; list-deck-cards-by-ownership.ts]`.
- `get_deck_health` reads only the old `deck_health` table, which nothing writes any more, so it always says not computed `[Confirmed: src/lib/connector/tools/get-deck-health.ts; src/lib/deck-health-server.ts header "Nothing is stored"]`.
- The in-app check is `loadDeckHealth` and `buildDeckHealth` `[Confirmed: src/lib/deck-health-server.ts, src/lib/deck-health.ts]`. It takes a client with a general `from()`; the connector handle is select-only with no single-row helper `[Confirmed: src/lib/connector/user-client.ts]`. So it cannot be passed in as is (section 4).
- Brackets live in TWO places: the Deck strategy screen saves to `deck_strategy.bracket` (a number 1 to 4) and never touches the deck row `[Confirmed: src/app/api/decks/[id]/strategy/route.ts]`. The connector reads `decks.bracket` (text) `[Confirmed: src/lib/connector/tools/list-decks.ts]`. Whether anything else fills `decks.bracket` is `[Approximate]`. This mismatch is the likely reason every bracket shows empty.

## 2. Locked decisions touched
- D-003 (scryfall_id vs oracle_id): facts match by card name, as the app does today, because `ref_cards` has no oracle id. Name matching is existing practice, not new. Flagged for Gene in the report, not a conflict.
- D-030 (no silent failures): a card with no match says "facts unavailable" and a failed lookup returns a real error. Never a guess.
- D-035 / D-040 (price estimates): reused unchanged.

## 3. Facts block (slices CC-06a, CC-06b)
Shape: `CardFacts` in the types file. Added as `facts` to: each `search_collection` card, each `get_deck` mainboard item, each `list_deck_cards_by_ownership` row (which keeps its own existing price fields).

| Field | Source | Rule |
|---|---|---|
| typeLine, manaCost, manaValue, colorIdentity, rulesText | `ref_cards` by name | Exact name, else front-face match (same as `fetchRefTextByName`). Not found: `available:false`, all null |
| legality | `ref_cards.commander_legal`; when false, `ref_printings.legality_commander` | true = `legal`; false + printings say `banned` = `banned`; false otherwise = `not_legal`; no card row = `unknown` |
| price | `ref_printings` via existing `estimatePrice` | `usd:null` when none. Label fixed: "Estimate from Scryfall". Never 0 |
| rulesText length | cut at 300 characters (`cutText`) | Always on for `search_collection` (max 25 cards a page). On `get_deck` only when `include_rules_text:true`; default off so a 150-card page still fits the 40 KB answer cap |

Behaviour rules:
- Read at the moment of asking. Nothing copied into `user_cards`; the empty saved type lines are left alone (brief default 4).
- One batched lookup per answer (names in batches of 200, as the app does), not one per card.
- Result size caps stay as they are (`fitRows`). If facts push a page over the cap, rows are dropped from the end and the existing "more remain" note says so. Never silent.
- The old `typeLine` field on search cards stays for compatibility and now carries the library type line when the saved one is empty. `facts.typeLine` is the source Claude should use.
- Tables touched (read only): `ref_cards` (key name; unique name), `ref_printings` (key set code + collector number [Approximate]; needs an index on name, which the ownership tool already relies on). No new index expected. Architect asks the Developer to time one 25-card search and one 100-card deck; add an index only if either exceeds 1.5 seconds.
- No write path, nothing to make atomic.

## 4. Live deck health (slice CC-06c)
Tool name unchanged: `get_deck_health`. Input unchanged (`deck_id`). New behaviour: runs the same computation as the Deck health screen, every call (brief default 1), and returns `DeckHealthToolResult`.

How:
- Reuse the pure routine `buildDeckHealth`, `commanderNamesFor`, and the card-role classifier. Do not copy them.
- Load the deck and its cards through the connector's own user-scoped handle, so the "every query carries the owner's user id" rule holds. Because the in-app loader needs a wider client, add a small connector loader that mirrors `loadHealthCards` using select-only queries, or give the existing loader a narrow read-only interface. Developer picks the smaller change; a test must prove both produce the same answer for the same deck.
- The commander's typical numbers (EDHREC cache) are read from `ref_commander_role_targets`, readable by signed-in users `[Confirmed: migration 20261111120000]`. The connector cannot write that cache. When the cache is fresh the answer is fast. When it is stale or missing, the numbers are worked out live and not saved, exactly as the app does when the cache cannot be written `[Confirmed: src/lib/commander-targets-server.ts header]`. The answer's source line says which. This could be slow for a commander nobody has checked in the app yet.
- **Fallback if that is too slow (more than about 8 seconds):** let the connector save only that shared cache table using the server key. That is a new write path from the connector, so it needs Gene and owner approval first. Not part of this contract.
- Result size: `MAX_HEALTH_RESULT_BYTES` (20 KB) applies; the health object is small.
- Failure: a real error (`HEALTH_FAILED`), never a passing result (D-030). Deck not found or not the owner's: `NOT_FOUND`, same as any other tool.
- Nothing is written. Annotations stay read-only.
- Acceptance parity: for the same deck, `health` equals what GET `/api/decks/[id]/health` returns, apart from `computedAt`.

## 5. Bracket (slice CC-06d)
- `list_decks` and `get_deck` return `bracket` as `BracketInfo`. Value comes from `deck_strategy.bracket` first, then `decks.bracket` if that parses as 1 to 4, else null with `whyEmpty` text.
- Claude cannot set brackets (brief default 3). No edit tool is added. The old `bracket: string|null` field stays for compatibility, with the same value as text.
- Reading `deck_strategy` uses the user-scoped handle; the table has `user_id` `[Confirmed: src/types/supabase.ts deck_strategy]`.

## 6. Multi-user and safety
Every query carries `user_id = verified sub` on user tables. Card library tables are shared reference data with no owner column, so they are the only reads without it. The tool-name list does not change (no new tools), so the registry snapshot test only needs updated tool descriptions.

## 7. Slices (ordered; the owner sees each before the next starts)
See the report for the full list with acceptance checks. Order: CC-06a facts lookup, CC-06b facts on results, CC-06c live deck health, CC-06d bracket, CC-06e connector description text and live check.

## 8. Old code deleted when this ships
- The saved-only branch and "not_computed" wording in `get-deck-health.ts`, and its `STALE_MS` rule.
- Tests that expect "not_computed".
- Nothing else; the old `deck_health` table is left in place (not a destructive change, and not in scope).
