# Design Document: Proxy Ownership Layer

## Overview

The Proxy Ownership Layer denormalises the allocation resolver's output directly into the `deck_cards` table and exposes it across the Oracle UI via a universal badge component, a conflict alert in the upgrade panel, a dedicated Allocation tab on `/collection`, and bidirectional tag sync back to Archidekt.

The architecture follows the existing pattern: a pure function (`computeAllocations`) produces a deterministic output, a store layer (`allocation-store.ts`) persists it, and a new **ownership-resolver** orchestration layer maps that persisted output into the `deck_cards` schema. The UI reads `deck_cards` directly — no joins required.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Sync / Manual Action Trigger                    │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│              ownership-resolver.ts (Orchestration)                    │
│                                                                      │
│  1. buildAllocationInput(db)                                         │
│  2. computeAllocations(input)       ← existing pure function         │
│  3. applyAllocationOutput(db, output)                                │
│  4. denormaliseOwnership(db, output) ← NEW: writes to deck_cards     │
│  5. queueTagWritebacks(db, diff)    ← NEW: queues Archidekt writes   │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   deck_cards     │  │ deck_allocations │  │  archidekt-sync  │
│ (ownership cols) │  │  (existing)      │  │  (tag writer)    │
└──────────────────┘  └──────────────────┘  └──────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           UI Layer                                    │
│                                                                      │
│  OwnershipBadge · ConflictAlert · AllocationTab · DeckListTable      │
└──────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Database Migration (`db/migrations/012-ownership-columns.sql`)

Adds two columns to `deck_cards`:

```sql
ALTER TABLE deck_cards ADD COLUMN ownership_status TEXT DEFAULT NULL
  CHECK (ownership_status IN ('original', 'proxy', 'not_owned'));

ALTER TABLE deck_cards ADD COLUMN proxy_of_deck_id INTEGER DEFAULT NULL
  REFERENCES decks(id) ON DELETE SET NULL;
```

The `CHECK` constraint enforces the allowed values at the DB level. `proxy_of_deck_id` uses `ON DELETE SET NULL` so that deleting a deck doesn't orphan rows.

### 2. Ownership Resolver (`src/lib/ownership-resolver.ts`)

Orchestration module that bridges `computeAllocations` output → `deck_cards` denormalisation.

```typescript
import type Database from 'better-sqlite3'
import type { AllocationOutput, AllocationRecord } from './allocation-resolver'
import { computeAllocations } from './allocation-resolver'
import { buildAllocationInput, applyAllocationOutput } from './allocation-store'

export interface DenormalisationResult {
  rowsUpdated: number
  originalCount: number
  proxyCount: number
  notOwnedCount: number
}

/**
 * Run the full ownership resolution pipeline:
 * 1. Build input from DB state
 * 2. Compute allocations (pure)
 * 3. Persist to deck_allocations
 * 4. Denormalise into deck_cards
 * 5. Return diff for tag write-back queueing
 */
export function resolveOwnership(db: Database.Database): {
  result: DenormalisationResult
  diff: import('./allocation-store').AllocationDiff
} {
  const input = buildAllocationInput(db)
  const output = computeAllocations(input)
  const diff = applyAllocationOutput(db, output)
  const result = denormaliseOwnership(db, output)
  return { result, diff }
}

/**
 * Write ownership_status and proxy_of_deck_id to deck_cards
 * based on the allocation output.
 *
 * Rules:
 * - role='original' → ownership_status='original', proxy_of_deck_id=NULL
 * - role='proxy'    → ownership_status='proxy', proxy_of_deck_id=<deck with original>
 * - no allocation   → ownership_status='not_owned', proxy_of_deck_id=NULL
 */
export function denormaliseOwnership(
  db: Database.Database,
  output: AllocationOutput
): DenormalisationResult {
  let originalCount = 0
  let proxyCount = 0
  let notOwnedCount = 0

  // Build lookup: cardName → deckId that holds the original
  const originalHolders = new Map<string, number>()
  for (const alloc of output.allocations) {
    if (alloc.role === 'original') {
      originalHolders.set(alloc.cardName, alloc.deckId)
    }
  }

  const updateStmt = db.prepare(`
    UPDATE deck_cards
    SET ownership_status = ?, proxy_of_deck_id = ?
    WHERE card_name = ? AND deck_id = ?
  `)

  const allocatedKeys = new Set<string>()

  const txn = db.transaction(() => {
    for (const alloc of output.allocations) {
      const key = `${alloc.cardName}|${alloc.deckId}`
      allocatedKeys.add(key)

      if (alloc.role === 'original') {
        updateStmt.run('original', null, alloc.cardName, alloc.deckId)
        originalCount++
      } else {
        // proxy — find which deck holds the original
        const holderDeckId = originalHolders.get(alloc.cardName) ?? null
        updateStmt.run('proxy', holderDeckId, alloc.cardName, alloc.deckId)
        proxyCount++
      }
    }

    // Mark unallocated deck_cards as 'not_owned'
    const allDeckCards = db.prepare(
      'SELECT card_name, deck_id FROM deck_cards'
    ).all() as { card_name: string; deck_id: number }[]

    for (const row of allDeckCards) {
      const key = `${row.card_name}|${row.deck_id}`
      if (!allocatedKeys.has(key)) {
        updateStmt.run('not_owned', null, row.card_name, row.deck_id)
        notOwnedCount++
      }
    }
  })

  txn()

  return {
    rowsUpdated: originalCount + proxyCount + notOwnedCount,
    originalCount,
    proxyCount,
    notOwnedCount,
  }
}
```

