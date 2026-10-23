# Report: m2-review
Role: Architect
Status: DONE
Task as received: Review the Developer's draft SQL `import_deck_with_intent` (M2) and the app-side save route against `contracts/import-intent.md`; also re-read the two migrations applied today (alerts table, `ref_precons.cards`). Rule on the Developer's deviation. Give a verdict, a change list, and make small changes directly in the draft. Read-only otherwise; nothing applied.

## Summary for the owner
**Verdict: APPROVE WITH CHANGES.** The new save function is safe to apply to the live database once the small fixes I already made in the draft file are included (they are). Applying it only adds a function; it changes no existing data and can be undone by dropping it.

What I checked and found good:
- **All-or-nothing.** Any failure undoes the whole save.
- **Nothing is ever deleted.** The function contains no delete of any kind. A copy that moves to the new deck leaves its old slot in the other deck as an empty (Unsleeved) slot, the same as the existing "release" behaviour.
- **Your data only.** Every lookup is filtered to the signed-in owner, and only the server can call the function (nobody can call it from a browser).
- **Skip.** A skipped move adds a new sleeved copy and raises an alert on every deck you listed as holding that card.
- **Races.** If a copy was taken by something else between review and save, that card is saved Unsleeved and listed under "Needs a look" instead of failing.
- **Basics.** Generic basics are never matched, added or moved.
- **Double submit.** Saving twice can't fill the same deck twice.

**One thing to fix before the feature is switched on (not before applying the function):** if the save fails, the app deletes the empty deck it just created. If the failure were an ambiguous one (for example a dropped connection after the save actually went through), that clean-up could delete a finished deck. I recommend it only deletes a deck that is still empty. Copies are never destroyed either way, but they could be left with no deck. The Developer should make that change before the flag is turned on.

**Developer's deviation: accepted.** The function chooses the exact copy itself, at save time, instead of being handed a copy number. That is safer than the contract text.

The two migrations applied earlier today are fine.

## Verdict
APPROVE WITH CHANGES. M2 may be applied as the draft file now stands. Route change R1 is required before the intent flag is enabled.

## Review against the contract
| Check | Result |
|---|---|
| Atomic | Yes, one plpgsql call; every raise rolls back inserts, moves and alerts [Confirmed: drafts/DRAFT_20261023160000…sql]. |
| Never deletes | No DELETE/TRUNCATE/DROP. Only UPDATEs: donor slot copy link cleared, and `location_id` of a copy now sleeved. It refuses a non-empty deck (`deck_not_empty`), unlike the older function which deletes slots. |
| Move leaves source slot unsleeved | Yes: donor `copy_id`, `ownership_status`, `placement_source` set NULL; slot kept. It also clears `placement_source`, which the older `_move_copy_to_slot` does not; harmless and tidier. |
| Skip alerts on ALL holder decks | Yes: loops over `alert_deck_ids`, one alert per deck on a slot there still holding this card; skips decks that aren't the user's or the new deck; one open alert per slot via the unique index. It alerts only the decks the route lists, so the route (planner) must pass every holder deck. It does (`plan.alertDeckIds`), tested in `import-intent-save.test.ts`. |
| User filtering | Deck ownership checked first; `user_cards.user_id`, `user_copies.user_id`, `deck_cards.user_id` and `decks.user_id` filtered on every query. `SECURITY DEFINER`, `search_path = public`, EXECUTE only to `service_role`. Change made: also revoke from `anon` (Supabase grants new functions to anon by default; existing functions have the same gap, see below). |
| Locking / stale | `pg_try_advisory_xact_lock` on the same `collection-copy:<id>` keys as every movement function, never waits (no deadlock between two imports), then re-checks the copy is still free / still in the donor slot. A contended or changed copy goes to Needs a look (`copy_no_longer_free` / `copy_no_longer_in_deck`). |
| Proxy-only free copy | The planner decides (original first, proxy only if that is the only free copy); the function matches the exact `is_proxy` it is told. If the original vanishes in the race it reports Needs a look rather than silently switching to a proxy. Acceptable. |
| Generic basics | Only via explicit `generic` action, name-checked against the basics list; no copy, never matched. |
| 100-card / sleeved | Slot rows are one per copy; sleeved status derives from slots, so a donor deck drops to Assembling by itself. |
| Idempotency / retry | A second call on the same deck raises `deck_not_empty` and changes nothing. A retry must create a new deck, which the route does. |
| `printing` choice | Different printing allowed (identity check compares the card, not the printing); the slot stores the printing actually used. |

