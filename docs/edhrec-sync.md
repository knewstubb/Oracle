# EDHREC Data Sync

## Overview

The Oracle syncs commander data from EDHREC to provide grounded recommendations. This includes card synergies, theme popularity, deck structure, and build-specific advice.

## Data Architecture

```
ref_commanders (7,241 rows)
├── edhrec_deck_count, salt_score, similar_commanders
│
├── ref_commander_insights (5,306 rows)
│   └── Theme popularity stats + detailed strategy guides
│
├── ref_commander_taxonomy (69,604 rows)
│   └── Links commanders to archetypes/themes/tribes
│
├── ref_edhrec_recommendations (272,629 rows)
│   └── Generic card recommendations per commander
│
└── ref_commander_builds (~3,500 rows)
    ├── primary_archetype — main strategy (aristocrats, combo, aggro...)
    ├── secondary_archetypes[] — supporting strategies
    ├── primary_theme — main focus (tokens, artifacts, kindred:goblins...)
    ├── secondary_themes[] — supporting themes
    ├── Deck structure (avg lands, creatures, etc.)
    │
    └── ref_build_cards (~350,000 rows)
        └── Build-specific card recommendations with synergy scores
```

## Taxonomy Model

### Archetype (verb) — How the deck wins
A deck can have a **primary archetype** (main strategy) plus **secondary archetypes** (supporting strategies).

Common archetypes:
- Aristocrats, Combo, Control, Voltron, Mill, Reanimator, Aggro, Stax
- Group-hug, Group-slug, Wheels, Blink, Infect, Lifegain, Enchantress
- Superfriends, Theft, Chaos, Spellslinger, Pillowfort, Ramp
- Extra-combats, Extra-turns, Toolbox, Topdeck, Tap-untap

Example dual-archetype decks:
- **Aristocrats + Reanimator** — sacrifice, recur, sacrifice again
- **Combo + Control** — control shell with combo finish
- **Tokens + Aristocrats** — make fodder, sacrifice fodder

### Theme (noun) — What the deck is built from  
A deck can have a **primary theme** plus **secondary themes**.

Common themes:
- Artifacts, Treasure, Tokens, Counters, Graveyard, Sacrifice
- Enchantments, Equipment, Landfall, Planeswalkers, Clones, Vehicles
- Energy, Exile, Toughness-matters, Defenders, Monarch, Snow

### Kindred (tribal)
Creature-type-focused decks use a **kindred:X** theme pattern:

- `kindred` — generic tribal synergy (Morophon, Maskwood Nexus decks)
- `kindred:goblins` — goblin-specific tribal
- `kindred:zombies` — zombie-specific tribal

This pattern allows:
1. **Kindred-agnostic cards** (Herald's Horn, Vanquisher's Banner) to associate with `kindred`
2. **Kindred-specific cards** (Goblin Chieftain, Lord of the Undead) to associate with `kindred:goblins` or `kindred:zombies`

A goblin aggro deck would have:
- **primary_archetype:** aggro
- **primary_theme:** kindred:goblins

### Mechanics
Wiring between cards and themes, not deck identity.
Examples: Cascade, Flashback, Mutate, Persist, Landfall

## Sync Scripts

### 1. Main Commander Sync
```bash
npx tsx scripts/sync-edhrec-data.ts [options]
```

Options:
- `--dry-run` — Preview without writing
- `--limit=N` — Sync only N commanders
- `--force` — Re-sync all, ignore last_synced
- `--verbose` — Detailed logging

Populates:
- `ref_commander_insights` — Theme tags and deck counts
- `ref_edhrec_recommendations` — Top synergy cards
- `ref_commander_taxonomy` — Archetype/theme links
- `ref_commanders` — Salt score, deck count, similar commanders

### 2. Build-Specific Sync
```bash
npx tsx scripts/sync-edhrec-builds.ts [options]
```

Options:
- `--min-decks=N` — Only commanders with N+ total decks (default: 500)
- `--limit=N` — Sync only N commanders
- `--force` — Re-sync all builds
- `--verbose` — Detailed logging

Populates:
- `ref_commander_builds` — Archetype + theme combos with deck structure
- `ref_build_cards` — Build-specific card recommendations