### 3. Sync Engine Integration

The existing sync pipeline in `archidekt-sync.ts` calls into the ownership resolver after delta application:

```typescript
// In the sync cycle, after deck delta is applied:
import { resolveOwnership } from './ownership-resolver'

// ... after delta application ...
const { result, diff } = resolveOwnership(db)

// Queue Archidekt tag write-backs for changed rows
if (diff.originalToProxy.length > 0 || diff.proxyToOriginal.length > 0) {
  await writeAllocationDiffToArchidekt(db, diff, client)
}

// Only AFTER ownership resolution: trigger recommendations, Notion push
```

If `resolveOwnership` throws, the sync engine catches the error, logs it with deck ID and error detail, and skips downstream processing (recommendations, Notion push) for affected decks.

### 4. Allocation API (`src/app/api/allocation/route.ts`)

New API route for manual override actions from the Allocation tab.

```typescript
// POST /api/allocation/reassign
interface ReassignRequest {
  cardName: string
  targetDeckId: number  // deck that should hold the original
}

// Response: { success: boolean, allocation: AllocationRow[] }
```

The handler:
1. Calls `setPriorityOverride(db, cardName, targetDeckId, 'pin_original')`
2. Calls `resolveOwnership(db)` to cascade to all decks sharing that card
3. Returns the updated allocation state for that card across all decks

### 5. Allocation Query API (`src/app/api/allocation/route.ts`)

```typescript
// GET /api/allocation?deckId=<optional>
interface AllocationResponse {
  cards: AllocationCardGroup[]
}

interface AllocationCardGroup {
  cardName: string
  decks: {
    deckId: number
    deckName: string
    ownershipStatus: 'original' | 'proxy' | 'not_owned'
    proxyOfDeckId: number | null
  }[]
}
```

Fetches all cards appearing in 2+ decks with their per-deck ownership status. When `deckId` query param is provided, filters to cards that include that deck AND at least one other.

### 6. OwnershipBadge Component (`src/components/OwnershipBadge.tsx`)

Replaces the existing `ProxyBadge` with a richer status indicator.

```typescript
'use client'

interface OwnershipBadgeProps {
  status: 'original' | 'proxy' | 'not_owned'
  className?: string
}

const CONFIG = {
  original: { glyph: '●', label: 'Original', color: 'text-teal-600', bg: 'bg-teal-50' },
  proxy:    { glyph: '◐', label: 'Proxy',    color: 'text-amber-600', bg: 'bg-amber-50' },
  not_owned:{ glyph: '○', label: 'Not owned', color: 'text-gray-500', bg: 'bg-gray-100' },
} as const

export function OwnershipBadge({ status, className }: OwnershipBadgeProps) {
  const { glyph, label, color, bg } = CONFIG[status]

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color} ${bg} ${className ?? ''}`}
      aria-label={label}
    >
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  )
}
```

The badge renders on every card surface: deck list table rows, card grid items, upgrade panel recommendation cards, and allocation tab rows.

### 7. ConflictAlert Component (`src/components/ConflictAlert.tsx`)

Inline warning rendered on upgrade recommendation cards.

```typescript
'use client'

