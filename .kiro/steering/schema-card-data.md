# Schema: Card Data Model

## Overview

Card data is split across reference tables (shared, read-only) and user tables (per-user ownership). This separation allows efficient storage and querying.

**Important:** The schema was migrated from a denormalized structure. See "Migration Mappings" section below for old→new table/column names.

## Reference Tables (Read-Only)

### `ref_cards`
Oracle-level card data — one row per unique card name.

| Column | Type | Description |
|--------|------|-------------|
| `name` | string | Card name (PK) |
| `oracle_text` | string | Rules text |
| `power` | string | Power (creatures) |
| `toughness` | string | Toughness (creatures) |
| `mana_cost` | string | Mana cost string |
| `mana_value` | number | Converted mana cost |
| `type_line` | string | Full type line |
| `color_identity` | string | Color identity (e.g., "WUB") |
| `is_creature` | boolean | Is a creature |
| `is_legendary` | boolean | Is legendary |
| `can_be_commander` | boolean | Legal as commander |
| `commander_legal` | boolean | Legal in commander format |
| `edhrec_rank` | number | EDHREC popularity rank |
| `default_category` | json | Default deck category |

### `ref_printings`
Printing-level data — one row per set printing.

| Column | Type | Description |
|--------|------|-------------|
| `scryfall_id` | uuid | Scryfall ID (PK) |
| `oracle_id` | uuid | Links to oracle-level identity |
| `name` | string | Card name |
| `set_code` | string | Set code (e.g., "mh2") |
| `set_name` | string | Full set name |
| `collector_number` | string | Collector number |
| `rarity` | string | common/uncommon/rare/mythic |
| `mana_cost` | string | Mana cost string |
| `type_line` | string | Type line |
| `color_identity` | string[] | Color identity array |
| `colors` | string[] | Card colors |
| `cmc` | number | Converted mana cost |
| `layout` | string | Card layout (normal, transform, etc.) |
| `image_uri_small` | string | Small image URL |
| `image_uri_normal` | string | Normal image URL |
| `image_uri_large` | string | Large image URL |
| `image_uri_art_crop` | string | Art crop URL |
| `price_usd` | number | USD price |
| `price_usd_foil` | number | USD foil price |
| `price_eur` | number | EUR price |
| `price_eur_foil` | number | EUR foil price |
| `released_at` | date | Release date |
| `reprint` | boolean | Is a reprint |
| `digital` | boolean | Digital-only printing |
| `legality_commander` | string | Commander legality |

**Note:** `ref_printings` does NOT contain `oracle_text`, `power`, or `toughness`. Get those from `ref_cards`.

## User Tables (Per-User)

### `user_cards`
User's card ownership at the oracle level — one row per unique card the user owns.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `user_id` | uuid | User FK |
| `oracle_id` | uuid | Oracle ID (links to ref_printings.oracle_id) |
| `card_name` | string | Card name (denormalized for queries) |

### `user_copies`
Physical copies owned — one row per copy.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `user_id` | uuid | User FK |
| `card_id` | uuid | FK to user_cards.id |
| `scryfall_id` | uuid | Specific printing (FK to ref_printings) |
| `is_foil` | boolean | Foil copy |
| `is_proxy` | boolean | Proxy (not owned) |
| `condition` | string | Card condition |
| `acquired_price` | number | Purchase price |
| `notes` | string | User notes |

## Common Query Patterns

### Check if user owns a card
```typescript
// 1. Get oracle_id from ref_printings
const { data: printing } = await supabase
  .from('ref_printings')
  .select('oracle_id')
  .eq('name', cardName)
  .limit(1)
  .single()

// 2. Check user_cards for ownership
const { data: userCard } = await supabase
  .from('user_cards')
  .select('id')
  .eq('user_id', userId)
  .eq('oracle_id', printing.oracle_id)
  .maybeSingle()

// 3. Count copies if needed
const { count } = await supabase
  .from('user_copies')
  .select('id', { count: 'exact', head: true })
  .eq('card_id', userCard.id)
  .eq('is_proxy', false)
```

### Get card details with oracle text
```typescript
// Printing data (image, price, set)
const { data: printing } = await supabase
  .from('ref_printings')
  .select('*')
  .eq('name', cardName)
  .order('released_at', { ascending: false })
  .limit(1)
  .single()

// Oracle data (rules text, P/T)
const { data: card } = await supabase
  .from('ref_cards')
  .select('oracle_text, power, toughness')
  .eq('name', cardName)
  .single()
```

