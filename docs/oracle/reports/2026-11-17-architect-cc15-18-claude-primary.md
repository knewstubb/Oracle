# Report: cc15-18-claude-primary
Role: Architect
Status: DONE
Task as received: Owner approved 2026-11-17 adding functionality so Claude (the connector) can be a primary interface. Audit and plan only; do NOT apply migrations or edit decisions.md. Rows are in docs/oracle/status.md (CC-13 done/drafted; CC-15 to CC-18 just added). Cover: CC-15 Claude creates a new deck (name, commander, format) and sets up a deck: commander, strategy notes/intent, bracket (today blocked for Claude, see get_deck description), with Undo of a creation (owner only; removable only while the deck is empty, since Claude can never delete decks). CC-16 Picklist and storage: Claude builds and ticks Picklists (reuse the live routines create_move_list, picklist_tick, record_move_looked_in, undo_move_tick, cancel_move_item, resolve_missing_copy), creates boxes/locations and moves copies between boxes. CC-17 Claude imports a deck from pasted text or a Moxfield/Archidekt link into a given deck, reusing existing import checks and identifier rules (scryfall_id vs oracle_id; no inline resolution logic). CC-18 buying list with prices for what a deck is missing, plus a wishlist (new stored data: say what is needed). For each: what exists, what is missing, the contract amendment, draft migration (supabase/drafts, not applied), D-034a amendment wording for Gene, risks, size, and a build order that keeps database changes separate and small. Respect the Oracle multi-user rule (everything scoped to the signed-in owner) and the CC-13 limits. Write docs/oracle/reports/2026-11-17-architect-cc15-18-claude-primary.md in the standard format. Start the final message with 'Status: <DONE|PARTIAL|BLOCKED>'.

## Summary for the owner
All four are doable, and each can be built in small separate steps. Four need a stored-data change you approve (creating decks and setting them up, Picklist and boxes, importing a list, the wishlist); the buying list needs none and can ship first. Five decisions are yours (section 10); the main ones: may Claude set a deck's bracket, may Claude undo its own Picklist ticks, and should the wishlist have its own screen in Oracle.

## 1. What is shared by all four (read first)
**How Claude writes today** [Confirmed: src/lib/connector/write-gateway.ts, src/lib/connector/tools/edit-tools.ts]. Every edit tool sends the signed-in owner's id (from Claude's verified sign-in, never from Claude's input) and the connection id to one database routine. The routine checks the connection is still switched on, touches only that owner's rows, logs the change in `ai_change_log` (change kinds are a fixed list in a CHECK) and lets Undo reverse it. Tools cannot reach the database directly: the Claude-side database handle is read-only and row-security-scoped [Confirmed: src/lib/connector/user-client.ts].

**Fixed limits that apply** [Confirmed: src/lib/connector/edit-config.ts; supabase/drafts/20261117100000_cc13_loosen_limits.draft.sql]: 120 cards per request go straight through, 121 to 200 wait, over 200 refused, 500 per hour, Undo of up to 200 in one click, 7-day Undo. CC-13's database change is still a draft; **all of the new database drafts need CC-13 applied first** (they check this and refuse otherwise).

**Hard blocks that stay** [Confirmed: edit-config.ts `BLOCKED_TOOL_NAMES`, `BLOCKED_TOOL_PREFIXES`]: no deleting decks, cards or copies, no replacing the collection. Tool names starting `import_`, `sync_`, `bulk_` are blocked by a test, so the CC-17 tool is named `add_deck_from_list`, not `import_...`. Nothing in this plan loosens that list.

**One shared design.** Four new change kinds are added to the log (`deck_create`, `deck_setup`, `box_create`, `box_move`) in one tiny foundation step (DB-A). Undo and "why can't I undo" are put in front of the live functions with the same wrapper pattern already used for `deck_category` [Confirmed: supabase/migrations/20261116190000_ai_deck_category.sql], so old kinds keep running unchanged code.

**Multi-user.** Every new routine takes the owner id first, filters every read and write by it, is granted to the server role only, and re-checks the connection switch inside the transaction. The wishlist table has an own-rows policy. Claude's read tools use the owner's scoped handle. Nothing keys on a name alone.

