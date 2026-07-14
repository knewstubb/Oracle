# Next Session Requirements — UI Responsiveness Fixes

## Context

Project: The Oracle (`/Users/bradknewstubb/Developer/Personal/The_Oracle/the-oracle/`)
Tech: Next.js 14 App Router, TanStack Query, Supabase, shadcn/ui

The app manages MTG deck card allocation — linking deck_cards rows to physical_copies via physical_copy_id. Status changes and imports can feel sluggish because:
1. The UI waits for server responses before updating visually
2. After deck import, auto-assign runs fire-and-forget in the background — the page loads showing stale "unallocated" state until a manual refresh

## Task 1: Optimistic UI updates for StatusControl

**File:** `src/components/StatusControl.tsx`

**Current behavior:** The StatusControl (Brew/Boxed/Archived segmented button) calls `setOptimisticStatus` but only after the confirmation modal flow. For non-confirmed transitions (Brew→Boxed, Boxed→Brew), the mutation fires and the UI waits for the server response before the button visually updates.

**Fix:** The optimistic update already exists (`setOptimisticStatus(newStatus)`) and fires before `statusMutation.mutate(newStatus)` for non-archived transitions. Verify this is working correctly — if the lag is on the server side (slow PATCH response), the optimistic pattern should already mask it. If it's not masking it, check whether the mutation's `onMutate` could be used to update the TanStack Query cache optimistically.

Also check: `AllocateToggle.tsx` — same pattern should apply. The toggle should flip visually immediately on click, rolling back only on error.

## Task 2: Auto-refetch after import navigation

**File:** `src/app/decks/[id]/page.tsx`

**Current behavior:** After importing a deck via the Import Deck modal, the user navigates to `/decks/[id]`. The deck detail page loads and shows card statuses. But auto-assign (`autoAssignDeck`) is still running in the background — so the initial load shows cards as "unallocated" even though they'll be allocated seconds later.

**Fix:** Add a one-time delayed refetch after the deck detail page first loads for a freshly-imported deck. Approach:

```typescript
// In the deck detail page, detect if this is a fresh import (e.g., via a query param or by checking if most cards are unallocated)
// Then schedule a single refetch after 3 seconds

useEffect(() => {
  // Only run once on mount for potentially-fresh imports
  const timer = setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'card-statuses'] })
    queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
  }, 3000)
  return () => clearTimeout(timer)
}, [deckId]) // eslint-disable-line react-hooks/exhaustive-deps
```

This is crude but effective — after 3s the auto-assign will likely have completed and the refetch picks up the real state. The staleTime on the card-statuses query is 5min, so the invalidation forces a fresh fetch.

A more targeted approach: pass `?freshImport=true` as a query param from the import flow's navigation, and only trigger the delayed refetch when that param is present.

## Task 3: Card statuses query — optimistic invalidation

**File:** `src/components/CardsTab.tsx`

After any picklist action (assign, unassign, print proxy), the TanStack Query for `['decks', deckId, 'card-statuses']` needs to be invalidated. Check that all mutation `onSuccess` handlers in the Picklist component properly invalidate this key so the Cards tab reflects changes immediately without a manual refresh.

## Key files to read first:
- `src/components/StatusControl.tsx` — status transition logic
- `src/components/AllocateToggle.tsx` — allocate toggle
- `src/app/decks/[id]/page.tsx` — deck detail page
- `src/components/CardsTab.tsx` — card statuses query
- `src/components/Picklist.tsx` — assign mutation invalidation
- `src/lib/auto-assign.ts` — background auto-assign (fire-and-forget)

## Acceptance criteria:
- Status changes (Brew/Boxed/Archived, Allocate on/off) feel instant — visual update happens before server response
- After importing a deck and navigating to its page, the card statuses self-correct within ~3 seconds without requiring a manual page refresh
- No regressions to existing optimistic updates or cache invalidation patterns
