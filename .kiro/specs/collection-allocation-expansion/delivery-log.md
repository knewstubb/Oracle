# Delivery Log — Collection Allocation Expansion

> Feature: Collection Allocation Expansion
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-06-29 — Feature Shipped

**Context:** Dedicated allocation page showing cross-deck card demand shipped.

**What shipped:**
- `/allocation` page with demand vs. supply rollup
- `CollectionRollupTab` component reused from collection
- Per-card view: owned count, allocated count, shortfall, deck assignments
- Shortfall indicators for cards where demand > supply

**Decisions made:**
- Separate page at `/allocation` (not a tab within Collection)
- Read-mostly interface — links to Picklist for edits
- Shares component with Collection but answers different question

**Known limitations:**
- Page accessible by direct URL only initially (sidebar link added later)

**Refs:**
- Spec: `specs/collection-allocation-expansion/`
- Related: `specs/nav-split-collection-allocation/`
