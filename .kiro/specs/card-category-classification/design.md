# Design: Card Category Classification

> Last updated: 2026-07-26
> Status: Final
> Reference implementation: `scripts/classify-mtg-cards.ts`

## Design Goals

- Accurate functional classification for deck health
- Fast lookup without API calls
- Extensible taxonomy
- Clear confidence indicators

## Schema

```sql
-- Column on canonical card table
mtg_cards (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE,
  oracle_text TEXT,
  -- ... other fields
  default_category JSONB
)

-- JSONB structure
{
  "primary": "ramp",
  "secondary": ["utility:fixing"],
  "confidence": "high",
  "notes": "Sol Ring — quintessential mana rock"
}
```

## Category Taxonomy

### Primary Categories

| Category | Oracle Text Signals | Examples |
|----------|---------------------|----------|
| Ramp | "Add {", "search...land...battlefield", "costs less" | Sol Ring, Cultivate |
| Draw | "draw a card", "draw N cards", "exile...may play" | Brainstorm, Harmonize |
| Engine | "double", "whenever an opponent", "untap all" | Rhystic Study, Panharmonicon |
| Removal | "destroy target", "exile target", "deals X damage to" | Swords, Murder |
| Removal:Mass | "destroy all", "exile each" | Wrath of God |
| Removal:Tempo | "return target...to its owner's hand" | Cyclonic Rift |
| Counterspell | "counter target spell" | Counterspell |
| Counterspell:Conditional | "counter...unless" | Mana Leak |
| Tutor | "search your library for a" (non-land) | Demonic Tutor |
| Protection | "gains hexproof", "indestructible", "prevent" | Heroic Intervention |
| Protection:Mass | "prevent all combat damage" | Fog |
| Recursion | "return...from your graveyard" | Reanimate |
| Discard | "discards a card" (opponent) | Thoughtseize |
| Finisher | "you win the game", massive damage | Craterhoof |
| Mill | "mills N cards" | Mesmeric Orb |
| Creature | Default for creatures without stronger role | — |
| Land | Default for lands without stronger role | — |
| Utility | Catch-all | Various |

### Utility Sub-tags

```
utility:tokens    — Creates tokens
utility:fixing    — Mana fixing without net increase
utility:stax      — Taxing or restricting opponents
utility:selection — Scry, surveil, top-deck manipulation
utility:sac-outlet — Enables sacrificing permanents
utility:anthem    — Static buffs to creatures
utility:hate      — Graveyard hate, artifact hate
utility:lifegain  — Life gain as primary effect
```

## Classifier Logic

```typescript
function classifyCard(card: CardData): Classification {
  const text = card.oracle_text?.toLowerCase() ?? ''
  
  // Check patterns in priority order
  if (isCounterspell(text)) return { primary: 'counterspell', ... }
  if (isRemovalMass(text)) return { primary: 'removal:mass', ... }
  if (isRemoval(text)) return { primary: 'removal', ... }
  if (isRamp(text)) return { primary: 'ramp', ... }
  if (isDraw(text)) return { primary: 'draw', ... }
  // ... etc
  
  // Fallback by card type
  if (card.type_line.includes('Creature')) return { primary: 'creature', ... }
  if (card.type_line.includes('Land')) return { primary: 'land', ... }
  return { primary: 'utility', ... }
}
```

## Key Decisions

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Rule-based | Yes | LLM classification | Deterministic, no API cost |
| Card-level storage | Yes | Per-deck only | New cards inherit automatically |
| JSONB format | Yes | Separate table | Simpler queries, single read |

## Provenance

- Authored: 2026-07-26
- Shipped: 2026-07-26
