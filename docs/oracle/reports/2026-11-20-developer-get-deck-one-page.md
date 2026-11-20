# Report: get-deck-one-page
Role: Developer
Status: DONE
Task as received: Owner decision 2026-11-20: a full Commander deck (100 cards, plus maybeboard where the tool returns it) must reach Claude in ONE get_deck reply. Fix get_deck so a 100-card deck plus its strategy, health and Tags fits in one page, preferring a smaller per-card payload over a higher cap, without dropping information Claude relies on. Keep paging for bigger lists and the "more remain" wording. Measure on the owner's real decks read-only. No database change, no hosted write.

## Summary for the owner
Claude now gets a whole 100-card deck, with its strategy, Deck health and every card's Tags, in one answer. Each card's Tags are sent as short codes (t3 and so on) with one list at the top saying what each code means, and a few always-the-same fields are left out. The size limit is unchanged. Nothing is lost: a card with no Tags simply has no Tags entry, and only the commander is marked as commander.

## Measured on your real decks (read-only; answer size in bytes, limit 40,960)
| Deck | Cards | Before | After | One page? |
|---|---|---|---|---|
| Yedora the Explorer | 102 | 38,974 | 34,532 | yes (before: yes, 2 KB spare) |
| A rot to process | 100 | 39,006 | 34,315 | yes |
| Rocco's Secret Sauce | 100 | 40,749 | 35,612 | yes (before: 211 bytes spare) |
| Murky Business | 101 | 39,616 | 34,846 | yes |
| Auntie Ool | 100 | 39,240 | 34,478 | yes |
Saving is 4.4 to 5.1 KB (about 12 percent) a deck. The worst deck now has 5.3 KB spare, so a deck with more Tags a card still fits. Today's decks already squeezed in, but with almost no room; the Tags added to the next cards would have pushed them over (the earlier report saw about 90 cards). A deck bigger than the limit (for example a 100-card deck with a large maybeboard listed) still pages and says "Showing N of M... Ask for the next page with offset N."

## Changed files
- src/lib/connector/tools/get-deck.ts — Tags as codes plus one `tagNames` list (only codes used); `isCommander` only when true; `facts.available` only when false; no empty `tags`
- src/lib/connector/tools/card-tags-tool.ts — code list (t1 to t40 by place in the Tag list) and its reverse
- src/lib/connector/tools/index.ts — get_deck description rewritten in plain words (codes, omitted fields, "a full 100-card deck comes back in one call")
- src/lib/connector/__tests__/facts-in-tools.test.ts, card-tags-search.test.ts — updated to the new shape; new tests below

## New decisions made (need owner confirmation)
- Tag codes are only valid inside the answer that carries their `tagNames` list. Alternative: use the stored Tag keys (for example token_generator), which are as long as the names and save nothing.
- Cap not raised (40 KB stays), so the connector limits and their tests are untouched.

## Assumptions
- Claude reads a missing `isCommander` as false, a missing `tags` as "no Tags" (a failed read still shows `tags_unavailable`), and a missing `facts.available` as true. The tool description says so.
- Measured with get_deck defaults (no rules text); the maybeboard flag made no difference on these decks (their maybeboards are counted only, size unchanged).

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- Real-deck measurement before and after: read-only select queries with a throwaway script (deleted, not committed).
- New tests: realistic 100-card deck with 5 Tags a card fits in one page, not truncated; a 160-row list still pages with "Showing N of 160 ... offset N"; the Tag code list resolves every code on the cards and all 40 Tags have unique round-trip codes.
- `npx vitest run`: 4370 passed, 1 failed (ImportIntentFlow env flag test, known pre-existing), 46 skipped.
- `npx tsc --noEmit`: only the 4 known AddToPicklist errors. `npx eslint src/lib/connector`: clean.
- No database object changed, no hosted write, no push.
