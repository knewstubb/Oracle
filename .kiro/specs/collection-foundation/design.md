# Design: Collection Foundation

> Last updated: 2026-09-12
> Status: In Review — atomic movement/import increment
> Reference implementation: `supabase/migrations/20260912150000_atomic_collection_movements.sql` through `20260912170000_atomic_collection_personal_scope.sql`

## Design Goals

- Preserve the current personal-app collection and allocation model while preventing crash- and race-induced orphaning.
- Make the current schema, rather than retired table and column names, the only write contract.
- Fail closed when a destructive input is incomplete or an RPC returns an invalid success payload.
- Keep the implementation small enough to adopt before Planned/Sleeved UX and broader production hardening.
- Preserve recoverability through complete preflight, transactional replacement, and read-only integrity checks.

## Design Principles for This Feature

| Principle | Application |
|---|---|
| Option A is the model of record | Storage uses `user_copies.location_id`; a sleeved copy is represented by `deck_cards.copy_id` and has no storage location. |
| One physical copy, one place | The existing unique partial index prevents a copy from backing multiple deck slots; movement RPCs clear and assign within one transaction. |
| Current schema only | RPCs and callers use `user_copies`, `deck_cards`, `ref_cards`, `ref_printings`, and `user_locations`; retired legacy contracts are not used as fallbacks. |
| Validate before mutation | Destructive imports resolve and validate the complete input before replacement; unresolved identities cannot produce a partial desired collection. |
| Personal-app scope | RLS expansion, audit infrastructure, durable staging/replay, backup/DR, and production-scale rollout remain deferred unless the product needs them. |

## Screens & Components

This increment changes the data and API foundation rather than introducing a new screen. Existing collection, allocation, deck, and onboarding screens continue to consume their current APIs.

### Current collection and allocation surfaces

- Collection imports now land copies in the user's default storage location, including add and sync paths.
- Explicit allocation actions call current-schema atomic RPCs. The route authenticates first and passes the authenticated user ID into the RPC.
- AI or batch deck-card deltas use one transaction and return planned additions; sleeving, origin choice, and confirmation UX remain a later phase.
- Missing-card restoration returns a copy to default storage atomically when that supported action is used.

### Deferred lifecycle UI

Planned/Sleeved presentation, origin-picker UX, warn-before-apply import confirmation, and always-confirm AI controls are not implemented by this increment. Their future design must specify default, loading, empty, error, success, and partial states; keyboard behavior and responsive behavior; and accessible names/focus transitions before implementation begins.

## Interactions

1. **Explicit allocation:** the user selects a source and target, then the route calls one movement RPC. No second confirmation is added because intent is already explicit.
2. **Collection add/sync:** the complete CSV is parsed and resolved before current-schema insert/sync RPCs apply the rows. Reads of large supply collections paginate beyond PostgREST's default 1,000-row limit.
3. **Collection replace:** the route accepts one complete CSV request. The replacement RPC takes a per-user advisory transaction lock, validates the desired membership, removes the old rows, and inserts the new rows in one transaction. Any error rolls the operation back.
4. **Legacy import mode:** `upsert` is retained only as a compatibility alias to the safe V2 add path. Retired destructive modes return HTTP 410 rather than silently selecting an unsafe implementation.
5. **Deck replacement/delta:** deck-card diffs use the current JSONB contract. Batch AI changes resolve metadata before the single transaction and validate returned counts before responding success.

## Accessibility Notes

No new UI controls are introduced in this increment. Existing controls retain their current keyboard and screen-reader behavior. The deferred Planned/Sleeved and confirmation work must not be treated as complete until the design gate covers keyboard interaction, focus management, accessible labels, and all declared states.

## Design Decisions & Alternatives

| Decision | Chosen | Alternative | Rationale |
|---|---|---|---|
| Physical location model | Option A: storage `location_id` plus deck-slot `copy_id` | Unified location column | Option A matches the existing allocation implementation and avoids a destructive rewrite. |
| Transaction boundary | Service-role-only current-schema RPCs | Sequential route writes or client fallback | Sequential writes can orphan copies on crash; client fallback cannot guarantee atomicity. |
| Default storage | One per-user `user_locations` row marked `is_default` | Treat NULL as unsorted | A real default makes unsleeved copies locatable and gives imports a safe destination. |
| Copy identity | Database trigger validates copy and slot canonical identity | Trust route/card-name checks | Route checks can drift or be bypassed; the invariant belongs at the write boundary. |
| Replacement locking | Per-user advisory transaction lock inside `replace_collection` | Select membership before locking | Locking after selection can omit concurrent rows and produce an incomplete replacement. |
| Import staging | Complete preflight plus one replacement transaction | Durable import-run staging | Staging is production hardening and can be adopted later for the personal app without changing the current RPC contract. |

---

## Architecture

### Overview

