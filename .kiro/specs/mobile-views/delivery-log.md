# Delivery Log — Mobile-Friendly Views

> Feature: Mobile-Friendly Views
> Status: In Progress
> Last updated: 2026-08-12
> Maintained by: Delivery Lead (Gene)

---

## 2026-08-12 — Phase 2 Compact Card List Implemented

**Context:** Phase 2 of mobile-friendly views — compact card list mode for CardsTab on mobile devices.

**What changed:**
- Created `useIsMobile` hook at `src/hooks/useIsMobile.ts` for shared mobile detection
- Created `MobileCardPreview` component for tap-to-view card images on mobile
- Updated `CardGroupSection.tsx` UnifiedCardRow to be mobile-responsive:
  - On mobile: hides mana cost, price, set info, category editor, kebab menu, drag handle, checkbox
  - Card name tap opens full-screen preview modal on mobile (vs hover preview on desktop)
  - Added `MobileStatusDot` component showing simple status indicators (●/◐/○)
- Collection page now defaults to list view on mobile (unless user explicitly set grid preference)

**Decisions made:**
- Simple status dot uses visual encoding: solid = owned, hollow = available, dashed = unowned
- Mobile rows show only: quantity + card name + status dot — minimal but functional for LGS use
- Hover preview disabled on mobile (not useful without hover), replaced with tap-to-preview modal

**Refs:**
- `specs/mobile-views/requirements.md` — Phase 2: Compact card list
- `specs/mobile-views/design.md` — Mobile-friendly card rows

---

## 2026-08-12 — Phase 1 CSS Quick Wins Implemented

**Context:** Implementing Phase 1 of mobile-friendly views — CSS-only responsive changes for immediate usability at LGS.

**What changed:**
- Home page: Deck grid now single column on mobile, horizontally scrollable folder chips
- Collection toolbar: Full-width search on mobile, filter row scrollable horizontally
- Deck detail: Parallax background hidden on mobile, tabs reordered (Cards + Pull List visible, others hidden on mobile)

**Decisions made:**
- Tabs reordered to show most-used tabs first (Cards, Pull List) since hidden tabs won't be accessible on mobile
- Used `-mx-5/px-5` negative margin pattern for edge-to-edge horizontal scroll containers

**Refs:**
- Commit `3d6436a` — feat(mobile): add responsive layouts for phone-friendly browsing

---

## 2026-08-12 — Feature Spec Created

**Context:** User requested mobile-friendly views for collection and decks to enable day-to-day usage at LGS. The Oracle is already deployed at `oracle-alpha-two.vercel.app` with basic PWA scaffolding but desktop-first views.

**What changed:**
- Created requirements.md with user stories for deck list, deck detail, collection browse, and quick search
- Created design.md with wireframes and component change list
- Created tasks.md with phased implementation plan

**Decisions made:**
- CSS-only responsive changes (not separate mobile routes) — faster to ship, single codebase
- Hide non-essential tabs on mobile rather than accordion collapse — cleaner UX
- List view default on mobile collection — grid too dense for phone screens
- Simple status badge (●/◐/○) on mobile instead of full StatusChipPopover

**Next steps:**
- Prioritize Phase 1 (CSS quick wins) vs Phase 2 (compact card list)
- Assign to Developer (Margaret) for implementation

**Refs:**
- `docs/roadmap/mobile-pwa.md` — existing mobile roadmap notes
- `docs/roadmap/infrastructure.md` — mentions Vercel deployment
