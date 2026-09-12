# Design Document: Deck Status Management

## Overview

Deck Status Management introduces a three-state lifecycle (`active`, `draft`, `inactive`) for decks, ensuring only active decks participate in card allocation calculations. Currently, the allocation resolver counts all `deck_cards` rows toward demand regardless of deck status — meaning draft/concept decks that are still being brewed claim physical card assignments and inflate the proxy report. This feature fixes that by:

1. Migrating the schema from `('active', 'draft', 'concept')` to `('active', 'draft', 'inactive')`
2. Filtering demand in `buildAllocationInput()` to only active decks
3. Filtering the shared cards API to only active decks
4. Releasing allocations when a deck leaves active status
5. Providing UI controls for status transitions and visual indicators on the deck list

The design leverages the existing Supabase/PostgreSQL backend, Next.js API routes with `requireAuth()`, and TanStack Query for client-side cache management.

## Architecture

```mermaid
graph TD
    subgraph "Client (React + TanStack Query)"
        DLP[Deck List Page]
        DDP[Deck Detail Page]
        BS[Brew Session]
    end

    subgraph "API Layer (Next.js Route Handlers)"
        SA[PATCH /api/decks/[id]/status]
        GA[GET /api/allocation]
        DA[GET /api/decks]
    end

    subgraph "Data Layer"
        AS[allocation-store.ts]
        AR[allocation-resolver.ts]
        DB[(Supabase PostgreSQL)]
    end

    DDP -->|status change| SA
    DLP -->|fetch with status filter| DA
    SA -->|update status| DB
    SA -->|release allocations| DB
    SA -->|trigger re-resolve| AS
    AS -->|join deck_cards + decks| DB
    AS -->|active-only demand| AR
    GA -->|active-only shared cards| DB
    BS -->|create deck as draft| DB
```

**Key Architectural Decisions:**

1. **Status filtering at the query level** — The `buildAllocationInput()` function will join `deck_cards` with `decks` to filter by status, rather than post-filtering in application code. This keeps the demand map accurate from the start.

2. **Allocation release on deactivation** — When a deck transitions away from `active`, we delete its `deck_allocations` rows and trigger a re-resolve. This ensures freed physical copies are immediately redistributable.

3. **No transition restrictions** — Any status can transition to any other status. This keeps the model simple and avoids complex state machine logic.

4. **URL-based filter persistence** — The deck list status filter is stored in URL query parameters (`?status=active,draft`) for shareability and back-button support.

## Components and Interfaces

### 1. Database Migration (`005_deck_status_inactive.sql`)

```sql
-- Step 1: Migrate 'concept' rows to 'draft'
UPDATE decks SET status = 'draft' WHERE status = 'concept';

-- Step 2: Drop existing constraint, add new one
ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_status_check;
ALTER TABLE decks ADD CONSTRAINT decks_status_check 
  CHECK (status IN ('active', 'draft', 'inactive'));
```

### 2. Status Transition API

**Endpoint:** `PATCH /api/decks/[id]/status`

```typescript
// Request
{ "status": "active" | "draft" | "inactive" }

// Response 200
{ "deck": { id, name, status }, "allocationRerun": boolean }

// Response 400
{ "error": "Invalid status. Must be one of: active, draft, inactive" }

// Response 404
{ "error": "Deck not found" }

// Response 401
{ "error": "Unauthorized" }
```

**Side effects on deactivation (active → draft/inactive):**
1. Delete all `deck_allocations` rows for the deck
2. Trigger `buildAllocationInput()` + `resolveAllocations()` + `applyAllocationOutput()`

**Side effects on activation (draft/inactive → active):**
1. Trigger allocation re-resolve to incorporate new demand

### 3. Modified `buildAllocationInput()` in `allocation-store.ts`

Current query:
```typescript
const { data: deckCardsRows } = await supabase
  .from('deck_cards')
  .select('card_name, deck_id')
  .eq('is_generic_land', false)
```

Modified query (join with decks to filter by active status):
```typescript
const { data: deckCardsRows } = await supabase
  .from('deck_cards')
  .select('card_name, deck_id, decks!deck_cards_deck_id_fkey(status)')
  .eq('is_generic_land', false)
  .eq('decks.status', 'active')
```

**Note:** Supabase's PostgREST `.eq()` on a joined table acts as a filter — rows where the joined `decks.status` is not `'active'` will have `decks: null`, which we filter out in the loop.

### 4. Modified `getSharedCardsAllocation()` in allocation route

The shared cards query will also join with `decks` to filter:
```typescript
// Only include deck_cards where the parent deck is active
const { data: page } = await supabase
  .from('deck_cards')
  .select('card_name, deck_id, decks!deck_cards_deck_id_fkey(status)')
  .eq('decks.status', 'active')
  .range(offset, offset + PAGE - 1)
```

### 5. UI Components

#### `StatusBadge` Component
A small chip component displaying the deck's status with color coding:
- **Active:** Green background (`rgba(29, 158, 117, 0.15)`), green text (`#1D9E75`)
- **Draft:** Blue background (`rgba(55, 138, 221, 0.15)`), blue text (`#378ADD`)
- **Inactive:** Grey background (`rgba(255, 255, 255, 0.08)`), muted text

#### `StatusControl` Component (Deck Detail Page)
A segmented button group allowing status transitions. When transitioning to `inactive`, shows a confirmation dialog warning about allocation release.

#### Deck List Status Filter
Chip/toggle buttons (matching the collection page filter pattern) allowing multi-select filtering by status values. Persisted to URL search params.

### 6. Brew Session Integration

The existing brew session deck creation flow sets `status = 'draft'` on the deck. The current schema already defaults to `'active'`, so the brew session must explicitly set `status: 'draft'` when inserting. The `DraftBanner` component on the deck detail page already handles this display.

