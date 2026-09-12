# Delivery Log — Card Category Classification

> Feature: Card Category Classification
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-26 — Feature Shipped

**Context:** Functional category classification for 32,393 MTG cards shipped.

**What shipped:**
- `mtg_cards.default_category` JSONB column
- Rule-based classifier script (`scripts/classify-mtg-cards.ts`)
- 12 primary categories: Ramp, Draw, Engine, Removal, Removal:Mass, Removal:Tempo, Counterspell, Tutor, Protection, Recursion, Discard, Finisher, Mill, Creature, Land, Utility
- Utility sub-tags: :Tokens, :Fixing, :Anthem, :Hate, :Lifegain, :Selection, :Sac-Outlet
- Confidence levels: 27% high, 54% medium, 19% low

**Decisions made:**
- Categories are card-level properties, not user-specific
- Rule-based classifier (no LLM API required)
- Per-deck overrides planned but not yet implemented
- Combo pieces are deck-level (Commander Spellbook), not card-level

**Category distribution:**
- Creature: 45.5%
- Utility: 22.0%
- Ramp: 4.3%
- Engine: 4.2%
- Removal: 4.2%
- Draw: 4.1%
- Other: 16%

**Refs:**
- Spec: `specs/card-category-classification/`
- Taxonomy: `docs/category-taxonomy.md`
- Script: `scripts/classify-mtg-cards.ts`
