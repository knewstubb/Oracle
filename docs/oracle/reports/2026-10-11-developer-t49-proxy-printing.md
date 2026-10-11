# Report: T-49 proxy records the requested printing and finish

Role: Developer
Status: DONE
Task as received:

> Task: T-49 (audit Batch 1, items P1 and the related collection proxy note; decisions D-038 and D-041). Files you own: src/app/api/allocation/add-proxy/route.ts, src/app/api/decks/[id]/cards/bulk/route.ts, src/app/api/collection/instances/add-proxy/route.ts, a NEW forward migration file in supabase/migrations/ (do not edit applied migrations; do not apply it), src/types/supabase.ts only for the new column, plus tests. Required behaviour: (a) deck_cards gets a nullable requested-finish column (nonfoil, foil, etched, same allowed values as the copies finish) per D-041, and add_proxy_to_slot and add_proxies_to_slots use the slot's own requested printing (its scryfall_id) and requested finish when present, falling back to the current newest-printing default only when the slot has none; (b) the collection add-proxy route records a printing instead of none; (c) a regression test using an alternate (for example borderless) printing proves the proxy records the requested printing. Make the migration safe to re-run and non-destructive (no drop, truncate, delete or data rewrite). In your report list the exact migration file name, what it changes in plain words, and how the owner should apply it. Do not change import code (Phase 5 owns carrying finish from imports).
> For Brad (plain words): This makes a proxy copy the exact printing the deck slot asks for, and lets deck slots remember foil or etched; it includes one data-storage change that you must approve before it is applied.

## Summary for the owner

When you press Proxy on a deck card, the new proxy now copies the exact printing that deck slot asks for — for example a Borderless Sol Ring slot gets a Borderless Sol Ring proxy — instead of always picking the newest regular printing. Deck slots can now also remember whether they ask for nonfoil, foil or etched, and the proxy uses that; adding a proxy straight to your collection now records a printing too, rather than a printing-less copy. Nothing changes on screen until the one data-storage change below is approved and applied; until then the app still works as before.

## Migration — exact file, plain meaning, how to apply

- **File:** `supabase/migrations/20261011120000_proxy_requested_printing_finish.sql`
- **What it changes, in plain words:**
  1. Adds one new, optional column to the deck card list: "the finish this slot asks for" (nonfoil, foil or etched). Existing slots are unaffected (the new field is empty until something sets it).
  2. Updates two database routines so that when a proxy is created for a deck slot, it records the printing that slot asks for and the finish that slot asks for; it only falls back to the newest printing of the card when the slot names no printing.
  - It is safe to run more than once, and it deletes or rewrites nothing.
- **How to apply:** after you approve, apply it to the hosted database with the project's normal command, `supabase db push --yes` (or paste the file into the Supabase SQL editor). Do **not** apply it before approving. This task did not apply it.
- **Why it needed approval:** it adds a column to how deck cards are stored (a schema change). The app code in this task depends on that column, so the deck-proxy and collection-proxy behaviour only becomes active after this migration is applied.

## Changed files

- `supabase/migrations/20261011120000_proxy_requested_printing_finish.sql` — new forward migration: adds `deck_cards.requested_finish` and rewrites `add_proxy_to_slot` / `add_proxies_to_slots` to use the slot's own `scryfall_id` and `requested_finish`, falling back to the newest printing only when the slot names none.
- `src/types/supabase.ts` — adds the new nullable `requested_finish` field to the generated `deck_cards` Row/Insert/Update types (only change in this file).
- `src/app/api/decks/[id]/cards/bulk/route.ts` — reads each slot's `scryfall_id` and `requested_finish` and passes them to `add_proxies_to_slots` per assignment (D-038 / D-041).
- `src/app/api/allocation/add-proxy/route.ts` — documentation corrected: the RPC now records the slot's requested printing/finish (no functional change; the RPC reads the slot).
- `src/app/api/collection/instances/add-proxy/route.ts` — a collection proxy now records a printing (caller-supplied or the newest printing of the card) and a validated finish (default nonfoil); previously it recorded neither.
- `src/app/api/allocation/add-proxy/route.test.ts` — new tests for auth, validation, success and error mapping.
- `src/app/api/decks/[id]/cards/bulk/route.test.ts` — new tests for the add-proxy path, including the borderless-printing regression.
- `src/app/api/collection/instances/add-proxy/route.test.ts` — new tests that a printing and finish are recorded, with fallback.
- `src/test/migration-t49-proxy-printing.test.ts` — new regression test asserting the migration's schema and RPC rules (requested printing wins over the newest-printing fallback) and that it is non-destructive.

## New decisions made (need owner confirmation)

- None beyond the already-locked D-038 and D-041. The migration itself needs owner approval before it is applied (see above).

## Assumptions

- `deck_cards.scryfall_id` is already the printing a slot asks for (audit P1/P6). This task records it; choosing it when a card is added is Batch 11 (T-48), owned elsewhere.
- A collection proxy with no caller-supplied printing uses the newest printing of the card, matching the deck-proxy fallback. If a card has no known printing at all, the collection route now returns "No printing found for this card" (404) rather than creating a printing-less copy.
- The two RPC signatures are unchanged, so no `DROP FUNCTION` and no signature-overload ambiguity; `CREATE OR REPLACE` preserves existing EXECUTE grants.
- Finish values are exactly `nonfoil` / `foil` / `etched` (D-004), enforced by a CHECK constraint and validated in the collection route.
- The unit-test environment has no Postgres, so the migration itself is verified structurally (see Verification); no database was written to and the migration was not applied.

## Challenges to locked decisions

- D-003, D-004, D-038, D-040, D-041, D-042 — none. The change implements D-038 and D-041 and uses `scryfall_id` as a printing id, not `oracle_id`.

## Open questions

- None for this task. Import carrying finish into the new `deck_cards.requested_finish` column remains Phase 5 (out of scope, not changed here), per the task.

## Verification

- `NODE_DISABLE_COMPILE_CACHE=1 npm run check` — **exit 0**; tests `1559 passed | 40 skipped`, 0 failures; type check 0 errors; lint 0 errors (263 pre-existing warnings).
- Focused run of the four new/changed suites — `4 passed (4)`, `37 passed (37)`.
- No API called, no script run, no database write, no migration applied. The migration file was written only.
- Borderless regression: `src/app/api/decks/[id]/cards/bulk/route.test.ts` feeds a slot whose `scryfall_id` is `borderless-sol-ring-scryfall-id` with `requested_finish = 'etched'` and asserts `add_proxies_to_slots` receives exactly that printing and finish; `src/test/migration-t49-proxy-printing.test.ts` asserts both RPCs use the requested printing before the newest-printing fallback and that the migration contains no DROP/TRUNCATE/DELETE.