## Data Models

### Deck Status Enum Values

| Status | Description | Allocation Participation |
|--------|-------------|------------------------|
| `active` | Live deck, ready for play | ✅ Included in demand |
| `draft` | Under construction via brew session | ❌ Excluded from demand |
| `inactive` | Shelved/retired deck | ❌ Excluded from demand |

### Database Schema Change

```sql
-- Before
status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'draft', 'concept'))

-- After
status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'draft', 'inactive'))
```

### API Request/Response Types

```typescript
// Status transition request
interface StatusUpdateRequest {
  status: 'active' | 'draft' | 'inactive'
}

// Status transition response
interface StatusUpdateResponse {
  deck: {
    id: number
    name: string
    status: 'active' | 'draft' | 'inactive'
  }
  allocationRerun: boolean
}

// Deck list query params
interface DeckListParams {
  status?: string // comma-separated: "active,draft"
}
```

### TanStack Query Keys

| Query Key | Invalidated On |
|-----------|---------------|
| `['decks']` | Status change |
| `['decks', deckId]` | Status change for that deck |
| `['shared-cards']` | Status change (active ↔ non-active) |
| `['allocation', deckId]` | Status change for that deck |
| `['proxy-report']` | Status change (active ↔ non-active) |



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Status validation rejects invalid values

*For any* string that is not one of `'active'`, `'draft'`, or `'inactive'`, the status transition endpoint SHALL reject it with a 400 error. Conversely, *for any* string that IS one of the three valid values, the endpoint SHALL accept it.

**Validates: Requirements 1.1, 2.2**

### Property 2: All valid status transitions persist correctly

*For any* existing deck and *for any* pair of valid status values (from, to), transitioning from the current status to the target status SHALL succeed, and the deck's status column SHALL reflect the new value immediately after.

**Validates: Requirements 2.1, 2.5**

### Property 3: Only active decks contribute to allocation demand

*For any* set of decks with mixed statuses and *for any* card appearing in those decks, the demand map produced by `buildAllocationInput()` SHALL contain that card only if at least one deck containing it has status `'active'`. No card exclusively in `'draft'` or `'inactive'` decks SHALL appear in the demand map.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 4: Allocations are released when a deck leaves active status

*For any* deck with status `'active'` that transitions to either `'draft'` or `'inactive'`, all `deck_allocations` rows for that deck SHALL be deleted. The count of `deck_allocations` rows for that deck after the transition SHALL be zero.

**Validates: Requirements 4.1, 4.2**

### Property 5: Shared cards endpoint only counts active decks

*For any* configuration of decks and cards, the `/api/allocation?view=shared` endpoint SHALL return only cards that appear in two or more decks with status `'active'`. Cards shared exclusively across `'draft'` and/or `'inactive'` decks SHALL not appear in the results.

**Validates: Requirements 5.1, 5.2**

### Property 6: Shared cards deckId filter respects status

*For any* deck with status `'draft'` or `'inactive'`, querying `/api/allocation?view=shared&deckId=X` with that deck's ID SHALL return an empty result set, regardless of how many cards the deck shares with other decks.

**Validates: Requirements 5.3**

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid status value in PATCH body | 400 with descriptive message listing valid values |
| Deck ID does not exist | 404 with "Deck not found" |
| Unauthenticated request | 401 via `requireAuth()` (existing pattern) |
| Allocation re-resolve fails after status change | Status change is committed, error logged, response includes `allocationRerun: false` with error detail. UI shows warning toast. |
| Database constraint violation (race condition) | 500 with generic error; client retries via TanStack Query |
| deckId filter references non-active deck | 200 with empty array and `message: "Deck is not active"` |

**Design Decision:** Status changes are committed independently of allocation re-resolve. If the re-resolve fails, the user's deck status is still updated (the desired state), but the allocation report may be temporarily stale. The response signals this via `allocationRerun: false`, and the UI can show a toast prompting manual re-resolve.

## Testing Strategy

### Unit Tests (Example-Based)

- Status badge renders correctly for each status value (3 examples)
- Status filter persists to URL query params
- Confirmation dialog appears on inactive transition
- Error state reverts status control
- Non-existent deck returns 404
- Unauthenticated request returns 401
- Brew session creates deck with `draft` status
- Default deck creation defaults to `active`

### Property-Based Tests (fast-check)

The project uses TypeScript with Vitest. Property tests will use [fast-check](https://github.com/dubzzz/fast-check) for property-based testing.

**Configuration:**
- Minimum 100 iterations per property
- Each test tagged with the property it validates

| Property | Generator Strategy |
|----------|-------------------|
| Property 1: Status validation | `fc.string()` for invalid, `fc.constantFrom('active', 'draft', 'inactive')` for valid |
| Property 2: Valid transitions | `fc.record({ from: fc.constantFrom(...), to: fc.constantFrom(...) })` for all 9 pairs |
| Property 3: Active-only demand | `fc.array(fc.record({ deckId, status, cards }))` with mixed statuses |
| Property 4: Allocation release | `fc.record({ allocations: fc.array(...) })` with deck transitioning away from active |
| Property 5: Shared cards active-only | `fc.array(fc.record({ deckId, status, cards }))` verifying shared card counting |
| Property 6: deckId filter | `fc.constantFrom('draft', 'inactive')` for deck status with shared cards |

### Integration Tests

- Migration smoke test: constraint updated, concept→draft migration, default preserved
- Full allocation cycle: activate deck → demand included → deactivate → demand removed → reallocated
- Brew session flow: create draft deck → promote to active → allocations computed

### Test Tag Format

```typescript
// Feature: deck-status-management, Property 3: Only active decks contribute to allocation demand
```
