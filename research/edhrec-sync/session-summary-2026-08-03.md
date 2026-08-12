# EDHREC Sync Session Summary

**Date:** August 3, 2026  
**Goal:** Reduce database size while preserving useful build data

## Final State

| Table | Count |
|-------|-------|
| ref_commander_builds | 1,885 |
| ref_build_cards | 94,250 |

Builds by commander rank bracket:
- Ranks 1-250: 917 builds
- Ranks 251-500: 968 builds

## Work Completed

### 1. Synced EDHREC Builds for Top 250 Commanders
- Used `scripts/sync-edhrec-builds.ts --limit=250`
- Fixed ranking bug: `edhrec_rank` was per-color-identity, not global
- Now use `edhrec_deck_count` (descending) for global popularity ranking

### 2. Deleted Builds for Commanders Ranked 501+
- Used `scripts/delete-non-top500.ts`
- Deleted 1,806 builds and ~90,300 cards
- Retained top 500 commanders (by deck count)

### 3. Ran Build Similarity Analysis
- Used `scripts/analyze-build-similarity.ts --verbose`
- Results: 565 merge candidates (≥65% Jaccard), 187 related (50-64%), 206 distinct
- Reports saved to `research/edhrec-sync/build-similarity-report.md` and `.json`

### 4. Deduped Near-Identical Builds
- Used `scripts/dedup-builds.ts` (65% threshold)
- Deleted 394 builds with ~19,700 cards
- Kept the build with more decks in each pair

## Data Model

### ref_commander_builds
Each build has:
- `archetype` — high-level playstyle (28 values): aristocrats, combo, voltron, etc.
- `theme` — specific strategy (139 values): kindred:elves, counters, equipment, etc.
- `primary_archetype` / `secondary_archetypes[]` — classification (currently single-value)
- `primary_theme` / `secondary_themes[]` — classification (currently single-value)
- `edhrec_theme_slug` — original EDHREC identifier

### Current Coverage
- **850 builds** have an archetype set
- **1,035 builds** have a theme set
- Each build has *either* archetype *or* theme, not both (EDHREC's categorization)

## Archetype Taxonomy (28 values)

```
aggro, aristocrats, blink, chaos, combo, control, enchantress,
extra-combats, extra-turns, good-stuff, group-hug, group-slug,
infect, lands-matter, legendary-matters, lifegain, mill, pillowfort,
ramp, reanimator, spellslinger, stax, tap-untap, theft, toolbox,
topdeck, voltron, wheels
```

## Theme Taxonomy (139 values)

Includes:
- **Kindred:** kindred:elves, kindred:dragons, kindred:zombies, etc.
- **Mechanics:** counters, energy, cascade, flashback, etc.
- **Card types:** artifacts, enchantments, equipment, planeswalkers
- **Strategies:** card-draw, sacrifice, clone, theft

## Next Steps

### Fill in Missing Archetypes/Themes

**Problem:** Each build has archetype OR theme, but not both. A kindred:elves deck is also likely ramp or combo. A counters deck might also be aggro or voltron.

**Approach options:**

1. **Rule-based inference** — Map theme → likely archetypes:
   - kindred:* → often aggro, tribal-synergy
   - counters → often voltron or aggro
   - artifacts → often combo or control

2. **Card-based analysis** — Look at the 50 cards in each build:
   - High removal count → control archetype
   - Many sacrifice outlets → aristocrats
   - Equipment/auras → voltron

3. **Commander-based inference** — Use commander's text:
   - Keywords in oracle text suggest archetypes
   - Color identity correlates with strategies

4. **EDHREC cross-reference** — Some commanders have multiple EDHREC pages
   - Could scrape additional theme pages for same commander
   - Get multiple tag assignments per commander

**Recommended:** Start with rule-based mapping (quick wins), then add card analysis for builds where theme→archetype isn't obvious.

## Scripts Created

| Script | Purpose |
|--------|---------|
| `sync-edhrec-builds.ts` | Sync builds from EDHREC API |
| `analyze-build-similarity.ts` | Calculate Jaccard similarity between builds |
| `dedup-builds.ts` | Delete near-duplicate builds |
| `delete-non-top500.ts` | Delete builds for commanders outside top 500 |
| `final-state.ts` | Report current build counts |
| `check-build-tags.ts` | Analyze archetype/theme coverage |

## Files Generated

- `research/edhrec-sync/build-similarity-report.md` — Human-readable similarity analysis
- `research/edhrec-sync/build-similarity.json` — Machine-readable similarity data
- `research/edhrec-sync/dedup-completed.txt` — Log of merged builds
