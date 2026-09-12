# Delivery Log — Collection Foundation

> Feature: Collection Foundation
> Status: In Progress
> Last updated: 2026-09-12
> Maintained by: Delivery Lead

---

## 2026-09-12 — Phase 0 grounding audit (read-only)

**Context:** Before building, the user asked to verify the ground-level data model matches product intent. Requirements were captured from a structured interview; this audit measures the live schema, code paths, and data against that intent.

**Live data baseline (production Supabase):**
- 3,650 physical copies; 0 proxies; 0 marked missing.
- **Every copy has `location_id = NULL`** (all 3,650) — the storage-location concept is effectively unused; NULL currently means "unsorted pile."
- Deck slots: 125 total (100 filled, 25 empty) across 2 decks.
- 5 `user_locations` rows exist but no copy points at one.
- **Invariant health — all clean:** 0 copies in both a deck and storage; 0 copies sleeved in more than one slot; 0 slots with contradictory/stale `ownership_status`; 0 slots with a copy but null status; 0 slots with status but no copy.

**Interpretation:** This is a *prevention* task, not a *cleanup* task. Current data satisfies the invariants; the model simply does not enforce them, and the storage-location concept is not yet real.

**Schema findings:**
- `user_copies` columns: `location_id` (nullable FK), `is_proxy`, `missing`, `proxy_for_card_id`, `finish`, `language`, `condition`, `printing_id`, `source_tag`, etc. This is richer than `schema-card-data` steering documents (which is stale — it lists `scryfall_id`/`is_foil` and omits `location_id`). Steering update deferred to Phase 5.
- One-location rule is **not modelled**: storage `location_id` and deck assignment (`deck_cards.copy_id`) are independent, with no constraint tying them to "exactly one."
- **No Planned vs Sleeved concept** exists — a slot is assigned or not; there is no representation of "intended but not physically moved."

**Movement-path atomicity findings:**
- Atomic/safe: assign, reassign-to-deck, assign-free-copy, mark-missing, design/built import diff (`apply_deck_cards_diff`), replace-with-original swap, breakdown, single-statement location updates.
- Non-atomic — zero-slot (clear-then-fill) risk: `claim-from-deck`, `undo` restore case, warm-start Moxfield resolve loop.
- Non-atomic — orphaned-copy risk: `add-proxy` (rollback only on error, not crash), `new_cards` deck import (delete + per-copy insert + batch insert, no transaction), and the `deck-cards-diff` non-atomic fallback when its RPC is absent.
- AI apply path (`OracleContext`) adds/removes deck-list cards one HTTP call at a time — not transactional; a partial failure half-edits the deck.

**Stale docs identified:**
- `schema-card-data` steering is behind the live schema (missing `location_id`/`user_locations`, wrong printing column name).
- `convention-atomic-writes` lists mark-missing as a non-atomic gap, but code now uses an atomic `mark_copy_missing` RPC. Both to be reconciled in Phase 5.

**Decisions carried from the interview:**
- One location per card, always (storage or a deck slot, never both/neither).
- Default storage location required; named binders/boxes creatable; proxies get locations too.
- Explicit Empty → Planned → Sleeved lifecycle is in scope (Planned shows ownership/availability context; Sleeved shows original/proxy only).
- Confirmation model: explicit move = no extra confirm; decklist change = warn; ambiguous origin = pick source; AI = always confirm.
- Missing-card handling parked; copies pullable from anywhere (no locked decks).

**Refs:**
- Requirements: `.kiro/specs/collection-foundation/requirements.md`
- Tasks: `.kiro/specs/collection-foundation/tasks.md`

---

## 2026-09-12 — Phase 1 design decision: Option A (two mechanisms, enforced between them)

**Context:** The audit revealed `location` is represented by two mechanisms: physical storage via `user_copies.location_id` (→ `user_locations` type `storage`; NULL = unsorted) and deck membership via `deck_cards.copy_id`. Deck-type `user_locations` rows exist (auto-created by the `trg_create_deck_location` trigger) but are effectively labels — copies are not assigned to them.

**Decision (user-approved): Option A.** Keep storage and deck-slot as two mechanisms and enforce the one-place rule between them, rather than unifying every copy under a single `location_id` (Option B, rejected as a high-risk rewrite of the allocation system).

**The model:**
- In storage = copy has a `location_id`, not referenced by any deck slot.
- Sleeved = copy referenced by a deck slot (`copy_id`); `location_id` cleared.
- Planned = a deck slot exists but references no copy; the owned copy (if any) still sits in storage.
- One default storage location per user makes "unsorted" a real place instead of NULL.

**Backfill rule (critical):** only copies that are `location_id IS NULL` **and not referenced by any deck slot** move to the default location. Copies currently sleeved in a deck (NULL location + in a slot) are left location-less, because stamping them with a storage location would put them in two places — the exact state we are preventing. For current data: ~3,550 unsleeved copies → default; 100 sleeved copies untouched.

**Schema facts confirmed:**
- `user_locations` has no `is_default` column yet; CHECK `locations_type_deck_check` enforces storage↔NULL-deck_id and deck↔non-null-deck_id.
- Storage locations are created via `POST /api/settings/storage-locations` (hardcodes type `storage`). DELETE relies on FK `ON DELETE SET NULL`, so deleting a location returns its copies to NULL.
- Import never sets `location_id` (why all copies are NULL).

