# Delivery Log — Deck Import Flow V2

> Feature: Deck Import Flow V2
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-16 — Feature Shipped

**Context:** Unified import dialog shipped with clear mode selection.

**What shipped:**
- Three input methods: URL, Paste List, CSV
- Platform auto-detection for 5 sites
- Text parser with permissive grammar
- Mode picker: "These are new cards" vs "Match against my collection"
- All imports start as Brewing status

**Decisions made:**
- Mode picker shown after parse (user sees what they're getting)
- "New cards" creates physical copies + assigns
- "Match collection" creates deck slots only, resolve via Picklist
- Removed old Boxed/Brew status picker from import flow

**Refs:**
- Spec: `specs/deck-import-v2/`
- Components: `DeckImportButton.tsx`, `text-deck-parser.ts`
