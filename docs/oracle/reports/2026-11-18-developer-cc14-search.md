# Report: cc14-search
Role: Developer
Status: DONE
Task as received: CC-14 (collection search improvements and the prepared card-data backfill): search by card text, Legendary status, subtype and mana value; list cards with no card data and prepare the fix; sort. Plan: `.agents/tasks/cc14-search/plan.md`. Owner approval 2026-11-18 ("Yes") for items 2, 3, 5, 6 and sort from item 4. "Leave out chosen locations" is CC-25 and not part of this.

## Summary for the owner
Claude can now search the collection by words in a card's rules text, by Legendary, and by "can be a commander". It can sort by name or mana value, and ask for counts grouped by creature type or mana value. It can also list exactly which owned cards have no card data. The fix for those cards is prepared but NOT applied: it needs your approval (see below). Search results no longer include rules text unless Claude asks for it.

**Needs your approval: the card-data script.** It has not been run and nothing in the live database was changed. It would add the 100 missing cards to the shared card library and fill in missing rules text and subtype spelling on 132 two-faced cards. It does not touch your decks or collection. A dry run shows exactly what would change first, and a rollback undoes it.

**The 100 cards with no card data (124 copies), by cause:**
- 43 new single-faced cards released after the library was loaded.
- 22 two-faced cards from a new set (layout "prepare").
- 11 adventure cards.
- 9 modal two-faced cards.
- 9 transforming cards.
- 6 split cards.

The "86" Claude quoted is a different number. The real count is 100 cards.

**Claim refuted:** that two-faced "Front // Back" names fail to match. Names are stored in full on both sides and 8 owned two-faced cards match fine. For all 57 two-faced missing cards the library has no row under any form of the name, so no matching change could fix them.

**TIDY-01 is fixed.** A test that was already failing now checks the wording the app really uses.

## Changed files
- `src/lib/connector/tools/collection-filters.ts` — new filters: text, text_match, legendary, can_be_commander, no_card_facts.
- `src/lib/connector/tools/collection-query.ts` — one shared batched library read (`readLibrary`) for text, commander and role checks.
- `src/lib/connector/tools/collection-view.ts` — sort by name or mana value, no-data cards last.
- `src/lib/connector/tools/rules-text-match.ts` — all-words and phrase matching across both faces.
- `src/lib/connector/tools/search-collection.ts` — new inputs; rules text off by default; coverage note.
- `src/lib/connector/tools/get-collection-summary.ts` — group by subtype and mana value.
- `src/lib/connector/tools/index.ts` — updated tool descriptions.
- `src/lib/connector/__tests__/collection-search-cc14.test.ts`, `rules-text-match.test.ts` — new tests.
- `src/lib/connector/__tests__/collection-search-filters.test.ts`, `facts-in-tools.test.ts`, `view-db.ts` — updated for the new default and filters.
- `src/lib/connector/__tests__/registry-and-isolation.test.ts` — TIDY-01 fix.
- `docs/oracle/contracts/connector-collection-search.md`, `.types.ts`, `connector-card-facts-and-deck-health.md` — contract updates.
- `src/lib/ref-card-backfill.ts`, `src/lib/ref-card-backfill-plan.ts` — Scryfall-to-library mapping and the dry-run, apply and rollback logic.
- `src/lib/ref-card-backfill.test.ts`, `ref-card-backfill-script.test.ts` — tests (33).
- `supabase/drafts/cc14-backfill-ref-cards.ts`, `.rollback.sql`, `.README.md` — the prepared script, rollback and approval text. Not applied.

No migration was added and no database write happened.

## New decisions made (need owner confirmation)
The plan lists these in section 2 (eight items; the handoff said seven).
1. Rules-text search: `text` plus `text_match`. Default is all words, in any order, partial words count. `phrase` is exact. A hint appears when nothing is found.
2. Two-faced cards: text search covers both faces; a phrase cannot cross between faces. Until the script runs, two-faced cards without stored text cannot match and are counted.
3. Legendary: `legendary` means Legendary on either face. A separate `can_be_commander` uses the library's commander flag.
4. Cards with no data never match data-based filters, are always counted, and `no_card_facts: true` lists them.
5. Sort: by name (default) or mana value, ascending or descending, ties by name, no-data cards last.
6. Counts: group by subtype (groups overlap, noted in the answer) and mana value; at most 60 groups.
7. Rules text is off by default in search results; on request it comes back.
8. Speed: no database change; text and commander checks reuse the one batched library read, run only when used. A test pins the request count.

## Assumptions
- Scryfall's real data for layout "prepare" matches the generic multi-face shape the mapper handles. This is only tested with fixtures. The dry run will show if it is wrong.
- Live counts come from the plan's read-only audit on 2026-11-18.

## Challenges to locked decisions
- none

## Open questions
- Approve the card-data script? It needs a dry run against live first, which needs the owner's database credentials. None exist in the worktree, so no dry run was done.
- Optional later speed-up (add rules text and commander flag to the existing view) would need an approved view change. Not built.

## Verification
- `npx vitest --run src/lib/connector src/lib/ref-card-backfill` — 23 files passed, 1 skipped; 359 tests passed, 4 skipped, 0 failed.
- `npm run typecheck` — 4 errors, all the pre-existing ones in `AddToPicklist.test.tsx`; none added.
- `npx eslint` on the changed `.ts` files — no output (clean).
- No live database access and no `--apply` run.