## Tag Mappings

EDHREC tags are mapped to our taxonomy in `scripts/edhrec-tag-mappings.ts`.

- **Mapped tags** → stored with taxonomy links
- **Unmapped tags** → tracked in report for review
- **Ignored tags** → too generic (flying, card draw) or 60-card concepts (midrange, tempo)

Unmapped tag report: `research/edhrec-sync/tag-mapping-report.md`

## Rate Limits

- 200ms delay between requests (~5 req/sec)
- Full sync of 7k commanders takes ~4 hours
- Build sync of 1.5k commanders × 3 themes takes ~3 hours

## Linking User Decks to Builds

The `decks` table has a `build_id` column that links to `ref_commander_builds`.

This enables:
- "Your deck is a Treasure Aristocrats build"
- "You're missing Academy Manufacturer (in 45% of this build)"
- "This build typically runs 34 lands, you have 32"

Build detection can be:
- Manual (user picks)
- Auto-suggested (analyze cards, find best match)
- Multiple (deck straddles two builds)

## Example Data

### Korvold, Fae-Cursed King

Builds:
- Treasure (8%) — archetype: aristocrats, theme: treasure
- Sacrifice (8%) — archetype: aristocrats, theme: sacrifice
- Lands Matter (2%) — archetype: combo, theme: lands

Top treasure-aristocrats cards:
1. Goldspan Dragon (27% synergy)
2. Academy Manufacturer (25% synergy)
3. Xorn (22% synergy)

Deck structure:
- 34 lands, 28 creatures, 9 instants, 8 sorceries

## Changelog

### 2026-08-06 (PM) — Tag Mapping Complete + Multi-Archetype Schema + Kindred Pattern
- **Completed full tag mapping review** — all 42 previously unmapped tags now resolved
- Final count: 132 mapped, 45 ignored, 0 unmapped
- Key decisions documented in `research/edhrec-sync/tag-mapping-report.md`:
  - `spellslinger` → archetype (not theme) — playstyle, not card type
  - `extra-combats`, `extra-turns` → own archetypes — "build to explosive turn" serves multiple archetypes
  - `birthing-pod` → toolbox — repeatable tutor chain, not infinite combo
  - `land-destruction` → stax — resource denial = stax, not lands-matter
  - `cycling` → graveyard — same wiring as surveil/delirium
  - `toughness-matters`, `defenders` → keep separate — different resources
  - `monarch` → keep distinct — adversarial, NOT group-hug
  - `experience-counters`, `modified-creatures` → stay ignored — don't interact with counter synergies
- Added hyphenated slug variants for all tags (EDHREC uses `plus-1-plus-1-counters`, not `+1/+1 counters`)
- Created `scripts/check-unmapped-tags.ts` validation script
- **Schema change: Multi-archetype support**
  - Added `primary_archetype`, `secondary_archetypes[]`
  - Added `primary_theme`, `secondary_themes[]`
  - Migration `20260806120000_builds_multi_archetype.sql` applied
  - Existing data migrated: 1,390 primary archetypes, 1,851 primary themes
- **Schema change: Kindred theme pattern**
  - Tribes now use `kindred:X` theme pattern (e.g., `kindred:goblins`)
  - Allows kindred-agnostic cards (Herald's Horn) and kindred-specific cards (Goblin Chieftain)
  - Migration `20260806130000_kindred_theme_pattern.sql` applied
  - 256 builds migrated across 49 creature types
- **Next:** Lower MIN_DECKS threshold to sync ~1,030 more commanders (target: top 2000)

### 2026-08-06 (AM)
- Created `ref_commander_builds` and `ref_build_cards` tables
- Added `decks.build_id` column
- Created `sync-edhrec-builds.ts` script
- Defined archetype (verb) vs theme (noun) taxonomy model
- Initial build sync: 3,497 builds, 349,700 build cards across ~970 commanders

### 2026-08-05
- Full sync of 7,241 commanders completed
- Fixed pagination bug (was capping at 1000 rows)
- Fixed special character slugs (ñ→n, û→u)
- Fixed duplicate key error in card upserts
- Created tag mapping report with commander counts