### Get user's collection with printing details
```typescript
const { data: copies } = await supabase
  .from('user_copies')
  .select(`
    id,
    is_foil,
    is_proxy,
    user_cards!inner(card_name, oracle_id),
    ref_printings!user_copies_scryfall_id_fkey(
      scryfall_id, name, set_code, set_name, 
      image_uri_normal, price_usd
    )
  `)
  .eq('user_id', userId)
```

## Commander Reference Tables

### `ref_commanders`
Commander-specific metadata — one row per legal commander.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `canonical_key` | string | URL-safe key (e.g., "yawgmoth-thran-physician") |
| `display_name` | string | Display name |
| `color_identity` | string | Color identity (e.g., "B", "WUB") |
| `scryfall_id` | uuid | FK to ref_printings |
| `leadership_type` | string | "commander", "partner", "background", etc. |
| `legal_commander` | boolean | Legal in Commander format |
| `legal_brawl` | boolean | Legal in Brawl |
| `legal_oathbreaker` | boolean | Legal in Oathbreaker |
| `needs_insights` | boolean | Flag for insight generation |
| `last_synced_at` | timestamp | Last sync from external source |

### `ref_commander_cards`
Recommended cards for specific commanders — curated staples/synergies.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `commander_id` | uuid | FK to ref_commanders.id |
| `card_name` | string | Card name |
| `card_role` | string | Role: "ramp", "removal", "wincon", "synergy", etc. |
| `position` | number | Display order / priority |
| `is_flexible` | boolean | Can be swapped for budget alternatives |

### `ref_commander_insights`
AI-generated or curated insights about commanders.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `commander_id` | uuid | FK to ref_commanders.id |
| `insight_type` | string | Type: "strategy", "synergy", "budget", etc. |
| `build_variant` | string | Build archetype (e.g., "aristocrats", "combo") |
| `content` | text | The insight text |
| `card_mentions` | string[] | Cards mentioned in the insight |
| `confidence` | number | Confidence score (0-1) |
| `source_type` | string | "edhrec", "ai", "curated", etc. |
| `source_url` | string | Source URL if applicable |
| `source_title` | string | Source title |
| `source_author` | string | Source author |
| `source_date` | date | Source publication date |

### `ref_commander_builds`
Build-specific data — each row is an archetype + theme combination for a commander.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `commander_id` | uuid | FK to ref_commanders.id |
| `archetype` | string | How deck wins: "aristocrats", "combo", "voltron", etc. (nullable) |
| `theme` | string | What deck is built from: "treasure", "artifacts", etc. (nullable) |
| `edhrec_theme_slug` | string | Original EDHREC tag slug |
| `deck_count` | number | Number of decks with this build |
| `deck_percentage` | number | % of total commander decks |
| `avg_lands` | number | Average land count |
| `avg_creatures` | number | Average creature count |
| `avg_instants` | number | Average instant count |
| `avg_sorceries` | number | Average sorcery count |
| `avg_artifacts` | number | Average artifact count |
| `avg_enchantments` | number | Average enchantment count |
| `avg_planeswalkers` | number | Average planeswalker count |
| `last_synced_at` | timestamp | Last sync from EDHREC |

### `ref_build_cards`
Build-specific card recommendations — top cards for each archetype+theme combo.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `build_id` | uuid | FK to ref_commander_builds.id |
| `card_name` | string | Card name |
| `card_type` | string | "creature", "instant", "land", etc. |
| `inclusion_rate` | number | % of decks running this card |
| `synergy_score` | number | EDHREC synergy % |
| `position` | number | Rank within card type |

### `ref_edhrec_recommendations`
Generic card recommendations per commander (not build-specific).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `commander_id` | uuid | FK to ref_commanders.id |
| `card_name` | string | Card name |
| `card_type` | string | "creature", "instant", etc. |
| `synergy_score` | number | EDHREC synergy % |
| `inclusion_rate` | number | % of decks running this card |
| `position` | number | Rank within card type |

### `ref_commander_taxonomy`
Links commanders to archetypes, themes, and tribes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `commander_id` | uuid | FK to ref_commanders.id |
| `tag_type` | string | "archetype", "theme", or "tribe" |
| `tag_value` | string | The tag value |
| `deck_count` | number | Decks with this tag |
| `is_primary` | boolean | Primary tag for this commander |

### Common Commander Queries