import { AlertTriangle } from 'lucide-react'

interface ConflictAlertProps {
  affectedDeckName: string
  cardName: string
}

export function ConflictAlert({ affectedDeckName, cardName }: ConflictAlertProps) {
  return (
    <div
      role="alert"
      className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Adding <strong>{cardName}</strong> would move the original from{' '}
        <strong>{affectedDeckName}</strong>, creating a proxy there.
      </span>
    </div>
  )
}
```

### 8. Allocation Tab (`src/components/AllocationTab.tsx`)

Client component using TanStack Query to fetch and display cross-deck ownership.

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { OwnershipBadge } from './OwnershipBadge'

export function AllocationTab({ deckFilter }: { deckFilter?: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['allocation', deckFilter],
    queryFn: () => {
      const url = deckFilter
        ? `/api/allocation?deckId=${deckFilter}`
        : '/api/allocation'
      return fetch(url).then(r => r.json())
    },
    staleTime: 5 * 60 * 1000,
  })

  // ... render table with card rows, deck columns, ownership badges, reassign actions
}
```

### 9. Collection Page Tab Integration

The `/collection` page gains a tab bar switching between the existing card grid ("Collection" tab) and the new `AllocationTab`.

```typescript
// src/app/collection/page.tsx — adds Tabs from shadcn/ui
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AllocationTab } from '@/components/AllocationTab'

// Wrap existing grid in <TabsContent value="collection">
// Add <TabsContent value="allocation"><AllocationTab /></TabsContent>
```

### 10. Archidekt Tag Write-back Integration

The existing `writeAllocationDiffToArchidekt` function already handles writing proxy tags. The ownership resolver hooks into this by passing the diff from `applyAllocationOutput` to the tag writer.

New behavior for reading tags on import:
- When the sync engine reads deck state from Archidekt, any card line containing `#!Proxy` or `[Proxy]` is interpreted as a `pin_proxy` override and added to the `overrides` map before running `computeAllocations`.

## Data Models

### deck_cards table (extended)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| ownership_status | TEXT | YES (NULL until first resolution) | 'original', 'proxy', or 'not_owned' |
| proxy_of_deck_id | INTEGER | YES | FK → decks(id). Non-null only when status='proxy' |

### Invariants

1. `ownership_status = 'original'` ⟹ `proxy_of_deck_id IS NULL`
2. `ownership_status = 'proxy'` ⟹ `proxy_of_deck_id IS NOT NULL` AND references a deck where the same card has `ownership_status = 'original'`
3. `ownership_status = 'not_owned'` ⟹ `proxy_of_deck_id IS NULL`
4. For any card name, at most `SUM(collection.quantity)` decks can have `ownership_status = 'original'`

## Conflict Detection Logic

When evaluating upgrade recommendations for conflict potential:

```typescript
function detectConflict(
  cardName: string,
  targetDeckId: number,
  db: Database.Database
): { hasConflict: boolean; affectedDeckName?: string } {
  // Check if the card exists in the collection
  const supply = db.prepare(
    'SELECT COALESCE(SUM(quantity), 0) as total FROM collection WHERE card_name = ?'
  ).get(cardName) as { total: number }

  if (supply.total === 0) {
    // Not owned — no conflict (user would need to buy it)
    return { hasConflict: false }
  }

  // Check if the card is already allocated as original in another deck
  const existingOriginal = db.prepare(
    `SELECT dc.deck_id, d.name as deck_name
     FROM deck_cards dc
     JOIN decks d ON d.id = dc.deck_id
     WHERE dc.card_name = ? AND dc.ownership_status = 'original' AND dc.deck_id != ?`
  ).get(cardName, targetDeckId) as { deck_id: number; deck_name: string } | undefined

  // Check if adding to target would exceed supply
  const currentDemand = db.prepare(
    'SELECT COUNT(*) as count FROM deck_cards WHERE card_name = ?'
  ).get(cardName) as { count: number }

  if (existingOriginal && currentDemand.count >= supply.total) {
    return { hasConflict: true, affectedDeckName: existingOriginal.deck_name }
  }

  return { hasConflict: false }
}
```

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `resolveOwnership` throws during sync | Sync engine catches, logs `{ deckId, error }`, halts recommendations/Notion push for affected decks |
| Manual reassign API call fails | Response 500, client reverts optimistic update, shows error toast |
| Archidekt tag write fails for a card | `deck_allocations.written_to_archidekt` stays `0`, retried next sync cycle |
| `proxy_of_deck_id` references a deleted deck | FK constraint `ON DELETE SET NULL` clears the reference; next resolution cycle repairs it |
| Migration fails on existing data | Migration uses `DEFAULT NULL` — existing rows get NULL until first resolution runs |

