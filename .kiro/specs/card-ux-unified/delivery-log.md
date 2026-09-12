# Delivery Log — Card UX Unified

> Feature: Card UX Unified
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-16 — Feature Shipped

**Context:** Multiple card display improvements shipped together as a unified UX pass. This consolidates: Card Management UX, Basic Lands Overhaul, Mana Pips & Set Icons, Collection List Enhancements, Material Icons Migration.

**What shipped:**
- Unified `CardGroupSection` component with `compact` prop for masonry
- Material Symbols icons for all status indicators
- Mana-font integration for mana cost display
- Keyrune integration for set expansion symbols
- Basic land dual modes: generic (collapsed) and specific-printing (individual)
- Card hover preview following cursor (200ms delay, 220px width)
- Status chip popovers with contextual actions
- Consistent kebab menu with quantity +/- stepper

**Decisions made:**
- Single shared component ensures feature parity across all views
- 200ms hover delay prevents accidental preview triggers
- CDN fonts for simplicity (mana-font, keyrune, Material Symbols)
- Generic lands exempt from allocation (always "filled")

**Related features consolidated:**
- Card Management UX
- Basic Lands Overhaul  
- Mana Pips & Set Icons
- Collection List Enhancements
- Material Icons Migration

**Refs:**
- Spec: `specs/card-ux-unified/`
- Components: `CardGroupSection.tsx`, `CardSlotBadge.tsx`, `ManaCost.tsx`, `CardHoverPreview.tsx`
