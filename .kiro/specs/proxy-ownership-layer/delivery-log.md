# Delivery Log — Proxy Ownership Layer

> Feature: Proxy Ownership Layer
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-06-26 — Feature Shipped

**Context:** Per-slot tracking of Original vs Proxy status shipped.

**What shipped:**
- `ownership_status` column: `'original'` | `'proxy'` | `'generic'` | NULL
- Resolver pipeline: buildAllocationInput → computeAllocations → applyAllocationOutput → denormaliseOwnership
- `proxy_of_deck_id` tracks which deck holds the original
- Proxy badges throughout UI with tooltip "Original held by [Deck Name]"
- Resolver runs on import/assignment, writes ownership metadata only

**Decisions made:**
- NULL means unresolved (status computed dynamically)
- Taxonomy rename (July 2026) later removed `'not_owned'` value
- Resolver is read-only for composition columns

**Refs:**
- Spec: `specs/proxy-ownership-layer/`
- Source: `src/lib/ownership-resolver.ts`
