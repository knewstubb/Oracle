# Card Data & Pricing

> Last updated: 2026-07-26

## Overview

The Oracle maintains a local cache of all Scryfall card printings (~100K cards) with prices, images, and metadata. This enables instant card lookups without hitting external APIs, faster image loading via cached URLs, and accurate pricing across all printings.

## Architecture

### Data Flow

```
Scryfall Bulk API (Default Cards JSONL)
       ↓
Daily Sync (10:00 UTC via Vercel cron)
       ↓
scryfall_printings table (~100K rows)
       ↓
card-lookup.ts service
       ↓
App queries (import engine, brew, tool registry)
```

### Table: scryfall_printings

| Column | Type | Purpose |
|--------|------|---------|
| scryfall_id | TEXT PK | Unique printing identifier |
| oracle_id | TEXT | Links all printings of the same card |
| name | TEXT | Card name (full, including DFC back) |
| set_code | TEXT | Three-letter set code (lowercase) |
| set_name | TEXT | Full set name |
| collector_number | TEXT | Collector number within set |
| rarity | TEXT | common, uncommon, rare, mythic |
| price_usd | NUMERIC(12,2) | Current USD price |
| price_usd_foil | NUMERIC(12,2) | Current USD foil price |
| price_eur | NUMERIC(12,2) | Current EUR price |
| price_eur_foil | NUMERIC(12,2) | Current EUR foil price |
| image_uri_small | TEXT | 146×204 image URL |
| image_uri_normal | TEXT | 488×680 image URL |
| image_uri_large | TEXT | 672×936 image URL |
| image_uri_art_crop | TEXT | Art-only crop URL |
| type_line | TEXT | Full type line |
| mana_cost | TEXT | Mana cost string |
| cmc | NUMERIC | Converted mana cost |
| colors | TEXT[] | Card colors |
| color_identity | TEXT[] | Commander color identity |
| legality_commander | TEXT | Commander format legality |
| layout | TEXT | Card layout (normal, transform, split, etc.) |
| released_at | DATE | Set release date |
| reprint | BOOLEAN | Is this a reprint? |
| digital | BOOLEAN | Digital-only printing? |
| updated_at | TIMESTAMPTZ | Last sync timestamp |

### Indexes

- `scryfall_id` (primary key)
- `oracle_id` — for "all printings of card X"
- `name` — for name-based lookups
- `(set_code, collector_number)` — for set/number lookups
- `price_usd WHERE price_usd IS NOT NULL` — for price queries
- `legality_commander WHERE legality_commander = 'legal'` — for commander-legal cards

## Sync Mechanism

### Initial Load

Run the local script for the first bulk load (~100K cards):

```bash
cd the-oracle
set -a && source .env.local && set +a
npx tsx scripts/sync-scryfall-printings.ts
```

This downloads the full Scryfall Default Cards JSONL (~100MB compressed, ~600MB decompressed) and upserts in batches of 500.

**Note:** Run the price column widening migration first if you haven't already (high-value cards like Black Lotus need NUMERIC(12,2)):

```sql
-- Run in Supabase SQL Editor
ALTER TABLE scryfall_printings
  ALTER COLUMN price_usd TYPE NUMERIC(12, 2),
  ALTER COLUMN price_usd_foil TYPE NUMERIC(12, 2),
  ALTER COLUMN price_eur TYPE NUMERIC(12, 2),
  ALTER COLUMN price_eur_foil TYPE NUMERIC(12, 2);
```

### Daily Refresh

1. Vercel cron triggers `/api/cron/sync-scryfall` at 10:00 UTC daily
2. The route calls the Supabase Edge Function `scryfall-sync`
3. Edge Function checks `sync_meta.scryfall_printings_last_sync` to skip if already current
4. Downloads Scryfall bulk data, decompresses, upserts changes

**Why 10:00 UTC?** Scryfall updates their bulk data around 09:00 UTC. Running at 10:00 catches new card releases same-day.

### Edge Function Memory Limits

The Supabase Edge Function may hit memory limits on the full 600MB decompressed file. The initial load should use the local script. Daily incremental updates are smaller and typically work in the Edge Function.

## Card Lookup Service

`src/lib/card-lookup.ts` provides the lookup interface:

### Functions

| Function | Purpose | Fallback |
|----------|---------|----------|
| `lookupByScryfallId(id)` | Find by printing UUID | Scryfall API |
| `lookupBySetAndNumber(set, num)` | Find by set + collector number | Scryfall API |
| `lookupByName(name)` | Find most recent printing | Scryfall API (exact, then fuzzy) |
| `lookupManyByName(names)` | Batch lookup | Scryfall /cards/collection |
| `getAllPrintings(name)` | All printings of a card | None |
| `getCheapestPrinting(name)` | Cheapest USD printing | None |

All functions check local DB first, falling back to Scryfall API only for cards not yet synced.

### Usage Example

```typescript
import { lookupByName, getCheapestPrinting } from '@/lib/card-lookup'

// Get card data
const result = await lookupByName('Rhystic Study')
if (result.card) {
  console.log(`${result.card.name}: $${result.card.price_usd}`)
  console.log(`Image: ${result.card.image_uri_normal}`)
}

// Find budget option
const cheap = await getCheapestPrinting('Rhystic Study')
if (cheap) {
  console.log(`Cheapest: ${cheap.set_name} at $${cheap.price_usd}`)
}
```

## Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260726160000_scryfall_printings.sql` | Table schema + indexes |
| `supabase/migrations/20260727000000_widen_price_columns.sql` | Widen price columns for high-value cards |
| `scripts/sync-scryfall-printings.ts` | Local bulk import script |
| `supabase/functions/scryfall-sync/index.ts` | Edge Function for daily sync |
| `src/app/api/cron/sync-scryfall/route.ts` | Vercel cron trigger |
| `src/lib/card-lookup.ts` | Lookup service |
| `vercel.json` | Cron schedule (10:00 UTC daily) |

## Benefits

1. **Faster lookups** — Local DB query vs API call (~5ms vs ~200ms)
2. **No rate limits** — Scryfall API has 50ms delay requirement
3. **Offline-capable** — Works without internet once synced
4. **Multi-tenant ready** — No user_id, shared across all users
5. **Image URL caching** — Faster image rendering (still served from Scryfall CDN)
6. **Price history potential** — Could add historical tracking later

## Future Ideas

- [ ] Historical price tracking (daily snapshots)
- [ ] Price alerts ("notify when card drops below $X")
- [ ] Cheapest vendor comparison (TCGPlayer, Card Kingdom, etc.)
- [ ] Printing rarity analysis ("how many printings exist?")
