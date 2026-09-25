# Contract: Allocation Suggestion Engine

Status: ACTIVE  
Owner: Architect  
Locked decision: D-007

## 1. Scope and purpose

This contract defines the **read-only** allocation suggestion engine for Oracle.
It reuses the V2 resolver compute layer to propose how physical copies could be
assigned to deck slots, **without writing any allocation state**.

The destructive clear-and-recompute Allocation Resolver is retired as a write
path per locked decision **D-007**.
[Confirmed: docs/oracle/decisions.md]

The engine is used by:
- The interactive card picklist (per-card candidate ranking).
- Bulk suggestion flows (e.g. import reconciliation, deck health checks).
- Any UI that needs to show "what could go here?" without mutating `deck_cards`.

## 2. Core principles

1. **Read-only.** The suggestion engine never inserts, updates, or deletes
   `deck_cards`, `user_copies`, `user_cards`, `decks`, or any allocation-related
   row. It returns proposals only.
2. **No side effects.** Calling a suggestion endpoint must not change RLS-visible
   state, audit logs, or deck versions.
3. **Incremental.** Suggestions work alongside existing assignments. A card
   already assigned to another deck is still returned as a Tier 3 candidate.
4. **Equal-footing.** All active decks claim cards equally. There is no special
   "brewing" vs "boxed" preference in the scoring tiers.
   [Confirmed: src/lib/allocation-candidates.ts]
5. **Reuses V2 compute.** The ranking, tier classification, and scoring logic live
   in `src/lib/allocation-candidates.ts`.
   [Confirmed: src/lib/allocation-candidates.ts]

## 3. Data model (minimal)

The engine reads the following tables only:

- `user_cards` — canonical card identity; joined by `card_name`.
- `user_copies` — physical copies owned by the user (`is_proxy = true` for proxies).
- `deck_cards` — current deck membership and copy assignment (`copy_id` FK to
  `user_copies.id`).
- `decks` — deck name and active state (`is_active`).
- `user_locations` — storage location name.

[Confirmed: src/types/supabase.ts]

Column semantics:
- `user_copies.printing_id` holds a **scryfall_id** (specific printing).
  [Confirmed: src/types/supabase.ts, src/lib/allocation-candidates.ts]
- `user_cards.oracle_id` holds the canonical **oracle_id** across printings.
  [Confirmed: src/types/supabase.ts]
- `deck_cards.copy_id` is the FK to the physical copy currently filling the slot.
  [Confirmed: src/types/supabase.ts]

## 4. Identifier rules

- `copy_id` refers to `physical_copies.id` / `user_copies.id` (a specific owned
  finish/printing).