```typescript
// Get commander by canonical key
const { data: commander } = await supabase
  .from('ref_commanders')
  .select('*')
  .eq('canonical_key', 'yawgmoth-thran-physician')
  .single()

// Get commander with insights
const { data: commander } = await supabase
  .from('ref_commanders')
  .select(`
    *,
    ref_commander_insights(*)
  `)
  .eq('canonical_key', key)
  .single()

// Get commanders by color identity
const { data: commanders } = await supabase
  .from('ref_commanders')
  .select('*')
  .eq('color_identity', 'BG')
  .eq('legal_commander', true)

// Get all builds for a commander
const { data: builds } = await supabase
  .from('ref_commander_builds')
  .select(`
    *,
    ref_build_cards(*)
  `)
  .eq('commander_id', commanderId)
  .order('deck_count', { ascending: false })

// Get top cards for a specific build
const { data: cards } = await supabase
  .from('ref_build_cards')
  .select('*')
  .eq('build_id', buildId)
  .order('synergy_score', { ascending: false })
  .limit(20)
```

## Deck Tables (Per-User)

### `decks`
User's decks.

| Column | Type | Description |
|--------|------|-------------|
| `id` | number | Primary key |
| `user_id` | uuid | User FK |
| `name` | string | Deck name |
| `commander_id` | uuid | FK to ref_commanders.id |
| `build_id` | uuid | FK to ref_commander_builds.id (nullable) |
| `format` | string | "commander", "brawl", etc. |
| `status` | string | "active", "archived", etc. |
| `created_at` | timestamp | Creation date |
| `updated_at` | timestamp | Last modified |

**Note:** `build_id` links the deck to a specific archetype+theme build, enabling build-specific recommendations.

### `deck_cards`
Cards in a deck — one row per card slot.

| Column | Type | Description |
|--------|------|-------------|
| `id` | number | Primary key |
| `deck_id` | number | FK to decks.id |
| `card_name` | string | Card name |
| `scryfall_id` | uuid | Specific printing (nullable) |
| `set_code` | string | Set code (nullable) |
| `quantity` | number | Number of copies |
| `categories` | string | JSON-encoded categories |
| `is_commander` | boolean | Is this the commander |
| `copy_id` | number | FK to user_copies.id (allocated copy) |
| `ownership_status` | string | "original", "proxy", or null |
| `proxy_of_deck_id` | number | If proxy, which deck owns the original |
| `dead_weight_flag` | string | Dead weight status |
| `dead_weight_reason` | string | Reason for dead weight flag |
| `tags` | string | User tags |
| `user_id` | uuid | User FK |

**Note:** The column `copy_id` was previously named `physical_copy_id`. The FK `deck_cards_copy_id_fkey` references `user_copies.id`.

## Key Files

- `src/lib/card-data.ts` — `getCardPrinting()` for ref_printings queries
- `src/app/api/cards/route.ts` — Card API (detail, printing, ownership)
- `src/app/api/collection/printings/route.ts` — Collection API with pagination

## Migration Mappings

The schema was migrated from a denormalized structure. If you encounter old code referencing these names, update them:

### Table Renames

| Old Table | New Table | Notes |
|-----------|-----------|-------|
| `physical_copies` | `user_copies` | Per-user physical card copies |
| `card_definitions` | `user_cards` | Per-user card ownership (oracle level) |
| `scryfall_printings` | `ref_printings` | Shared printing data |
| `card_metadata` | `ref_cards` | Shared oracle-level card data |
| `card_kingdom_prices` | *(removed)* | Prices now on `ref_printings.price_usd` |

### Column Renames

| Table | Old Column | New Column |
|-------|------------|------------|
| `deck_cards` | `physical_copy_id` | `copy_id` |
| `user_copies` | `card_definition_id` | `card_id` |
| `user_copies` | `scryfall_printing_id` | `scryfall_id` |

### FK Relationship Changes

| Old FK | New FK |
|--------|--------|
| `physical_copies_card_definition_id_fkey` | `user_copies_card_id_fkey` |
| `deck_cards_physical_copy_id_fkey` | `deck_cards_copy_id_fkey` |

### External API Migration

The app previously queried external APIs (Scryfall, EDHREC) at runtime. Now all card data is stored locally:

| Old Pattern | New Pattern |
|-------------|-------------|
| Scryfall API for card details | `ref_printings` + `ref_cards` |
| Scryfall API for prices | `ref_printings.price_usd` |
| EDHREC API for commander data | `ref_commanders` + `ref_commander_insights` |

**Sync jobs** update reference tables periodically rather than querying at runtime.

## Provenance

- Authored: 2026-08-01
- Updated: 2026-08-06 (added ref_commander_builds, ref_build_cards, ref_edhrec_recommendations, ref_commander_taxonomy; added decks.build_id)
- Motivated by: Repeated confusion about which tables contain oracle_text, power, toughness vs. printing data. Schema was migrated from denormalized structure to normalized ref_/user_ split. Build tables added to support archetype+theme-specific recommendations.
