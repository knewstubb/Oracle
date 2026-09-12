---
inclusion: manual
---

# Oracle — Component & Layout Spec

**Version 2.0** — supersedes v1.0. Rewritten against the actual `tokens.css` / theme-aliasing audit sheet rather than visual estimates from screenshots. Companion to `oracle-status-color-spec.md`. Living document; update in place.

## 1. Purpose

Locks the structural patterns shared across Decks, Collection, Allocation, and Brew Canvas: spacing, typography, table/row behavior, status badge placement, header structure, and the master-detail panel. v1 was written from screenshots before implementation existed and got several details wrong (row heights, token names, header presence on Allocation) — this version reflects what's actually built, and marks what's still unverified rather than guessing.

## 2. Spacing Scale (as implemented)

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight gaps, badge padding |
| `--space-2` | 8px | Row vertical padding, small gaps |
| `--space-3` | 12px | Row horizontal padding, standard gaps |
| `--space-4` | 16px | Section padding |
| `--space-5` | 24px | Large gaps, indent levels |
| `--space-6` | 32px | Section margins |
| `--space-7` | 48px | Empty-state padding |

7 steps, not the 6 v1 proposed, and the mapping doesn't line up 1:1 with what v1 guessed (v1's `--space-4`/16px is correct, but v1's `--space-6`/24px is actually `--space-5` here, and v1's `--space-8`/32px is `--space-6`). Use the table above as canonical; discard v1's numbering.

**Known exception, unresolved:** global content padding is `px-5` (20px), which isn't on this scale at all — the two nearest steps are `--space-4` (16px) and `--space-5` (24px). Worth a decision: is a page-gutter allowed to sit outside the 8pt scale as a deliberate one-off (common enough pattern — outer container padding is sometimes treated differently from internal component spacing), or should it snap to `--space-5`? Flagging rather than assuming.

## 3. Typography Scale (as implemented)

| Token | Value | Usage |
|-------|-------|-------|
| `--text-xs` | 11px | Column headers, badges, labels |
| `--text-sm` | 12px | Subgroup/drill-down text |
| `--text-base` | 13px | Body text — all table data |
| `--text-md` | 14px | Secondary headings |
| `--text-lg` | 16px | Component headings |
| `--text-xl` | 20px | Section headings |
| `--text-2xl` | 24px | Large headings |
| `--text-3xl` | 28px | Page titles (via PageHeader) |

Weights: `--font-normal` (400) and `--font-medium` (500) only — 500 is the max weight anywhere in the system. This matches the original "two weights only" principle from the color/design-system work; no drift here.

v1 proposed purpose-named tokens (`--text-label`, `--text-body`, `--text-heading`). Kiro built a generic t-shirt scale instead. That's a reasonable, defensible call on its own — more reusable, standard Tailwind convention — so this spec now treats the t-shirt scale as canonical rather than asking for a rename.

## 4. Neutral Ramp

Unchanged from v1, confirmed matching implementation:

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-canvas` | `#131316` | Page background |
| `--bg-surface` | `#1A1A1E` | Cards, panels |
| `--bg-surface-hover` | `#212126` | Hover states |
| `--border-subtle` | `#262629` | Row dividers |
| `--border-default` | `#35353A` | Visible borders, inputs |
| `--text-tertiary` | `#6E6E76` | Muted labels, placeholders |
| `--text-secondary` | `#9C9CA3` | Numeric data, secondary info |
| `--text-primary` | `#E8E8EA` | Primary content, headings |

## 5. Status Token Reference (see color spec for full detail)

Two independent axes, per `oracle-status-color-spec.md`:

- **Ownership:** `--status-owned` #5F5E5A, `--status-proxy` #4A93A0, `--status-unowned` #F0339E
- **Allocation:** `--status-unallocated` #5F5E5A, `--status-partial` #8A8A92, `--status-full` #5F5E5A, `--status-over` #FF5F1F

Plus two general-purpose semantic tokens that sit outside the ownership/allocation taxonomy:

- `--accent-primary` #1D9E75 — the one interactive color: buttons, selected states, CTAs, focus rings, "health OK"
- `--signal-warning` #EF9F27 and `--signal-critical` #E24B4A — general warning/destructive signals not tied to a specific card

**Open question, not yet resolved:** `--signal-warning` is documented as covering three things — health warnings, below-target indicators, and "over-allocation hints." But over-allocation already has its own dedicated token (`--status-over`, a completely different hex). If "over-allocation hint" is meant to be a lighter-weight preview of the same state `--status-over` represents at full weight, that's a legitimate two-tier pattern (hint vs. confirmed) — but it needs to be documented as such, not left as two tokens that happen to both touch the same concept. Confirm which it is before more components get built against one or the other arbitrarily.

**Badge background convention (new, not in v1):** every status/signal token that appears as a filled badge uses a 15%-alpha variant of itself for the background — `--accent-primary-bg`, `--signal-warning-bg`, `--signal-critical-bg`, all `rgba(..., 0.15)`. This is now the standard pattern; any new badge-style token added later should follow it rather than inventing a new alpha value.

## 6. Table & Row Pattern

