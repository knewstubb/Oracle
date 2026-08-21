# Design: Hybrid Category System

> Last updated: 2026-08-12
> Status: Draft
> Author: Margaret (Developer)

## Problem

The current category system uses fixed, generic categories (Ramp, Draw, Removal, etc.) that work well for staples but miss the unique roles that matter for specific commanders.

**Example:** In a Ghen, Arcanum Weaver deck, the generic categories don't capture:
- "Ghen Engine" — sac outlets + enchantment recursion that make the loop work
- "Discard Fuel" — looting effects that stock the graveyard
- "Ghen Protection" — effects that protect Ghen specifically (not generic protection)
- "Saga Payoffs" — cards that only matter because you're recurring sagas

A [[Sol Ring]] is "Ramp" in every deck. But [[Claws of Gix]] is only relevant *in Ghen* — it's not ramp, draw, or removal. It's "Engine" in a generic sense, but the specific role is "Sac Outlet for the Loop."

## Goals

1. **Keep generic categories as baseline** — Ramp, Draw, Removal, etc. still matter for deck health checks
2. **Support commander/archetype-specific overlays** — per-deck custom categories that supplement (not replace) generics
3. **Oracle can suggest custom categories** — during brewing, AI proposes categories tailored to the commander's strategy
4. **UI shows both layers** — generic category for health analysis, custom category for strategic grouping

## Non-Goals

- Replacing the generic taxonomy (still needed for cross-deck health comparisons)
- Enforcing a single "correct" custom category set per commander (users can override)
- Fully automated category generation (user confirmation required)

---

## Design

### Data Model

#### Option A: Per-Deck Custom Categories (Recommended)

Add a `custom_categories` JSONB column to `decks`:

```sql
ALTER TABLE decks ADD COLUMN custom_categories JSONB DEFAULT NULL;
```

Schema:

```typescript
interface DeckCustomCategories {
  // Categories defined for this deck
  categories: CustomCategory[]
  
  // When these were generated/last edited
  created_at: string // ISO date
  source: 'ai' | 'user' | 'template'
}

interface CustomCategory {
  name: string           // "Ghen Engine", "Discard Fuel"
  description: string    // "Cards that sacrifice enchantments or enable Ghen's recursion loop"
  target_count?: number  // Suggested count (e.g., 8-10)
  emoji?: string         // Optional emoji prefix for display
}
```

**Pros:** 
- User can customize categories per-deck
- Same commander, different builds can have different categories
- Categories live with the deck, not globally

**Cons:**
- Redundant if user builds multiple Ghen decks
- No shared templates across users

#### Option B: Commander-Level Templates

Store suggested categories on `ref_commanders` or `ref_commander_builds`:

```sql
ALTER TABLE ref_commander_builds ADD COLUMN suggested_categories JSONB DEFAULT NULL;
```

**Pros:**
- Shared across all users building the same archetype
- Can be curated/improved over time
- Oracle can pull from known-good templates

**Cons:**
- User can't customize without per-deck override anyway
- Need to sync with EDHREC or manually curate

#### Recommended: Hybrid of Both

1. **`ref_commander_builds.suggested_categories`** — AI-generated or curated templates per archetype
2. **`decks.custom_categories`** — per-deck override/customization (starts as copy of template)

User flow:
1. User starts building Ghen (Saga theme)
2. Oracle pulls `suggested_categories` from `ref_commander_builds` for Ghen/Saga
3. Categories copied to `decks.custom_categories` for this deck
4. User can edit categories in the deck editor
5. If user picks a different build (e.g., Ghen/Aristocrats), categories reset to that template

### Card-to-Category Assignment

Current: `deck_cards.categories` stores JSON like `["Ramp", "Draw"]`

Extended: Support both generic and custom:

```typescript
interface HybridCategories {
  // Generic (for health engine)
  generic: {
    primary: string        // "Ramp"
    secondary?: string[]   // ["Draw"]
  }
  
  // Custom (for strategic grouping)
  custom?: {
    primary: string        // "Ghen Engine"
    secondary?: string[]   // ["Sac Outlet"]
  }
}
```

**Storage:** Could serialize as JSON in `deck_cards.categories`, or add a separate `deck_cards.custom_category` column.

Simpler approach: Keep `deck_cards.categories` for generic. Add `deck_cards.custom_category` (string, nullable) for the primary custom category:

```sql
ALTER TABLE deck_cards ADD COLUMN custom_category TEXT DEFAULT NULL;
```

### UI Changes

#### Deck View — Grouping Mode Toggle

Add a toggle in the deck header:
- **"By Role"** — groups by generic category (Ramp, Draw, Removal...)
- **"By Strategy"** — groups by custom category (Ghen Engine, Discard Fuel...)

Both views show the same cards, different groupings.

#### Card Row — Dual Category Display

Show both categories on hover or in expanded view:
```
Sol Ring
├── Role: Ramp
└── Strategy: (none — it's just ramp)

Claws of Gix
├── Role: Utility (Sac Outlet)
└── Strategy: Ghen Engine
```

