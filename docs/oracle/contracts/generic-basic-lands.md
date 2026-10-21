# Contract: Generic basic lands

Status: draft for Developer, owner decisions of 2026-10-21, owner answers applied (rev 3). Supersedes the "Generic basics" toggle (D-048).
Rev 2 changes: language stored (Q1); existing decks ignored, no data conversion, legacy rows are not a concern because the owner will purge and re-import (Q2); swap-to-generic releases the copy (Q3); generics have a real Sleeved/Unsleeved state (Q4, new §3A); art is image-only, default chosen and stored at write time (Q5, new §3B); swaps use the ordinary allocation path (Q6).
Rev 3 changes: NO swap feature (owner removes and re-adds instead); generic Sleeved state is all-or-nothing per deck per basic type (§3A); plain generic line starts Sleeved, deck-level Unsleeved does not override (answered).
Migration: `supabase/migrations/20261021120000_deck_cards_is_generic.sql` (DRAFT, NOT APPLIED).

## 1. Owner rules (restated)
1. No "Generic basics" toggle anywhere.
2. Every deck can add unlimited generic Plains, Island, Swamp, Mountain, Forest, Wastes and the five Snow-Covered basics. A generic references no copy, no allocation, no conflict, and adds nothing to the collection.
3. A specific land (named printing or scanned) is a real copy, allocated like any card.
4. A deck mixes both freely.
5. Decklist: one line per distinct printing, plus one generic line (no printing). Never merged across printings.
6. Import: a basic line with no set and collector number is generic; one naming a printing is a real card (Round 13, already built).
7. No swap feature. To change generic to specific the owner removes a card by the normal path and adds the other the normal way (remove a specific land, raise the generic count by one; or lower the generic count and add a specific card as usual).
8. A generic may carry finish, an art printing, and optionally a language.

## 2. How a generic is stored today
- Import writes a generic as a planned slot (`card_id` null, `is_maybeboard=true` RPC flag, no copy) WITH `printing_id` and `scryfall_id` set to a default placeholder printing (`getBasicLandDefaultScryfallId`). [Confirmed: src/lib/manabox-deck-import.ts:257-275]
- Every reader decides "generic" differently, by an EMPTY `scryfall_id`:
  - status engine: `isBasicLand(name) && !card.scryfall_id` [Confirmed: src/lib/card-status.ts:~278]
  - picklist: `isGenericLand = isBasicLand && !c.scryfall_id` [Confirmed: src/app/api/decks/[id]/picklist/route.ts:~98-124]
  - built-deck reconcile payload: `is_generic_land: ... && !card.scryfallId` [Confirmed: src/lib/deck-import.ts:137]
  - the "convert to generic" action clears `scryfall_id` and `set_code` [Confirmed: src/app/api/decks/[id]/cards/[cardId]/route.ts PATCH; CardGroupSection.tsx:1093,1197]
- **Diagnosis (probable bug, confirmed by reading):** an import-saved generic carries a default `scryfall_id`, so the status engine files it as "unresolved specific-printing land". It goes through the available/alternate/claimed/unowned computation instead of `generic_land`. Result: imported generics can show as unowned/claimed, appear in the picklist, and count as shortages, while the Cards tab's generic roll-up (which keys off status `generic_land`) misses them. Clearing the id would lose the art, and the two meanings ("no printing chosen" vs "generic") are tangled. [Approximate: not run against live data; confirm with one imported deck.]
- Separately, the PATCH that "converts to generic" only clears printing fields. If the slot holds a copy, it is not released (D-039 says it should return to storage). [Approximate: no release call seen in that route.]

## 3. Model: explicit flag
Add `deck_cards.is_generic boolean NOT NULL DEFAULT false` and `deck_cards.requested_language text NULL`.
- Do NOT infer from a missing copy: an Unsleeved or unowned ordinary card also has no copy.
- Do NOT infer from an empty printing id: a generic needs an art printing.
- Invariants (DB check plus server validation): `is_generic` implies `copy_id IS NULL`, `ownership_status IS NULL`, card name is one of the 11 basic names, `is_commander=false`.
- A generic slot stores: `card_name`, `scryfall_id`/`set_code` (image only, see §3B; NOT a wanted printing and need not be owned), `requested_finish` (D-041), `requested_language`, and `generic_sleeved` (§3A). No condition, no Original/Proxy. It owns nothing.
- Quantity: one slot row per copy as today (`quantity=1`), so "unlimited" needs no cap or new model. The deck page groups rows for display.
- Real copy: `is_generic=false`, normal allocation. A real basic with no copy yet (named printing not owned) is an ordinary Unsleeved/unowned slot (D-047/D-031), NOT generic.
- Single source of truth: one helper `isGenericSlot(row)` reading `is_generic`; delete the four `!scryfall_id` checks. The import RPC payload field `is_generic_land` is set from `is_generic` (Round 13 `isGenericBasic` stays the import decision).

