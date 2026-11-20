# Report: card-details-modal-slice-1
Role: Developer
Status: DONE
Task as received: Card details modal slice 1 (shared shell plus deck context, plus the GATE 2 draft for "Why it's here"). Report started in FEAT-001; later FEATs fill the remaining sections.

## Summary for the owner
The card details window on the deck's Cards tab is now the new design: a left rail with the card picture, status and three facts, and four tabs (Overview, Printings, Copies, Rulings). It is 1080 by 600 on a desktop with each tab scrolling on its own, and a full-screen sheet on a phone. The old Roles section is gone from the window. Deck health numbers are untouched. You need to approve the "Why it's here" line (below) before it appears in the window.

**Why it's here, for approval.** It adds one optional line of up to 200 characters to each card in a deck. It touches no existing data and is undone with the rollback file, which refuses while any Why text exists. Nothing has been applied; until you approve and it is applied, the Why box stays hidden.

## Changed files
- supabase/drafts/20261120110000_why_here_deck_cards.{draft,rollback}.sql — Why column draft and undo; not applied
- docs/oracle/reports/evidence/roles-db/test_why.sh, test_chain.sh (+ .out, README) — throwaway-database rehearsal (20 and 19 PASS, 0 FAIL)
- src/lib/card-details/* , src/app/api/decks/[id]/cards/[cardId]/{details,why}/route.ts, PATCH `slotOnly` guard — server layer (FEAT-002); load.ts now also returns the card's Commander legality
- src/components/CopySwatch.tsx — shared swatch (solid Original, hatched Proxy, grey in another deck, hollow Open) and the hatch
- src/components/deck-rail/RailCards.tsx — now imports the hatch from CopySwatch; looks the same
- src/components/card-details/* — modal shell, provider, Overview, Printings, Copies, Rulings, tests
- src/components/CardsTab.tsx, CardGroupSection.tsx — use the new provider and hook
- src/lib/type-line-dfc-front.test.ts — one assertion now uses the shared type-line parser (it imported a deleted helper)
- docs/oracle/reports/evidence/card-details-modal/ — screenshots, capture.mjs, harness page

## Removed vs kept
- Removed: CardWindow.tsx and its test; card-window-roles(.test).ts; card-window-stored-roles(.test, -server).ts; the roles route (route and test) under api/decks/[id]/cards/[cardId]/roles. The only other importer found was type-line-dfc-front.test.ts (fixed).
- Kept: card-roles.ts, deck-health.ts, the roles database tables, drafts and RPC wrappers, in-app chat code. Deck health still reads the text classifier.

## Flags for the owner
- Words: all owner-visible words are in src/lib/card-details/labels.ts (Planned, In deck, Open, Original, Proxy, Claimed, Sleeve here, Move here). "Not sleeved" became Planned; "Free" became Open; "Sleeved · Playable deck" became "In {deck} · Playable".
- "Swap in" is not built. The vocabulary has no "swap" and there is no existing route that replaces the copy in a filled slot (assign refuses a filled slot). An Open copy on a filled slot shows "Open · replaces the copy now in this slot" with no button. A new atomic route would be needed; say if you want it.
- Move here: when the source deck is Playable, the first click shows an inline note with Confirm and Cancel; other sources move on one click (small change from spec section 19).
- Printing radios are disabled with a note when the slot has a copy; the details route and the modal's PATCH (`slotOnly`) refuse a printing change on a sleeved slot.
- Tags heading is "Tags" and read-only; owner add/remove tags is not built (decision D1). "No Tags for this card yet." shows when none.
- Rulings come from ref_rulings (77,961 rows, seeded once, no refresh job): new rulings will be missing until a refresh job exists.
- Hatch moved into CopySwatch; the grey swatch uses --status-partial (the existing token --status-owned is too dark for 3:1).
- Save line reads "Saved at HH:MM" (the shared SaveStatus), not just "Saved".
- Edge: the first category list is always visible; "Also in" allows 4 chips (5 total).

## Notes for later
- Tags read path: src/lib/card-details/card-tags-read.ts is local. After card-tags-display merges, switch to the shared read path.
- "Add to buying list" is hidden for slice 3 (explore).
- Claude writing Why later should go through the change log with a reason.
- Rail "EDHREC decks" row is explore only.

## New decisions made (need owner confirmation)
- 200 characters for the Why line (spec's example).
- Swap in left out (above); Move here two-step for Playable sources; no ruling refresh job; hatch moved.

## Assumptions
- The throwaway base has no row security on deck_cards, so test_why.sh adds the live policy as a stand-in before taking its baseline.
- The saved Playwright session belongs to the test user (no decks), so the browser check used a temporary page with fixture answers (see Verification).

## Challenges to locked decisions
- none

## Open questions
- Approve the Why draft? Want "Swap in" built as a new route?

## Verification
- npx vitest run src/components src/lib src/app/api/decks — all pass except ImportIntentFlow "built: checks the collection…" (fails the same without these changes; env-flag test)
- npm test — 346 files passed; same single ImportIntentFlow failure
- npm run typecheck — only the 4 known AddToPicklist.test.tsx errors
- npm run lint — only the known PicklistV2.tsx error
- Browser: capture.mjs (headless Chromium, 1280 and 390 wide, fixture data in a temporary page, removed afterwards): modal exactly 1080x600 on all four tabs; Printings, Copies and Rulings scroll inside; 390 wide fills the screen; 0 console errors. Real Yedora not opened in the browser: the saved session is the test user. Yedora health numbers (Lands 37, Ramp 18, Card Advantage 6, Targeted Removal 6, Board Wipes 0, Game Plan 34) rest on no change to deck-health code and its passing tests.

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

