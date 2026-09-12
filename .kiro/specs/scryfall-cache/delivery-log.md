# Delivery Log — Scryfall Printings Cache

> Feature: Scryfall Printings Cache
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-26 — Feature Shipped

**Context:** Local cache of Scryfall printings data shipped for local-first lookups.

**What shipped:**
- `ref_printings` table with ~100K cards
- Daily sync via Vercel cron at 10:00 UTC
- Columns: scryfall_id, oracle_id, name, set_code, set_name, collector_number, rarity, mana_cost, type_line, color_identity, image URLs, prices
- Local-first lookup chain: ref_printings → Scryfall API (fallback)
- Card lookup service with fallback chain
- Cheapest printing lookup for budget recommendations

**Decisions made:**
- Cache all printings (not just owned) for comprehensive recommendations
- Daily sync catches new set releases
- Four image URL variants cached (small, normal, large, art_crop)
- Four price columns (USD, USD foil, EUR, EUR foil)

**Refs:**
- Spec: `specs/scryfall-cache/`
- Source: `src/lib/scryfall-cache.ts`, `src/lib/card-lookup.ts`
