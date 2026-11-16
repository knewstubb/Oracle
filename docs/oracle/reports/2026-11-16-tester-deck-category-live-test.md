# Tester report: deck_category draft migration, tested on a throwaway database

**Role:** Tester
**Status:** PARTIAL (every check passed, but the database it ran on is a rebuilt approximation, not a replay of the real history; see Challenges)

## Task as received
Owner approved testing the draft migration `supabase/drafts/20261116190000_ai_deck_category.draft.sql` (contract `docs/oracle/contracts/claude-connector-deck-category.md`) on the free throwaway Supabase project `iiuwdlziygeaovpkenpi` (oracle-category-test). Never touch live `udocxsyzzvrceiuupprj`. Steps: build schema from repo migrations, seed, regression the 8 existing change kinds, apply the draft, re-run regression, test deck_category, test the rollback script. Do not edit repo SQL. Do not delete the project.

## Summary for the owner
- The draft works as the contract describes. I found no defects in it.
- All 8 existing change kinds behaved identically before the draft, after the draft and after the rollback (33 of 33 checks each time).
- All 48 deck_category checks passed (30 on one test user, 18 on another).
- The rollback refuses while category history exists. Once that history was deleted (test project only), it put every function and permission back byte for byte.
- Caveat: the real schema history cannot be replayed (the repo says so itself), so I rebuilt a minimal schema and stand-in versions of the collection functions. This proves the connector logic and the draft; it does not prove the real collection functions.
- The live project was never touched.

## Changed files
- This report only. No repo SQL or code edited.

## New decisions
None.

## Assumptions
- The stand-in collection functions (add/remove card, move copy, proxies) approximate the live ones. The draft does not touch them.
- Cases where "capitals only differ" means the card already holds the deck's spelling (e.g. card has `Ramp`, request `RAMP`). A card spelled `ramp` asked for `ramp` is treated as a respell to `Ramp` and changes (observation, see Open questions).

## Challenges
1. **Full replay is impossible.** `supabase/migrations/` starts by renaming tables no repo migration creates; `supabase/reconciliation/README.md` says a clean replay is blocked until a hosted schema snapshot exists. I needed a minimal bootstrap (my own SQL, not in the repo): the tables decks, user_locations, user_cards, user_copies, deck_cards, and six stand-in functions (`_ensure_default_storage_location_id`, `remove_deck_card_with_release`, `unassign_copy_to_storage`, `replace_proxy_with_original`, `add_proxy_to_slot`, `insert_user_copies`).
2. Applied from the repo (text verbatim, comments stripped): `20261116130000`, `20261116150000`, `20261116150100` (in two parts), and the final forms of `150200` and `150300`. Skipped: `ai_pending_count`/`ai_list_pending`/`ai_get_pending`/`ai_moved_slots`, `170000` (needs `auth.oauth_*`; unaffected), and the other ~80 migrations. All 20 connector function bodies matched the repo (comment/whitespace-insensitive compare of `prosrc`).
3. The draft was applied verbatim; its function bodies match the repo file, and the four `_v1` functions match the pre-draft originals.
4. Each regression ran in one transaction, so the "later log row" timing branch in the undo check is not exercised.
5. `npm run typecheck/lint/test` not run: DB-only task, no app code touched.

## Open questions
- Switch-off cancelling a waiting category request: not tested (lives in connector code the draft does not touch; testing needs revoking a connection). Suggest a follow-up on the real stack.
- A card spelled `ramp` asked for `ramp` becomes `Ramp` (respell to the deck's spelling). Matches contract 3a as I read it; owner may want it called out in the tool text.

## Verification (all on iiuwdlziygeaovpkenpi, via the supabase tool; results in table `zz_results`)
| Phase | Result |
|---|---|
| Pre-draft regression, 8 kinds (dry run, apply, undo, owner-only refusals, over-ten approve/decline, duplicates, guards) | 33/33 |
| Post-draft regression (fresh user) | 33/33 |
| deck_category, user C | 30/30 |
| deck_category, user D | 18/18 |
| Post-rollback regression | 33/33 |

deck_category coverage: apply 1-10 cards with log rows and untouched other columns; 11 changes wait for owner (`over_ten`), approve applies 11 rows, Claude cannot undo them (`owner_only`), owner undo restores; approve after a slot became Maybeboard fails the whole request with nothing written; decline writes nothing; multi-category lists, 5 accepted and 6 refused; respell `ramp` to existing `Ramp`; tie `tokens`/`Tokens`, `bbq`/`BBQ` resolved to the lowest slot's spelling (lowercase, not alphabetical); first spelling inside one request wins; commander keeps its `Commander` entry (5 requested plus it is refused, 4 plus it accepted); partner without an entry gets none; `Maybeboard` refused in four capital/whitespace variants and inside a list; Maybeboard cards refused (three forms) and untouched; `Commander` refused on non-commanders in any case; capitals-only request is `nothing_to_change` with no write; validation (empty, blank, 61 chars, non-string, duplicate slot, wrong name, 61 slots, no slots); undo restores NULL and the exact previous raw text, including plain-text `Removal`; undo refused (`slot_edited`) for Claude and owner after a manual edit, allowed again if the value is back to the changed one; already-undone, unknown connection and bad actor handled; recent-changes list shows categories from/to (NULL as empty list); second apply of the draft refused by its guard; all new and renamed functions are service-role only.

Rollback: refused while 25 category log rows and 4 waiting/other requests existed; after I deleted those rows (test project only) it ran cleanly. 20 of 20 connector function fingerprints and all permissions equal the pre-draft snapshot; both allow-lists are back to 8 kinds; no `_v1` or helper functions left; `deck_category` is `unknown_action` again.

## Left on the test project (not deleted)
4 fake users (@example.invalid), 12 decks, 232 cards, the connector tables with 66 log rows and 9 request rows, my bootstrap tables and stand-in functions, test helper tables/functions (`zz_*`) and the result table. The draft is currently rolled back (not applied). Live project untouched.