| Property | Value |
|----------|-------|
| Row height | `--row-height` = 44px — confirmed applied to all 7 table view components |
| Row horizontal padding | `--row-h-pad` = `--space-3` (12px) |
| Row vertical padding | `--row-v-pad` = `--space-2` (8px) |
| Status slot | `--status-slot-width` = 24px, trailing column, empty placeholder rendered even when unused so numeric columns stay aligned |
| Table data text | `--text-base` (13px) |
| Table header text | `--text-xs` (11px), uppercase |
| Numeric columns | right-aligned, `tabular-nums` |
| Name column | `flex-1`, truncate, never wraps |

Row height is now uniform and confirmed (v1 had this as an estimate; it's measured now). Not yet confirmed: whether Collection and Allocation's thumbnail-display divergence (flagged earlier — Collection dropped card art, Allocation kept it) has actually been resolved. The audit sheet confirms both are among the 7 table components sharing row height/padding, but row height matching doesn't guarantee visual content matches — verify directly against current screenshots before considering this closed.

## 7. Page Header

Confirmed built as a shared `PageHeader` component, applied to Decks, Collection, Allocation, and Settings. This closes the gap flagged earlier — Allocation previously had no title treatment at all.

| Property | Value |
|----------|-------|
| Title | `--text-3xl` / `--font-medium` (28px/500) |
| Subtitle | `--text-base` / `--font-normal` (13px/400), optional |
| Content width | `max-w-[1520px]`, applied to all pages except Brew Canvas |
| Content padding | `px-5` (20px — see Section 2 open item) |

**Confirmed intentional exception:** Brew Canvas uses its own breadcrumb + tabs pattern instead of PageHeader, and is excluded from the max-w container (it's a full-bleed spatial workspace, not a list view). Documented here so it isn't "fixed" to match the others by accident in a future pass.

**Not yet confirmed:** whether the primary/secondary button-weight inconsistency on Collection (Add Cards and Import CSV both reading as equal-weight ghost buttons, vs. Decks' clear "Brew Deck"-primary / "Import Deck"-secondary split) has been addressed. Not in the audit sheet — check directly.

## 8. Master-Detail Panel

| Property | Value |
|----------|-------|
| Width | `--detail-panel-width` = 320px, fixed |
| Applies to | Instance panel, allocation panel |

Confirmed width matches v1's spec exactly. Not yet confirmed: whether the required-restatement rule from v1 (the four numeric columns — OWNED/PROXY/ALLOC/SHORT or equivalent — must repeat at the top of the panel, since they can scroll out of view behind it) actually made it into the built panel. Worth a direct check; this was a real usability gap in the original screenshot, not a stylistic nice-to-have.

## 9. Chart Tokens

| Token | Value |
|-------|-------|
| `--chart-1` | `--accent-primary` (teal, 100%) |
| `--chart-2` | teal, 80% opacity |
| `--chart-3` | teal, 60% opacity |
| `--chart-4` | teal, 40% opacity |
| `--chart-5` | teal, 20% opacity |

This is a single-hue opacity ramp, not the separate red/amber/green performance-grading system speculated on in the color spec (Section 9 there was explicitly flagged [Guessing], read off a screenshot, not the real implementation — this supersedes it).

**Flagging a real risk, not just a note:** opacity ramps are hard to distinguish past 3–4 steps even with normal vision, and `--chart-5` at 20% opacity teal on a #131316 background will have very low contrast — likely to fail legibility for any data series that lands on that step. This works fine for a single-series chart (e.g. one mana curve) but will not hold up if any dashboard needs to compare more than 2–3 categories at once side by side.

**Attribute-rating bars (Analysis tab):** Confirmed wired to tokens — bar fill always uses `--accent-primary`, score text uses conditional coloring (`--accent-primary` ≥7, `--signal-warning` 4–6, `--signal-critical` 1–3). Category distribution bars use `--signal-warning` for below-target and `--accent-primary` for on/above-target. This means low scores and "critical" card states share a color (`--signal-critical`) — confirmed intentional, since the context (a rating number vs. a card badge) disambiguates.

## 10. Confirmed-fine, No Action Needed

- Neutral ramp, spacing values 1–7, two-weight typography, row height/padding/status-slot, detail panel width, PageHeader on the four list-view pages, badge alpha convention.
- `--primary-foreground: #ffffff` (pure white on the teal button) — correct as a deliberate exception to the "no pure white" rule, since it's sitting on a saturated color fill rather than the near-black canvas.
- Brew Canvas ownership dots — NOW consuming `--status-owned`, `--status-proxy`, `--status-unowned` directly from tokens.css (fixed).
- Attribute-rating bars — wired to `--accent-primary` / `--signal-warning` / `--signal-critical` (confirmed).

## 11. Outstanding — Carried Forward or Newly Surfaced

- [ ] Confirm the blue-leak audit (Draft filter, Brew tab) is actually fixed visually, not just inferred fixed from the token layer being correct.
- [ ] Resolve whether `--signal-warning`'s "over-allocation hints" usage is a deliberate two-tier pattern against `--status-over`, or redundant.
- [ ] Confirm Collection/Allocation thumbnail-display parity.
- [ ] Confirm Collection header button weighting (primary vs. secondary).
- [ ] Confirm master-detail panel's numeric-restatement requirement was implemented.
- [ ] Decide whether `px-5` page padding stays a scale exception or snaps to `--space-5`.
- [ ] Deck lifecycle taxonomy (Active/Draft/Inactive on the Decks page) still has no dedicated token set — it's a third state axis, distinct from ownership and allocation, and currently has no documented color assignment now that blue is off the table. Recommend formalizing this as its own small section in the color spec before it gets built ad hoc.
