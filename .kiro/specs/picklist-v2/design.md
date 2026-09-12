# Design: Picklist 3-Column View

> Last updated: 2026-07-16
> Status: Final
> Reference implementation: `src/components/PicklistV2.tsx`

## Design Goals

- See all unresolved cards at once
- Clear visual grouping by resolution path
- Quick actions without navigation
- Real-time progress feedback

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Progress: ████████████░░░░░░░░░░  65/100                        │
│            Original  Proxy  Available  Claimed  Unowned          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  In Storage          │  In Decks           │  Unowned            │
│  (Available)         │  (Claimed)          │                     │
│                      │                     │                     │
│  ─ Trade Binder ─    │  ─ Korvold (Active) │  Rhystic Study      │
│  Sol Ring    [Claim] │  Dockside  [Claim]  │  [Proxy]            │
│  Mana Crypt  [Claim] │                     │                     │
│                      │  ─ Prosper (Brew) ─ │  Smothering Tithe   │
│  ─ Commander Box ─   │  Treasure Map       │  [Proxy]            │
│  Arcane Signet       │  [Claim]            │                     │
│  [Claim]             │                     │                     │
│                      │                     │                     │
└──────────────────────────────────────────────────────────────────┘
```

## Progress Bar Segments

| Segment | Color | Meaning |
|---------|-------|---------|
| Original | Green | Physical copy assigned |
| Proxy | Blue | Proxy assigned |
| In Storage | Light grey | Available to claim |
| In Decks | Amber | Held by other decks |
| Unowned | Pink | Need to buy or proxy |

## Card Row Component

```tsx
interface PicklistCardRow {
  cardName: string
  setCode?: string
  status: 'available' | 'claimed' | 'unowned'
  location?: string  // storage location or deck name
  deckStatus?: 'brewing' | 'in_rotation' | 'graveyard'
  onAction: () => void
}
```

## Claim Flow

### Available (Storage)

```typescript
// Direct assignment, no confirmation
await assignPhysicalCopy(deckId, copyId)
invalidateQueries()
```

### Claimed (Other Deck)

```typescript
// Tier 4 confirmation for In Rotation decks
if (holdingDeck.status === 'in_rotation') {
  const confirmed = await confirm(
    `Pull from ${holdingDeck.name}? It's in rotation.`
  )
  if (!confirmed) return
}
await reassignPhysicalCopy(copyId, fromDeckId, toDeckId)
invalidateQueries()
```

### Unowned

```typescript
// Create proxy and assign
const proxyId = await createProxy(cardName, scryfallId)
await assignPhysicalCopy(deckId, proxyId)
invalidateQueries()
```

## Card Hover Preview

- Follows cursor position
- 220px width, 5:7 aspect ratio
- 200ms delay before showing
- Viewport-clamped positioning
- Uses `CardHoverPreview` component

## Key Decisions

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Three columns | Yes | Two columns (resolved/unresolved) | More actionable grouping |
| Separate tab | Yes | Inline in Cards tab | Dedicated resolution workflow |
| Self-filter | Yes | Show current deck in Claimed | Confusing to claim from self |

## Components

- `PicklistV2.tsx` — Main component with three columns
- `usePicklistData.ts` — Data fetching hook
- `CardHoverPreview.tsx` — Cursor-following preview
- `useCardHoverPreview.ts` — Preview state management

## Provenance

- Authored: 2026-07-16
- Shipped: 2026-07-16
