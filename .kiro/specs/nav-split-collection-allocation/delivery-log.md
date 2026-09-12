# Delivery Log — Nav Split: Collection / Allocation

> Feature folder: `.kiro/specs/nav-split-collection-allocation/`
> Started: 2026-07 (original spec)

---

## 2026-07-14 — Completion: Sidebar IA Change

**Trigger:** Product decision made directly with user during product-spec audit session. TD-008 identified the sidebar update as missing. User directed Gene to resolve it with a specific IA decision.

**Product decision (not re-litigated with Marty — user-directed):**
- Replace "Shared Cards" nav item with "Cards" (`IdCard` icon, `/allocation`)
- Keep "Collection" as its own top-level nav item (user reversed the earlier removal — Collection's CRUD-heavy interaction model warrants top-level access)
- Do NOT merge Collection and Allocation into one page — different interaction models

**Implementation (Margaret):**
- `Sidebar.tsx`: nav items are now 5 (Decks, Cards, Collection, Brew Deck, Settings). "Shared Cards" removed, "Cards" added. Icon imports: `IdCard` + `Library`.
- `allocation/page.tsx`: PageHeader title renamed "Allocation" → "Cards", subtitle updated. No "View full collection" link needed (Collection is in the sidebar).
- `Sidebar.test.tsx`: rewritten to match current nav items. Fixed pre-existing drift (test asserted "Search" nav item that never existed in the component).

**Verification:**
- Sidebar renders 5 items: Decks, Cards, Collection, Brew Deck, Settings
- "Cards" links to `/allocation` and highlights when active
- "Collection" links to `/collection` and highlights when active
- `/shared-cards` still accessible by direct URL (not redirected, not removed)
- `/collection` still accessible by direct URL (just not in sidebar)

**Status:** Complete. TD-008 resolved. `product-spec.md` and `tech-debt-register.md` updated.

---
