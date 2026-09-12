# Design: Deck Lifecycle Overhaul

> Last updated: 2026-07-16
> Status: Final
> Reference implementation: `src/components/StatusControl.tsx`

## Design Goals

- Clear, intuitive lifecycle names that reflect commitment, not completion
- Visual distinction between states at a glance
- Smooth transitions with appropriate gating
- Claim completeness visible for active decks

## State Machine

```
Brewing ──────────► In Rotation
   ▲                     │
   │                     │
   │   ◄─────────────────┘
   │
   ▼                     ▼
Graveyard ◄──── (from either)
   │
   └──► Brewing (Resurrect)
```

## Visual Treatment

### Deck Tiles

| State | Border | Background | Badge | Extra |
|-------|--------|------------|-------|-------|
| Brewing | Dashed | Normal | Teal "Brewing" | — |
| In Rotation | Solid | Normal | Teal "In Rotation" | Completeness dot |
| Graveyard | Solid | Desaturated | Grey "Graveyard" | — |

### Completeness Indicator

- **Green dot**: All slots resolved (Original or Proxy)
- **Amber dot**: 90%+ slots resolved
- **Red dot + triangle**: < 90% slots resolved

### Status Control UI

Three-segment control in deck header:
- Left: Brewing
- Center: In Rotation
- Right: Graveyard

Clicking a segment triggers transition validation.

## Database Schema

```sql
-- Existing column, renamed display values
decks.status: 'brewing' | 'in_rotation' | 'graveyard'

-- Completeness computed from deck_cards join physical_copies
-- No stored denormalization
```

## Transition Logic

### Brewing → In Rotation

```typescript
// Validate card count
const { targetCount, minCount } = getFormatConfig(deck.format)
if (deck.card_count < minCount) {
  throw new Error(`Need at least ${minCount} cards`)
}
if (targetCount && deck.card_count !== targetCount) {
  throw new Error(`Commander requires exactly ${targetCount} cards`)
}
```

### Any → Graveyard

```typescript
// Prompt for card release
if (hasClaimedCards) {
  const release = await confirmDialog("Release cards?")
  if (release) {
    await releaseAllCards(deckId)
  }
}
await updateStatus(deckId, 'graveyard')
```

## Key Decisions

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Display names | Brewing/In Rotation/Graveyard | Brew/Built/Archived | "In Rotation" conveys commitment without implying 100% physical |
| Completeness indicator | Dot on tile | Badge text | Quick visual scan without reading |
| Resurrect target | Always Brewing | User choice | Simpler flow, prevents confusion |

## Components

- `StatusControl.tsx` — Three-segment toggle with transition logic
- `StatusBadge.tsx` — Styled badge for status display
- `DeckTile.tsx` — Includes completeness dot rendering
- `StatusFilter.tsx` — Filter decks by status on grid

## Provenance

- Authored: 2026-07-16
- Shipped: 2026-07-16
