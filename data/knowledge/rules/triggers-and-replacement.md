# Triggered Abilities and Replacement Effects

## Overview

Understanding the difference between triggered abilities and replacement effects is crucial for complex board states in Commander.

## Triggered Abilities

### Identification
- Start with "when," "whenever," or "at"
- Examples: "When this enters the battlefield...", "Whenever you draw a card...", "At the beginning of your upkeep..."

### How They Work
1. The trigger condition is met
2. The ability triggers (noted by the game)
3. Next time a player would receive priority, the ability goes on the stack
4. The ability resolves when it's the top object on the stack

### Intervening "If" Clauses
- "When X, if Y, do Z" — Y must be true when the ability triggers AND when it resolves
- If Y is false at either point, the ability does nothing
- Example: "When this enters, if you control a Dragon, draw a card"

### Trigger Conditions by Type

#### Zone-Change Triggers
- "Enters the battlefield" (ETB)
- "Leaves the battlefield" (LTB)  
- "Dies" (goes from battlefield to graveyard)
- "When you cast" (triggers while on the stack)

#### State Triggers
- Trigger when a game state is achieved
- Only trigger once until the condition stops being true
- Example: "When you have no cards in hand, draw a card"

#### Combat Triggers
- "Attacks" — declared as attacker
- "Becomes blocked" — at least one blocker declared
- "Deals combat damage" — after damage step
- "Deals combat damage to a player" — specifically player damage

### APNAP Order (Active Player, Non-Active Player)
- When multiple triggers happen simultaneously:
  1. Active player puts all their triggers on stack (in any order)
  2. Next player in turn order does the same
  3. Continue for all players
- Result: Non-active player's triggers resolve first

## Replacement Effects

### Identification
- Use "instead," "as," "with," or "enter(s) the battlefield with"
- Don't use the stack — they modify events as they happen
- Examples: "If damage would be dealt, prevent that damage instead", "This enters with two +1/+1 counters"

### How They Work
- Replace one event with another (or nothing)
- The original event never happens
- Can only apply once to a given event

### Common Types

#### Damage Prevention/Modification
- "Prevent all damage that would be dealt to..."
- "If damage would be dealt, instead that damage plus 1 is dealt"

#### Zone Change Modification
- "If this would be put into a graveyard, exile it instead"
- "If this would die, instead remove all damage from it"

#### Enter-the-Battlefield Modification
- "This enters with X counters"
- "As this enters, choose a creature type"
- Clone effects: "As this enters, you may have it become a copy of..."

### Self-Replacement Effects
- If an effect would replace itself, apply only the replacement
- Example: "This enters as a copy of a creature, except it has flying" — enters as flying copy, not double replacement

### Order of Replacement Effects
- If multiple replacement effects could apply to the same event:
  - Affected player (or controller of affected permanent) chooses order
  - Each effect can only apply once to a given event

## Key Distinctions

| Triggered Abilities | Replacement Effects |
|---------------------|---------------------|
| Use the stack | Don't use the stack |
| Can be responded to | Can't be responded to |
| "When/whenever/at" | "Instead/as/with" |
| Event happens, then trigger | Event is modified or prevented |
| Can trigger multiple times from one event | Each applies only once per event |

## Commander-Specific Interactions

### Commander Zone Replacement
- "If your commander would go to graveyard/exile/hand/library, you may put it into the command zone instead"
- This is a replacement effect — you choose when it would change zones
- "Dies" triggers still work because the commander went to the graveyard (momentarily)

### ETB Doublers
- [[Panharmonicon]], [[Yarok, the Desecrated]] — triggered abilities trigger additional times
- These don't double replacement effects (like entering with counters)

### Counters Doublers
- [[Doubling Season]], [[Hardened Scales]] — these ARE replacement effects
- They modify "enters with counters" as a replacement effect
- Two replacement effects: player chooses order

## Provenance

- Source: Magic: The Gathering Comprehensive Rules, Sections 603, 614-615
- Rules Version: June 19, 2026
- Authored: 2026-08-03
