# Brief: Category management (Gate 1 DRAFT)
Author: Product, drafted 2026-11-16. Status: **DRAFT, awaiting owner approval. NOT approved. Nothing is built.**
Order: second of three. Needs the Claude "set card category" tool first (`claude-connector-deck-category.md`). Followed by `suggested-categories.md`.

## 1. What this is, in plain words
One screen that lists every category you use, with how many cards are in it, in each deck and across all decks. You can merge two categories (for example "Life" into "Lifegain"), rename one, or delete one that has no cards. Claude can do the same through the connector.

## 2. Problem
Categories are typed freely, so the same idea ends up under several names ("Life", "Lifegain", "life gain"). Claude can now invent names and give each card up to 5. There is no place to see or tidy them, so they will drift further apart.

## 3. Goals
1. See every category, its card count per deck and in total.
2. Merge, rename and delete-empty from that screen.
3. Claude can list, merge, rename and delete-empty too, with the same safety as other Claude edits.

## 4. Scope
In: the list screen, the three actions, the Claude versions, preview and undo.
Out: suggestions when adding cards (next brief), colours or icons for categories, a fixed global category list, changing which deck a card is in, anything on the maybeboard.

## 5. Scenarios
| # | When | Wants |
|---|---|---|
| S1 | "I think I have Life and Lifegain both." | See both with counts, merge Life into Lifegain, in every deck at once |
| S2 | "Ramp should read Mana Ramp." | Rename in every deck, or only in one deck |
| S3 | "Tidy up after Claude sorted my deck." | See the new names Claude invented, rename or merge them |
| S4 | "This category is empty now." | Delete it so it stops showing up |
| S5 | Claude is asked "clean up my categories". | Claude lists them, proposes merges, you approve |

Example: Life is on 12 cards in Korvold and 5 in Prosper; Lifegain is on 8 in Korvold. Merging Life into Lifegain shows "17 cards in 2 decks will change", with a preview, then applies.

## 6. What must never happen
- A merge or rename silently loses a card's category, or leaves a card with none.
- A card ends up with the same category twice, or more than 5 (if a merge would push a card past 5, it is flagged, not cut).
- A merge touches the "Commander" group on commanders, or creates or removes a Maybeboard marker.
- Quantities, copies, zones or ownership change.
- Claude changes many cards without your yes.

## 7. Rules (behaviour)
- Names match ignoring capital letters ("ramp" and "Ramp" are one category).
- Merge, rename and delete-empty can apply to all decks or one deck.
- Delete is allowed only on categories with zero cards. A category with cards cannot be deleted; merge it instead.
- Same safety as other Claude edits: up to 10 cards change straight away, more waits for your yes after a preview, every change shows in Recent changes and can be undone for 7 days.
- Undo restores the exact previous categories on every card touched.

## 8. Proposed slices (owner sees each before the next)
1. Read-only list screen: every category, count per deck, total.
2. Merge and rename on that screen, with a preview ("17 cards in 2 decks") and undo.
3. Delete-empty.
4. Claude tools: list categories, merge, rename, delete-empty, with preview and approval.

## 9. Resolved by the owner (2026-11-16)
- **Merge scope:** a merge applies to every deck. A "this deck only" option is offered if it is cheap to build; if not, it is left out.

## 9a. Open questions for the owner (behaviour)
2. **Empty categories.** Does an "empty category" even exist for you? Today a category only exists while a card uses it. Options: (a) recommended, a category disappears automatically when its last card leaves, so delete-empty is rarely needed; (b) keep a saved list of names you want to reuse, which can be empty.
3. **Merge pushes a card past 5.** If merging leaves a card with 6, should the screen stop and show those cards (recommended), or drop the last one?
4. **Claude and renames.** May Claude rename or merge across all your decks, or only within one deck at a time? Recommended: one deck at a time for Claude, all decks only from the screen.
5. **Priority.** Is this worth doing before suggestions, or would you rather have suggestions first? Recommended: this first, because suggestions will otherwise add more near-duplicate names.

## 10. Risks
- Existing categories may use a separate main and secondary badge (D-010) and a short length cap; the audit must check how that fits with the 5-category list.
- Cross-deck merges touch many cards, so they need the preview and undo from day one.

## 11. Next gates
Owner approves, Architect audit (what exists in the app for categories, locked decisions touched), Designer mockup, Developer slices, Tester, Scribe.

For Brad (plain words): a tidy-up screen for your categories, so "Life" and "Lifegain" can become one, with a preview and an undo.
