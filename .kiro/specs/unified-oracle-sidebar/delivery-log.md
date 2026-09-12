# Delivery Log — Unified Oracle Sidebar

> Feature: Unified Oracle Sidebar
> Status: In Progress
> Last updated: 2026-08-12
> Maintained by: Gene (Delivery Lead)

---

## 2026-08-12 — Spec Complete, Ready for Implementation

**Context:** User requested a fundamental change to unify the Oracle sidebar and brew chat into a single persistent interface. Full spec cycle completed in one session.

**What was produced:**
- `requirements.md` — Full requirements with user stories, AC, NFRs
- `design.md` — Comprehensive visual design with colors, component specs, states
- `tasks.md` — 10-phase implementation breakdown (~8 days estimated)

**Key decisions made:**
1. **Session history tabs:** Separate "Explorations" vs "Deck Conversations" (not unified list)
2. **Explore page:** New `/explore` page (not modal), bookmarkable URL
3. **Forge page:** Merged into `/explore`
4. **Intent detection:** AI classification only in general/collection/forge contexts
5. **Session naming:** After first AI response (not first user message)
6. **Session continuity:** 4-hour window (following Gemini/Claude patterns)
7. **Session history style:** Simple text list like Claude (no mini cards)
8. **New session button:** Auto-refresh only (no explicit button)
9. **Long names:** Truncate at 30 chars with tooltip

**Refs:**
- User direction captured in conversation context
- Design tokens: `src/styles/tokens.css`
- Current sidebar: `src/components/OracleSidebar.tsx`

---

## Next Steps

1. Margaret begins Phase 1 (Database & API Foundation)
2. Charity assists with Supabase migrations
3. Daily check-ins during implementation

---
