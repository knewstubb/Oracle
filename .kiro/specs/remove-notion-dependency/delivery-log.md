# Delivery Log — Remove Notion Dependency

> Feature: Remove Notion Dependency
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-01 — Feature Shipped

**Context:** Removed Notion as storage backend, replaced with native Supabase tables.

**What shipped:**
- `deck_documentation` table: one row per deck with structured columns
- `deck_notes` table: append-only note store per deck
- Zero `@notionhq` imports — SDK removed from dependencies
- Documentation stored locally with strategy, synergies, matchups, mulligan columns

**Decisions made:**
- Local storage preferred over third-party dependency
- Append-only notes with created_at timestamps

**Known limitations:**
- `notion_logged` column name retained as tech debt (TD-006)

**Refs:**
- Spec: `specs/remove-notion-dependency/`
- Tables: `deck_documentation`, `deck_notes`