## 2. CC-15: create a deck and set it up
**What exists**
- The Oracle screens create a deck through a plain route that inserts a `decks` row with a random whole-number id, then inserts the commander as a `deck_cards` row, ignoring a failure on that second step [Confirmed: src/app/api/decks/create/route.ts]. Not atomic; a half-made deck is possible. So Claude must **not** reuse this route.
- The commander role is set by the live routine `set_deck_command_zone` [Confirmed: supabase/migrations/20261023170100_set_deck_command_zone.sql]. It takes `deck_cards` row ids, so the commander does not have to be an owned card.
- Strategy notes and bracket live in `deck_strategy` (bracket 1 to 4, notes), saved by the Deck strategy screen's route, upserting on `deck_id` [Confirmed: src/app/api/decks/[id]/strategy/route.ts].
- Today Claude is told in plain words it cannot set a bracket [Confirmed: src/lib/connector/tools/bracket.ts `BRACKET_WHY_EMPTY`, src/lib/connector/tools/index.ts get_deck/list_decks text].

**What is missing**: any Claude path to create a deck; to set commander, notes or bracket; Undo for either; the card-name-to-printing lookup is already there (`resolveCard`) and is reused.

**Contract amendment** (new tools; all inputs strict, no user id field)
- `create_deck { name (1-100 chars), format (from the app's format list), commander? { name } }`. Commander is required when the format is Commander. The app resolves the name to `scryfall_id` (printing) and `oracle_id` (card) with the existing resolver and passes both; the database never matches names. Refuses: duplicate deck name (case-insensitive, so TEST A can't be made twice), more than 10 decks in an hour, more than 25 empty Claude-made decks still open. The new deck is empty, "not active", with the commander as a planned slot (no copy taken; an unowned commander shows as Unowned under D-059).
- `set_deck_setup { deck_id, commander?, strategy_notes? (max 4000 chars), bracket? (1 to 4, or null to clear) }`. At least one field. Writes only what changed; never touches budget, table context or other strategy fields.
- Both log one change (kinds `deck_create`, `deck_setup`), appear in Recent changes, and are not subject to the waiting rule (one row each).
- **Undo:** `deck_setup` can be undone by Claude or the owner; refused (plain words) if the same fields changed since. `deck_create` can be undone **by the owner only**, in Oracle, and only while the deck is empty apart from its own commander row: refused with a reason if any card, any attached copy, any Picklist step or a folder is on it. This is the one delete in the whole plan and is described in the draft header so the owner can approve it knowingly.
- Tool text changes: `get_deck`, `list_decks` and `BRACKET_WHY_EMPTY` stop saying Claude cannot set a bracket (only if the owner answers Q1 with yes). Snapshot and registry tests change with them.
- Types file to add: `docs/oracle/contracts/connector-cc15-18.types.ts` (not written in this audit; Developer's first step reads this report). The limits object `_ai_limits_new()` is mirrored in `edit-config.ts` with an equality test, like CC-13.

**Draft migrations**: `supabase/drafts/20261117200000_cc15a_new_change_kinds.draft.sql` (DB-A foundation) and `supabase/drafts/20261117200100_cc15b_deck_create_setup.draft.sql` (DB-B). Atomicity: each is one routine = one transaction; if the commander step fails, no deck exists. Indexes: existing `ai_change_log` indexes cover the new reads.

**D-034a wording for Gene (proposed):** "Claude may also create a new, empty deck (name, format, commander) and may set a deck's commander, strategy notes and bracket. Each is recorded and shown in Recent changes. Claude can undo a setup change; only the owner can undo a deck creation, and only while the deck is still empty (Undo then removes that empty deck). Claude still can never delete a deck, and cannot undo a deck creation itself. At most 10 decks per hour."

**Risks:** the deck-delete in Undo (guarded five ways, owner-only; deck is irretrievable but was empty); random deck ids (retry on clash, as the import code does); `decks` column defaults (e.g. `status`) not verified against a live schema [Approximate]; commander replacement leaves the old commander as an ordinary card (existing routine behaviour).
**Size:** M. Developer 2 tools plus Undo text; Tester checks isolation and Undo refusals.

## 3. CC-16: Picklist and storage
**What exists**
- All six routines are live and take the owner id first: `create_move_list` (up to 500 steps), `picklist_tick` (found / placed / cant_find), `record_move_looked_in`, `undo_move_tick` (with its own "state has changed" guard), `cancel_move_item`, `resolve_missing_copy` [Confirmed: supabase/migrations/20261116035500..20261116035529, 20261116032532]. Steps are stored in `move_items`, whose `source` already allows `'ai'` [Confirmed: supabase/migrations/20261113100100_move_items.sql], but every routine writes `'manual'`.
- Creating a box is a plain route insert into `user_locations` (type storage) [Confirmed: src/app/api/settings/storage-locations/route.ts]. Moving copies between boxes is the live atomic routine `move_copies_to_storage` [Confirmed: src/app/api/collection/assign-location/route.ts].
- Nothing of this is reachable from Claude today; there is no Claude read tool for the Picklist or boxes.

**What is missing**
- A single door that tags what Claude does as Claude's (D-034a: "every Claude change is recorded with its own source").
- Box creation and box moves with Undo.
- Read tools so Claude can see the Picklist and boxes: `list_picklist` (open steps) and `list_boxes` (name, id, copy count). Both read-only through the scoped handle (`move_items` has an own-rows read policy [Confirmed: move_items migration line 63]).

**Contract amendment**
- `create_picklist { items[1..120]: { copy_id, to: deck {deck_id, slot_id?} | box {location_id} } }` (limit 120 to match the direct limit; larger lists are split by Claude).
- `tick_picklist_item { copy_id, action: found|placed|cant_find, to }`, `note_looked_in { item_id, place }`, `undo_picklist_tick { item_id, expected_state }`, `cancel_picklist_item { item_id }`, `mark_turned_up { copy_id, to }`.
- `create_box { name (1-60), description? }` (max 10 an hour; duplicate names refused).
- `move_copies_to_box { copy_ids[1..200], location_id }` (a named real box only; no "default box" shortcut; copies in decks, In your hand or Missing are refused by the live routine).
- Rules: a Picklist tick that moves a card between decks is the same thing as a CC-13 card move: straight through, no approval. Claude may undo or cancel **only steps it made itself** (source `'ai'`); it can never cancel or undo the owner's steps. `mark_turned_up` clears a Missing flag, which is the owner's knowledge of a physical card, so see Q3.
- Box and box-move changes are logged (kinds `box_create`, `box_move`, owner-only Undo, like card moves). Picklist steps are **not** put in the change log: the Picklist's own history (state, time, source) is the record. Recent changes will not list ticks; the Picklist screen should show "by Claude" (Designer, Q4).

**Draft migration**: `supabase/drafts/20261117200200_cc16_picklist_and_boxes.draft.sql` (DB-C). `ai_picklist` calls the live routines unchanged in one transaction and then re-tags the rows as Claude's; if the routine raises, the tag rolls back with it. No live routine is edited. Box create / move / undo are new routines. Owner Undo of a box move is all-or-nothing and refused if any copy has moved again or gone into a deck. Undo of a box creation removes the box only when it is empty and not the default box.

**D-034a wording for Gene:** "Claude may build and tick the Picklist (found, placed, can't find, looked in, cancel, undo) and mark a copy as turned up; steps it makes are marked as Claude's, and Claude can undo or cancel only those. Claude may create a storage box and move free copies between boxes (up to 200 at a time); only the owner can undo a box creation or a box move. Claude still never deletes a box, a copy or a card. Ticks that move a card between decks follow the CC-13 rule (straight through)."

**Risks:** the Picklist tick physically represents where a card is, so a wrong tick makes Oracle disagree with the shelf (mitigated: Claude only ticks when told, per tool text; Undo exists); `placement_source` re-tag in the draft relies on the five-second window and a result key (`item_id`, `list_id`) that must be confirmed against the contract's result types [Approximate]; a deck slot placed by a tick is tagged `'ai'`, which D-009 allows.
**Size:** L (eight edit tools, two read tools, three database routines; most logic reuses live code).

## 4. CC-17: import a deck from pasted text or a link
**What exists**
- The Import screen's pipeline: link parsing (`parseDeckUrl`, only Archidekt and Moxfield plus three text sites), fetch and normalise, a read-only preview route, per-row resolution through the existing resolver, import intent, and the live routine `import_deck_with_intent` which fills a brand-new empty deck and refuses a non-empty one [Confirmed: src/app/api/decks/import/preview/route.ts, src/lib/deck-normalizer.ts, supabase/migrations/20261023160000_import_deck_with_intent.sql]. Archidekt gives `scryfall_id` directly; Moxfield gives set code + collector number and is resolved through Scryfall, in the existing functions [Confirmed: AGENTS.md identifier rules; src/lib/deck-normalizer.ts normalizers].
- The Import screen can add owned copies to the collection (D-047 Original / Proxy). Claude may add copies only one at a time, owner-only Undo (D-034a). **So Claude's import must be list-only.**

**What is missing**: a connector tool; a way to fill a deck that already holds a commander row; Undo of an import as one click; a guard that forces "list only".

**Contract amendment**
- `add_deck_from_list { deck_id, text? | url?, maybeboard? }`. Exactly one of `text` or `url`. The target must be the owner's, empty apart from its commander. 120 cards or fewer, same as a direct edit; more is refused with "send the maybeboard separately" (no waiting path for imports).
- Steps (all existing code, no new resolution): fetch (links only through the existing parser's allow-list: no arbitrary URLs) -> normalise -> resolve each line (set + number -> printing; name -> oracle card) -> if anything is unresolved or ambiguous, **nothing is saved** and Claude gets the list of unresolved lines to fix and resend (the existing "needs a choice" outcome) -> `ai_import_deck_list`.
- Every slot is saved as **Planned (no copy)**; no copy is taken, moved or created (the draft forces this, so a bad call cannot do otherwise). Foil/etched markers are kept (D-056). A commander marked in the list is ignored; Claude sets it with `set_deck_setup`.
- Logged as `deck_add` (an existing kind), one row per slot under one group, so one click undoes the whole import (up to 120 slots, inside the 200 Claude-undo limit).
- Types: reuse `import-intent.types.ts` and `import-row-editing.types.ts`; add only the tool input/output.

**Draft migration**: `supabase/drafts/20261117200300_cc17_import_deck_list.draft.sql` (DB-D): one wrapper around the live import routine. No table change. The wrapper lifts the commander row aside during the call so the live "deck must be empty" check passes; that lift is the one fragile spot [Approximate] (it assumes `deck_cards.deck_id` has no foreign key forcing a real deck). The throwaway test must prove it, and if not the fix is a one-line change to the live routine's emptiness check, which would be its own tiny migration.

**D-034a wording for Gene:** "Claude may fill one of the owner's empty decks from a pasted list or an Archidekt or Moxfield link, as planned cards only (no copies are taken or added). Anything it cannot match is reported and nothing is saved. One Undo removes the whole import. Claude still cannot import into the collection or replace anything."

**Risks:** Moxfield may refuse a server fetch (the existing code already carries that risk) so link imports can fail where pasting works; link fetching from the server must stay inside the existing host allow-list (no open fetch); a 100-card paste can run slow, the 40 KB result cap applies to the answer so it returns counts and the unmatched list, not every card.
**Size:** M to L (mostly wiring existing functions; the hard part is the commander lift).

## 5. CC-18: buying list and wishlist
**Buying list: what exists** [Confirmed: src/lib/connector/tools/list-deck-cards-by-ownership.ts]. `list_deck_cards_by_ownership` already returns proxy and not-owned cards per deck, a price per card (cheapest known paper printing from shared price data in `ref_printings`, a Scryfall estimate, not a shop price), "value if bought", per-deck totals and a grand total, paged. Unpriced cards are counted, not treated as free.
**What is missing**: a shopping-shaped answer: how many of each card to buy across decks (a card wanted by two decks is two buys, because each deck wants its own copy), sorted most expensive first, with a subtotal, how many are unpriced, an option to include proxies as "would upgrade", and no maybeboard unless asked. Card Kingdom prices are not available (price source is Scryfall only); say so in the answer.
**Contract:** one new read-only tool `get_buying_list { deck_id?, include_proxies?, include_maybeboard?, sort? }` built on the same price loader and ownership rules, so there is one source of price truth. **No database change.** Output stays inside the 40 KB cap with the usual "truncated" statement.

**Wishlist: new stored data needed.** Today there is only a per-card yes/no flag attached to import conflicts, and the standalone list was explicitly deferred [Confirmed: supabase/migrations/20260926140000_import_reconciliation_redesign.sql lines 58 to 70]. Needed: one table `wishlist_items` (owner id; `oracle_id` for the card; optional `printing_id`; finish; quantity; optional deck it is wanted for; note; added by owner or Claude; removed-at instead of deletion). Row security: own rows only. It adds no copy and changes no count or deck state.
- Tools: `get_wishlist` (read), `add_to_wishlist { items[1..100] }`, `remove_from_wishlist { ids }`. Claude removes only rows Claude added (soft remove), at most 500 active rows. Asking twice raises the quantity rather than duplicating.
- Not in the change log (it is not a deck or collection change). "Undo" is remove_from_wishlist.
- **Needs an owner-visible place in Oracle** to see and edit the wishlist, otherwise Claude's list is invisible to the owner. That is Designer's lane (mockup and spec) and is the gate for the wishlist database step (Q4).

**Draft migration**: `supabase/drafts/20261117200400_cc18_wishlist.draft.sql` (DB-E). Atomic per call.
**D-034a wording for Gene:** "Claude may keep a wishlist of cards the owner wants to buy and may remove entries it added itself. The wishlist is separate from the collection: it never adds a copy, changes a deck or counts toward anything."
**Risks:** prices are estimates (the answer must say so every time); a wishlist nobody can see is a trap; entries for unresolved names must be refused (oracle_id required) rather than stored as text.
**Size:** buying list S; wishlist M plus Designer work.

## 6. Build order (database changes separate and small)
Each DB step is its own approval and its own throwaway-branch run.
1. **CC-13 database change** (already drafted) approved and applied first.
2. **CC-18a get_buying_list**: code only, no database. Ships anytime.
3. **DB-A foundation** (four kind names, undo and blocker front doors, limits): approve and apply alone.
4. **DB-B CC-15** deck create/setup and its Undo, then Developer tools and tool-text changes, then Tester (isolation test with a second user, Undo refusals, "no bracket claim" text).
5. **DB-D CC-17** import wrapper (needs the empty deck from step 4), then the tool.
6. **DB-C CC-16** Picklist wrapper and boxes, then the tools, with the Picklist screen showing "by Claude" (small Designer note).
7. **DB-E CC-18b wishlist** last, after the Designer screen exists.
Steps 2 and 3 can run in parallel; 5 and 6 can swap.

## 7. Cross-cutting tests (Tester)
Equality test of `_ai_limits_new()` vs `edit-config.ts`; registry/snapshot test for the new tool names (and that no blocked name or prefix appears); isolation test per new routine with a second user id (every one must return not-found, never another owner's data); Undo refusals; "Nothing was changed" on every refusal; the test plan Step 1 changes to "ask Claude to create TEST A and TEST B".

## 8. Changed files
- supabase/drafts/20261117200000_cc15a_new_change_kinds.draft.sql — DB-A foundation, draft, not applied
- supabase/drafts/20261117200100_cc15b_deck_create_setup.draft.sql — DB-B, draft, not applied
- supabase/drafts/20261117200200_cc16_picklist_and_boxes.draft.sql — DB-C, draft, not applied
- supabase/drafts/20261117200300_cc17_import_deck_list.draft.sql — DB-D, draft, not applied
- supabase/drafts/20261117200400_cc18_wishlist.draft.sql — DB-E, draft, not applied
- docs/oracle/reports/2026-11-17-architect-cc15-18-claude-primary.md — this report
- Not written: rollback files and the contract types file (each DB step gets its rollback and the shared types file at its Developer hand-off).

## 9. New decisions made (need owner confirmation)
- Deck creation Undo removes an empty deck (owner only). Needs explicit approval because it is the first Claude-related delete.
- Picklist ticks are tracked in the Picklist's own history, not Recent changes.
- Import is planned-cards-only and capped at 120.
- Wishlist is its own table, soft-remove only.

## 10. Open questions (for the owner, in plain words)
1. **Bracket:** may Claude set a deck's bracket (1 to 4)? Recommended yes, with Undo, because notes and bracket describe the deck the same way. You would see "Set by Claude" in Recent changes. If no, setup is commander and notes only.
2. **Claude undoing its own Picklist ticks:** recommended yes, only for steps Claude made. If no, only you can undo ticks.
3. **"Turned up":** may Claude clear a card's Missing flag when you tell it you found the card? Recommended yes, it is your word that counts and it has Undo from the Picklist. Today the Picklist routine has no limit to Claude-made steps for this one.
4. **Screens:** the Picklist should label steps "by Claude" and the wishlist needs a screen. OK for the Designer to be asked?
5. **Card Kingdom prices:** Scryfall estimates only for now. Is that enough for the buying list?

## Assumptions
- Deck format names come from the app's existing list (app validates; the database only checks non-empty).
- `decks.status` and similar defaults exist at the database level (the current create route omits them).
- The function body signatures in drafts were written from migration files, not a live database.

## Challenges to locked decisions
- D-034a — it says Claude "can never delete a deck"; CC-15 Undo does delete an empty deck. Evidence: Undo is owner-only, runs only on empty decks Claude made, and the same sentence already allows owner-only Undo of a collection add. Suggested change: the wording in section 2. No reopening needed, a clarification.
- D-034a — the "stays in the old deck's plan" move rule and CC-13 (moves straight through) already differ; CC-16 ticks follow CC-13. Gene to keep one version of the sentence when recording amendments.

## Verification
- Read files only; no command changed the database. Drafts have not been run against any database: none of the SQL is tested. First real run is the throwaway-branch test per step.
- `git status` not run; no existing file was edited.
