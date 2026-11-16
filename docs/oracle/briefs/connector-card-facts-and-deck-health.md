# Brief: Connector card facts and live deck health (Gate 1 DRAFT)
Author: Gene, drafted 2026-11-16 from Claude's feedback (`docs/oracle/reports/2026-11-16-gene-claude-feedback-compare.md`). Status: **DRAFT, awaiting owner approval. NOT approved. Nothing is built.**

## 1. What this is, in plain words
When Claude looks at a card in Oracle it sees the name and where the copies are, but not what the card does. This brief makes Claude see the card's type, cost, colours, rules text, whether it is legal in Commander, and an estimated price. It also makes Claude's deck health answer the same as the Deck health screen, instead of saying "not computed".

## 2. Problem
- Claude cannot tell a creature from a land, so it cannot judge a deck without asking the owner to paste card text.
- Claude's deck health always answers "not computed" because it only reads an old saved result that the app no longer writes.
- Brackets show as empty on every deck.

## 3. Goals
1. Every card Claude sees carries: type line, mana value, colour identity, rules text, Commander legality, and a price labelled as an estimate (price may be "unknown", never zero).
2. Claude's deck health gives the same numbers and verdict as the in-app Deck health screen, worked out when asked.
3. Claude can say why a deck's bracket is empty and who sets it.

## 4. Scope
In: read-only changes to what the connector returns. Out: new data collection, bulk card imports, changes to what Claude may edit, game logging (separate brief), filters (separate brief).

## 5. Scenarios
| # | When | Wants |
|---|---|---|
| S1 | "Which cards in Korvold are creatures that cost 4 or more?" | Claude answers from real card facts |
| S2 | "How healthy is my Prosper deck?" | The same ramp / draw / removal / lands picture the app shows |
| S3 | "Is anything in this deck banned?" | Claude checks Commander legality |

## 6. Findings that shape the work (from the comparison report)
- The card facts already exist in Oracle's shared card library; the connector just does not read them. Many owned cards also have an empty type saved because the importer did not supply one. [Confirmed: src/lib/connector/tools/search-collection.ts, src/lib/card-definition-resolver.ts]
- The in-app deck health is worked out on request and nothing is saved, so the connector's "saved only" rule can never succeed. [Confirmed: src/lib/connector/tools/get-deck-health.ts, src/lib/deck-health-server.ts]
- Brackets are set only on the Deck strategy screen. [Confirmed: src/app/api/decks/[id]/strategy/route.ts]

## 7. Proposed slices (Architect to confirm; no stored-data change expected)
1. Card facts on every connector card result, read at the moment of asking from the card library.
2. Connector deck health runs the in-app check. Reuses the existing in-app routine.
3. Bracket: explain empty brackets; optionally let Claude suggest one but not set it (owner decides below).

## 8. Open questions for the owner (behaviour)
1. **Deck health freshness.** Recommended: Claude always gets a fresh check (a few seconds slower, always right). Alternative: only show a saved result. Which?
2. **Prices.** Claude shows an estimate with a "from Scryfall, estimate" label, and "unknown" when there is none. OK?
3. **Brackets.** Should Claude only report the bracket, or also be allowed to set it (with undo like other small edits)? Recommended: report only for now.
4. **Empty types on cards you own.** Fix by reading the card library each time (recommended, nothing in your collection changes), or also tidy the saved empty values (changes stored data; needs your approval)?

## 9. Risks
- Slower answers on big decks if the fresh check is heavy. Mitigation: Architect to measure.
- Some cards may not be found in the card library; Claude must say "facts unavailable", not guess.

## 10. Next gates
Owner approves brief, then Architect audit (read-only), then Developer slices, then Tester, then Scribe.

For Brad (plain words): this proposes letting Claude see what your cards actually do and get the same deck health you see in the app.
