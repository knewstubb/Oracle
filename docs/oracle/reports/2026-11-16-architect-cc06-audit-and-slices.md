# Report: cc06-audit-and-slices
Role: Architect
Status: DONE
Task as received: Start CC-06 per docs/oracle/process.md: read the approved brief and the 2026-11-16 Gene reports, audit current connector code, then write the contract in docs/oracle/contracts/ and slice the build into small developer-ready slices (ordered, with acceptance checks). Also outline CC-07 and CC-08 slices at a high level so ordering is clear. Do not implement code. Write a report.

## Summary for the owner
Claude can be given card facts and a real deck health check without changing any stored data. The work is eight small steps for CC-06, then CC-07 and CC-08 follow in order. One new finding: brackets look empty because the connector reads a different place from where the Deck strategy screen saves them. The one thing to watch is speed: the first health check for a commander nobody has checked in the app may be slow.

## Audit (Gate 2)
- Card facts exist in the shared card library, keyed by card name, with type, rules text, mana cost, mana value, colours and a yes/no Commander legality. The connector never reads them. [Confirmed: src/types/supabase.ts; src/lib/connector/tools/search-collection.ts]
- Banned versus simply not legal is only on the printings table. Price estimates are there too, and an existing helper already turns them into an honest "estimate, unknown is not free" figure. [Confirmed: src/lib/connector/tools/list-deck-cards-by-ownership.ts]
- Deck health from Claude reads an old saved table nobody writes to. The in-app check computes on request. [Confirmed: src/lib/connector/tools/get-deck-health.ts; src/lib/deck-health-server.ts]
- The in-app health loader needs a wider database handle than the connector has (select only, no single-row call). The commander's typical-numbers cache is readable by signed-in users but not writable by the connector. [Confirmed: src/lib/connector/user-client.ts; migration 20261111120000]
- Brackets: the Deck strategy screen saves to the strategy table; the connector reads the deck row. [Confirmed: src/app/api/decks/[id]/strategy/route.ts; src/lib/connector/tools/list-decks.ts]. Whether anything else fills the deck row is [Approximate].
- Dead code to delete when shipped: the saved-only branch and "not_computed" wording in the connector health tool, plus tests asserting it.
- Locked decisions: none in conflict. D-003 note: facts match by name because the card library has no oracle id; this is today's practice.

## CC-06 slices (ordered)
Each slice: small, tests with it, owner sees it before the next. No migration anywhere in CC-06.

1. **CC-06a Facts lookup (internal, no tool change).** New small function: given card names, return facts (type, cost, mana value, colours, rules text, legality, price) using exact then front-face matching, batched by 200. Reuse the existing price helper. Acceptance: unit tests for exact match, double-faced front face, not found (`available:false`), banned vs not legal, no price gives null not zero, 250 names batch correctly.
2. **CC-06b Facts on search results.** Add facts to each `search_collection` card, rules text on. Acceptance: asking for "Sol Ring" shows type, cost, colours, legality, estimate label; a card with an empty saved type now shows the library type; a name not in the library shows "facts unavailable"; a 25-card page stays under the size cap or says more remain; timed under 1.5 s.
3. **CC-06c Facts on deck cards.** Add facts to `get_deck` items (rules text only with `include_rules_text`) and to ownership-tool rows. Acceptance: scenario S1 (creatures costing 4 or more in a real deck) answerable from one `get_deck` call; ownership tool totals unchanged; 100-card deck timed.
4. **CC-06d Live deck health.** Connector health runs the in-app check each call, read-only, through the owner-scoped handle. Acceptance: same numbers and verdict as the Deck health screen for two real decks (apart from time); other user's deck is not found; forced failure returns an error, never a pass; commander with no cache still answers and the source line says so; first-call time recorded. Old saved-only code and tests deleted in this slice.
5. **CC-06e Bracket.** `list_decks` and `get_deck` show the bracket from the strategy table first, then the deck row; if none, a plain explanation of who sets it. Acceptance: a deck with a strategy bracket shows it; a deck without shows null and the explanation; no tool can set it.
6. **CC-06f Descriptions and safety tests.** Update tool descriptions (facts, estimate wording, live health). Update registry and isolation tests (tool list unchanged, every user-table query carries the user id). Acceptance: full unit suite passes.
7. **CC-06g Live check (Tester).** Run the real connector against the owner's account (read-only), scenarios S1 to S3 from the brief, plus a second-account isolation check. Acceptance: all three scenarios answered; no write recorded.
8. **CC-06h Close-out (Scribe/Gene).** Status, vocabulary, report links. Not code.

Decision gates inside CC-06: if slice 4 first-call time exceeds about 8 seconds, stop and ask Gene about letting the connector save the shared commander-numbers cache (new write path, owner approval).

## CC-07 outline (collection search; starts after CC-06; own audit and contract first)
- Audit points already known: the search currently scans up to 3000 cards in memory when filtering (the collection is roughly 2,800), so a real filter and summary may need a database routine (migration, owner approval) instead of more scanning. Owned cards have a wishlist flag, so wishlist is a cheap read-only filter. [Confirmed: migration 20260927120000 uses a wishlist column; scan limit in search-collection.ts]
- Type and colour filters must use the card library facts (not the saved type column), which is why CC-06 comes first.
- Slices: (1) audit and contract, deciding scan versus database routine; (2) type, colour, mana value filters; (3) location filter (box, binder, deck) and "not in a deck"; (4) group-count summary by type, colour or location; (5) wishlist filter if the audit says cheap; (6) page-size and "N more" polish; (7) Tester live check on the three brief scenarios.

## CC-08 outline (game logging; last; new stored data)
- Slices: (1) contract plus draft migration for games, playgroup people and the pod link, all with the owner's account on every row and per-user protection (owner approves before applying); (2) Designer mockup for deck game history and Playgroup page (owner approves); (3) one all-or-nothing routine to log a game; (4) Claude tools to log, read, correct and undo its own games (new change kinds in the existing 7-day undo system; only the owner deletes); (5) game history on each deck; (6) Playgroup page; (7) Tester two-account separation check, then live check; (8) close-out.
- Open design item for its own contract: how Claude's logged games appear in Recent changes.

## Changed files
- docs/oracle/contracts/connector-card-facts-and-deck-health.md — CC-06 contract
- docs/oracle/contracts/connector-card-facts-and-deck-health.types.ts — reference types
- docs/oracle/reports/2026-11-16-architect-cc06-audit-and-slices.md — this report

## New decisions made (need owner confirmation)
- `get_deck` rules text is opt-in (default off) so big decks fit one answer; search results always include it.
- Legality shows banned versus not legal, using the printings table only when the card library says not legal.
- Bracket is read from the strategy table first, then the deck row.
- If live health is slow, the shared commander-numbers cache may need a connector write path (not decided; Gene and owner).

## Assumptions
- The owner's deck_strategy rows are where real brackets live; not queried against live data.
- Signed-in read access to the card library is enough (confirmed by migration, not tested live).

## Challenges to locked decisions
- none

## Open questions
- Is the brief's "every card carries rules text" fine as opt-in on deck lists? (Recommended yes.)
- Is a slow first health check for a new commander acceptable, with the cache write only as a fallback?

## Verification
- Read-only audit of connector tools, health loader, targets cache, strategy route, migrations and types. No code run, no tests run, no migrations written.
