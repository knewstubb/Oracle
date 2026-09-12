# Delivery Log — UI Overhaul

> Feature: UI Overhaul
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-06-26 — Feature Shipped

**Context:** Design system foundation established across all pages.

**What shipped:**
- `PageHeader` component shared across Decks, Collection, Allocation, Settings
- shadcn/ui component library (15+ primitives)
- `max-w-[1520px]` content container on all list-view pages
- Two font weights only (400, 500)
- Dark theme as primary (no light mode)
- Consistent spacing, typography, border radius patterns

**Decisions made:**
- shadcn/ui as building blocks, not a full design system
- Dark-first design (light mode deferred)
- Unified page header pattern

**Refs:**
- Spec: `specs/ui-overhaul/`
- Component: `src/components/PageHeader.tsx`
