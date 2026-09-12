# Delivery Log — Deck Lifecycle Overhaul

> Feature: Deck Lifecycle Overhaul
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-16 — Feature Shipped

**Context:** Renamed deck lifecycle states from brew/boxed/archived to Brewing/In Rotation/Graveyard for clarity.

**What shipped:**
- Brewing → In Rotation gated by card count validation
- Graveyard transition with optional card release prompt
- Resurrect always lands in Brewing
- Claim completeness dot (green/amber/red) on In Rotation deck tiles
- Red triangle alert for incomplete In Rotation decks
- Visual treatment: dashed border for Brewing, desaturated for Graveyard

**Decisions made:**
- "In Rotation" reflects commitment, not physical completion
- Completeness dot is a quick visual indicator without reading
- Resurrect always goes to Brewing to force re-validation

**Refs:**
- Spec: `specs/deck-lifecycle-overhaul/`
- Components: `StatusControl.tsx`, `StatusBadge.tsx`, `DeckTile.tsx`
