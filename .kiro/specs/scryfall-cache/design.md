# Design: Scryfall Printings Cache

> Last updated: 2026-07-26
> Status: Final
> Reference implementation: `src/lib/scryfall-cache.ts`

## Design Goals

- Instant card lookups without external API
- Comprehensive printing coverage
- Automatic currency with new releases

## Schema

```sql
ref_printings (
  scryfall_id UUID PRIMARY KEY,
  oracle_id UUID,           -- Links to ref_cards
  name TEXT NOT NULL,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  rarity TEXT,              -- common/uncommon/rare/mythic
  mana_cost TEXT,
  type_line TEXT,
  color_identity TEXT[],
  colors TEXT[],
  cmc NUMERIC,
  layout TEXT,
  image_uri_small TEXT,
  image_uri_normal TEXT,
  image_uri_large TEXT,
  image_uri_art_crop TEXT,
  price_usd NUMERIC(10,2),
  price_usd_foil NUMERIC(10,2),
  price_eur NUMERIC(10,2),
  price_eur_foil NUMERIC(10,2),
  released_at DATE,
  reprint BOOLEAN,
  digital BOOLEAN,
  legality_commander TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

CREATE INDEX idx_ref_printings_oracle_id ON ref_printings(oracle_id);
CREATE INDEX idx_ref_printings_name ON ref_printings(name);
CREATE INDEX idx_ref_printings_set_code ON ref_printings(set_code);
```

## Sync Process

```typescript
// Daily cron job
async function syncScryfallPrintings() {
  // 1. Fetch bulk data manifest
  const manifest = await fetch('https://api.scryfall.com/bulk-data')
  const allCards = manifest.data.find(d => d.type === 'all_cards')
  
  // 2. Download full bulk file (~250MB JSON)
  const cards = await downloadAndParse(allCards.download_uri)
  
  // 3. Filter to paper cards
  const paperCards = cards.filter(c => !c.digital)
  
  // 4. Batch upsert to ref_printings
  for (const batch of chunk(paperCards, 1000)) {
    await supabase.from('ref_printings').upsert(batch, {
      onConflict: 'scryfall_id',
      ignoreDuplicates: false
    })
  }
}
```

## Lookup Chain

```typescript
async function lookupCard(query: CardQuery): Promise<CardData | null> {
  // 1. Try local cache first
  const cached = await supabase
    .from('ref_printings')
    .select('*')
    .eq('name', query.name)
    .maybeSingle()
  
  if (cached.data) {
    return cached.data
  }
  
  // 2. Fall back to Scryfall API
  const scryfall = await fetch(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(query.name)}`
  )
  
  if (scryfall.ok) {
    const card = await scryfall.json()
    // Optionally cache for future
    await cacheCard(card)
    return card
  }
  
  return null
}
```

## Key Decisions

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Cache all printings | Yes | Only owned | Enables recommendations |
| Daily sync | Yes | Real-time | Avoids rate limits |
| Bulk download | Yes | Incremental | Scryfall bulk API is fastest |

## Components

- `scryfall-cache.ts` — Sync logic
- `card-lookup.ts` — Lookup with fallback chain
- `/api/cron/sync-printings` — Cron endpoint
- Vercel cron config in `vercel.json`

## Provenance

- Authored: 2026-07-26
- Shipped: 2026-07-26
