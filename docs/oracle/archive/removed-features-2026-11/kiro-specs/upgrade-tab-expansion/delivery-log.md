# Delivery Log — Upgrade Tab Expansion

> Feature: Upgrade Tab Expansion
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-06-29 — Feature Shipped

**Context:** EDHREC-powered upgrade suggestions for decks shipped.

**What shipped:**
- `UpgradeTab.tsx` on deck detail with priority-ranked suggestions
- Cut/add card pairs with synergy scores
- Ownership badge per suggestion (owned vs. need to buy)
- Price data from Card Kingdom (cached)
- Change log in `upgrade_change_log` table
- "Make change" applies swap; "Skip" dismisses

**Decisions made:**
- Suggestions ranked by synergy score
- Each shows: cut card, add card, reason, price, owned status
- History tracking for all upgrade decisions

**Refs:**
- Spec: `specs/upgrade-tab-expansion/`
- Component: `src/components/UpgradeTab.tsx`