## 3A. Sleeved / Unsleeved for a generic
- No existing field holds this for a generic. For ordinary slots, state is derived: a copy link means Sleeved, none means Unsleeved. A generic has no copy, so it needs its own field: new `deck_cards.generic_sleeved boolean NOT NULL DEFAULT true` (only meaningful when `is_generic`). [Confirmed: src/lib/card-status.ts:~262-283 derives lifecycle from `copy_id`; generics are hard-coded `lifecycle: 'planned'`, which contradicts D-032/D-002 "generics count as Sleeved". That hard-coding must change.]
- Import mapping (D-047 per-line Original/Proxy/Unsleeved): a generic line set to Unsleeved writes `generic_sleeved=false` and stays so until the owner sleeves it. A generic line set to Original or Proxy, and a plain "11 Plains" line with no editing, writes `generic_sleeved=true` (owner-confirmed default). Neither creates a copy; "Original/Proxy" on a generic is only a Sleeved choice, nothing is added to the collection. The per-line editor for generics offers Sleeved / Unsleeved (line-level, see below).
- D-031 deck-level "Sleeved/Unsleeved" import choice: it only supplies the starting value of each line. It does not override a line the owner changed. Owner-confirmed: a deck-level Unsleeved choice does NOT unsleeve plain generic lines (they stay Sleeved); only a line the owner sets Unsleeved is Unsleeved.
- **All or nothing, per deck per basic type (recommended and cleanest).** The decklist already shows one generic line per basic type (§5), so "line" = (deck, basic name). `generic_sleeved` stays a per-row column (simple to query and count) but every API/UI write sets it for ALL generic rows of that name in that deck in one statement; no per-row control exists. Per-type beats per-finish/language lines because a line split by finish would let one "Plains" line be half sleeved. Import: if one import yields several generic rows of the same type with mixed states (e.g. a plain "6 Plains" and a "5 Plains" set Unsleeved), the whole type becomes Unsleeved (Unsleeved wins, never silently Sleeved) and the result screen says so.
- **Change count** (add or remove generics) is one atomic RPC `set_generic_basic_count(p_deck_id, p_user_id, p_card_name, p_count)`: new rows inherit the type's current state (an Unsleeved line stays all Unsleeved), plus its finish, language and art; if the type has no rows yet they take the Sleeved default, a chosen finish/language and stored default art (§3B). Lowering the count deletes surplus generic rows (no copies involved, nothing released). Count 0 removes the line. Rejects non-basic names and negative counts; no upper cap.
- Actions: **Sleeve** on a generic sets `generic_sleeved=true`: no copy, no proxy created, no allocation, no conflict check, no collection change. **Unsleeve** on a generic sets `generic_sleeved=false`: nothing to release. On an ordinary card, Sleeve still picks/creates a copy and Unsleeve releases it (D-039, D-025). Both are one user-scoped update over the whole (deck, basic name) line, in one endpoint or the existing sleeve route branching on `is_generic`; a bulk sleeve of a mixed selection treats each generic line as a unit and each ordinary card as before.
- Counting (D-002): a generic counts toward the 100 cards whatever its state. It counts toward "sleeved N/100" only when `generic_sleeved=true`. Any unsleeved generic makes a complete list Assembling, not Playable. Generics never create shortage, picklist or Reconcile demand in either state (no copy needed). The sleeved count is passed into `DeckStateBadge` by its callers; I could not find the calculation in a shared lib [Approximate: src/components/vocabulary/DeckStateBadge.tsx takes `sleeved` as an input], so the Developer must locate every place that computes it and make generics count by flag. Status label for a generic: `generic_land` with lifecycle `sleeved|planned` taken from the flag; card-statuses summary counts `planned` should then include unsleeved generics.

