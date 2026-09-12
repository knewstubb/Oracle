# Design: Deck Import Flow V2

> Last updated: 2026-07-16
> Status: Final
> Reference implementation: `src/components/DeckImportButton.tsx`

## Design Goals

- Single unified dialog for all import methods
- Clear mode selection after parsing
- Fast feedback on parse success/failure
- Commander detection from various formats

## Dialog Flow

```
┌─────────────────────────────────────────────┐
│  Import Deck                                │
├─────────────────────────────────────────────┤
│  [URL] [Paste List] [CSV]                   │  ← Tab selection
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ https://archidekt.com/decks/123...  │   │  ← Input area
│  └─────────────────────────────────────┘   │
│                                             │
│  [Parse →]                                  │
└─────────────────────────────────────────────┘

       ↓ (on successful parse)

┌─────────────────────────────────────────────┐
│  Korvold, Fae-Cursed King (100 cards)       │
├─────────────────────────────────────────────┤
│                                             │
│  ○ These are new cards                      │
│    Creates physical copies & fills slots    │
│                                             │
│  ○ Match against my collection              │
│    Checks what you own, resolve via Picklist│
│                                             │
│  [Import →]                                 │
└─────────────────────────────────────────────┘
```

## Text Parser Grammar

```typescript
// Supported formats:
// 1 Sol Ring
// 1x Sol Ring
// 1 Sol Ring (CMR) 472
// Commander:
// 1 Korvold, Fae-Cursed King
// SB: 1 Card Name
// // Comments and blank lines ignored
```

## URL Detection

```typescript
const platformPatterns = {
  archidekt: /archidekt\.com\/decks\/(\d+)/,
  moxfield: /moxfield\.com\/decks\/([a-zA-Z0-9-]+)/,
  mtggoldfish: /mtggoldfish\.com\/deck\/(\d+)/,
  tappedout: /tappedout\.net\/mtg-decks\/([^\/]+)/,
  deckbox: /deckbox\.org\/sets\/(\d+)/,
}
```

## Import Mode Behavior

### "These are new cards"

```typescript
// 1. Create physical_copies rows for each card
// 2. Link to deck_cards via physical_copy_id
// 3. Set ownership_status = 'original'
// 4. Result: deck is 100% resolved (all Original)
```

### "Match against my collection"

```typescript
// 1. Create deck_cards rows only
// 2. physical_copy_id = NULL
// 3. ownership_status = NULL (unresolved)
// 4. Result: deck needs Picklist resolution
```

## Key Decisions

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Always Brewing | Yes | Let user choose status | Simpler flow, consistent behavior |
| Mode picker after parse | Yes | Mode picker before | User sees what they're getting first |
| Text parser permissive | Yes | Strict MTGA format | Handle various sources gracefully |

## Components

- `DeckImportButton.tsx` — Dialog with tab selection
- `text-deck-parser.ts` — Permissive text parser
- `url-parser.ts` — Platform URL detection
- `deck-import.ts` — Core import logic

## Provenance

- Authored: 2026-07-16
- Shipped: 2026-07-16