## Developer's deviation: ruling
**Accepted and the contract is amended in spirit.** The function receives a descriptor (printing, proxy flag, finish) and picks the copy under lock. This removes the window where a copy number computed earlier goes stale, keeps copy numbers off the client, and gives two identical rows two different copies. Contract §5 should read "the route passes a descriptor; the function picks the copy under lock." (Developer to update the one sentence.)

## Change list
Done by me in the draft (SQL):
- **C1** Revoke EXECUTE from `anon` as well as PUBLIC/authenticated.
- **C2** Replaced the `record` variable in the alert loop with two integers (`SELECT INTO` leaves them NULL when no slot matches). Removes a PL/pgSQL "record not assigned" edge case I could not test here.
- **C3** Added a review note at the top of the file.

Required of the Developer (code, before enabling the intent flag):
- **R1** In `src/lib/manabox-deck-import.ts` (the `rpc.error` branch), delete the new deck only if it has no slots, and only for a clear "rejected" error (database error code P0001 or function missing), never for a network or timeout error. [Confirmed: `manabox-deck-import.ts` ~L432]
- **R2** Snapshot (version history) the donor decks of a move, as the new deck gets one, so the other deck's change is traceable. Optional but recommended.
- **R3** Update the contract §5 sentence per the ruling above.

Not blocking, FYI:
- A copy with no stored printing can never match by printing and would show Needs a look; the planner already treats that as "other printing".
- `search_path = public` only (no `pg_temp`), consistent with the other functions.
- Existing movement functions grant EXECUTE only by `REVOKE … FROM PUBLIC`, which on Supabase may leave `anon` able to call them. They require a matching `p_user_id`, but a separate check of live grants is worthwhile. [Approximate: not verified against the live database]

## The two migrations applied today
- **Alerts table** `20261023140000_deck_card_alerts.sql`: additive; RLS on with owner-read policy; unique open alert per slot; cascades on deck/slot delete; copy link set NULL if the copy goes. Correct. Note: alert writes rely on the service role; there is no RLS write policy, which is intended. `user_id` has no foreign key (matches other tables). No issue.
- **`ref_precons.cards`** `20261023150000_ref_precons_cards.sql`: one nullable column, existing read policy covers it. No issue. Cards stay NULL until the sync script is re-run.

## Verification
Read the draft SQL in full, the applied migrations, `_move_copy_to_slot`, `release_deck_copies`/`replace_deck_with_new_cards` (locks, location handling), the alert routes and library, the save-path code and rows builder. **Not run:** there is no local Postgres here, so the SQL has not been executed. Suggested smoke test right after applying (no data touched): call the function with a deck number that does not exist and expect `deck_not_found`; then run the Tester flow on the test account, which still does not exist yet, before the flag is enabled for real data.

## Changed files
- docs/oracle/contracts/drafts/DRAFT_20261023160000_import_deck_with_intent.sql (C1–C3)
- docs/oracle/reports/2026-10-23-architect-m2-review.md (new)

## New decisions
None locked. Ruling on the deviation (above).

## Assumptions
Sleeved status is derived from slots, not stored on the deck [Approximate]; the live database matches the repo migrations.

## Challenges to locked decisions
None new.

## Open questions
None for the owner. The route clean-up change R1 is a delete of an empty, just-created deck; restricting it to a still-empty deck keeps it inside the earlier approval.
