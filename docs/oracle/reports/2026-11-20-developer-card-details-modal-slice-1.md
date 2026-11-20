# Report: card-details-modal-slice-1
Role: Developer
Status: PARTIAL
Task as received: Card details modal slice 1 (shared shell plus deck context, plus the GATE 2 draft for "Why it's here"). Report started in FEAT-001; later FEATs fill the remaining sections.

## Summary for the owner
(To be completed at the end of the slice.)

Draft for approval so far: one optional 200-character "Why it's here" line per deck card. It adds one empty column, touches no existing data, and is undone with the rollback file (refused while any Why text exists). Nothing has been applied.

## Changed files
- supabase/drafts/20261120110000_why_here_deck_cards.draft.sql — adds deck_cards.why_here (nullable, 200-character cap); not applied
- supabase/drafts/20261120110000_why_here_deck_cards.rollback.sql — undo; refuses while any Why text exists
- docs/oracle/reports/evidence/roles-db/test_why.sh, test_why.out — throwaway-database rehearsal (20 PASS, 0 FAIL)
- docs/oracle/reports/evidence/roles-db/test_chain.sh, test_chain.out — why draft applied last, rolled back first (19 PASS, 0 FAIL)
- docs/oracle/reports/evidence/roles-db/README.md — rows for the new test