## 3B. Art (image-only)
- A generic's printing id is display only; the owner need not own it, and it never affects allocation. Any printing of that basic may be chosen via the picker.
- Default art: a random printing of that basic that the owner owns (a `user_copies` row for that basic name, joined to its printing); if they own none, the Round 12 default (`getBasicLandDefaultScryfallId`). [Confirmed: src/lib/basic-lands.ts default ids]
- Chosen at write time (import, add-generic) and STORED in `scryfall_id`/`set_code`; never computed at display, so it cannot change on reload. Pick once per generic line (all rows of one import line share it); a later added generic picks again. The random choice goes through a small pure function taking an injected random source so it is testable. Owner override writes the stored id.

## 4. Migration (draft, not applied)
Schema additions only: `is_generic`, `generic_sleeved`, `requested_language`, and a check constraint (generic implies no copy, no ownership status). NO data conversion, no backfill, no deletes: existing decks are out of scope because the owner will purge the database and re-import, so legacy rows and old-shape code paths need no handling. Defaults are safe, so the migration can apply before the code ships. Rollback is the commented DROPs. Not deployed; deployed state per `docs/oracle/status.md` is unchanged by this note.

## 5. Display
Decklist lines: group by (name, is_generic, printing). One generic line per basic type, labelled "(generic)", plus one line per distinct printing. Replace the name-only collapse in CardsTab roll-up and CardGroupSection grouping (they currently merge specific lands by `scryfall_id` and generic by name, close to the rule already; the change is to key generic off `is_generic`, and never merge generic into a printing line). Generic shows the existing badge.

## 6. Add / change count / remove generic (no swap)
- No swap RPCs, routes or UI. Specific to generic = remove the specific card through the normal removal path (copy released to storage as for any card, D-039) and raise the generic count. Generic to specific = lower the generic count and add the specific card the normal way (normal allocation, sleeve and conflict behaviour).
- Controls: add generic, change generic count (stepper per basic type), remove generic line. All use `set_generic_basic_count` (§3A). Generic art/finish/language edits apply to the whole line.
- Retire the PATCH that clears `scryfall_id`/`set_code` to make a "generic" (it is the old convention and a source of the bug); PATCH must reject `is_generic`, `generic_sleeved` and copy fields. Generic-line edits go through the dedicated endpoint.

## 7. Effects
- Allocation: generic rows are skipped by allocation, picklist, readiness, shortage and conflict checks (D-032 stands). Count toward deck size; Maybeboard does not.
- D-023 (basics fungible on import): applies only to named-printing basics; unchanged.
- Collection rollup: generic never touches it (no copy). `rollup` basic-land special cases stay name-based and only affect owned copies; no change needed [Confirmed: src/app/api/collection/rollup/route.ts:81].
- Reconcile (D-037): generics excluded; keyed by `is_generic`.
- Legality singleton exemption stays name-based [Confirmed: legality/route.ts:~159].
- D-025 (Sleeved/Unsleeved, Original/Proxy): a generic is Sleeved, with neither Original nor Proxy label (as today, status `generic_land`).
- D-031/D-047 (Unsleeved import): REVISED. A generic CAN be Unsleeved (`generic_sleeved=false`, §3A) and then blocks Playable. An Unsleeved line for a specific basic is an ordinary slot. D-032's "generics are automatically Sleeved" and D-031's "generic basic lands still automatically count as Sleeved" and D-002's matching clause no longer hold as written: generics are Sleeved by default but can be Unsleeved.
- D-051 (rows split by language): generic rows split by finish and language like any row (language now stored in `requested_language`); condition and Original/Proxy are not shown.
- D-039: the "switching a tracked basic land to generic" clause is no longer needed (no switch action exists); removing a card already releases its copy.
- D-041/D-038: generic keeps requested finish and art printing the same way.

## 8. Import
Remove the toggle UI and its field from the request and from `ImportDefaultsBar`/flow. Round 13 rule is the only rule. Row editor: for a generic row, show Finish, Language and Sleeved/Unsleeved; hide Condition and Original/Proxy. Import writes `is_generic=true`, `generic_sleeved`, `requested_finish`, `requested_language` and the stored art id (§3B). Old requests that send the toggle are ignored. The deck import RPC (`replace_deck_with_new_cards`, and the draft in 20261020120000) needs the new row keys `is_generic`, `generic_sleeved`, `requested_language`; fold them into that RPC rewrite rather than a third rewrite.

