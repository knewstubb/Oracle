# Brief: Filterable collection search for Claude (Gate 1 DRAFT)
Author: Gene, drafted 2026-11-16 from Claude's feedback. Status: **DRAFT, awaiting owner approval. NOT approved. Nothing is built.** Depends on: `connector-card-facts-and-deck-health.md` (type and colour facts must exist first).

## 1. What this is, in plain words
Claude can search the collection by name, and filter by free or proxy only, but must flip through pages (about 113 calls for the whole collection) to find, say, every green ramp creature you own. This lets Claude ask for exactly what it wants, and get a summary count first.

## 2. Problem
Claude cannot filter by type, colour, or where a card is stored, and cannot get totals. Whole-collection questions take many slow calls. [Confirmed: src/lib/connector/tools/search-collection.ts supports name, free-only, proxy filter and paging only.]

## 3. Goals
1. Filters Claude can combine: type (e.g. creature), colour identity, mana value range, where the card is stored (box, binder, deck), free-only, proxy / original, name text.
2. A summary view: counts grouped by type, colour or location, so Claude sees the shape of the collection in one answer.
3. Results small enough to read: sensible page size, plus "N more" so Claude knows when to stop.

## 4. Scope
In: read-only search and summary. Out: changing cards, game logging, wishlist (parked; separate idea), card tags like ramp or removal (the tagging pipeline is specced but unbuilt).

## 5. Scenarios
| # | When | Wants |
|---|---|---|
| S1 | "What green creatures do I own that aren't in a deck?" | A short filtered list |
| S2 | "How is my collection split by colour?" | One summary, no paging |
| S3 | "What's in the Unsorted box?" | Cards by location |

## 6. Proposed slices
1. Type, colour, mana value and location filters on the existing search.
2. Summary (group counts) view.

## 7. Open questions for the owner (behaviour)
1. **Function tags.** Do you want "ramp / draw / removal" searchable now? Recommended: not yet; Deck health already sorts cards into these roles per deck, so ask about a deck instead.
2. **What counts as "free".** Today free means not sleeved in any deck. Should cards marked In your hand or Missing be left out of "free"? Recommended: yes, same as the rest of the app.
3. **Proxies in results.** Show originals and proxies as separate rows (recommended) or one row with counts?
4. **Wishlist.** Should Claude be able to see your wishlist too, or leave that for later? Recommended: later.

## 8. Risks
Colour and type search needs the card facts from the first brief; without them filters would silently miss cards. Slice order must hold.

## 9. Next gates
Owner approves brief, Architect audit, Developer slices, Tester, Scribe.

For Brad (plain words): this proposes letting Claude filter your collection by type, colour and where cards live, and get totals without paging through everything.