**Follow-ups noted for later Phase 1 tasks:** `add-proxy` and `replace-with-original` intentionally produce NULL/unsorted copies and must respect the default-location invariant; deleting the default location must be blocked or reassign first; storage overview counting must treat the default location correctly.

---

## 2026-09-12 — Copy-uniqueness already enforced; scope of remaining Phase 1 narrowed

**Context:** Interview surfaced the scarcity/over-allocation concern (more decks than copies) and the accordion model (one row per non-basic instance; generic basics use a real `quantity`). Planned to add a unique constraint so one physical copy backs at most one deck slot.

**Finding:** The constraint **already exists and is enforced.** `deck_cards` has a live, valid UNIQUE partial index `idx_deck_cards_unique_physical_copy ON (copy_id) WHERE copy_id IS NOT NULL`. The Phase 0 code audit missed it (it saw the redundant non-unique `idx_deck_cards_copy_id` alongside it). So "one copy → at most one deck slot" is a hard DB guarantee today, across all formats; generic-land rows (null copy) are correctly unconstrained.

**Data pre-checks (read-only, all clean):** 0 non-basic slots stored as `quantity > 1`; 0 `quantity > 1` rows at all currently; 0 `copy_id` values in more than one slot; 100 slots reference a unique copy.

**Scarcity behaviour confirmed correct:** built-mode import auto-assigns free (Tier 1/2) copies; with 1 copy and 3 decks wanting it, the first-processed deck shows `original` and the other two show `claimed` (owned but held elsewhere), derived live by `computeUnresolvedStatuses`. Caveats: the scarce-copy "winner" is processing-order, not priority; `autoAssignDeck` writes with a plain UPDATE (not the advisory-locked RPC), so the DB unique index — not the app — is the real backstop against concurrent over-allocation.

**Model note (accordion):** non-basic cards are one `deck_cards` row per physical instance (display may collapse to "×N"); generic basic lands are a single row with real `quantity` and `copy_id = null`, exempt from copy tracking. Data matches this today.

**Remaining Phase 1 gaps:**
1. Location XOR is not enforced — nothing prevents a copy having both a storage `location_id` and a deck slot (data is currently clean but unguarded).
2. Import is not location-aware — reimport lands copies at NULL location instead of the default.
3. Redundant non-unique `idx_deck_cards_copy_id` can be dropped (harmless cleanup, not a fix).

**Correction:** The Phase 0 delivery-log statement that `deck_cards.copy_id` has "no UNIQUE constraint" is superseded by this finding.

---

## 2026-09-12 — Phase 1 location integrity: default location + location-aware import

**Context:** Complete the location-integrity increment so every owned copy always has a real location and imports stop reintroducing NULL-location drift, under the approved Option A model.

**What changed:**
- Migration `20260912114410_collection_foundation_default_storage_location.sql`: added `is_default` to `user_locations`, a partial unique index guaranteeing one default storage location per user, seeded/promoted an "Unsorted" default, and backfilled unsorted+unsleeved copies into it.
- `src/lib/import-engine-v2.ts`: added `resolveDefaultLocationId()` and stamped `location_id` on inserted copies in both the add and sync paths, so collection import places owned copies in the default location instead of NULL. `new_cards` deck import copies remain location-less by design (they are created already sleeved into a deck slot).

**What was found already in place (no work needed):**
- Copy-uniqueness is already a hard DB guarantee: live unique partial index `idx_deck_cards_unique_physical_copy ON (copy_id) WHERE copy_id IS NOT NULL`. A single physical copy cannot back two deck slots, in any format. Generic-land rows (null copy) are unconstrained, matching the accordion model.

**Validation evidence:**
- `npm run build` passes. Targeted ESLint on the changed file: new code is clean; 3 pre-existing `any` errors and 1 pre-existing unused-symbol warning remain and are unrelated.
- Live integrity after changes: 1 default location (id 115); 0 copies in both storage and a deck; 0 copies in neither; 3,550 copies located; 100 sleeved copies correctly location-less.
- `resolveDefaultLocationId` reuses the existing default (id 115) rather than creating duplicates (verified by the single-default count).

**Model now true:** every physical copy is either in a storage location (has `location_id`, including the default "Unsorted") or sleeved in exactly one deck (`copy_id`), never both, never neither.

**Deferred to later phases (surfaced, not silently dropped):**
- Crash-window atomicity fixes for `claim-from-deck`, `undo` restore, warm-start Moxfield resolve loop, `add-proxy`, and `new_cards` deck import — belong with Phase 2/3 where sleeving and confirmation land.
- A hard DB XOR constraint (storage location vs deck slot) — deferred until Phase 2 wires sleeve/unsleeve so the constraint won't fight current code.
- Change the deck-import default from `new_cards` to `built` (or make it explicit) for the collection-first workflow.
- Drop the redundant non-unique `idx_deck_cards_copy_id` (harmless cleanup).

**Refs:**
- Migration: `supabase/migrations/20260912114410_collection_foundation_default_storage_location.sql`
- Import: `src/lib/import-engine-v2.ts`
- Tasks: `.kiro/specs/collection-foundation/tasks.md`

---
