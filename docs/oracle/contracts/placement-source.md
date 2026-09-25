# Contract: Placement Source

## Status

DRAFT — pending owner approval. This contract defines the schema and API changes
required to add a `source` parameter to every placement write, per **D-009**:

> Drag-to-assign is the single placement mechanic. Every placement carries a
> `source` parameter (e.g. `manual`, `ai`) so undo, validation and audit logging
> are shared across manual and AI placement.

## Domain

A **placement** is any operation that sets `deck_cards.copy_id` to a non-null
value, thereby sleeving a physical or proxy copy into a deck slot.

### `PlacementSource`

| Value    | Meaning                                                                 |
|----------|-------------------------------------------------------------------------|
| `manual` | A user explicitly dragged, clicked, or confirmed the assignment.        |
| `ai`     | The assignment was produced by the allocation suggestion engine (auto-assign, AI brew delta, version restore, upgrade apply). |
| `import` | The assignment was created as part of a deck import (Built import, new-cards import, import-conflict proxy, import-claim finalization). |

## Schema change

Add a nullable column to `deck_cards` that records the source of the placement
that currently fills the slot.

- **Table:** `public.deck_cards`
- **Column:** `placement_source text`
- **Constraint:** `CHECK (placement_source IS NULL OR placement_source IN ('manual', 'ai', 'import'))`
- **Nullable:** yes
- **Semantics:**
  - `NULL` when `copy_id IS NULL` (planned / unresolved slot).
  - `'manual'`, `'ai'`, or `'import'` when `copy_id IS NOT NULL`.
- **Index:** `idx_deck_cards_placement_source ON deck_cards(user_id, placement_source) WHERE placement_source IS NOT NULL`.

### Why deck_cards and not a separate audit table

The source describes the *current* assignment of a slot. Because `copy_id` itself
lives on `deck_cards`, the source belongs on the same row: it is read and
written in the same atomic RPC, requires no extra join for the UI, and is
cleared automatically when the slot is released. A separate audit log is
out of scope for this contract; if the owner wants a full placement history,
that should be a follow-up task.

## Placement write paths

The following RPCs set `deck_cards.copy_id`. Each one accepts a `p_source`
parameter defaulting to `'manual'`. Callers that represent AI or import flows
must pass the appropriate value.

| # | RPC | API route / caller | Default source | Caller may override |
|---|-----|--------------------|----------------|---------------------|
| 1 | `assign_physical_copy` | `POST /api/allocation/assign` [Confirmed: `src/app/api/allocation/assign/route.ts`] | `manual` | no (user action) |
| 2 | `force_claim_copy` | `POST /api/allocation/claim-from-deck` [Confirmed: `src/app/api/allocation/claim-from-deck/route.ts`] | `manual` | no (user action) |
| 3 | `assign_free_copy` | `POST /api/allocation/assign-free-copy` [Confirmed: `src/app/api/allocation/assign-free-copy/route.ts`] | `manual` | no (user action) |
| 4 | `reassign_to_deck` | `POST /api/allocation/reassign-to-deck` [Confirmed: `src/app/api/allocation/reassign-to-deck/route.ts`] | `manual` | no (user action) |
| 5 | `undo_copy_move` | `POST /api/allocation/undo` [Confirmed: `src/app/api/allocation/undo/route.ts`] | `manual` | no (undo is a manual action) |
| 6 | `add_proxy_to_slot` | `POST /api/allocation/add-proxy` [Confirmed: `src/app/api/allocation/add-proxy/route.ts`] | `manual` | no (user action) |
| 7 | `replace_proxy_with_original` | `POST /api/allocation/replace-with-original` [Confirmed: `src/app/api/allocation/replace-with-original/route.ts`] | `manual` | no (user action) |
| 8 | `add_proxies_to_slots` | `POST /api/decks/[id]/cards/bulk` [Confirmed: `src/app/api/decks/[id]/cards/bulk/route.ts`] | `manual` | no (user action) |
| 9 | `batch_assign_deck` | `src/lib/supply-pool.ts` (called by `autoAssignDeck` and batch UI) [Confirmed: `src/lib/supply-pool.ts`, `src/lib/auto-assign.ts`] | caller-supplied | yes — `autoAssignDeck` passes `ai`; batch UI passes `manual` |
| 10 | `replace_deck_with_new_cards` | `src/lib/deck-import.ts` (new-cards import) [Confirmed: `src/lib/deck-import.ts`] | `import` | no |
| 11 | `reconcile_built_deck` | `src/lib/deck-import.ts` (Built import) [Confirmed: `src/lib/deck-import.ts`, `supabase/migrations/20260912180000_built_import_reconciliation.sql`] | `import` | no |
| 12 | `finalize_import_claims` | `src/lib/import-sleeve-claims.ts` [Confirmed: `src/lib/import-sleeve-claims.ts`, `supabase/migrations/20260917003229_finalize_import_claims_rpc.sql`] | `import` | no |
| 13 | `resolve_import_conflict_proxy` | `src/lib/import-sleeve-claims.ts` [Confirmed: `src/lib/import-sleeve-claims.ts`, `supabase/migrations/20260917102547_resolution_rpcs_by_card_identity.sql`] | `import` | no |

