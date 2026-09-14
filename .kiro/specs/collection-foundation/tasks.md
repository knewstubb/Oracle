# Tasks: Collection Foundation

Each phase is validated against `requirements.md` before the next begins. All audit/verification steps are read-only. No destructive schema change happens without explicit approval.

## Phase 0 — Grounding audit (read-only)

- [x] Produce a written schema-vs-intent gap report: live Supabase schema diffed against `schema-card-data` steering and the intent in requirements. Refs: NFR-2, NFR-5. Evidence: 2026-09-12 grounding audit in `delivery-log.md`.
- [x] Enumerate every code path that changes a copy's location or a slot's assignment (assign, reassign, unlink, add-proxy, import, AI-apply). Classify each as atomic or non-atomic. Refs: NFR-1. Evidence: 2026-09-12 grounding audit and rejected-review entry in `delivery-log.md`.
- [x] Run integrity queries on current data: copies in both deck+storage, sleeved copies in no location, slots with stale `ownership_status`, copies referenced by >1 slot. Record counts as the baseline. Refs: 5.1, NFR-5. Evidence: all recorded baseline and post-change counts were zero for invalid states.

## Phase 1 — Location integrity (the invariant)

- [x] Define the one-location model of record: how a copy's single location (storage vs deck slot) is represented and constrained. Refs: 5.1. (Option A: storage `location_id` XOR deck-slot `copy_id`; copy-uniqueness already enforced by live unique index.)
- [x] Guarantee a default storage location per user and backfill any copy with no location into it. Refs: 5.2.
- [x] Make location-aware import so copies land in the default location, not NULL. Refs: 5.2, 5.5.
- [x] Make every location-changing operation atomic (RPC/transaction), fixing the flagged non-atomic flows. Refs: 5.1, NFR-1. Evidence: current-schema movement, batch, missing-restoration, import, and replacement RPC callers now fail closed; full lifecycle hard XOR remains deferred.
- [ ] Ensure unsleeve/remove/deck-delete returns copies to storage rather than orphaning them. Refs: 5.1. (Deferred to Phase 2 with the Sleeved concept.)
- [ ] Add a hard XOR constraint once sleeve/unsleeve is wired. Refs: 5.1, NFR-1. (Deferred to Phase 2.)
- [x] Re-run integrity checks; confirm zero two-location and zero no-location copies. Refs: NFR-5.

## Phase 2 — Slot lifecycle (Planned vs Sleeved)

- [x] Introduce an explicit Planned/Sleeved distinction for deck slots. Refs: 5.3. Evidence: `DeckCardLifecycle` is derived from nullable `copy_id` in `src/lib/card-status.ts`; committed in `bc4e9d3`.
- [x] Redefine the slot-state derivation around Empty / Planned(owned|proxy|unowned, with availability) / Sleeved(original|proxy) as a single source of truth. Refs: 5.3, NFR-2. Evidence: canonical `allocationStatus` plus compatibility `status` are returned by `computeDeckCardStatuses` and `/card-statuses`.
- [ ] Retire or auto-reconcile the stale `ownership_status` so it can no longer drift. Refs: NFR-2.
- [x] Update the deck-detail and cards views to show planned-context vs sleeved-context correctly. Refs: 5.3. Evidence: deck detail, picklist, CardsTab, CardGroupSection, CardSlotBadge, StatusChipPopover, and PicklistV2 consume lifecycle-aware fields in `bc4e9d3`.

## Phase 3 — Movement & confirmation

- [ ] Keep explicit move/assign actions confirmation-free (intent already shown). Refs: 5.4.
- [ ] Add an origin-picker when a card to place has multiple candidate source copies. Refs: 5.4.
- [ ] Warn-before-apply when a decklist change will physically move cards. Refs: 5.4, 5.5.
- [ ] Route AI add/remove through an always-confirm gate before applying. Refs: 5.4.
- [x] Make multi-card (AI or batch) application atomic. Refs: NFR-1. Evidence: `/api/decks/[id]/cards/batch` resolves metadata before calling the current-schema `apply_ai_deck_delta` RPC and validates returned counts.

## Phase 4 — Import alignment

- [x] Rename the user-facing and API `theorycrafted` import intent to `theorycrafted`; create/update its deck slots as Planned without collection or physical-allocation writes. Refs: 5.5. Evidence: committed in `9d688f5`.
- [x] Make Built import/reimport reconcile stated physical reality: preserve matching valid assignments, atomically pull eligible free copies, release removed Sleeved copies to default storage, and return structured unresolved conflicts without taking cards from other decks. Refs: 5.5, 5.4. Evidence: `reconcile_built_deck` RPC and executor committed in `2ba479d`; focused Built test passes 1/1.
- [x] Retain New-cards import as the guarded atomic create-and-sleeve path, including Original/Proxy results. Refs: 5.5, NFR-1. Evidence: existing `replace_deck_with_new_cards` path remains the `new_cards` executor; focused import route suite passes 12/12.
- [x] Align canonical lifecycle/API results and shared UI with the import outcomes: Planned plus allocation context, or Sleeved plus Original/Proxy. Refs: 5.3, 5.5. Evidence: `DeckCardLifecycle`, `allocationStatus`, canonical `copyId`, compatibility aliases, and shared UI wiring committed in `bc4e9d3`.
- [x] Keep collection import instance-level into default/specified storage, separate from deck import. Refs: 5.2, NFR-3. Evidence: V2 add/sync imports use default-location RPC insertion and replacement preflight; focused import-client tests pass.

## Phase 5 — Verification

- [ ] Runnable read-only integrity suite proving all invariants (one location, no drift, instance-level). Refs: NFR-5.
- [ ] Validate each acceptance criterion in 5.1–5.5 against the running app. Refs: 5.x.
- [ ] Update `schema-card-data` steering and `product-spec` to reflect the corrected foundation. Refs: NFR-2.