## New decisions made (need owner confirmation)
- 200 characters for the Why line (spec's example).
(More to be added by later FEATs.)

## Assumptions
- The throwaway base has no row security on deck_cards, so test_why.sh adds the live policy as a stand-in (own-row policy, no anon access, as in migration 20261116100000) before taking its baseline.

## Challenges to locked decisions
- none so far

## Open questions
- none so far

## Verification
- `./run.sh test_why`, `test_chain`, `test_db1` to `test_db5`, `test_s3`, `test_s4`, `test_s5`, `test_tags` in docs/oracle/reports/evidence/roles-db — all 0 FAIL (test_tags: 20 PASS without the optional Part B job inputs; the saved test_tags.out is unchanged)

## Contradictions between the spec and the codebase

Each is tagged with whether an owner decision of 2026-11-20 (D1 tags, D2 roles, D3 Why, D4 buying list) or Gene's verified facts cover it. None needs an owner answer before building. Items marked FLAG go in the slice report for the owner to confirm.

1. **Tags source.** The spec asks for Scryfall tag names and owner-added tags with "+ Add tag". The app stores its own 40 curated Tags. Live check (read-only): `ref_tag_list` has 40 rows. [Confirmed: src/lib/card-tags.ts, supabase/drafts/20261120100000_tags_fill_tag_tables.draft.sql]. Covered by D1.
2. **A legacy `deck_cards.tags` text column already exists.** The spec says owner-added tags show a dot and can be removed, and that column looks like where that would live. [Confirmed: src/types/supabase.ts deck_cards.Row.tags]. D1 makes Tags read-only, so the modal must not read or write that column. Covered by D1.
3. **Roles fallback.** The spec's GATE 1 item 3 says ship with roles rendered as chips. Covered by D2 (roles dropped). Deck health still reads the text classifier through `src/lib/card-roles.ts` and `deck-health.ts`; neither is touched. [Confirmed: src/lib/card-window-roles.ts imports from ./card-roles].
4. **Category fields.** The spec names `primary_category` and `additional_categories` columns. The database has one `deck_cards.categories` text column (JSON list), first entry = list group, up to 5 entries, names up to 60 characters. [Confirmed: src/types/supabase.ts; src/components/CardWindow.tsx uses `parseCategoriesCapped`, `MAX_CATEGORIES_PER_CARD`, `MAX_CATEGORY_LENGTH`; PUT `src/app/api/decks/[id]/cards/[cardId]/categories/route.ts` takes `{primary_category, additional_categories}` and serialises]. Covered by Gene's facts. "Also in" allows 4 chips, not unlimited.
5. **Rulings source.** The spec says Scryfall rulings endpoint, cached. Code comments say `ref_rulings` was dropped and rulings come from Scryfall on demand. [Confirmed: src/lib/card-data.ts lines ~535-545; supabase/reconciliation/pending-local/20260812000000_drop_ref_rulings.sql, which the reconciliation README says was never applied]. Live read-only check: `ref_rulings` exists with 77,961 rows and columns id, oracle_id, source, published_at, comment. Covered by D3-facts (Gene: read from `ref_rulings`). How it is filled: nothing in the repo writes it today. The only trace is the old creation migration `scripts/migrations/add-ref-rulings.sql`, so it was seeded once from Scryfall bulk data and has no refresh job. The stale comment in `card-data.ts` is wrong; leave `getRulingsByCardName` (chat tool `mtg_ruling_search`) alone and record the discrepancy. A top-up is not needed for slice 1, because a card with no stored ruling shows the empty state. FLAG: new rulings published after the seed will be missing until someone adds a refresh job.
6. **"Shared tokens already built" for swatches, pips, badges.** The left rail has status colours in `src/styles/tokens.css` (`--status-*`, `--state-*`, `--signal-*`), pips are `ColourPips`/`ManaIcon`, and the status badge is `CardSlotBadge`. There is NO swatch component. The only hatched fill is an inline `repeating-linear-gradient` in `src/components/deck-rail/RailCards.tsx` line ~72. [Confirmed: those files]. Not covered. Resolution without asking: create one `CopySwatch` component that uses the existing tokens and export the hatch style from it. Change `RailCards.tsx` to import that hatch so only one exists. Rendering is unchanged. FLAG.
7. **Status and action words versus the vocabulary.** [Confirmed: docs/oracle/specs/vocabulary.md sections 3 and 3.3, src/components/CardSlotBadge.tsx, src/lib/move-here.ts].
   - "Not sleeved": the vocabulary says state words are **Planned** (slot with no copy) and **In deck** (slot with a copy). "Sleeved/Unsleeved" as state words are retired. The spec's pill is dashed; the vocabulary says outline badges are "Never dashed".
   - "Free": the allocation convention says **Open** (free copy in storage).
   - "Sleeved · Playable deck": use **In {deck name} · Playable**.
   - "Sleeve here": matches the action **Sleeve**. Keep.
   - "Move here": exists as a specified action in docs/oracle/specs/know-where-cards-are.md section 19, with a route and `MoveHereControl`. Keep.
   - "Swap in": not in the vocabulary or convention. Closest existing words are **Reassign** and "Replace with original" (proxy to original). FLAG with recommendation: label it **Sleeve here** with a line "replaces the copy now in this slot", because the convention has no "swap".
   - Plan: put every owner-visible word in one file, `src/components/card-details/labels.ts`, using the convention words (Planned, In deck, Open, Original, Proxy, Claimed, Unowned, Sleeve here, Move here). The report lists each spec word, what shipped and a one-line way to switch. Not silently renamed.
8. **Move warning versus the earlier Move here decision.** Spec section 19.5 says no dialog, a line before the click; vocabulary line about confirmations by deck status concerned the retired Active flag. The owner now asks for an inline warning "before confirming". Plan: when the source deck is Playable, the first click on Move here opens an inline row note ("{Deck} is Playable, so it will become Assembling.", the existing `playableWarning()`) with Confirm and Cancel. A non-Playable source moves on one click as today. Covered by the owner request. FLAG: this is a small change from section 19.
9. **Printing change can alter the sleeved copy.** `PATCH /api/decks/[id]/cards/[cardId]` mirrors `scryfall_id` onto the sleeved `user_copies.printing_id`. `POST /api/cards/update-printing` (deck_card target) has no ownership check. [Confirmed: both route files]. This contradicts "changing a printing never changes which physical copy is attached" (it rewrites a physical card's printing). Covered by the owner rule. Plan: the radios call PATCH only when `copy_id` is null; when sleeved the radios are disabled. The new details route enforces the same rule on the server (409), and `update-printing` is not used.
10. **Roles route callers.** Only the old CardWindow and its tests call `/api/decks/[id]/cards/[cardId]/roles`. [Confirmed: grep of src]. Covered by D2: removal allowed.
11. **Entry points.** The spec lists CardPopover and CardGrid. Only `CardGroupSection.tsx` (name click, "Card details" menu item) and `CardsTab.tsx` (provider) use the window. [Confirmed: grep for `useCardWindow`/`CardWindowProvider`]. CardPopover and CardGrid have no hook-up and stay as they are. Not a blocker.
12. **Rail value "Commander Legal"** comes from `ref_printings.legality_commander`; the "EDHREC decks" row is explore only (slice 3). Not in slice 1.
13. **Deck status words.** The code's `DeckStatus` type in `src/lib/deck-status.ts` is `brewing | in_rotation`, while Brewing, Assembling and Playable live in `MoveHereDeckState` (`src/lib/move-here.ts`) and `computeDeckReadiness`. Use the latter. [Confirmed]. Covered.
14. **"Why it's here" column** does not exist live: a read-only query for `deck_cards.why_here` returned error 42703. Expected under D3. The textarea stays hidden.
15. **Roles database objects and Tags read path.** Tags job `card-tags-display` is NOT merged (`git merge-base --is-ancestor card-tags-display main` fails; its branch has only design commits, none with code). Decision: build a small `src/lib/card-tags-read.ts` function with a batched shape `getTagsByOracleIds(ids): Promise<Map<string, TagChip[]>>`. At the merge step, rebase and switch to the shared read path if it landed.

