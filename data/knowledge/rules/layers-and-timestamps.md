# Layers and Timestamps

## Overview

Layers are the system Magic uses to determine the final characteristics of permanents when multiple effects modify them. This is one of the most complex rules areas.

## The Seven Layers

Effects are applied in layer order. Within each layer, effects are applied in timestamp order (or dependency order).

### Layer 1: Copy Effects
- Clone effects, [[Sakashima of a Thousand Faces]]
- Establishes base characteristics to be modified by later layers
- "Copy of X, except..." modifications happen here

### Layer 2: Control-Changing Effects
- [[Control Magic]], [[Gilded Drake]]
- Determines who controls the permanent
- Later timestamps win for conflicting control effects

### Layer 3: Text-Changing Effects
- Changing card text (e.g., [[Sleight of Mind]])
- "Mountain" becomes "Island" etc.
- Rarely relevant in modern Commander

### Layer 4: Type-Changing Effects
- Adding/removing types, subtypes, supertypes
- [[Maskwood Nexus]] (adds creature types)
- [[Oko, Thief of Crowns]] (makes things Elks)
- Applied before P/T setting effects matter

### Layer 5: Color-Changing Effects
- Adding/removing colors
- [[Painter's Servant]], [[Darkest Hour]]
- Devoid makes cards colorless here

### Layer 6: Ability-Adding/Removing Effects
- Granting abilities: [[Akroma's Memorial]]
- Removing abilities: [[Dress Down]], [[Overwhelming Splendor]]
- This is where things get complex with timing

### Layer 7: Power/Toughness Effects
Applied in sub-layers:

**7a: Characteristic-Defining Abilities (CDA)**
- Abilities that set P/T based on some condition
- [[Tarmogoyf]], [[Nighthowler]]
- Only in this layer if it sets base P/T

**7b: Setting P/T to Specific Values**
- "Base power and toughness become X/Y"
- [[Turn to Frog]] → base 1/1
- Overwrites 7a effects

**7c: Modifications Not Setting P/T**
- +X/+Y effects from non-counters
- [[Giant Growth]], [[Glorious Anthem]]
- Most P/T modification falls here

**7d: Counters**
- +1/+1 counters, -1/-1 counters
- Applied after static modifications

**7e: Effects That Switch P/T**
- [[About Face]], [[Twisted Image]]
- Applied last in the P/T calculation

## Timestamps

### What is a Timestamp?
- The order in which continuous effects came into existence
- Earlier timestamps apply before later ones (within the same layer)
- Later effects "win" for conflicting effects

### Timestamp Rules
- Permanents get timestamps when they enter the battlefield
- Effects get timestamps when they start applying
- If a permanent becomes a new object, it gets a new timestamp
- If an effect's controller changes, it gets a new timestamp

### Dependency
- If effect A depends on effect B, apply B first (even if A has earlier timestamp)
- Dependency exists when applying A would change what B affects, or whether B exists

## Common Layer Interactions

### Humility + Opalescence
Classic puzzle:
1. Both enchantments are affected by both effects
2. Layer 4: Opalescence makes enchantments creatures
3. Layer 6: Humility removes all abilities
4. Layer 7b: Humility sets all creatures to 1/1

But which applies first? Timestamp matters:
- If Humility entered first: Opalescence is a 4/4 (counts enchantments including Humility)
- If Opalescence entered first: Both are 1/1 (Humility removes Opalescence's ability but not before type-setting in L4)

Actually: More complex — depends on dependency analysis.

### +1/+1 and -1/-1 Counters
- State-based action: If a permanent has both, remove pairs until one type remains
- This happens after layer 7d

### Mutate
- Creates a merged permanent with combined characteristics
- Top creature determines base characteristics
- All abilities are shared (from all components)
- Layer interactions apply to the merged permanent

## Practical Tips for Commander

### "Base" vs "Gets"
- "Base power and toughness become 1/1" (Layer 7b) — before modifiers
- "Gets +2/+2" (Layer 7c) — after base, before counters
- +1/+1 counters (Layer 7d) — always apply

### Order Matters
- [[Turn to Frog]] then [[Giant Growth]] = 3/3 (1/1 base + 2/2)
- [[Giant Growth]] then [[Turn to Frog]] = 1/1 (base 1/1 overwrites)

### Control + Abilities
- If you steal a creature with [[Control Magic]], you control its abilities
- Layer 2 (control) is applied before Layer 6 (abilities)

## Provenance

- Source: Magic: The Gathering Comprehensive Rules, Section 613
- Rules Version: June 19, 2026
- Authored: 2026-08-03
