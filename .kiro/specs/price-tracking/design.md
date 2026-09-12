# Design: Price Tracking

> Last updated: 2026-07-22
> Status: Final
> Reference implementation: `src/lib/price-store.ts`

## Design Goals

- Non-intrusive price display (complements, doesn't dominate)
- Efficient cached lookups
- Single source of truth (Scryfall)
- Responsive refresh UX

## Data Flow

```
Scryfall API → Daily Cron → ref_printings.price_usd → UI Display
                     ↑
              Manual Refresh
```

## Schema

```sql
-- Prices stored on ref_printings (shared card data)
ref_printings (
  scryfall_id UUID PRIMARY KEY,
  price_usd NUMERIC(10,2),
  price_usd_foil NUMERIC(10,2),
  price_eur NUMERIC(10,2),
  price_eur_foil NUMERIC(10,2)
)

-- Collection value computed via JOIN
SELECT SUM(rp.price_usd) as total_value
FROM user_copies uc
JOIN ref_printings rp ON uc.scryfall_id = rp.scryfall_id
WHERE uc.user_id = $1 AND NOT uc.is_proxy
```

## Collection Value Banner

```
┌─────────────────────────────────────────────────────────────────┐
│  Collection Value                                               │
│  ──────────────────────────────────────────────────────────────│
│  $12,547.30           +$1,234.50 (10.9%)        4,821 cards    │
│  Total Value          Gain/Loss                 Card Count      │
│                                                                 │
│  Most Valuable: Gaea's Cradle ($850.00)        [Refresh Prices]│
└─────────────────────────────────────────────────────────────────┘
```

## Cron Job

```typescript
// .github/workflows/sync-prices.yml or Vercel cron
// Runs daily at 10:00 UTC

export async function refreshPrices() {
  const scryfall = await fetch('https://api.scryfall.com/bulk-data')
  // Download oracle_cards bulk file
  // Parse JSON, extract prices
  // Batch update ref_printings
  // ~100k cards in ~30-60 seconds
}
```

## Refresh UX

```typescript
const handleRefresh = async () => {
  setRefreshing(true)
  try {
    await fetch('/api/collection/refresh-prices', { method: 'POST' })
    toast.success('Prices updated')
    invalidateQueries()
  } catch {
    toast.error('Failed to refresh prices')
  } finally {
    setRefreshing(false)
  }
}
```

## Key Decisions

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Scryfall as source | Yes | Card Kingdom | Scryfall is free, comprehensive |
| Store on ref_printings | Yes | Separate prices table | Simpler joins, single source |
| Manual + cron refresh | Yes | Real-time API calls | Rate limits, performance |

## Components

- `CollectionValueBanner.tsx` — Displays value, gain/loss, top card
- Price column in `CardGroupSection.tsx` rows
- `/api/collection/refresh-prices` — Manual refresh endpoint
- `/api/cron/sync-prices` — Automated daily job

## Provenance

- Authored: 2026-07-22
- Shipped: 2026-07-22
