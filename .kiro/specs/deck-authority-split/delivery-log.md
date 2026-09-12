# Delivery Log — Deck Authority Split

> Feature: Deck Authority Split
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-01 — Feature Shipped

**Context:** Architectural decision establishing Oracle as local-authoritative for deck composition.

**What shipped:**
- `deck-import.ts` and `deck-cards-diff.ts` own the import path
- Diff-based preservation of enriched columns on reimport
- `ownership-resolver.ts` only modifies allocation metadata
- No write-back to Archidekt/Moxfield (read-only external platforms)
- Reimport uses stable-identity diff (card_name + scryfall_id)

**Decisions made:**
- External platforms as import source only, not sync targets
- Local enrichment (categories, allocation) preserved across reimports
- Ownership resolver guards against touching composition columns

**Refs:**
- Spec: `specs/deck-authority-split/`
- Source: `src/lib/deck-import.ts`, `src/lib/deck-cards-diff.ts`