- `deck_card_id` refers to `deck_cards.id` (a card's membership in a deck).
- `card_name` is used for identity matching only when a `copy_id` is not yet
  selected.
- `scryfall_id` identifies a specific printing. `oracle_id` identifies the
  canonical card across all printings.
  [Confirmed: src/types/supabase.ts, src/lib/allocation-candidates.ts]

## 5. API surface

All endpoints are authenticated. Unauthenticated requests are rejected by the
route's auth guard before any data is read.

### 5.1 Get ranked candidates for a single card

```
GET /api/allocation/candidates?cardName={cardName}&preferredScryfall={scryfall_id}
```

[Confirmed: src/app/api/allocation/candidates/route.ts]

#### Request

| Query parameter | Type | Required | Description |
| --------------- | ---- | -------- | ----------- |
| `cardName` | `string` | yes | Card name to resolve. Double-faced cards use the full `"Name // Name"` form; the engine falls back to the front face if needed. |
| `preferredScryfall` | `string` | no | Preferred `scryfall_id` printing. Adds `+2` to the within-tier score when a candidate's `printing_id` matches. |

#### Response `200 OK`

```json
{
  "candidates": [
    {
      "entry": {
        "physicalCopyId": 42,
        "cardId": 7,
        "printingId": "abc-123",
        "finish": "nonfoil",
        "isProxy": false,
        "condition": "near_mint",
        "locationId": 3,
        "locationName": "Trade binder",
        "assignedTo": null
      },
      "tier": 1,
      "tierLabel": "Free original in storage",
      "withinTierScore": 2,
      "autoSelectable": true
    }
  ]
}
```

[Confirmed: src/lib/allocation-candidates.ts]

#### Errors

| Status | `error` value | When |
| ------ | ------------- | ---- |
| `400` | `"cardName query parameter is required"` | `cardName` missing or empty. |
| `404` | (auth guard) | User is not authenticated. |
| `500` | `"Failed to fetch candidates: {message}"` | Unexpected database or compute failure. |

[Confirmed: src/app/api/allocation/candidates/route.ts]

### 5.2 Get ranked candidates for many cards

```
POST /api/allocation/candidates/batch
```

Batch endpoint for flows that need candidates for many cards at once (e.g. the
import reconciliation grid or a deck's full list). Uses a POST body because the
list of names can exceed practical query-string length limits.

#### Request body

```json
{
  "cardNames": ["Sol Ring", "Command Tower", "Arcane Signet"],
  "preferredScryfallByName": {
    "Sol Ring": "abc-123"
  }
}
```

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `cardNames` | `string[]` | yes | Unique or non-unique card names to look up. |
| `preferredScryfallByName` | `Record<string, string \| null>` | no | Per-name preferred `scryfall_id`. Names not present use `null`. |

#### Response `200 OK`

```json
{
  "results": {
    "Sol Ring": [ /* RankedCandidate[] */ ],
    "Command Tower": [ /* RankedCandidate[] */ ],
    "Arcane Signet": [ /* RankedCandidate[] */ ]
  }
}
```

Every name in `cardNames` appears as a key in `results`, even if the candidate
list is empty. An empty candidate list is represented as a single synthetic
Tier 5 candidate indicating "print new proxy" is the only option.

[Confirmed: src/lib/allocation-candidates.ts]

#### Errors

| Status | `error` value | When |
| ------ | ------------- | ---- |
| `400` | `"cardNames array is required"` | `cardNames` missing or not an array. |
| `400` | `"cardNames cannot be empty"` | `cardNames` is an empty array. |
| `400` | `"Invalid JSON body"` | Body is not valid JSON. |
| `404` | (auth guard) | User is not authenticated. |
| `500` | `"Failed to fetch batch candidates: {message}"` | Unexpected database or compute failure. |

## 6. Tier semantics

Candidates are classified into tiers. Lower tiers are better.

| Tier | Label | Source | `autoSelectable` | Meaning |
| ---- | ----- | ------ | ---------------- | ------- |
| 1 | `Free original in storage` | Existing `user_copies` row with `is_proxy = false` and no `deck_cards` assignment. | `true` | Best option. Use this copy as-is. |
| 2 | `Free proxy in storage` | Existing `user_copies` row with `is_proxy = true` and no `deck_cards` assignment. | `true` | Use this proxy as-is. |
| 3 | `Assigned to another deck` | Existing `user_copies` row already assigned to a `deck_cards` row. | `false` | Requires user decision; all decks claim equally. |
| 5 | `Print new proxy` | Synthetic — no physical copy exists. | `false` | Only option is to create a new proxy. |

Notes:
- Tier 4 was intentionally removed when all decks started claiming cards equally.
  [Confirmed: src/lib/allocation-candidates.ts]
- Tier 5 is synthetic: `physicalCopyId = -1`, `cardId = -1`, `isProxy = true`, and
  `assignedTo = null`.
  [Confirmed: src/lib/allocation-candidates.ts]

## 7. Within-tier scoring

The engine scores candidates inside the same tier using the following additive
rules:

| Rule | Score | Condition |
| ---- | ----- | ----------- |
| Printing match | `+2` | `preferredScryfallId` is provided and equals the candidate's `printing_id`. |
| Non-foil | `+1` | Candidate's `finish === "nonfoil"`. |
| Near mint | `+1` | Candidate's `condition === "near_mint"`. |

Results are sorted by tier ascending, then `withinTierScore` descending.

[Confirmed: src/lib/allocation-candidates.ts]

## 8. Allowed compute functions and RPCs

### 8.1 Application-layer compute (TypeScript)

The suggestion engine may call **only** the following read-only functions:

- `getRankedCandidates(cardName, userId, preferredScryfallId?)`
- `getBatchRankedCandidates(cardNames, userId)`
- `fetchEnrichedSupply(cardName, userId)`
- `fetchBatchEnrichedSupply(cardNames, userId)`
- `classifyTier(entry)`
- `scoreCandidate(entry, preferredScryfallId)`

[Confirmed: src/lib/allocation-candidates.ts]

### 8.2 Database reads

Direct `SELECT` against:
- `public.user_cards`
- `public.user_copies`
- `public.deck_cards`
- `public.decks`
- `public.user_locations`

No RPCs are required for the core suggestion engine. The existing
`get_import_allocations(p_user_id)` RPC is a separate reconciliation view and
may be consumed by callers that want a card-level allocation summary, but it is
not part of the candidate-ranking compute layer.
[Confirmed: supabase/migrations/20260917205918_get_import_allocations_rpc.sql]

### 8.3 Allowed allocation write paths

All allocation mutations must be atomic and scoped to a single copy or single
deck slot:

- `assign_physical_copy(copy_id, target_deck_card_id, user_id)`
- `assign_free_copy(card_name, copy_id, target_deck_id, user_id)`
- `reassign_to_deck(card_name, copy_id, target_deck_id, user_id)`
- `batch_assign_deck(assignments, deck_id, user_id)` — scoped to one deck
- `replace_proxy_with_original(...)`
- `add_proxy_to_slot(...)` / `add_proxies_to_slots(...)`
- `unassign_copy_to_storage(copy_id, user_id)`
- `undo_copy_move(...)`
- `force_claim_copy(...)`
- `_move_copy_to_slot(...)`

Collection-level mutations (`replace_collection`, `apply_collection_sync`,
`delete_user_copies`) may release allocations only via FK cascade or explicit
per-copy removal as part of their own transaction; they are not allocation RPCs
and must not be used as allocation resolvers.

## 9. Retired write paths

The following destructive clear-and-recompute pattern is retired and must not be
reintroduced:

- `allocation_clear_active_decks(p_user_id UUID)` — bulk cleared `copy_id` /
  `ownership_status` on all active-deck `deck_cards` rows as a prelude to
  recomputation.

No RPC may clear allocations across multiple decks or multiple cards in a single
call.

## 10. Forbidden operations

The suggestion engine **must not** invoke or trigger any of the following:

- `allocation_clear_active_decks` RPC (retired per D-007)
- Any bulk clear-and-recompute allocation pattern
- Any `INSERT`, `UPDATE`, or `DELETE` on `deck_cards`, `user_copies`, `user_cards`,
  `decks`, `user_locations`, or `import_sleeve_claims`
- Any operation that creates deck versions, audit log entries, or side effects

[Confirmed: docs/oracle/decisions.md, src/types/supabase.ts]

## 11. Error shapes

All error responses use this JSON shape:

```ts
interface AllocationSuggestionError {
  /** Human-readable error message. */
  error: string
  /** Optional stable code for programmatic handling. Not present on all errors. */
  code?: string
}
```

Read-only suggestions do not produce `409 Conflict` / `stale` errors because they
never contend for writes. A `409` from the auth layer or middleware is outside
the engine's scope.

## 12. Multi-user considerations

Every query in the compute layer must filter by `user_id`:
- `user_cards.user_id`
- `user_copies.user_id`
- `deck_cards.user_id`
- `decks.user_id`

The current implementation already applies these filters.
[Confirmed: src/lib/allocation-candidates.ts]

## 13. Migration history

- `20260925000000_retire_destructive_allocation_rpc.sql` — drops
  `allocation_clear_active_decks`.

## 14. Path citations

- D-007 (retire destructive resolver, reuse compute as suggestion engine):
  [Confirmed: docs/oracle/decisions.md]
- V2 compute layer implementation:
  [Confirmed: src/lib/allocation-candidates.ts]
- Existing single-card API route:
  [Confirmed: src/app/api/allocation/candidates/route.ts]
- Schema types for the underlying tables:
  [Confirmed: src/types/supabase.ts]
- Import allocation reconciliation RPC (related but separate view):
  [Confirmed: supabase/migrations/20260917205918_get_import_allocations_rpc.sql]
- Existing write paths that the engine must not use:
  [Confirmed: src/app/api/allocation/assign/route.ts]
  [Confirmed: src/types/supabase.ts]
