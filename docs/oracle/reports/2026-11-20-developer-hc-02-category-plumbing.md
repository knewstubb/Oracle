# Report: hc-02-category-plumbing
Role: Developer
Status: DONE
Task as received: Build slice HC-02 of categories-drive-deck-health: category plumbing exactly as the audit's HC-02 row and section d describe: up to 5 categories per card everywhere (today the app keeps only 3 and the card window shows one), names up to 60 characters (today cut at 16), the card window shows every category the card holds, the first category still decides the group in the list, the deck total stays separate from the per-category counts and is never summed from them, and the connector tool wording fixes in section j. No stored category value may be changed or deleted; no data migration; no hosted write.

## Summary for the owner
A card can now sit in up to five categories everywhere in the app, and category names can be up to 60 characters. Nothing is cut any more, so "Game Plan & Win Conditions" stays whole. The card window lists every category the card is in, marks the first as the one the list uses, and lets you remove a category, pick one the deck already uses, or type a new name. Claude's tool texts now say a category is where a card sits, not a card role, and to use the exact names the deck shows. Deck health numbers are unchanged. Nothing stored was changed.

## Changed files
- src/lib/categoryUtils.ts — cap 5 per card, names 60, `validateCategoryNames`; reading no longer cuts names
- src/app/api/decks/[id]/cards/[cardId]/categories/route.ts, bulk/route.ts — accept 5 and 60; refuse more instead of cutting
- src/hooks/useDeckCategories.ts — names kept whole; includes every category in use, not only first ones
- src/components/CardWindow.tsx — shows all categories; edit panel (first category, remove, add from deck, add new name with counter)
- src/components/CategoryTagEditor.tsx, CardGroupSection.tsx — up to four extra dropdowns / suggestions
- src/lib/connector/tools/index.ts, edit-tools.ts — wording
- tests: categoryUtils, deck-health-categories, categories route, bulk route, CardWindow, CategoryTagEditor, edit-tools, chat-card-proposals
- docs/oracle/reports/evidence/hc-02-categories/ — screenshots

## New decisions made (need owner confirmation)
- Visual: the first category chip has a thick white outline plus the words "Shown in the list"; other chips are plain. Each extra chip has a Remove button while editing.
- Visual: the edit panel has a free-text field "Or add a new name (up to 60 characters)" with a "n of 60" counter. Without it you cannot give a card a long name in the window. A name over 60 shows a message and is not saved; "Maybeboard", "Sideboard", "Commander", "Companion" are refused.
- The deck's category pick-lists now include categories that are only extra (not first) on some card.
- The paused chat's category check now allows 60 characters too (it shared the old 16 limit).

## Assumptions
- Health still reads card text (HC-03 changes that), so the tool text says a category does not change a count "for now".
- Names that differ only by capitals reuse the deck's spelling in the window, as Claude's tool does.

## Challenges to locked decisions
- none

## Flags: audit vs code
- Audit section j said add_cards_to_deck still said "Give every card a role category"; HC-01 had already removed that. I only added the "where a card sits, not a role" and exact-name lines.
- The audit said the card window rebuilds the list from cut names; confirmed and fixed at the source (the read cut), so the window can no longer write cut names.
- `get_deck_health` description untouched (the three plain lines in section j belong with HC-05).
- Archidekt sync of extra categories not read (audit marked it approximate).
- Existing test "shows one category" was rewritten: it asserted the old one-chip rule that this slice replaces.

## Open questions
- Is the free-text field in the card window wanted, or should long names come only from Claude until HC-04?

## 5-minute test (Yedora the Explorer, then A rot to process)
1. Open Yedora, click a creature's name (for example Ainok Survivalist) to open the card window. It shows "Creature" with "Shown in the list".
2. Press Edit. Under "Or add a new name" type "Game Plan & Win Conditions", press Add. Add "Payoffs". Add a third with a name of about 60 characters (the counter reads "60 of 60"). All three show whole, nothing cut.
3. Close the window. The card is still in the Creature group in the list.
4. Try a sixth: the window says a card can be in 5 categories. Use Remove to take one off.
5. Open the deck rail: Yedora reads 37 Ok, 18 Heavy, 6 Light, 6 Light, 0 Light, 34. Repeat on A rot to process: 38 Ok, 9 Light, 7, 7, 3 Ok, 37. The numbers do not change.
Note: step 2 writes to your real deck. Remove the extras afterwards.

## Verification
- Full vitest: 339 files; only failures were the old chat 16-character test (updated, passes) and the known flaky upgrade-engine property test (passes on rerun, also flaky on main). No other failures.
- tsc: only the 4 known AddToPicklist errors. eslint: 1 error (the known PicklistV2), 248 problems (249 before).
- Browser (local dev server restarted from this worktree on port 3000, Chromium): Yedora and A rot to process at 1280 and 390 px. A card given three categories (Creature, Game Plan & Win Conditions, Payoffs) plus a typed 60-character name showed all four whole, no overflow, no console errors, list group stayed Creature, and the saved request carried the 4 names in order. Phone: no control under 44 px in the window. The card data and the save were intercepted in the browser, so no hosted write happened. Screenshots in evidence/hc-02-categories/.
- Not run: screen reader pass; no migration; no hosted write.
