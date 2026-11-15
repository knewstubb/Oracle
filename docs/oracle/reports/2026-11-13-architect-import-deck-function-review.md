# Report: import-deck-function-review
Role: architect
Status: DONE
Task as received: Review the DRAFT database function on branch origin/import-destination (supabase/drafts/insert_user_copies_to_deck.draft.sql, src/lib/import-deck-placement.ts, the Developer report). Resolve its two open points read-only against the real schema (project udocxsyzzvrceiuupprj) and repo migrations. Check triggers/constraints, NOT NULL columns, RLS/security definer/grants, locking, singleton rules, basics, proxies/finish, that counts add up, and that nothing existing is changed beyond assigning the new copies. Apply nothing. If fixes are needed, write a corrected draft plus proposed migration filename and this report with a clear safe-to-approve answer.

## Summary for the owner
**Safe to approve as written? No. Safe to approve the corrected version? Yes.** The original would have worked on the happy path, but it had one real security gap (anyone holding the app's public key could have called it), a way to create a duplicate card in a one-copy-per-card deck when two things happen at once, and a way to mix up which imported copy went where. All are fixed in the corrected version, which only adds one function and changes no stored data. Nothing was applied.

## Answer: safe to approve? No (original) / Yes (reviewed version)
Why the original is a no:
1. **Open to the public key.** It blocked "everyone" and "signed-in users" but not the anonymous role. On this project new functions are open to the anonymous role by default, so anyone with the public key could have imported cards into any user's deck.
2. **Could mismatch copies.** The saved copies were handed over without a fixed order, so in rare cases a copy could be matched to the wrong line of the file.
3. **Could create a duplicate.** It skipped over a slot another action was editing and then added a second slot for the same card.
4. **Could miscount.** The result counts were tallied inside the step that can be undone, so a copy that was rolled back could still be counted as placed.
5. **Hid real faults.** It caught every error per copy, so a genuine bug would silently push cards to Unsorted instead of stopping the import.

## Plain-language risks that remain (after the corrected version)
- **Two things at once:** while an import runs, adding a card to that same deck waits a moment. If two actions grab things in opposite order the database stops one of them; an import then fails cleanly with nothing saved and can be retried. Rare.
- **Cards with two faces** (for example "Front // Back"): if the deck lists only one face name, the card is not seen as the same, so it may be added as a new slot or sent to Unsorted ("could not place"). Never a wrong card in a slot.
- **Format limit comes from the app**, not the database. A bug in the app passing a high limit would allow extra copies in a one-copy deck. Only the server can call it.
- **Big imports** run one copy at a time inside one transaction; several thousand rows should be fine but should be tried once on a test import.
- **No undo** (as the contract already says); the result screen lists what went where.

## Findings by area (all read-only against the live project, 2026-11-13)
- **Open point 1, identity trigger: resolved.** The guard (`trg_validate_deck_card_copy_identity`, before insert or update of copy, name, printing, user) accepts a new slot when the slot's card matches the copy: by the printing's card identity if the printing is in the local reference table, otherwise by name (case and spaces ignored). The draft took name and printing from the file row, which could differ from the owned card. The reviewed version takes both from the saved copy, so the new slot always passes. A mismatch still raises, and the per-copy safety net turns it into "could not place". [Confirmed: live `pg_get_functiondef(validate_deck_card_copy_identity)`]
- **Open point 2, new-slot columns: resolved.** `deck_cards` required columns: id (identity, automatic), deck_id, card_name, user_id. Defaults cover is_generic (false) and generic_sleeved (true); quantity defaults 1. Everything else is optional. Checks: finish must be nonfoil/foil/etched (the reviewed version forces a valid value), placement_source 'import' is allowed, ownership_status original/proxy allowed, a generic slot cannot hold a copy (the draft could try to fill one; now excluded). No row has quantity above 1, so counting slot rows is right. [Confirmed: live information_schema and pg_constraint]
- **Other triggers and constraints.** One unique rule: a copy can sit in only one slot (new copies are fresh, so safe). Companion and partner rules do not apply (new slots set neither). The pending in-hand/missing migration adds a guard that refuses in-hand or missing copies in a slot and a trigger on copies; new copies are neither, so they pass. [Confirmed: live pg_trigger; `supabase/migrations/20261113100000_copy_in_hand_and_missing_since.sql`, not yet applied]
- **Security definer, RLS and grants.** `deck_cards` and `decks` have no row security; `user_copies` does but a definer function bypasses it. The function checks the deck belongs to the user and that every card belongs to the user (inside the existing insert function). Live permissions of the chat-proposal functions show anonymous and service role can run them (signed-in users cannot). The draft copied the "like chat" revoke list, which leaves anonymous open. Fixed by also revoking anonymous. **Challenge for Gene:** the chat proposal functions, `assign_free_copy`, `insert_user_copies` and others show the same anonymous access today; worth a separate review. [Confirmed: live proc ACLs]
- **Locking.** Locking the deck row also makes other deck-card inserts wait (foreign key). The reviewed version additionally locks every slot of the deck up front and no longer skips locked rows. Two imports into one deck run one after the other; the second sees the first's fills.
- **Singleton and duplicates.** Limit counts main-list slots including ones made earlier in the same import, so a second Sol Ring in the same file goes to Unsorted as "already filled". Maybeboard-only cards go to Unsorted. The draft's Maybeboard test would have ignored a slot with empty categories (nullable column; none live today); fixed.
- **Basic lands.** Fill an empty tracked basic slot, otherwise Unsorted. Generic basic slots (50 live) are skipped. The database now also recognises basic names itself.
- **Proxies and finish.** Read from the saved copy. Proxy gives ownership 'proxy'; finish is copied to the slot only when valid. Proxy count is returned.
- **Counts add up.** Tallied after each copy's undoable step and checked at the end (placed + added + Unsorted = rows imported, otherwise the whole import rolls back). Also checks the number of saved copies equals the rows.
- **Nothing else touched.** The only existing rows changed are empty slots getting a copy, ownership and 'import' source, and the new copies' own location. No deletes, no other deck, no other copy. New slots are inserted only for cards the deck does not list.
- **Placement rules vs the code.** The draft matches the planner except two harmless differences: the database fills a basic land from a slot before the basic check (same as the planner), and the database decides (the planner is only a forecast), as the contract says.

## Changed files
- supabase/drafts/insert_user_copies_to_deck.reviewed.sql — corrected draft (not applied); proposed migration name 20261113120000_insert_user_copies_to_deck.sql, to be copied into the migrations folder only after approval
- docs/oracle/reports/2026-11-13-architect-import-deck-function-review.md — this report

## New decisions made (need owner confirmation)
- None. The reviewed version only implements the approved contract more safely.

## Assumptions
- Anonymous access on new functions is a project default grant; seen on existing functions, not on a deployed copy of this one.
- Not run: the corrected SQL was not executed anywhere (nothing may be applied). It needs a dry run on a test copy or branch of the database before the real one.

## Challenges to locked decisions
- none. Note for Gene: the contract's function signature list (user, rows, deck) differs from the draft (user, deck, rows, limit); the contract table should be updated to the draft's order.

## Open questions
- Should the anonymous-access finding on the existing functions get its own task? (Recommendation: yes.)

## Verification
- list_tables / information_schema columns on deck_cards, user_copies — required columns and defaults listed above
- pg_trigger, pg_constraint, pg_indexes, pg_policies, pg_proc (functiondef, ACL) — read-only SELECTs, results as above
- Data checks (null categories 0, quantity above 1: 0, generic slots 50, tracked basics 88) — read-only
- Corrected SQL not executed; only reviewed by reading. Database unchanged.