The application uses server-side authenticated routes with an admin Supabase client. Routes retain explicit ownership checks and pass `p_user_id` to service-role-only RPCs. The database owns multi-row invariants and transaction boundaries. The implementation preserves Option A:

- **Storage copy:** `user_copies.location_id` points to a storage `user_locations` row.
- **Sleeved copy:** `deck_cards.copy_id` points to the copy and `user_copies.location_id` is cleared.
- **Planned slot:** `deck_cards.copy_id IS NULL`; the intended card remains separate from physical ownership.
- **Copy uniqueness:** `idx_deck_cards_unique_physical_copy` prevents one non-null copy from being assigned to multiple slots.

A hard XOR constraint is intentionally deferred until all sleeve/unsleeve transitions are implemented. The active movement RPCs still enforce the invariant for their own transitions.

### Components

| Component | Role | Location |
|---|---|---|
| Atomic movement RPCs | Lock contested resources, validate ownership/identity, and update related rows atomically | `supabase/migrations/20260912150000_atomic_collection_movements.sql`, `20260912151000_atomic_collection_batch_delete.sql`, `20260912162000_atomic_collection_boundary.sql`, `20260912163000_atomic_collection_insert_ids.sql` |
| Personal-scope hardening RPCs | Default storage, identity trigger, missing restoration, and replacement transaction | `supabase/migrations/20260912170000_atomic_collection_personal_scope.sql` |
| RPC result validators | Reject malformed success payloads, counts, IDs, booleans, and optional IDs | `src/lib/atomic-rpc.ts` |
| Import V2 | Complete preflight, paginated reads, default-location inserts, and transactional replacement | `src/lib/import-engine-v2.ts`, `src/app/api/collection/import/route.ts` |
| Collection/deck callers | Thin authenticated wrappers around current-schema RPCs | `src/app/api/allocation/`, `src/app/api/collection/`, `src/app/api/decks/`, `src/lib/` |
| Generated database contract | Types for current tables and RPC arguments/results | `src/types/supabase.ts` |

### Data Model

The current schema uses integer IDs for `user_copies.id`, `deck_cards.copy_id`, and `user_locations.id`.

- `user_locations.is_default` has a per-user uniqueness guarantee for storage locations.
- `_default_storage_location_id` / `_ensure_default_storage_location_id` resolve or create the default storage row.
- Collection imports pass the resolved default location to copy insertion RPCs.
- `validate_deck_card_copy_identity()` rejects a slot assignment when the copy's canonical card identity does not match the slot's card identity.
- `replace_collection(uuid, jsonb)` receives a fully resolved desired collection and returns structured counts.
- Service-role execution is granted explicitly; `PUBLIC` and `authenticated` execution is revoked for the changed security-definer write functions.

### State Management

Routes authenticate once, normalize inputs, and call the database boundary. They do not perform a sequence of source-clear/target-fill writes. Callers validate structured RPC results with `assertAtomicRpcSuccess` and field-specific validators before returning success to the client. Import clients retain chunking for append/custom endpoint flows, but the default full replacement is sent as one complete request so the server can preflight and commit it as one transaction.

### Error, Rollback, and Release Behavior

- RPC guard failures are returned as route errors and leave all rows unchanged.
- Replacement parse, identity, or insert failures roll back the transaction.
- Missing or malformed success payloads are treated as failures rather than optimistic success.
- The local migration lint gate could not run because Postgres was unavailable at `127.0.0.1:54322`; hosted privilege/integrity checks previously recorded in the delivery log remain the available evidence for this increment.
- The production build passes while the repository-wide typecheck and full test suite remain known baseline gates documented in the delivery log.

## Deferred Scope and Re-entry Triggers

| Deferred item | Why it is safe to defer | Trigger to bring it into scope |
|---|---|---|
| Planned/Sleeved UX and hard XOR | Current movement paths are guarded; incomplete unsleeve transitions make a hard constraint potentially incompatible today. | Implement the complete sleeve/unsleeve lifecycle or add a second user-facing lifecycle. |
| Origin picker and confirmation UX | No new implicit physical movement is introduced by this increment; explicit routes remain controlled. | Decklist imports, AI actions, or ambiguous sources start moving copies without direct user intent. |
| Broad RLS/multi-user hardening (TD-037) | The app remains private and server routes retain ownership guards; enabling incomplete policies could break current access. | Public/multi-user access or direct client writes become a product requirement. |
| Durable import staging/revisions/replay | Complete preflight and one transaction protect the current personal workflow without a destructive contract change. | Import size, reliability, or recovery needs exceed a single request/transaction. |
| Audit, alerts, backup/DR, capacity engineering | These are operational posture improvements, not required for the current private-app invariant. | Authoritative multi-user operation, incident requirements, or production SLOs are adopted. |
| Broader missing-card workflow | Only safe restoration is in scope; the user explicitly parked missing-card behavior. | The user needs found/lost/replacement workflows beyond restoration to default storage. |
