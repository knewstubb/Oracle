# Delivery Log — Generic Basic Lands

> Feature: Generic Basic Lands
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-01 — Feature Shipped

**Context:** Basic lands exempt from allocation tracking shipped.

**What shipped:**
- `isBasicLand()` check in `basic-lands.ts`
- `is_generic_land` boolean on `deck_cards`
- `generic_land` status in `card-status.ts` (skips classification)
- Collapsed display ("Forest ×12" instead of 12 rows)
- Kebab menu +/- for quantity, "Make generic", "Remove all"

**Decisions made:**
- Generic lands always considered "Original" — no allocation needed
- Deliberate physical copy assignment drops the exemption
- Support for Forest, Island, Mountain, Plains, Swamp, Wastes, Snow-Covered variants

**Refs:**
- Spec: `specs/generic-basic-lands/`
- Source: `src/lib/basic-lands.ts`, `src/lib/card-status.ts`
