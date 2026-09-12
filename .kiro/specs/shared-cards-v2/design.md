# Design Document — Shared Cards V2 Migration

## UX Design

### Overview

This is a deletion-and-wiring feature, not a design-from-scratch feature. The Shared Cards page already displays contention correctly (cards in 2+ decks, owned counts, printing breakdowns). The change is: remove the inline `ProxyAllocationPanel` (role-toggle radio buttons that write to a dead-end table) and replace it with a "Resolve" link that navigates to the affected deck's Picklist.

No new components are designed. `CardSlotBadge` (from taxonomy) is wired in. The Picklist interaction (Tier 3/4/5 reassignment) already exists.

### What Changes on the Shared Cards Page

**Before (current):**
- Click a shared card row → expands inline to show `ProxyAllocationPanel`
- Panel shows radio buttons per deck: "Original" / "Proxy"
- "Apply" button writes to `proxy_allocations` (dead-end, never affects resolution)

**After:**
- Click a shared card row → expands to show per-deck status using `CardSlotBadge`
- Each deck entry shows: deck name, badge (Original/Proxy per `ownership_status`), and a "Resolve" link for contended cards
- "Resolve" navigates to `/decks/[id]?tab=cards&mode=picklist` — the Picklist handles actual reassignment
- No radio buttons, no "Apply" button, no inline allocation UI

### Expanded Row Layout (After)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Sol Ring · In 3 decks · You own 1 copy · ⚠ Needs proxies            │
├──────────────────────────────────────────────────────────────────────┤
│  Muldrotha     [● Original]                                          │
│  Atraxa        [◐ Proxy]                          [Resolve →]        │
│  Gitrog        [◐ Proxy]                          [Resolve →]        │
└──────────────────────────────────────────────────────────────────────┘
```

- `CardSlotBadge` renders the status per deck entry (Original or Proxy)
- "Resolve →" link appears only on decks where the card is a proxy AND contention exists (demand > supply)
- Clicking "Resolve →" navigates to that deck's Picklist where the user can reassign via the Claimed/Tier 4 mechanism

### Non-Contended Cards (Informational Only)

When owned supply >= demand (e.g., own 3 copies, in 3 decks — all originals), the expanded row shows status badges but **no "Resolve" link**. There's nothing to resolve — it's purely informational.

### Responsive Behavior

Unchanged from current Shared Cards page layout. The expanded row content is simpler than the current `ProxyAllocationPanel` (no radio groups, no buttons with loading states), so it renders cleanly at all viewport widths.

### Accessibility

- "Resolve" links are standard `<a>` tags with `aria-label="Resolve Sol Ring in Atraxa"` (card name + deck name for screen readers)
- `CardSlotBadge` already includes `aria-label` per the taxonomy spec
- Expanded section uses `aria-expanded` on the toggle (existing pattern from `SharedCardRow`)

---

## Architecture

### Deletion List (Verified)

| File | Safe to delete? | Reason |
|------|----------------|--------|
| `src/components/ProxyAllocationPanel.tsx` | ✓ | Only imported by `SharedCardRow.tsx` (which we're rewriting) |
| `src/components/ProxyAllocationPanel.test.tsx` | ✓ | Test for deleted component |
| `src/app/api/proxy-allocate/route.ts` | ✓ | Only consumer of `allocation.ts`'s `commitAllocation` |
| `src/app/api/proxy-allocate/route.test.ts` | ✓ | Test for deleted route |
| `src/app/api/shared-cards/allocations/route.ts` | ✓ | Reads only from `proxy_allocations` |
| `src/app/api/shared-cards/allocations/preview/route.ts` | ✓ | Only consumer of `allocation.ts`'s `previewAllocation` |
| `src/lib/allocation.ts` | ✓ | 2 importers (proxy-allocate route + allocations/preview route) — both deleted above |
| `src/lib/collection-reallocator.ts` | ✓ | 1 importer (`collection/import/route.ts` legacy mode — dead behind write-blocking trigger) |
| `src/lib/collection-reallocator.test.ts` | ✓ | Test for deleted file |

**NOT safe to delete (out of scope — has other consumers):**

| File | Consumers | Disposition |
|------|-----------|------------|
| `src/lib/allocation-resolver.ts` | `ownership-resolver.ts`, `card-movement.ts`, `allocation-store.ts`, `collection-reallocator.ts` | Keep. Used by the V1 ownership resolver pipeline which still runs. Separate tech debt. |
| `src/lib/allocation-store.ts` | `allocation/priority`, `allocation/reassign`, `allocation/route`, `allocation/unassign`, `ownership-resolver.ts`, `card-movement.ts` | Keep. Powers the `/allocation` page and related routes. Separate tech debt. |

### Proxy Detection Bug Fix

**Current (broken):** `shared-cards/route.ts` line ~220:
```typescript
is_proxy: (p.tags.get(id) || '').toLowerCase().includes('proxy'),
```

**Fixed:** Replace with a join against `deck_cards.ownership_status` or `physical_copies.is_proxy`:

```typescript
// In the deck_cards query (Step 1), also select ownership_status
const { data: allDeckCards } = await supabase
  .from('deck_cards')
  .select('card_name, set_code, scryfall_id, deck_id, ownership_status')
  // Remove 'tags' from the select — no longer needed

