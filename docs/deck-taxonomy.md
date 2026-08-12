# Deck Taxonomy: Archetypes vs Themes

## Overview

Every deck tag should answer exactly one of two questions:

- **Archetype** — *How does the deck win, or how does it stays alive long enough to?* Verb-shaped. The game plan.
- **Theme** — *What is the deck physically built from?* Noun-shaped. The resource the game plan runs on.

**Decks can have multiple of each.** A deck has a primary archetype/theme (the dominant identity) and zero or more secondary archetypes/themes (supporting strategies).

## Multi-Axis Classification

Most decks aren't pure — they blend strategies. The taxonomy supports this:

| Field | Type | Description |
|-------|------|-------------|
| `primary_archetype` | string | The deck's main game plan |
| `secondary_archetypes` | string[] | Supporting strategies |
| `primary_theme` | string | The deck's main resource |
| `secondary_themes` | string[] | Supporting resources |

### Examples

**Korvold, Fae-Cursed King:**
- Primary archetype: `aristocrats` (sacrifice for value)
- Secondary archetypes: `combo` (can assemble infinite loops)
- Primary theme: `sacrifice` (creatures dying as trigger)
- Secondary themes: `treasure`, `kindred:dragons`

**Atraxa, Praetors' Voice:**
- Primary archetype: `stax` (resource denial)
- Secondary archetypes: `superfriends`, `infect`
- Primary theme: `counters` (proliferate payoffs)
- Secondary themes: `planeswalkers`

**Edgar Markov:**
- Primary archetype: `aggro` (race with combat damage)
- Primary theme: `kindred:vampires`
- Secondary themes: `tokens` (eminence creates tokens)

### When to Use Secondary Tags

Add a secondary archetype/theme when:
- The deck has a meaningful card package for that strategy (10+ cards)
- The strategy affects how the deck plays out games
- Removing that package would change the deck's identity

