# Delivery Log — Draft Deck Management

> Feature: Draft Deck Management
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-06-29 — Feature Shipped

**Context:** Brew sessions surfaced on Decks Grid as distinct tiles.

**What shipped:**
- `DraftDeckTile` for saved brew-status decks
- `DraftSessionTile` for unsaved brew sessions
- `DraftBanner` on deck detail for brew-status decks
- Dashed border visual treatment for draft content
- Navigation from session tile → `/new-deck` with session context

**Decisions made:**
- Visual distinction via dashed border
- Separate tile components for saved vs unsaved state
- Session ID passed via URL param for continuity

**Refs:**
- Spec: `specs/draft-deck-management/`
- Components: `src/components/DraftDeckTile.tsx`, `DraftSessionTile.tsx`
