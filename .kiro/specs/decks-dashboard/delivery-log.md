# Delivery Log — Decks Dashboard

## 2026-07-26: DeckTile Visual Refinements + CardsTab Grouping

### What Changed
Multiple visual refinements to DeckTile component based on Figma review, plus functional improvements to CardsTab grouping options.

### Files Modified
- `the-oracle/src/components/DeckTile.tsx` — Visual refinements
- `the-oracle/src/components/CardsTab.tsx` — Grouping functions now use real data
- `the-oracle/src/app/page.tsx` — Grid layout adjustments
- `the-oracle/src/app/settings/components/page.tsx` — Component library updates

### DeckTile Changes

**Dimensions:**
- Card: 236×260px (fits 6 across at 1456px content width with 8px gaps)
- Art height: 156px
- Footer height: 104px

**Border:**
- 0.5px solid, wrapping all 4 sides
- Green (#1D9E75) for ready, Amber (#EF9F27) for needs-pull/overcount, Red (#E24B4A) for unowned
- Purple (#8F51D5) for brewing (solid, not dashed)
- Subtle outer glow on amber/red states (8px radius, 25% opacity)

**Art:**
- Darkened to 70% brightness by default
- Brightens to 100% on hover (with scale effect)

**Footer layout:**
- `justify-between` to push color bar to bottom
- Color bar 8px from bottom edge (via `pb-2`)
- Text wrapped in container div for proper spacing

**Colors:**
- Commander name: #808080 (muted gray)
- Icon/count text: matches border color

**Icons:**
- Ready: Check
- Needs pull: BookOpen  
- Overcount: Hash
- Unowned: Ban (was Circle)
- Brewing: FlaskConical
- Graveyard: Skull

### CardsTab Grouping Changes

**Now functional with real data:**
- **Category**: Uses `categories` field → ramp, draw, removal, etc.
- **Type**: Parses category → Creature, Instant, Sorcery, Artifact, Enchantment, Land, Planeswalker, Other
- **Color**: Extracts from `mana_cost` → White, Blue, Black, Red, Green, Multicolor, Colorless
- **CMC**: Parses `mana_cost` → 0, 1, 2, 3, 4, 5, 6, 7+
- **Price**: Uses `price_usd` → $0–$0.50, $0.50–$1, $1–$2, $2–$5, $5–$10, $10–$20, $20–$50, $50–$100, $100+

Empty groups are automatically hidden.

### Grid Layout Changes
- Gap reduced from 16px to 8px (`gap-2`)
- Cards left-aligned (removed `justify-center`)
- Skeleton loading updated to match new dimensions

### Component Library Updates
- Real Scryfall commander IDs for demo tiles
- Updated spec reference with new dimensions
- Reflects all visual changes

### Why
User Figma review identified:
1. Border should wrap entire card, not just left edge
2. Color bar should be inside footer with margin and rounded ends
3. Cards need to fit 6 across the content width
4. Brewing should be purple (#8F51D5), not blue
5. Grouping by CMC, Color, and Price should work with real card data

### Deferred
- None
