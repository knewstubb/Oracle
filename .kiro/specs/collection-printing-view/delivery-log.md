# Delivery Log — Collection Printing View

> Feature: Collection Printing View
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-06 — Feature Shipped

**Context:** Per-printing-level collection view shipped as list view mode.

**What shipped:**
- `/api/collection/printings` API route
- List view showing individual physical copies
- Columns: set, condition, foil status, deck assignment
- Assigned copies show deck name; unassigned show storage location
- Sortable by card name, set, condition
- Proxy toggle filtering proxy copies in/out

**Decisions made:**
- Separate API route from rollup view for performance
- List view as one of two view modes (alongside grid)
- Proxy toggle chip in toolbar

**Known limitations:**
- No inline editing of condition or storage location
- No pagination (loads all copies)

**Refs:**
- Spec: `specs/collection-printing-view/`
- Component: `src/components/collection/PrintingListView.tsx`
