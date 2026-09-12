# Delivery Log — Deck Status Management

> Feature: Deck Status Management
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-06 — Feature Shipped

**Context:** Three-stage deck lifecycle shipped with status transitions.

**What shipped:**
- Three DB values: `brew`, `boxed`, `archived` (CHECK constraint)
- "Boxed" displayed as "Built" in UI (display rename)
- `StatusBadge.tsx` shared across all deck surfaces
- PATCH `/api/decks/[id]/status` for transitions
- Delete protection: Built decks must archive first

**Decisions made:**
- Kept enum values unchanged, display renamed "Boxed" → "Built"
- Status badges: Brew (teal), Built (teal), Archived (grey)
- Only active decks participate in allocation when allocate=true

**Note:** Later renamed again to Brewing/In Rotation/Graveyard (July 2026).

**Refs:**
- Spec: `specs/deck-status-management/`
- Component: `src/components/StatusBadge.tsx`