#### Category Editor

When editing a card's category:
1. Primary dropdown: generic categories (from taxonomy)
2. Secondary dropdown: custom categories (from `deck.custom_categories`)

#### Deck Settings — Custom Category Manager

UI to:
- View/edit the deck's custom categories
- Add new categories
- Remove unused categories
- Reset to template (if archetype template exists)

### Oracle Integration

#### During Brewing

When Oracle starts a new brew session:

1. Check if `ref_commander_builds` has `suggested_categories` for this commander/archetype
2. If yes, use as starting point
3. If no, generate categories dynamically based on the commander's strategy

Oracle prompt addition:

```
=== CUSTOM CATEGORIES ===

For this commander ({{commander_name}}), the strategic categories are:
{{#each custom_categories}}
- {{emoji}} {{name}} ({{target_count}} cards) — {{description}}
{{/each}}

When suggesting cards, assign them to both:
1. Generic role (Ramp, Draw, Removal, etc.) — for deck health
2. Strategic category (from the list above) — for the commander's specific game plan

Not every card needs a strategic category — staples like Sol Ring are just "Ramp."
Cards central to the commander's strategy SHOULD have one.
```

#### Category Suggestion Tool

Add a tool for Oracle to propose custom categories:

```typescript
{
  name: 'suggest_custom_categories',
  description: 'Propose commander-specific categories for a deck being built',
  input_schema: {
    type: 'object',
    properties: {
      commander_name: { type: 'string' },
      archetype: { type: 'string' },
      categories: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            target_count: { type: 'number' },
            emoji: { type: 'string' }
          }
        }
      }
    }
  }
}
```

### Health Engine Compatibility

The health engine MUST continue to use generic categories for its thresholds:
- Ramp: 10-14
- Draw: 10-14
- Removal: 8-12
- etc.

Custom categories are for **display/grouping only**, not health computation.

---

## Migration Path

### Phase 1: Schema + Basic UI (MVP)

1. Add `decks.custom_categories` JSONB column
2. Add `deck_cards.custom_category` TEXT column
3. Add grouping mode toggle (Role vs Strategy)
4. Oracle can suggest categories during brewing
5. User can manually edit custom categories per card

### Phase 2: Templates

1. Add `ref_commander_builds.suggested_categories`
2. Populate templates for popular commanders (top 50 by EDHREC)
3. Auto-populate `deck.custom_categories` from template on brew start
4. Add "Reset to Template" button in deck settings

### Phase 3: AI Enhancement

1. Oracle automatically categorizes cards into custom categories during skeleton generation
2. "Re-categorize deck" action that AI reviews and assigns custom categories to existing cards
3. Learn from user edits to improve templates

---

## Open Questions

1. **Should custom categories have target counts?**
   - Pro: Helps Oracle balance the deck
   - Con: Harder to define, varies by build
   - Recommendation: Optional, Oracle can suggest but not enforce

2. **Should we show custom category in grouped list view or only in detail view?**
   - Recommendation: Show in grouped list when "By Strategy" mode is active

3. **What happens when a card fits multiple custom categories?**
   - Recommendation: Single primary custom category (like generic), but could add secondary later

4. **Should templates be versioned?**
   - Recommendation: No, keep simple. User's `custom_categories` is their snapshot.

---

## Example: Ghen, Arcanum Weaver

### Suggested Categories (from template)

| Emoji | Name | Target | Description |
|-------|------|--------|-------------|
| 🔄 | Ghen Engine | 10-12 | Sac outlets, enchantment recursion, loop enablers |
| 📚 | Discard Fuel | 8-10 | Looting, self-mill, enchantments-to-yard |
| 🛡️ | Ghen Protection | 4-6 | Hexproof, indestructible, Ghen-specific survival |
| 🎯 | Seal Removal | 6-8 | Enchantment-based removal (Seal of Fire, Grasp of Fate) |
| 🦾 | Enchantment Payoffs | 4-6 | Starfield of Nyx, Opalescence, enchantress effects |
| 💀 | Death Triggers | 4-6 | Constellation, "when enchantment goes to graveyard" |

### Card Examples

| Card | Generic Role | Custom Category |
|------|--------------|-----------------|
| [[Sol Ring]] | Ramp | (none) |
| [[Claws of Gix]] | Utility (Sac Outlet) | 🔄 Ghen Engine |
| [[Tortured Existence]] | Recursion | 📚 Discard Fuel |
| [[Seal of Fire]] | Removal | 🎯 Seal Removal |
| [[Starfield of Nyx]] | Engine | 🦾 Enchantment Payoffs |
| [[Lightning Greaves]] | Protection | 🛡️ Ghen Protection |
| [[Doomwake Giant]] | Removal | 💀 Death Triggers |

---

## Provenance

- **Authored:** 2026-08-12 by Margaret (Developer)
- **Motivated by:** User request for commander-specific categories during Oracle chat about Ghen deck building
