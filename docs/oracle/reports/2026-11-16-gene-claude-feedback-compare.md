# Report: claude-feedback-compare
Role: Gene
Status: DONE
Task as received: Compare Claude's feedback on the Oracle MCP connector against the briefs (claude-connector.md, daily-use-deck-advisor.md, use-what-i-own.md) and docs/oracle/status.md. For each item say covered (and deployed?), partial, or new; verify in code why typeLine is empty and get_deck_health returns "not_computed" (data gap or bug?); recommend what to brief next.

## Summary for the owner
Claude's complaints are mostly fair: the connector shows card names and where copies are, and nothing about what the cards do. Most of the missing facts already exist in Oracle's own card library, so this is mainly about showing them to Claude, not collecting new data. Two of the things Claude hit are bugs or leftovers, not missing features. Game logging and playgroup info are new and not in any brief.

## Findings: typeLine empty and deck health "not_computed"
- **typeLine empty: data gap plus a missing join, not a crash.** The collection search tool reads the type line straight from the owner's own card table, `user_cards.type_line` [Confirmed: src/lib/connector/tools/search-collection.ts]. That column is saved as an empty string whenever the importer did not supply one (`type_line: card.typeLine ?? ''`) [Confirmed: src/lib/card-definition-resolver.ts]. The real type line, mana value, colour identity, rules text and legality sit in the shared card library (`ref_cards`, `ref_printings`) [Confirmed: src/types/supabase.ts]. Deck health already reads that library for the in-app screen [Confirmed: src/lib/deck-health-server.ts]. The connector never joins to it. Fix = join on name/oracle id at read time (and optionally backfill the empty column).
- **get_deck_health "not_computed": by design, but the design is stale (a bug in intent).** The connector tool only reads a saved row from the old `deck_health` table and says "not computed" if none exists [Confirmed: src/lib/connector/tools/get-deck-health.ts]. Since Deck health Phase 2 the app computes health on request and no longer stores it; old rows are left alone and nothing writes new ones [Confirmed: src/lib/health-store.ts header; deck-health-server.ts "Nothing is stored"]. So for any deck, the connector will always say not computed. The in-app computation (`loadDeckHealth`) exists and is reusable by the connector. Note the connector's "never computes" rule is a choice made in the connector slice, not a locked decision.
- **Bracket null on all decks:** bracket is set only through the deck strategy screen (valid 1 to 4, default null) [Confirmed: src/app/api/decks/[id]/strategy/route.ts]; the connector list reads it from the deck row [Confirmed: tools/list-decks.ts]. Data gap: the owner has not set brackets (or the strategy value is not copied onto the deck row; needs a check).

## Item by item
| Claude's request | Status | Evidence |
|---|---|---|
| Type line, mana value, colour identity, rules text on card output | **New for the connector.** The data exists; no connector brief covers card facts. The connector brief section 5 lists "look up card facts and prices" as a read, so it is in intent but not built. | Brief claude-connector section 5; data in ref_cards |
| Price per printing | **Partial.** Brief section 5 promises prices (labelled estimates). The ownership tool reads prices for buy ideas [Confirmed: tools/list-deck-cards-by-ownership.ts]; search results show none. Deck-advisor brief covers estimated prices in-app (deployed, S4 merged). | status.md Deck health S4 |
| Function tags (ramp, draw, removal) | **Partial.** Deck health already assigns roles (ramp, draw, removal, lands) in-app (deployed). A finer tag pipeline is specced but not built. Not exposed to the connector. | deck-health.ts; contracts/card-tagging-pipeline.md |
| Legality / banned | **New for the connector.** ref_cards has commander legality; no brief mentions showing it to Claude. | ref_cards.commander_legal |
| Deck health numbers | **Covered in-app (deployed), broken in connector** (see above). | status.md Deck health S1 to S5 |
| Bracket | **Partial.** Bracket is a per-deck field the owner sets in Deck health; it is shown by the connector but empty. | strategy route |
| Collection search filters (type, colour, location, free-only) | **Partial.** Free-only and proxy filters and paging already exist in the connector. Type, colour, location filters are new. Blocked on the type line gap for type filter. Paging at about 113 calls is the pain point. | search-collection.ts; briefs mention fast card search in the deck-advisor brief |
| Game logging (deck, result, pod, notes) | **New.** Only a mention of a post-game debrief as O-004, parked until after M3. No brief. | status.md O-004 |
| Playgroup info | **New.** Not in any brief. | none |
| Wishlist | **Partial.** Wishlist exists in the import reconciliation flow (T-22, done). Not exposed to the connector and no brief for it as its own thing. | status.md T-22 |
| Whether the connector is deployed | Reads and safe edits: built and merged to main (CC-04b). On/off switch and setup guide (CC-04d): built and tested, NOT merged. | status.md Claude connector table |

Use-what-i-own: covers owned-versus-buy ideas and warnings; nothing in it conflicts with the above.

## Recommendation: what to brief next
1. **"Card facts for Claude" (one brief, small).** Add type line, mana value, colour identity, rules text, legality and price (labelled estimate) to every card Claude sees, read from Oracle's existing card library. Also make deck health in the connector run the same check as the in-app screen. Replaces Claude's priorities 1 and 2. No new data collection, no Scryfall bulk import, no schema change expected (Architect to confirm).
2. **Filterable collection search.** Type, colour, location filters, and a count-by-group view so Claude does not page 113 times. Depends on 1. Can be the same brief as a second slice.
3. **Game log and playgroup** as a separate brief. It is a new feature with new stored data (owner gate), and it overlaps the parked debrief item. Needs owner behaviour answers first.
4. Smaller follow-up: check why brackets are empty and whether to prompt the owner to set them.

I put the order as 1, 2, 3 (Claude put game logging third and filters fourth). Filters are cheaper and fix a daily pain; logging is a bigger feature.

## Changed files
- docs/oracle/reports/2026-11-16-gene-claude-feedback-compare.md — this report

## New decisions made (need owner confirmation)
- None. Recommendation only; no briefs written yet.

## Assumptions
- Claude's feedback was taken as given; I did not run the live connector.
- The imports that left type lines empty are the cause of the empty column; I did not query live data to count rows.

## Challenges to locked decisions
- none

## Open questions
- Should the connector's deck health run a fresh check each time (recommended), or stay saved-only?
- Do you want game logging in Oracle at all, or is it better left in Claude chats for now?
- Are bracket values meant to be set on the deck already?

## Verification
- Read the three briefs, status.md sections, and traced get-deck-health, search-collection, card-definition-resolver, health-store, deck-health-server, strategy route — read-only; no tests run.
