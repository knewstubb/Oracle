# Delivery Log — Picklist 3-Column View

> Feature: Picklist 3-Column View
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-16 — Feature Shipped

**Context:** Rebuilt Picklist as three-column layout for batch resolution.

**What shipped:**
- Three columns: Available (storage), Claimed (other decks), Unowned
- Progress bar with color-coded segments
- Instant claim for Available cards (muted green button)
- Confirmation dialog for claiming from In Rotation decks
- Proxy button for Unowned cards
- Card hover preview following cursor
- Promoted from sub-tab to top-level deck tab

**Decisions made:**
- Self-referencing filtered out (current deck doesn't show in Claimed column)
- Tier 4 confirmation only for In Rotation decks (not Brewing/Graveyard)
- Search field filters all columns
- Cards sorted alphabetically within groups

**Refs:**
- Spec: `specs/picklist-v2/`
- Component: `src/components/PicklistV2.tsx`
