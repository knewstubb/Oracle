# Tasks — Shared Cards V2 Migration

> Derived from: `design.md` (Architecture section)
> Owner: Margaret (Fullstack Developer)
> Date: 2026-07-14

## Task Order Rationale

Delete first (remove dead code paths that write to `proxy_allocations`), then fix the bug and rewrite the component (which depend on the panel being gone), then drop the table (safe because no readers exist), then verify.

---

## Tasks

- [ ] 1. Delete ProxyAllocationPanel and its test
  - Delete `src/components/ProxyAllocationPanel.tsx`
  - Delete `src/components/ProxyAllocationPanel.test.tsx`
  - Refs: `requirements.md` Req 1

- [ ] 2. Delete legacy allocation routes
  - Delete `src/app/api/proxy-allocate/route.ts`
  - Delete `src/app/api/proxy-allocate/route.test.ts`
  - Delete `src/app/api/shared-cards/allocations/route.ts`
  - Delete `src/app/api/shared-cards/allocations/preview/route.ts`
  - Refs: `requirements.md` Req 1

- [ ] 3. Delete allocation.ts (V1 engine)
  - Delete `src/lib/allocation.ts`
  - Verify: zero imports remain (`grep -rn "from '@/lib/allocation'" src/`)
  - Refs: `requirements.md` Req 1

- [ ] 4. Delete collection-reallocator and remove legacy import mode
  - Delete `src/lib/collection-reallocator.ts`
  - Delete `src/lib/collection-reallocator.test.ts`
  - Remove `import { importCollectionAndReallocate } from '@/lib/collection-reallocator'` from `src/app/api/collection/import/route.ts`
  - Remove the `legacy` mode branch from that route (it writes to a read-only table anyway)
  - Refs: `requirements.md` Req 6

- [ ] 5. Fix proxy detection bug in shared-cards route
  - In `src/app/api/shared-cards/route.ts`: add `ownership_status` to the deck_cards select
  - Replace `is_proxy: (p.tags.get(id) || '').toLowerCase().includes('proxy')` with `is_proxy: dc.ownership_status === 'proxy'`
  - Remove `tags` from the select (no longer needed for this purpose)
  - Verify: API response `is_proxy` values match `deck_cards.ownership_status`
  - Refs: `requirements.md` Req 3, `design.md` Architecture > Proxy Detection Bug Fix

- [ ] 6. Rewrite SharedCardRow expanded content
  - Remove `ProxyAllocationPanel` import from `src/components/SharedCardRow.tsx`
  - Replace expanded section with: per-deck list showing `CardSlotBadge` + "Resolve →" link
  - Import `CardSlotBadge` from `@/components/CardSlotBadge` and `Link` from `next/link`
  - "Resolve →" links to `/decks/[id]?tab=cards&mode=picklist`
  - Only show "Resolve →" when `card.needing_proxies && deck.is_proxy`
  - Update `SharedCardRow.test.tsx` to test new expansion content (no radio buttons, has badge + link)
  - Refs: `requirements.md` Req 5, Req 7, `design.md` UX > Expanded Row Layout

- [ ] 7. Remove Shared Cards page panel references
  - In `src/app/shared-cards/page.tsx`: remove any "Manage Proxies" or "Allocate" buttons if they exist
  - Verify page renders correctly with the rewritten `SharedCardRow`
  - Refs: `requirements.md` Req 7

- [ ] 8. Create migration 020 — Drop proxy_allocations table
  - Create `supabase/migrations/020_drop_proxy_allocations.sql`
  - Content: `DROP TABLE IF EXISTS proxy_allocations;`
  - Apply via MCP `apply_migration` after code deployment
  - Refs: `requirements.md` Req 2, `design.md` Architecture > Migration

- [ ] 9. Run deletion grep sweep and verify
  - Run all 6 grep patterns from `test-plan.md` Section 3
  - All must return zero results
  - Run `npx tsc --noEmit` — no new errors from deletions
  - Refs: `test-plan.md` Section 3

- [ ] 10. Release gate verification
  - Run all checks from `test-plan.md` Section 7
  - Spot-check proxy detection fix (Section 2)
  - Manual UI verification (Section 6)
  - Refs: `test-plan.md` Sections 2, 5, 6, 7