// In the per-deck mapping:
is_proxy: dc.ownership_status === 'proxy',
```

This is a ~5-line change in the existing route. The `tags` field is no longer read for this purpose.

### SharedCardRow Rewrite

Replace the `ProxyAllocationPanel` import and expansion with:

```tsx
// Remove:
import { ProxyAllocationPanel } from '@/components/ProxyAllocationPanel'

// Replace expansion content with:
{expanded && (
  <div className="px-4 pb-3 space-y-2">
    {card.decks.map(deck => (
      <div key={deck.id} className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{deck.name}</span>
          <CardSlotBadge status={deck.is_proxy ? 'proxy' : 'original'} />
        </div>
        {card.needing_proxies && deck.is_proxy && (
          <Link href={`/decks/${deck.id}?tab=cards&mode=picklist`}>
            <span className="text-xs text-[var(--accent-primary)]">Resolve →</span>
          </Link>
        )}
      </div>
    ))}
  </div>
)}
```

### collection-reallocator.ts Removal

The only import is in `src/app/api/collection/import/route.ts`:

```typescript
import { importCollectionAndReallocate } from '@/lib/collection-reallocator'
```

This powers the `legacy` import mode which writes to the read-only `collection` table (write-blocking trigger installed at migration 010). The import mode is already dead. Remove the import and the `legacy` mode branch from the route, then delete the file.

### Migration: Drop proxy_allocations

```sql
-- Migration 020: Drop proxy_allocations table
-- Safe: all code paths reading/writing this table have been removed in the
-- preceding code deployment.

DROP TABLE IF EXISTS proxy_allocations;
```

Single-statement migration. No data preservation needed.

### TanStack Query Changes

- Remove `queryKey: ['shared-cards', 'allocations']` from any query (the route no longer exists)
- The existing `queryKey: ['shared-cards']` invalidation stays (used by the listing)
- The Picklist's mutation `onSuccess` already invalidates `['shared-cards']` (existing behavior from taxonomy spec)

---

## Operations

### Deployment Strategy

**Two-step deployment** (code first, then migration):

1. **Deploy code:** Delete files, rewrite `SharedCardRow`, fix proxy detection bug. At this point `proxy_allocations` table still exists but has zero readers/writers — harmless.
2. **Run migration 020:** Drop `proxy_allocations` table. Safe because step 1 guarantees zero references.

This ordering is deliberate — if step 1 has issues and needs rollback, the table still exists and old code can be restored. If migration ran first and code still referenced the table, the app would crash.

### Monitoring

- After step 1: verify no 404s or 500s on `/shared-cards` page (Vercel function logs)
- After step 2: verify `proxy_allocations` table is gone (`SELECT * FROM proxy_allocations` should error)
- Confirm the proxy detection fix: spot-check a shared card where a deck has `ownership_status = 'proxy'` — verify it shows `is_proxy: true` in the API response

### Rollback

- **Code rollback:** Instant via Vercel (revert to previous deployment). Table still exists, old code works against it.
- **Migration rollback (if needed):**
  ```sql
  -- Recreate empty table (no data to restore — it was stale labels)
  CREATE TABLE proxy_allocations (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    card_name TEXT NOT NULL,
    deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('original', 'proxy')),
    written_to_archidekt BOOLEAN DEFAULT FALSE,
    written_at TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID NOT NULL
  );
  ```
  Only needed if code rollback also happens and old code tries to read this table. In practice: if step 1 rolls back, step 2 hasn't run yet, so no migration rollback needed.

### Performance

No performance impact. We're removing code paths, not adding them. The shared-cards route gains a tiny improvement by no longer reading the `tags` field.
