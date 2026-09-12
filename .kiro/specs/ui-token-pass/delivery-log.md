# Delivery Log — UI Token Pass

> Feature: UI Token Pass
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-08 — Feature Shipped

**Context:** CSS custom properties defining complete visual language shipped.

**What shipped:**
- `tokens.css` with spacing scale (7 steps), typography scale (8 sizes)
- Neutral ramp (8 values), status colors (ownership + allocation axes)
- Chart colors, badge conventions
- Token-based status colors: `--status-owned`, `--status-proxy`, etc.
- Semantic tokens: `--accent-primary` (teal), `--signal-warning` (amber)
- Badge background convention: 15%-alpha of badge color

**Decisions made:**
- 8pt grid spacing (4px–48px)
- No pure white text except on saturated button fills
- All UI colors reference CSS custom properties

**Refs:**
- Spec: `specs/ui-token-pass/`
- Source: `src/styles/tokens.css`
