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

- [ ] Introduce an explicit Planned/Sleeved distinction for deck slots. Refs: 5.3.
- [ ] Redefine the slot-state derivation around Empty / Planned(owned|proxy|unowned, with availability) / Sleeved(original|proxy) as a single source of truth. Refs: 5.3, NFR-2.
- [ ] Retire or auto-reconcile the stale `ownership_status` so it can no longer drift. Refs: NFR-2.
- [ ] Update the deck-detail and cards views to show planned-context vs sleeved-context correctly. Refs: 5.3.

## Phase 3 — Movement & confirmation

- [ ] Keep explicit move/assign actions confirmation-free (intent already shown). Refs: 5.4.
- [ ] Add an origin-picker when a card to place has multiple candidate source copies. Refs: 5.4.
- [ ] Warn-before-apply when a decklist change will physically move cards. Refs: 5.4, 5.5.
- [ ] Route AI add/remove through an always-confirm gate before applying. Refs: 5.4.
- [x] Make multi-card (AI or batch) application atomic. Refs: NFR-1. Evidence: `/api/decks/[id]/cards/batch` resolves metadata before calling the current-schema `apply_ai_deck_delta` RPC and validates returned counts.

## Phase 4 — Import alignment

- [ ] Make decklist import create added cards as Planned, not silently Sleeved. Refs: 5.5.
- [ ] Preserve still-valid sleeved assignments across reimport and surface pending moves for confirmation. Refs: 5.5, 5.4.
- [x] Keep collection import instance-level into default/specified storage. Refs: 5.2, NFR-3. Evidence: V2 add/sync imports use default-location RPC insertion and replacement preflight; focused import-client tests pass.

## Phase 5 — Verification

- [ ] Runnable read-only integrity suite proving all invariants (one location, no drift, instance-level). Refs: NFR-5.
- [ ] Validate each acceptance criterion in 5.1–5.5 against the running app. Refs: 5.x.
- [ ] Update `schema-card-data` steering and `product-spec` to reflect the corrected foundation. Refs: NFR-2.
