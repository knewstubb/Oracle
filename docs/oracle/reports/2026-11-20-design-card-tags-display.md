# Report: design-card-tags-display
Role: Designer
Status: DONE
Task as received: Part 1 (design, Gate 3 proposal) of "show the card Tags in the Oracle app (the 'showing Tags' slice of RQ-12)": update the spec and mockup for the card window's Tags section (chips, order, at most five plus 'and N more', no-Tag state, loading and failed states, phone layout), the collection search Tag filter (placement, single or multi-select, combined with colour and type filters, empty result), and any place Tags appear in the collection list or grid (recommend minimal). Examples: Sol Ring, Warren Soultrader, a card with no Tag. No build, no stored-data change.

## Summary for the owner
Open a card in a deck and you see a "Tags" section: up to five read-only chips, broad Tags first, with "and 2 more" when there are extra. The collection search gets one "Tags" button in the filter row; it opens a list of all 40 Tags where you tick one or several. Nothing is built yet. Every look-and-feel choice below needs your yes or no.

## Changed files
- docs/oracle/specs/deck-rail-strategy-tags.md — new sections 4a to 4d (Tags in the card window, Tag filter, other places and Claude's search, accessibility), Tags bullet in section 4 replaced, copy list and open questions (8b) extended
- docs/oracle/mockups/card-tags-display.html — new mockup: card window for Sol Ring, Warren Soultrader, Smothering Tithe, a 7-Tag card and a no-Tag card, loading and failed states; collection Tag filter closed, open, two picked, empty result; phone and greyscale switches
- docs/oracle/reports/2026-11-20-design-card-tags-display.md — this report

## Visual choices for owner confirmation
1. **Five first.** Broad Tags first, then mechanic Tags, each in the Tag list's own order (commonest first). Replaces the earlier "alphabetical". Example: Warren Soultrader shows Ramp, Token generator, Sacrifice outlet, Treasure generator. A card with seven Tags shows Card draw, Ramp, Recursion, Fixing, Token generator.
2. **Chips.** Plain outlined pills, identical for broad and mechanic Tags, not buttons, no hover effect, not tab stops.
3. **"and N more".** Text only under the chips: "and 2 more. Use the Tag filter in your collection search to find this card by them." Hidden Tags are not named and nothing expands.
4. **No Tags.** Quiet grey line "No Tags for this card." No guess.
5. **Loading and failed.** One grey placeholder bar while loading; a red-outlined box with "Couldn't load Tags for Sol Ring. Nothing has changed." and Try again if it fails. Tags load on their own, so they never block the rest of the window.
6. **Filter placement.** One "Tags" button at the right end of the existing filter row (after colours and status); shows "Tags: 2" when used.
7. **Filter panel.** Opens under the button (bottom sheet on a phone). Lists all 40 grouped as Broad Tags and Mechanic Tags, with a "Find a Tag" box, no counts, and a quiet line "Cards released after 7 August 2026 have no Tags yet."
8. **Multi-select.** Several Tags can be picked. "All of them" is the default, "Any of them" one tap away. Claude's search gets the same two choices.
9. **Applies at once**, Done only closes. A summary line under the filter row ("Tags: Sacrifice outlet, Treasure generator (all of them) · 12 cards") has Clear Tags.
10. **Empty result.** "No cards match", one sentence on what was asked, a hint, and buttons "Clear Tags" and "Clear all filters".
11. **Collection rows and tiles show no Tags** (minimal, as recommended).
12. **Contrast and targets.** Chip text 14.18:1, outlines 5.07:1; every filter control at least 44 px (48 px rows on a phone); ticks and words, never colour alone.

## New decisions made (need owner confirmation)
- Items 1 to 12 above, and the questions in spec section 8b.
- The card window shows no guessed label at all, even for a card with no stored Tag (see Assumptions).

## Assumptions
- The brief says the text-reading guess is hidden on cards with stored Tags; your rule says a card with no Tag shows none. I combined them: the card window never shows the guess. Deck health keeps its classifier and numbers. [Confirmed: src/components/CardWindow.tsx still renders the guess and the editable section today.]
- The card window exists only for deck cards. [Confirmed: CardWindow is used only in CardsTab.tsx and CardGroupSection.tsx; the collection page has no card window.] So Tags on a collection card appear only through the filter in this slice.
- The collection search has a colour filter and a status filter; I found no card type filter on the collection screen [Confirmed: src/components/collection/CollectionToolbar.tsx, src/lib/collection-filters.ts]. The Tag filter sits beside the ones that exist. Claude's search tool does have a type filter [Confirmed: src/lib/connector/tools/collection-filters.ts], and the Tag filter combines with it.
- Tag names shown are the stored display names (for example "Targeted removal", "Stax / tax"); order uses the stored display order.
- The Tag names are fixed in the app, so the filter panel needs no loading state. If the build reads them from the stored list instead, a loading state is needed.
- The date "7 August 2026" in the quiet line comes from the Scryfall copy used for the fill (brief section 9).
- Mockup sample data (cards, colours, statuses) is invented except the 40 Tags and their order; Smothering Tithe and Warren Soultrader Tags match the live examples.

## Challenges to locked decisions
- none

## Open questions
- Spec section 8b: nine questions, each with a recommendation first. The two that change behaviour most: no guessed label for cards without Tags (Q1), and no card window in the collection (Q2).

## Verification
- Extracted the mockup script and ran `node --check` — passes.
- Read the live sources the design touches: CardWindow.tsx (roles section, shared lookup), CollectionToolbar.tsx, connector collection-filters.ts, and the Tag list draft SQL (names and display order).
- No build, no database access, no write outside docs/oracle in this worktree. decisions.md and status.md untouched.
- Not run: the mockup in a browser (no browser check made); not run: any app tests (nothing built).