## 9. Multi-user safety
Every slot has `user_id`; RPCs take `p_user_id` from `requireAuth`, verify deck ownership, never accept copy or user ids from the client; service-role client bypasses RLS so ownership checks in the RPCs are mandatory. Generic rows touch no `user_copies`, so a generic can never consume or release another user's copy. Concurrency: `set_generic_basic_count` locks the deck row (`FOR UPDATE`) so a double click cannot double-insert or mis-count.

## 10. Developer tasks, in order
1. Owner approves migration; apply `20261021120000`; regenerate `src/types/supabase.ts`.
2. Add `isGenericSlot` helper; replace the four `!scryfall_id` detections (card-status, picklist, deck-import, CardsTab/CardGroupSection) to read `is_generic`; set generic lifecycle from `generic_sleeved`. Fixes the display bug.
3. Sleeved-count / deck-state calculation: count generics by flag everywhere it is computed.
4. Art default function (random owned printing, stored) with injected random source.
5. `set_generic_basic_count` RPC plus endpoint; line-level Sleeve/Unsleeve for generics (updates the whole line); retire the clearing PATCH.
6. Import: write the new fields via the RPC (mixed-state rule: Unsleeved wins); remove toggle. Keep Round 13 decision.
7. Deck page: add-generic, count stepper, remove-generic controls; decklist line grouping.
8. Row editor tweaks for generic rows (after T-56 import branch `test-t56-local` merges).
9. Update tests; Gene updates decisions.

## 11. Tests
- `isGenericSlot` and import decision: basic no printing is generic; basic with set+number, or scryfall id only, is real (extend `basic-lands-import.test.ts`); non-basic never generic.
- Status engine: generic with default `scryfall_id` and `is_generic=true` gives `generic_land` (regression for the bug); specific unowned basic gives unowned.
- Picklist/readiness/shortage ignore generics; deck size counts them.
- Decklist grouping: 6 generic + 2 ZNR + 1 M21 gives three lines, never merged.
- `set_generic_basic_count`: raising on an Unsleeved line gives new rows `generic_sleeved=false` (inherit), finish, language, art; raising on a Sleeved line inherits Sleeved; empty line starts Sleeved; lowering deletes rows and touches no copy; 0 removes the line; non-basic name or negative count rejected; wrong user gets not-found; invariant check rejects `is_generic` with a copy.
- Line-level Sleeve/Unsleeve: updates every generic row of that name in that deck only, not other types or decks, and not ordinary cards.
- Import mixed states: plain 6 Plains plus 5 Plains set Unsleeved gives all 11 Unsleeved.
- Readiness: complete 100-card list with all generics sleeved is Playable; one unsleeved generic gives Assembling and "sleeved N/100" excludes it but size includes it.
- Sleeve/Unsleeve a generic: creates no copy, no proxy, no allocation, leaves collection counts unchanged; ordinary card Sleeve unchanged.
- Import: plain "11 Plains" gives `generic_sleeved=true`; line set Unsleeved gives false; deck-level Unsleeved does not override per the proposal.
- Art default: with owned printings picks one of them (seeded random), with none uses the Round 12 default, stored value is stable across reloads, owner override with an unowned printing is accepted.
- Removing a specific land releases its copy (add one regression with a basic on the normal removal path).
- Multi-user: user B cannot change count, sleeve or remove user A's generic line.
- Import-toggle removal: request carrying the old toggle behaves identically.

## 12. For Gene (decisions.md)
- D-048: superseded (toggle removed; Round 13 rule is permanent).
- D-032: add "permanent, unlimited per deck; stored with is_generic; holds image-only art printing, finish, language"; replace "automatically Sleeved" with "Sleeved by default, can be Unsleeved and Sleeved by the owner without using any copy".
- D-031 and D-002: same "automatically count as Sleeved" clause changes (generics count as Sleeved only while Sleeved).
- D-047: note that Unsleeved applies to generic basics too (no copy involved).
- D-039: the "switching a tracked basic land to generic" clause may be deleted (no switch action exists); the rest stands.
- D-051: still pending from the earlier note (Foil checkbox).
- The earlier contract `import-row-editing.md` §6 D-048 bullet is superseded by this note.
