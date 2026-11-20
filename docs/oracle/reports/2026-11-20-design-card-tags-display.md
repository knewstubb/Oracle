# Report: design-card-tags-display
Role: Designer
Status: DONE
Task as received: Part 1 (design, Gate 3 proposal) of "show the card Tags in the Oracle app (the 'showing Tags' slice of RQ-12)": spec and mockup for the card window's Tags section, the collection search Tag filter, and any place Tags appear in the collection list or grid (recommend minimal); no build, no stored-data change. **Scope change from Gene, 2026-11-20:** the owner asked for a full redesign of the card details modal that replaces the CardWindow, so nothing is designed or built in the card window in this job (no Tags section, editable roles section not removed, text-reading guess not hidden). Kept: a reusable batched Tag read path by oracle_id, the collection Tag filter, and the connector (Tag filter in search_collection, Tags per card in results and in get_deck, tool wording).

## Summary for the owner
In this slice you get a Tag filter in the collection search: one "Tags" button in the filter row that opens the list of 40 Tags, where you can pick several. Claude can filter by Tag too, and sees each card's Tags in search results and when it reads a deck. The card window is untouched; showing Tags on a card waits for the card details redesign. Every look-and-feel choice below needs your yes or no.

## Changed files
- docs/oracle/specs/deck-rail-strategy-tags.md — section 4a now says the card window Tags section moved to the card details redesign and designs the shared Tag read path; 4b Tag filter (with how the server applies it); 4c Claude's search and deck read; 4d accessibility; section 4's Tags bullet says "not changed in the card window"; open questions 8b trimmed to the filter and Claude questions
- docs/oracle/mockups/card-tags-display.html — now only the collection Tag filter (closed, open, two picked, empty result; phone and greyscale). The card window screen from my first draft was removed
- docs/oracle/reports/2026-11-20-design-card-tags-display.md — this report

## Visual choices for owner confirmation
1. **Filter placement.** One "Tags" button at the right end of the existing filter row (after colours and status). With picks it reads "Tags: 2" and takes the green selected look; the count means colour is not the only signal.
2. **Panel.** Opens under the button (bottom sheet on a phone). All 40 Tags in two groups, Broad Tags and Mechanic Tags, in the stored order, with a "Find a Tag" box, no counts, and the quiet line "Cards released after 7 August 2026 have no Tags yet."
3. **Multi-select.** Several Tags can be picked. "All of them" is the default, "Any of them" one tap away (shown once two are picked). Claude's search has the same two choices.
4. **Applies at once.** Done only closes the panel. A line under the filter row: "Tags: Sacrifice outlet, Treasure generator (all of them) · 12 cards" with Clear Tags.
5. **Empty result.** "No cards match", one sentence on what was asked ("You own no cards with all of these Tags in Green."), a hint, and "Clear Tags" and "Clear all filters".
6. **Collection rows and tiles show no Tags** (minimal).
7. **Claude sees every Tag on a card** in results and deck reads, not five (it has no screen to fit). Broad first, then mechanic, in list order.
8. **Contrast and targets.** Text 14.18:1, outlines 5.07:1; every filter control at least 44 px (48 px rows on a phone); ticks and words, never colour alone.

## New decisions made (need owner confirmation)
- Items 1 to 8, and the six questions in spec section 8b.
- Technical decisions the build must follow (not owner-facing): one shared read function `getCardTags(oracleIds)` and one reverse read `oracleIdsWithTags(tagKeys, mode)`, both in a new `src/lib/card-tags-read.ts`; reads run 100 ids at a time and follow 1,000-row pages; a failed read returns an error, never "no Tags"; the 40 Tag names and order come from `card-tags.ts`, not from the stored list. Connector inputs `tags` and `tags_match` (default all); results and get_deck carry `tags`, with `tags_unavailable: true` on a failed read.

## Assumptions
- The collection page reads cards a page at a time from the server (rollup and printings endpoints) [Confirmed: src/app/collection/page.tsx, via useCollectionRollup and useCollectionPrintings]. I have not read those endpoints. The design applies the Tag filter there by limiting the list to the owner's cards that match, computed from the shared read path. If a page cannot be limited that way without a new database function or view, that is a stored-data change: the build stops and reports BLOCKED with the question.
- The collection screen has a colour filter, a status filter and a Basic chip, and no card type filter [Confirmed: src/components/collection/CollectionToolbar.tsx]. Claude's search has a type filter [Confirmed: src/lib/connector/tools/collection-filters.ts]; the Tag filter combines with it.
- The Tag filter in Claude's search counts as a card-fact filter (needs a card identity; cannot combine with `no_card_facts`), like the existing role filter [Confirmed: factFilterNames in collection-filters.ts]. The oracle id is already on the collection view rows [Confirmed: collection-view.ts].
- Tag lists on screen and for Claude use stored display names; order uses the stored display order [Confirmed: src/lib/card-tags.ts CARD_TAGS and the draft SQL].
- Signed-in users can read `ref_card_tags` (stated in the task; not re-checked against the live database here).
- Sample data in the mockup (cards, colours, statuses) is invented; the 40 Tags and their order are real.
- The date "7 August 2026" in the quiet line comes from the Scryfall copy used for the fill (brief section 9).

## Challenges to locked decisions
- none

## Open questions
- Spec section 8b, six questions with recommendations first. The card window questions from my first draft (order, "and N more", no-Tag line, states, text-reading guess, no card window in the collection) were handed to the card details redesign and are listed in spec section 4a as carried-over inputs.

## Verification
- Ran the mockup script in jsdom: filter open, two picked, empty result and closed render with no script errors.
- Read the sources the design touches: collection page and toolbar, connector filters and tool files, card-tags.ts, the Tag list draft SQL.
- No build, no database access, no write outside docs/oracle in this worktree. decisions.md and status.md untouched.
- Not run: the mockup in a real browser; any app tests (nothing built).
