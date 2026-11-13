# Report: know-where-cards-are (Gate 2 audit + contract)
Role: architect
Status: DONE
Task as received: Gate 2 audit + contract for Phase 3 "Know where cards are" (system locations In your hand, Missing, Unsorted + combined move checklist with found/placed ticks). Audit what exists; decide whether the locations fit the data model without a schema change (if not, smallest change as a DRAFT migration, not applied); write docs/oracle/contracts/know-where-cards-are.md; report here. Owner approved Phase 3 start 2026-11-12.

## Summary for the owner
Two of the three locations already exist underneath: Unsorted is a real box today, and a "missing" marker already exists on every physical card (nobody has used it; zero cards are marked). "In your hand" does not fit, because Oracle would currently treat a card in your hand as spare, so it needs one small new marker plus a saved checklist. Nothing has been changed in your data; two draft changes are written and waiting for your approval. Five short questions for you are in the contract (the first is whether to approve the stored-data change).

## Audit: what already exists

Locations and boxes
- Storage boxes are `user_locations` rows of type `storage`; every deck also gets an auto-created row of type `deck` (unused for copies). A copy in a deck has `location_id` NULL and a `deck_cards.copy_id` pointing at it. [Confirmed: `supabase/migrations/20260730033009_merge_copies_into_collection.sql`, `src/types/supabase.ts`, live query: 0 copies have both a location and a deck row]
- Live (project "The Oracle", 2026-11-12, read-only): 4,259 copies, 1 user, storage locations Unsorted (default), Bulk Box, Trade Binder, Blue Cards; 10 deck-type rows; 116 planned slots (copy_id null); 0 copies missing; 0 copies location-less and outside a deck; 0 copies assigned to two slots.
- **Unsorted** = the per-user default storage location, flagged `is_default`, unique per user, undeletable (RPC refuses). Used by every "release to storage" path. [Confirmed: `20260912114410_collection_foundation_default_storage_location.sql`; live `delete_storage_location` body]
- A lands box or valuable binder does not exist as a special thing: they are ordinary named storage locations the owner creates (the owner's data shows "Trade Binder"). Settings UI manages them. [Confirmed: `src/app/api/settings/storage-locations/route.ts`, `src/components/settings/storage-locations-settings.tsx`, `src/app/storage/page.tsx`]
- Storage overview counts "unsorted" as location NULL and not in a deck, which is a different, older meaning from the Unsorted box. [Confirmed: `src/app/api/storage/overview/route.ts`]

Missing
- `user_copies.missing` exists. Mark RPC `mark_copy_missing` (clears deck slots, sets missing, location NULL) and `unmark_copy_missing` exist, service role only; no route or screen calls them. [Confirmed: `20260925220000_placement_source.sql`, `20260912170000_atomic_collection_personal_scope.sql`, grep of `src/`]
- Assign, reassign and undo RPCs refuse a missing copy with `copy_missing`; import and conflict SQL excludes `missing = true`. [Confirmed: same migration; `20260920140500_get_import_allocations_v2_resolutions.sql` and others]
- **The TypeScript readers do not filter missing** (spare browse, candidates, owned lookup, card status, supply pool). Today harmless because 0 are flagged; would be a bug the moment one is. [Confirmed: `src/lib/spare-copy-browse.ts` line ~151, `allocation-candidates.ts`, `owned-copy-lookup.ts`, `card-status.ts`]
- D-028 retired the owner-facing Missing; the contract `card-state-actions.md` section 12 enforces "no Missing wording".

Allocation, planned slots, spare, moving
- Planned slot = `deck_cards` row with `copy_id` NULL (D-020/D-025). Sleeved = `copy_id` set. [Confirmed: `src/lib/card-status.ts`, `src/lib/spare-copy-browse.ts`]
- Spare = real copy with no `deck_cards` row pointing at it; no location test. [Confirmed: `src/lib/spare-copy-browse.ts` header and `src/lib/deck-health-gap.ts`]
- Moving between decks: `reassign_to_deck`, `_move_copy_to_slot`, `undo_copy_move`, `unassign_copy_to_storage`, `release_deck_copies`, plus routes under `src/app/api/allocation/` (assign, reassign-to-deck, claim-from-deck, undo, assign-free-copy). Each is one transaction under a per-copy advisory lock; all refuse a missing copy. Removing a card releases the copy to Unsorted (D-039). [Confirmed: `20260925220000_placement_source.sql`, `src/app/api/decks/[id]/cards/[cardId]/route.ts`]
- Checklist / pick list: a per-deck pick list exists (screen `src/components/PicklistV2.tsx`, route `src/app/api/decks/[id]/picklist/route.ts`) showing outstanding cards and where copies are (D-033). It is computed, has no saved ticks, and spans one deck. There is no combined checklist and no found/placed code. [Confirmed]
- Half-built/dead: the mark/unmark missing RPCs (no callers). `get_collection_rollup` on the live project reads old table names (`physical_copies`, `card_definitions`) and has no migration in the repo. [Confirmed: live function body; grep of `supabase/migrations`]

## Answer: does it fit without a schema change?
- Unsorted: yes. Missing: yes (flag exists; add a "since" date). In your hand: no, one new column needed. The checklist ticks need one new table. Design: two columns on `user_copies`, one table `move_items`, two guard triggers. Full reasoning and rejected alternatives in contract section 2.

## Changed files
- `docs/oracle/contracts/know-where-cards-are.md` — the contract (behaviours, API/RPC shapes, atomicity, undo/safety, Deck health interaction, D-028/D-039 reconciliation, sliced plan with tests, owner questions)
- `docs/oracle/contracts/know-where-cards-are.types.ts` — reference types and the shared availability helper (no handlers)
- `supabase/migrations/20261113100000_copy_in_hand_and_missing_since.sql` — DRAFT, not applied: `in_hand`, `missing_since`, guard triggers, indexes
- `supabase/migrations/20261113100100_move_items.sql` — DRAFT, not applied: checklist table with RLS
- `docs/oracle/reports/2026-11-12-architect-know-where-cards-are.md` — this report

## Migration drafts: reversibility, existing data, risks
- Reversible: yes, rollback block is in migration 1; migration 2 reverses by dropping its table. Rollback loses only the new values (in-hand, since-date, checklist rows).
- Existing data: no row is updated or moved. Live has 0 missing and 0 location-less copies, so every existing copy keeps its behaviour. Metadata-only column add.
- Risks: (1) readers treat in-hand as spare until slice S0 updates them; mitigated because nothing goes in hand until slice S2 and the deck_cards guard trigger makes stray assignments fail loudly. (2) several older SQL functions need `AND NOT in_hand` added, taken from the live definitions. (3) RLS is switched off on `user_copies` and absent on `deck_cards` on the live project (see Open questions).

## New decisions made (need owner confirmation)
- In your hand is a column on the copy, not a location row; Missing stays the existing flag (contract section 2).
- Checklist rows are saved in a new table; undo is one level (latest tick) (section 7).
- Rename of Unsorted should be refused (Q4).
- Look-next order: other decks listing the card, then Unsorted, then other boxes (section 4, B3; default, not owner-critical).

## Assumptions
- The live project "The Oracle" (udocxsyzzvrceiuupprj) is the deployed database; read-only queries only, nothing written.
- Live function bodies equal the repo migrations except where noted (rollup).
- Phase 5 proxy ranking does not exist yet, so swap hints are a null slot.

## Challenges to locked decisions
- D-028 — owner already approved reversal for Missing (brief 17.6); live data shows 0 flagged copies, so the transition gate is met without data work — suggested wording in contract section 9.
- D-039 — owner approved extension (checklist Found goes to In your hand) — suggested wording in section 9.
- D-037 — Missing as supply is a new question — Q1 in the contract.
- Stale doc: `card-state-actions.md` section 12 and the `copy_excluded` message rule conflict with the approved Missing — Gene/Designer to amend.
- Note: `docs/oracle/vocabulary.md` does not exist; the locked file is `docs/oracle/specs/vocabulary.md` (D-043).

## Open questions
- Q0 to Q5 for the owner are in contract section 11 (approve stored-data change; shortage treatment of Missing; what starts a checklist; placing into a deck with no empty slot; protecting Unsorted; cards left in hand).
- Security flag (not part of this feature): `user_copies` has policies but row-level security is off, and `deck_cards` has neither. Matters for the public version; suggest a separate task.
- Overlap between the per-deck pick list and the new combined checklist is for Gate 3.

## Amendment 2026-11-13 (owner decisions: Move here, wording)

Summary for the owner: Move here is a one-click direct move between decks with a short Undo and no reminders. It can ship first because it needs no stored-data change. The checklist stays as the optional shelf-walking flow. "Sleeve" the button and tab are renamed; the replacement for "Sleeved / Unsleeved" is still your choice.

- Existing move code found: the safe move `reassign_to_deck` and its exact undo `undo_copy_move`, with routes under the allocation folder, are reused. `claim-from-deck` is the older force-claim and is not used. [Confirmed: `20260925220000_placement_source.sql`, `src/app/api/allocation/reassign-to-deck/route.ts`, `.../undo/route.ts`]
- Gaps in the existing move: it does not stop a move into the deck the copy is already in (a double click on a deck wanting two copies could shuffle slots), and it returns no deck names for the toast. Fix: a thin new function `move_copy_to_deck` that checks the screen is current and then calls the existing move in the same transaction. No table or column change.
- Contract changes: new section 4a (behaviour M1 to M10, RPC, route, undo), section 5 table, section 8 (Deck health: source deck turns short and refreshes; "In another deck" entry disappears from the target), section 9 (D-033 conflict, wording decisions), slice plan (new S0a, ships before the migrations), questions Q6 and Q7, new section 13 (wording and affected screens). Types file has `MoveHereBody`/`MoveHereResponse`.
- Decisions that now conflict, for Gene after owner approval (not edited): **D-033** ("show effect before confirmation" vs instant move with Undo); **D-025, D-031, D-043, D-002** lock the words Sleeved/Unsleeved and the Sleeve action.
- No reminders: Move here creates no checklist row and no banner; the In your hand banner is only for checklist pick-ups.
- Wording screens: "Sleeve" button/tab is in 5 files (deck page tab, pick list, collection detail panel, status chip popover x3, cards tab x2); "Sleeved/Unsleeved" appears in about a dozen screens plus chat and import text (full list in contract section 13).
- New owner questions: Q6 (ask before taking a card from a deck you can play? recommend no) and Q7 (words for in-deck versus planned: recommend "In deck" / "Planned").
- Designer's mockup and spec for Move here were not touched (Designer's task).
- Process note: this amendment's section 13 and the types addition were appended from the shell rather than with the edit tool; content was checked.