## Pipeline Ordering

```
Archidekt Sync Delta Applied
  │
  ▼
resolveOwnership(db)          ← MUST complete before downstream
  │
  ├─► Recommendations generated (reads fresh ownership_status)
  ├─► Notion push (reads fresh ownership_status)
  └─► Tag write-back queued (from diff)
```

If the resolver fails, the pipeline short-circuits. Downstream consumers never see stale ownership data because they're gated behind the resolver.

## Testing Strategy

- **Property-based tests (fast-check + Vitest):** Cover the 9 correctness properties below. Generate random allocation inputs (varying demand maps, supply maps, deck priorities, overrides) and assert invariants hold across 100+ iterations per property.
- **Unit tests:** Cover OwnershipBadge rendering for each status, ConflictAlert rendering, error handling paths (resolver failure halts pipeline, API returns 500 on reassign failure, optimistic revert).
- **Integration tests:** Verify the full sync pipeline ordering (delta → resolve → recommendations), manual override API end-to-end, and Archidekt tag read-back interpretation.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Ownership status and proxy_of_deck_id consistency

*For any* `deck_cards` row after ownership resolution, the following invariant holds:
- If `ownership_status = 'original'`, then `proxy_of_deck_id` is NULL
- If `ownership_status = 'proxy'`, then `proxy_of_deck_id` is a non-null deck ID where that card has `ownership_status = 'original'`
- If `ownership_status = 'not_owned'`, then `proxy_of_deck_id` is NULL

**Validates: Requirements 1.3, 1.4, 1.5**

### Property 2: Resolver denormalisation faithfulness

*For any* allocation output produced by `computeAllocations`, after `denormaliseOwnership` executes, every `deck_cards` row has a non-null `ownership_status` that matches the allocation output: records with `role = 'original'` map to `ownership_status = 'original'`, records with `role = 'proxy'` map to `ownership_status = 'proxy'`, and cards in `deck_cards` with no allocation record map to `ownership_status = 'not_owned'`.

**Validates: Requirements 2.2, 2.3, 2.4, 2.5**

### Property 3: Override cascade completeness

*For any* manual override (pin_original or pin_proxy) applied to a card that appears in N decks, after `resolveOwnership` executes, all N decks containing that card have updated `ownership_status` values consistent with the new allocation output.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 4: Conflict detection correctness

*For any* upgrade recommendation card and target deck, a conflict alert is produced if and only if: (a) the card exists in the collection with quantity > 0, AND (b) adding the card to the target deck would cause total demand to exceed supply, requiring an existing original to be displaced.

**Validates: Requirements 6.1, 6.3**

### Property 5: Allocation tab shows exactly shared cards

*For any* set of `deck_cards` data, the allocation API returns exactly those card names that appear in two or more distinct decks — no fewer, no more.

**Validates: Requirements 7.2**

### Property 6: Allocation tab deck filter correctness

*For any* selected deck ID, the filtered allocation API response contains only cards that appear in the selected deck AND at least one other deck.

**Validates: Requirements 7.5**

### Property 7: Allocation API response completeness

*For any* card returned by the allocation API, the response includes the card name, a list of all decks containing that card, and the `ownership_status` for each deck entry.

**Validates: Requirements 7.3**

### Property 8: Tag write operation correctness

*For any* set of ownership changes produced by the resolver, the tag writer queues: a "write Proxy tag" operation for each card becoming `'proxy'`, a "remove Proxy tag" operation for each card becoming `'original'` that previously had a Proxy tag, and no operation for cards with status `'not_owned'`.

**Validates: Requirements 9.2, 9.3, 9.4**

### Property 9: Proxy tag interpretation on import

*For any* Archidekt import text where a card line contains the Proxy tag marker, the sync engine produces a `pin_proxy` override entry for that card-deck pair in the allocation input's overrides map.

**Validates: Requirements 9.5**
