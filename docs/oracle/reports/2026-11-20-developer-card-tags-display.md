# Report: card-tags-display (build)
Role: Developer
Status: DONE
Task as received: Part 2 (build) of "show the card Tags in the Oracle app (the 'showing Tags' slice of RQ-12)", following `docs/oracle/specs/deck-rail-strategy-tags.md` sections 4a to 4d and `docs/oracle/reports/2026-11-20-design-card-tags-display.md`. The design step withdrew the card window Tags section (it moves to the card details redesign), so this build covers the shared Tag read path, the collection Tag filter, and Claude's search and deck read. No migration, no hosted write.

## Summary for the owner
The Collection screen now has a "Tags" button at the end of the filter row. It opens the list of 40 Tags, you tick one or more, and the list narrows at once (for example Sacrifice outlet plus Treasure generator shows exactly Warren Soultrader). Claude can ask for cards by Tag in one question, for example "owned cards tagged Sacrifice outlet that are not in a deck", and every card Claude sees now lists its Tags. The card window is unchanged, and Deck health numbers are unchanged.

One thing to decide: with Tags added, a full 100-card deck may now come back from Claude in two pieces (about 90 cards, then the rest) instead of one. Nothing is lost and the answer says when more remain. See "New decisions".

## 5-minute test
1. Open Collection. At the end of the filter row, tap "Tags". The list shows 13 Broad Tags then 27 Mechanic Tags and a "Find a Tag" box.
2. Tick "Sacrifice outlet". The list drops to 135 cards and a line under the filters says "Tags: Sacrifice outlet · 135 cards" with a "Clear Tags" button.
3. Also tick "Treasure generator". "Show cards with: All of them / Any of them" appears. With "All of them" you see 1 card (Warren Soultrader). Tap "Any of them" to widen it.
4. Untick everything, then tick two Tags nobody has together to see "No cards match" with "Clear Tags" and "Clear all filters". Press Escape: the panel closes and focus goes back to the Tags button.
5. Switch to the list view and repeat step 2: same cards. At phone width the panel is a bottom sheet.
6. Ask Claude: "Which owned cards are sacrifice outlets and not in a deck?" It should use one search. Ask it to show a deck: each card has its Tags (Sol Ring: Ramp; a card with none: an empty list).
7. Open Yedora, the Explorer: Deck health still reads Lands 37, Ramp 18, Card Advantage 6, Targeted Removal 6, Board Wipes 0, Game Plan 34.

Not in this test: opening Sol Ring or Warren Soultrader in the card window. The card window does not show Tags in this slice (design decision; it belongs to the card details redesign).

## What was removed and what stays
Removed: nothing. The task text asked for the CC-26 "Universal roles" editing UI to be deleted and the text-reading stand-in to be hidden, but the approved design (2026-11-20) moved all card window work to the card details redesign and says those stay in the card window until that redesign replaces it. Following the design:
- Stays untouched: the card window (`CardWindow.tsx`, `card-window-*`), the editable Universal roles section and its client code and API write route, the text-reading stand-in, the roles tables and drafts, the in-app chat code, Deck health and its classifier, the Picklist components.
- Wording only: connector text that said a category is "not a card role" now says it is "not what the card does (that is its Tags...)". The old `roles` filter keeps its behaviour; its description gains "Not the same as Tags."

## Changed files
- src/lib/card-tags-read.ts (new) — shared Tag read path: `getCardTags`, `oracleIdsWithTags`, `resolveTag`, `ALL_TAGS`, session and read-only adapters, 5-minute cache
- src/lib/collection-tag-filter.ts (new) — reads `tags`/`tagsMatch` from a request, asks the shared read path
- src/app/api/collection/rollup/route.ts, printings/route.ts — Tag filter on the grid and list pages (still 50 and 100 a page); unknown Tag is a 400; failed Tag read is an error, not "no cards"
- src/lib/collection-colour-filter.ts — `in` added to the view query type
- src/hooks/useCollectionRollup.ts, useCollectionPrintings.ts — send the Tag choice with the list request
- src/components/collection/CollectionTagFilter.tsx (new) — Tags button, panel, summary line, empty state
- src/components/collection/CollectionToolbar.tsx — slot for the Tags button at the end of the filter row
- src/app/collection/page.tsx — Tag state, summary line, empty state, Clear all filters
- src/lib/connector/tools/card-tags-tool.ts (new) — connector adapter, Tags per card, printing to card identity
- src/lib/connector/tools/collection-filters.ts, collection-query.ts, collection-view.ts — `tags`, `tags_match`, validation message listing the 40, coverage note
- src/lib/connector/tools/search-collection.ts, get-deck.ts — Tags on each result and deck card, `tags_unavailable` on a failed read
- src/lib/connector/tools/index.ts, edit-tools.ts — tool descriptions (Tag, Category, "Not the same as Tags")
- Tests: src/lib/card-tags-read.test.ts, src/lib/connector/__tests__/card-tags-search.test.ts, src/app/api/collection/__tests__/tag-filter-routes.test.ts, src/components/collection/CollectionTagFilter.test.tsx, src/hooks/collectionTagParams.test.tsx; updated facts-in-tools, collection-search-filters, edit-tools, view-db
- docs/oracle/reports/evidence/card-tags-display/ — screenshots

## New decisions made (need owner confirmation)
- get_deck size: each card now carries about 40 bytes of Tags, and the 40 KB answer limit was already nearly used by a 100-card deck. A full deck can come back as about 90 cards plus a note "Showing 90 of 100... offset 90". The tool text now says "up to about 90 cards in one call". Options: keep as is (recommended, nothing lost), or ask the Architect to raise the limit for get_deck.
- The collection filter reads Tags with the signed-in session, but lists use the existing admin client for card data as before.
- A deck card with no printing on record is marked `tags_unavailable` (its card identity cannot be found), not shown as having no Tags.

## Assumptions
- Tag filter on the collection list view limits copies of tagged cards, counted per copy (list view counts copies, grid counts cards).
- Status chips (Fully Placed etc.) are not applied server side today; unchanged.

## Challenges to locked decisions
- none

## Open questions
- Should the 100-card get_deck limit be raised (see above)?

## Verification
- `npx vitest run` (full): 4374 passed, 1 failed (ImportIntentFlow env flag test, known pre-existing), 46 skipped. New tests: 15 read path, 16 connector, 11 routes, 12 component, 2 hooks.
- `npx tsc --noEmit`: only the 4 known AddToPicklist errors.
- `npx eslint` on changed files: 0 errors, 3 warnings (pre-existing in page.tsx and CollectionToolbar.tsx).
- Browser check on the worktree app at http://localhost:3000 (restarted from the worktree): desktop 1280 and phone 390 wide. Sacrifice outlet gives 135 cards; plus Treasure generator (all of them) gives Warren Soultrader only. Screenshots: `docs/oracle/reports/evidence/card-tags-display/01-collection-desktop.png`, `02-desktop-sacrifice-outlet.png`, `03-phone-sheet.png`.
- Deck health: no file of the classifier or Deck health was changed; a test checks get_deck's health block and Categories are identical with and without Tag data. Live Yedora numbers were not re-read in the browser.
- No hosted write, no migration; only read queries.