## Amendment 2 (2026-11-13): one Picklist, Move here confirmed, wording

Summary for the owner: the per-deck "Sleeve List" and the checklist are now one thing, the Picklist. Per deck it lists what the deck still needs in three groups (Available, Needs moving, Unowned); the all-decks view is the same list across decks in walking order, and Found it / Placed it ticks are shared. Move here is confirmed as slice 1 and needs no stored-data change; the regrouped, renamed per-deck Picklist is slice 2 and also needs none. "Sleeve" is gone as a word; the Sleeved/Unsleeved replacement is still your choice.

- Move here: the contract already had it (section 4a), all your listed rules are present (instant, Undo toast "Moved from <deck>", exact-slot undo or refused if refilled, source keeps its slot and shows short by one, same-deck check, owner picks when several copies, refused while the copy waits on a checklist step, no reminders). Only the name of the secondary link changed to "Add to Picklist".
- Picklist (new section 4b): reuses the existing pick list screen and route. Its three current groupings already are the three new groups (free in a box = Available, in another deck = Needs moving, no copy = Unowned); the route gets additive fields and the grouping moves into one tested shared function. Preserved: route fields, `PicklistV2` and its prop, `PicklistProgress`, ranking, direct one-click place, the `picklist` tab link. Replaced: the old "take from an active deck" confirm (now Move here). Added: ticks, the all-decks view.
- Risk to existing picklists: nothing is stored for them today, so no data is at risk; code risk is a large screen shared by several pages, mitigated by tests that pin today's grouping before any rename.
- Wishlist today: only a yes/no tick on import-conflict rows (table `import_sleeve_claims`, set via the reconciliation wishlist route and checkbox); it is inert and not a buy list. Unowned can show buy ideas and prices with no new storage; a real wishlist side needs new storage and is a LATER slice. New question Q8 (recommend: not now).
- Revised slices: S0a Move here, S0b Picklist regroup and rename (both no stored-data change), S0 supply rule (migration 1), S1 locations, S2 ticks (migration 2), S3 all-decks Picklist, S4 Can't find, S5 undo and deck picker, S6 close-out, LATER wishlist. Tests per slice are in contract section 10.
- Wording: "Sleeve" dropped (tab becomes Picklist, button Placed it); affected screens listed in section 13 (deck page tab, Picklist, collection detail panel, status chip popover, Cards tab, plus the Sleeved/Unsleeved screens if Q7 is approved). Q7 stays open (recommend In deck / Planned).
- For Gene (not edited): D-033 needs re-wording (pick list is now the Picklist; "show effect before confirmation" vs Move here; "Sleeve" meaning); D-025 (Sleeved/Unsleeved and the availability labels, add "Needs moving"); D-031 and D-047 (import choice words); D-043 (locked vocabulary, "N/100 sleeved"; add Picklist, Needs moving, Placed it); D-002 (Assembling/Playable defined by those words, rules unchanged); also D-059 uses the same words (not in the owner's list, flagged) and D-030 (Unowned only on a successful lookup).
- Draft migrations: unchanged, still DRAFT, not applied. Move here's function migration is written by the Developer, not drafted here.
- Process note: this amendment was made with the edit tool only; no shell writes. The designer spec and mockup still say "Move checklist" and are Designer's to update.
- New owner question: Q8 (separate wishlist feature?).

## Amendment 3 (2026-11-13): import destination

Summary for the owner: when you import cards you pick one place for the whole import. The default is Unsorted; the dropdown also lists every box or binder and every deck. A box or binder needs no change to how data is stored at all. A deck destination fills the deck's matching empty slot, adds a new slot for a card the deck does not list, and sends a card the deck already has filled to Unsorted; the result screen gives all three numbers with reasons, so nothing disappears. Missing and In your hand are never offered. It is two new slices (binder first, then deck) that do not depend on the other Phase 3 slices. Four short questions (Q9 to Q12) have recommended answers.

- Contract: new section 4c (picker position on the review step under the "Importing as" bar, request and response shape, valid destinations, rules ladder for decks, singleton / 100-card / colour / proxy / finish handling, reuse, atomicity, idempotency, Deck health effect, safety), a section 5 route table update, slices I1 and I2 in section 10, questions Q9 to Q12, a Designer item in section 12. Types: `ImportDestination`, `DestinationsResponse`, `ImportPlacementResult`.
- Findings [Confirmed: `supabase/migrations/20260912163000_atomic_collection_insert_ids.sql`, `src/lib/import-copies.ts`, `src/lib/manabox-collection-import.ts`]: imported copies are built with no location and the insert function turns that into Unsorted, but it already accepts a real location per row and returns the new copy ids. So a box or binder destination is a code-only change. A deck destination has no existing path; it reuses the existing assign-to-slot and add-card-to-deck behaviour, wrapped in one new database function (function only; no table or column change).
- Atomic: one transaction; any failure leaves nothing added. A single copy that cannot be placed stays in Unsorted and is counted, it does not abort. A deleted deck or box refuses the import before any write.
- Idempotency: the add-only import has no duplicate-submit guard today and no reconciliation of its own (reconciliation belongs to deck imports and onboarding). I added no stored key. Repeating the same import into the same deck is harmless (copies land as duplicates in Unsorted).
- Deck health: placed copies are not spare and the deck's gaps shrink; copies sent to Unsorted or a binder are spare as usual. Only the chosen deck is refreshed.
- Rules I chose beyond the owner's: new slots in the deck are checked for colour identity and legality but only warned about (recommended, Q9; the chat add path blocks them, which is a precedent the owner may prefer); basic lands go to Unsorted unless the deck has an empty tracked basic slot (Q10); a card only on the Maybeboard goes to Unsorted (Q11); no remembered destination and no undo (Q12). Formats with a copy limit use that limit instead of 1.
- For Gene (not edited): D-020 ("import runs no allocation pass") needs a clause: "except when the owner picks a deck as the destination of a collection import". Others respected.
- Not designed: the Designer owns the look of the picker, forecast and result screen. The optional forecast (a dry run of the same placing rules) can be cut without losing anything required.
- Process note: all edits made with the edit tool; no shell writes. `decisions.md` not touched.

## Verification
- Read AGENTS.md, role files, process.md, decisions.md, brief, vocabulary spec — done.
- Read-only SQL on live project (counts, constraints, triggers, RLS, function bodies) — results above; no writes.
- Migration drafts not run, not applied, not linted against a database [untested: SQL syntax only reviewed by eye].
- No code or tests changed; `git status` shows only new docs, contract types and two draft migrations.