Don't add secondary tags for:
- Generic staples (Sol Ring doesn't make every deck "artifacts")
- One-off cards (a single tutor doesn't make the deck "combo")
- Splash support (3 ramp spells doesn't make the deck "ramp")

---

## The Test

**Archetypes are verbs.** They describe what the deck *does*:
- Aristocrats → drains via death triggers
- Combo → assembles a game-ending loop
- Voltron → stacks buffs on one creature for commander damage

**Themes are nouns.** They describe what the deck is *made of*:
- Treasure → treasure tokens
- Artifacts → artifact permanents
- Graveyard → cards in the graveyard

The clean pairing that proves the model: **Sacrifice** (theme — creatures dying as resource) feeds **Aristocrats** (archetype — payoffs for that resource). Same pattern: Graveyard → Reanimator, Equipment → Voltron, Planeswalkers → Superfriends.

## Tribes Are Themes

Tribes are not a third category. "Zombies" is a theme where the noun happens to be a creature type instead of a permanent type — same axis as Artifacts or Graveyard.

Tribes use the `kindred:` prefix to distinguish them from other themes:
- `kindred:vampires` — Vampire tribal
- `kindred:zombies` — Zombie tribal
- `kindred` (bare) — Generic tribal (Morophon, Adaptive Automaton, changeling decks)

Example: Wilhelt is Aristocrats (archetype) + `kindred:zombies` (theme).

## Mechanics Are Wiring

A mechanic is a rules-level ability that connects cards to themes/archetypes. It's neither the noun nor the verb — it's the connective tissue.

- Modular → wires into Counters (theme)
- Evoke → wires into Sacrifice (theme)
- Surveil → wires into Graveyard (theme)
- Cascade → wires into Spellslinger (depends on archetype)
- Ninjutsu → wires into Ninjas (tribe/theme)

Mechanics don't create a third taxonomy category. They fold into the theme or archetype they signal.

**Promotion rule:** A mechanic can graduate to archetype status if it has an independent card pool and game plan. Storm qualifies (distinct game plan: chain spells to lethal count). Cascade doesn't (still just a Spellslinger value engine).

---

## Archetypes (Verbs)

| Archetype | Game Plan |
|-----------|-----------|
| Aggro | Race opponents with combat damage before they stabilize |
| Aristocrats | Sacrifice creatures for repeatable value and drain |
| Blink | Repeated ETB/LTB value by flickering permanents |
| Chaos | Randomness (dice, coin flips) as the mechanism |
| Combo | Assemble pieces for a game-ending loop |
| Control | Deny and answer everything, win late |
| Enchantress | Card-advantage engine built on casting enchantments |
| Good Stuff | No unifying synergy — just efficient cards |
| Group Hug | Help everyone, win through politics |
| Group Slug | Punish everyone symmetrically (burn, forced sacrifice) |
| Infect | Win via ten poison counters |
| Lifegain | Life total as the deck's defining resource, converted to a win |
| Mill | Win by emptying an opponent's library |
| Pillowfort | Make yourself unappealing to attack |
| Ramp | Mana acceleration as the whole identity |
| Reanimator | Cheat creatures from graveyard to battlefield |
| Spellslinger | Cast instants/sorceries for triggers and value |
| Stax | Restrict resources for everyone |
| Storm | Chain spells to a lethal count |
| Superfriends | Stack planeswalker loyalty into inevitability |
| Theft | Take and use opponents' permanents |
| Voltron | Stack buffs on one creature for commander damage |
| Wheels | Force mass discard/draw, punish emptied hands |

### Notes on Soft Archetypes

**Lifegain** and **Ramp** are structurally noun-shaped (resources), but no sharper name exists for the deck identity built around them. Kept as archetypes because casual usage treats them as full identities.

---

## Themes (Nouns)

| Theme | Resource |
|-------|----------|
| Artifacts | Artifact permanents |
| Clones | Copy effects |
| Commander-zone | Cards referencing the commander mechanic |
| Counters | +1/+1, -1/-1, and other counter types |
| Devotion | Colored-mana-symbol density |
| Enchantments | Enchantment permanents (auras, sagas, curses) |
| Energy | Energy counters |
| Equipment | Equipment permanents |
| Exile | Cards played from exile / impulse draw |
| Graveyard | Cards in the graveyard |
| Lands | Lands as the payoff resource (landfall is a sub-tag) |
| Legendary | Legendary permanents |
| Planeswalkers | Planeswalker permanents |
| Sacrifice | Creatures dying as the trigger |
| Spells | Instants and sorceries (resource for Spellslinger) |
| Tokens | Token creatures/permanents |
| Treasure | Treasure tokens specifically |
| Vehicles | Vehicle permanents |

### Tribes (Theme Subtype)

Tribes use the same pattern — the noun is a creature type:

| Tribe | Notes |
|-------|-------|
| Angels | Flying tribal, lifegain synergy |
| Dragons | Big mana, flying |
| Elves | Mana dorks, go-wide |
| Goblins | Tokens, sacrifice |
| Vampires | Lifegain, aristocrats |
| Zombies | Recursion, aristocrats |
| ... | (Many more) |

---

## Examples

| Commander | Archetype | Theme(s) | Tribe |
|-----------|-----------|----------|-------|
| Korvold | Aristocrats | Treasure, Sacrifice | — |
| Teysa Karlov | Aristocrats | Tokens | — |
| Edgar Markov | Aggro | Tokens | Vampires |
| Breya | Combo | Artifacts | — |
| Atraxa | Stax/Control | Counters | — |
| The Ur-Dragon | Aggro | — | Dragons |
| Wilhelt | Aristocrats | Tokens | Zombies |
| Muldrotha | Reanimator | Graveyard | — |

---

## Database Schema

### ref_commander_builds

Each row is an archetype + theme combination for a commander:

```sql
commander_id  -- FK to ref_commanders
archetype     -- "aristocrats", "combo", etc. (nullable)
theme         -- "treasure", "artifacts", etc. (nullable)
edhrec_theme_slug  -- Original EDHREC tag
deck_count    -- Number of decks with this build
avg_lands, avg_creatures, ...  -- Deck structure
```

### decks.build_id

Links a user's deck to a known build:

```sql
decks.build_id  -- FK to ref_commander_builds (nullable)
```

---

## Taxonomy Coverage

All core archetypes and themes from EDHREC are now mapped. The following have been implemented:

**Archetypes added (2026-08-06):**
- Extra Combats, Extra Turns, Toolbox, Topdeck, Tap/Untap, Cast from Exile

**Themes added (2026-08-06):**
- Toughness Matters, Defenders, Monarch, Snow

**Kindred (tribal) pattern:**
- All tribes now use `kindred:X` prefix (e.g., `kindred:vampires`)
- Bare `kindred` is for generic tribal (Morophon, changelings)

See `research/edhrec-sync/tag-mapping-report.md` for remaining unmapped tags.

**Ignored (too generic or 60-card concepts):**
- Midrange, cEDH, Tempo — power level, not identity
- Flying, Card Draw, Haste — too generic

---

## System Reconciliation (2026-08-06)

The codebase has three taxonomy systems serving different purposes:

### 1. `ref_taxonomy` table (Knowledge Base)

**Purpose:** Index for Oracle chat's knowledge base. Explains concepts to users.

**Categories:** 5 — `archetype`, `mechanic`, `tribe`, `keyword`, `color`

**Decision:** Keep separate. The Oracle needs to explain "what is Cascade?" and "what are Zombies?" as distinct topics. Broader categories help organize educational content.

### 2. `edhrec-tag-mappings.ts` (Sync Classifier)

**Purpose:** Map EDHREC's crowd-sourced tags to our curated taxonomy during data sync.

**Categories:** 2 — `archetypes`, `themes`

**Migrated from:** 4 categories (`archetypes`, `themes`, `mechanics`, `tribes`)

**Decision:** Aligned to 2-axis model. Mechanics fold into themes. Tribes use `kindred:` prefix (e.g., `kindred:vampires`). Bare `kindred` is for generic tribal decks (Morophon, Adaptive Automaton).

### 3. `ref_commander_builds` table (Build Identity)

**Purpose:** Store commander build identities with archetype/theme classification.

**Columns:** `primary_archetype`, `secondary_archetypes[]`, `primary_theme`, `secondary_themes[]`

**Decision:** Canonical source of truth for deck classification. All sync code writes to this model.

### Why Different Systems?

| System | Granularity | Use Case |
|--------|-------------|----------|
| `ref_taxonomy` | Concept-level | "Explain Cascade to me" |
| `edhrec-tag-mappings.ts` | Tag-level | "This EDHREC tag means X" |
| `ref_commander_builds` | Build-level | "This deck is Aristocrats + Tokens" |

The knowledge base needs mechanics, tribes, and keywords as first-class concepts for explanation. The build classifier only needs to know archetype vs. theme.

---

## Provenance

- Authored: 2026-08-06
- Based on: EDHREC tag analysis of 7,241 commanders
- Decision: Collapsed four-category taxonomy (archetypes/themes/mechanics/tribes) to two (archetypes/themes), with tribes as theme subtype and mechanics as wiring