### Clearing operations (set `placement_source = NULL`)

These RPCs remove a copy from a slot. They are not placements and do not accept
a source parameter, but they must clear `placement_source` when setting
`copy_id` and `ownership_status` to `NULL`:

- `undo_copy_move` (release-to-storage branch) [Confirmed: `supabase/migrations/20260912150000_atomic_collection_movements.sql`]
- `release_deck_copies`
- `delete_deck_with_release`
- `unassign_copy_to_storage`
- `mark_copy_missing`
- `delete_user_copy` [Confirmed: `supabase/migrations/20260912150000_atomic_collection_movements.sql`]

### Out of scope

The following RPCs change deck composition but do **not** assign copies, so they
are not placement writes and do not set `placement_source`:

- `apply_deck_cards_diff` — inserts planned slots without copies.
- `apply_ai_deck_delta` — inserts/removes planned slots without copies.

## API contract

### Request bodies

Every placement API route accepts an optional `source` field. If omitted, the
server defaults to `manual`.

```ts
// POST /api/allocation/assign
interface AssignBody {
  deckCardsId: number
  physicalCopyId?: number
  source?: PlacementSource // default 'manual'
}

// POST /api/allocation/claim-from-deck
interface ClaimFromDeckBody {
  deckCardsId: number
  physicalCopyId: number
  source?: PlacementSource // default 'manual'
}

// POST /api/allocation/assign-free-copy
interface AssignFreeCopyBody {
  copyId?: number
  physicalCopyId?: number // deprecated alias
  targetDeckId: number
  cardName: string
  source?: PlacementSource // default 'manual'
}

// POST /api/allocation/reassign-to-deck
interface ReassignToDeckBody {
  copyId?: number
  physicalCopyId?: number // deprecated alias
  targetDeckId: number
  cardName: string
  source?: PlacementSource // default 'manual'
}

// POST /api/allocation/undo
interface UndoBody {
  deckCardsId: number
  physicalCopyId: number
  restoreTo: { deckCardsId: number } | null
  source?: PlacementSource // default 'manual'
}

// POST /api/allocation/add-proxy
interface AddProxyBody {
  deckCardsId: number
  cardId?: number
  cardDefinitionId?: number // deprecated alias
  source?: PlacementSource // default 'manual'
}

// POST /api/allocation/replace-with-original
interface ReplaceWithOriginalBody {
  deckCardsId?: number
  proxyCopyId?: number
  originalCopyId: number
  proxyStorageLocationId: number | null
  source?: PlacementSource // default 'manual'
}

// Internal: batch_assign_deck JSON element
interface BatchAssignmentElement {
  deckCardsId: number
  copyId?: number
  physicalCopyId?: number // deprecated alias
  clearDeckCardsId?: number | null
  source?: PlacementSource // default 'manual'
}
```

See [`placement-source.types.ts`](./placement-source.types.ts) for the
TypeScript definitions.

### RPC signatures

All placement RPCs add a `p_source text DEFAULT 'manual'` parameter. Existing
callers that do not pass it continue to work and record `'manual'`.

Example updated signature:

```sql
CREATE OR REPLACE FUNCTION public.assign_physical_copy(
  p_target_deck_card_id integer,
  p_copy_id integer,
  p_user_id uuid,
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
```

Inside each placement RPC, the `UPDATE deck_cards` statement that sets `copy_id`
must also set:

```sql
placement_source = p_source
```

Inside clearing RPCs, the `UPDATE deck_cards` statement that sets `copy_id = NULL`
must also set:

```sql
placement_source = NULL
```

## Validation rules

1. `placement_source` is rejected unless it is `NULL`, `'manual'`, `'ai'`, or
   `'import'` (database CHECK constraint).
2. A caller may not pass `source: 'ai'` on a user-initiated drag/click route.
   The API layer enforces this by not reading the `source` field on manual
   routes; it always uses `'manual'`.
3. The `batch_assign_deck` RPC is the only path where the caller legitimately
   passes `'ai'`; the auto-assign caller must set it, and the batch UI caller
   must set `'manual'`.
4. Import RPCs (`replace_deck_with_new_cards`, `reconcile_built_deck`,
   `finalize_import_claims`, `resolve_import_conflict_proxy`) hard-code
   `'import'` and do not expose a caller parameter.

## Backwards compatibility

- New `placement_source` column is nullable; existing filled slots are backfilled
  to `'manual'` during migration.
- RPCs use `DEFAULT 'manual'` for the new parameter; existing application code
  continues to call them without modification and records the correct source.
- The API routes do not require `source` in the request body.

## Multi-user design

`placement_source` is on `deck_cards`, which already carries `user_id` and is
subject to RLS. The index is scoped `(user_id, placement_source)`.

## Open questions

- Should the `source` be exposed in the deck card row API response so the UI can
  show an "AI-placed" badge? Recommended: yes, return it from the standard
  `deck_cards` select.
- Should clearing operations (release, unassign, mark missing) record an audit
  event with the *previous* source? This contract keeps only current-state
  source; a separate audit table would be needed for history.

## Related decisions

- **D-009** — source parameter on every placement.
- **D-007** — the allocation resolver is a suggestion engine; it writes through
  `batch_assign_deck` and therefore passes `source = 'ai'`.
