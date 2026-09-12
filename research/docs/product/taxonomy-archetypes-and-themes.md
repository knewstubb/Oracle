# Taxonomy: Archetypes vs. Themes

> Status: proposed. This is a recommendation for collapsing `TaxonomyCategory` from four peer values (`archetypes` | `themes` | `mechanics` | `tribes`) down to two, plus the reasoning for every placement. Cross-reference `scripts/edhrec-tag-mappings.ts` and `research/edhrec-sync/tag-mapping-report.md` for the tag-level mapping this feeds.

## The test

Every tag in this taxonomy should answer exactly one of two questions:

- **Archetype** — *How does the deck win, or how does it stay alive long enough to?* Verb-shaped. The game plan.
- **Theme** — *What is the deck physically built from?* Noun-shaped. The resource the game plan runs on.

**Tribes are not a third category.** "Zombies" is a theme where the noun happens to be a creature type instead of a permanent type — same axis as Artifacts or Graveyard, different vocabulary. Don't give tribes their own top-level branch.

**Mechanics and keywords are not deck identity.** A keyword mechanic (modular, evoke, surveil, ninjutsu) is evidence *for* a theme or archetype, not a peer to them. Fold it in as a sub-variant tag on whichever theme/archetype it actually signals. If a mechanic is popular and distinctive enough to carry its own identity (Cascade, Storm), it graduates — but it graduates *into* one of the two lists, it doesn't create a third list.

The clean pairing that proves the model: **Sacrifice** (theme — the resource is creatures dying) feeds **Aristocrats** (archetype — the payoff for using that resource). Same relationship should hold everywhere a theme and archetype are related: Graveyard → Reanimator, Planeswalkers → Superfriends, Equipment/Enchantments → Voltron.

---

## Mechanics and keywords — the wiring, not the room

A **mechanic** is a rules-level trigger or ability printed on a card that connects it to a theme's resource or an archetype's game plan. It's neither the noun nor the verb — it's the connective tissue between them. The test: *by what specific game action does this card report to a theme or archetype?*

- Modular — transfers its +1/+1 counters to another artifact creature on death → wires into **Counters**
- Evoke — cast for less, then sacrifice → wires into **Sacrifice**
- Surveil — look and mill while filling the yard → wires into **Graveyard**
- Ninjutsu — swap in an unblocked attacker → wires into the **Ninjas** tribe
- Cascade — cast a free spell off the top → wires into **Spellslinger**, and by extension whatever archetype (Storm, Aggro) sits on top of it

None of these describe a deck by themselves. Each describes how one card plugs into something that does. That's why a mechanic without a matching theme or archetype yet (Morph, Mutate, in the open-26 appendix below) is a genuinely open question, not a rejection — it's signal waiting for a home, not noise.

A **keyword**, by contrast, is card text with no synergy pull: flying, vigilance, trample, first strike, hexproof. Printing it on a card doesn't imply the deck wants more of it or should build toward it — there's no chain on the other end. That's the real reason most of the ignore list is keywords rather than mechanics: a mechanic is an unanswered question about which theme it belongs to; a keyword isn't information about the deck at all.

**Promotion out of "sub-variant tag" status is earned by an independent card pool, not by deck count.** Storm has its own archetype because "cast enough spells to chain a kill" is a distinct game plan, not just a detail of how Spellslinger executes. Cascade hasn't earned that — a Cascade deck is still just a spells deck using Cascade as its value engine, so it stays folded under Spellslinger regardless of how many decks register the tag. Ninjutsu and Morph in the appendix sit on this exact fence: high deck counts, but the number alone doesn't tell you whether the card pool has actually grown independent of its current parent (the Ninjas tribe, and nothing, respectively) — that's a judgment call on the cards themselves.

---

## Archetypes — how the deck wins or stays alive

| Archetype | Game plan |
|---|---|
| **Aggro** | Race opponents down with combat damage before they stabilize |
| **Voltron** | Stack buffs on one creature, win via commander damage |
| **Control** | Deny and answer everything, win in the late game |
| **Combo** | Assemble a finite piece-set for a game-ending loop |
| **Stax** | Restrict resources for everyone, grind out an asymmetric advantage |
| **Pillowfort** | Make yourself unappealing to attack, stall |
| **Group Hug** | Help everyone, win through goodwill and politics rather than a fast clock |
| **Group Slug** | Punish everyone symmetrically (burn, forced sacrifice, mass damage) |
| **Aristocrats** | Sacrifice creatures for repeatable value and drain |
| **Reanimator** | Cheat expensive creatures into play from the graveyard |
| **Mill** | Win by emptying an opponent's library |
| **Superfriends** | Stack planeswalker loyalty and abilities into inevitability |
| **Theft** | Take and use opponents' permanents |
| **Wheels** | Force mass discard/draw, punish or benefit from emptying hands |
| **Chaos** | Randomness (dice, coin flips) as the actual mechanism |
| **Infect** | Alternate win condition — ten poison counters instead of life loss |
| **Enchantress** | Card-advantage engine built on casting enchantments |
| **Blink** | Repeated ETB/LTB value by flickering permanents |
| **Good Stuff** | No unifying synergy — just efficient, powerful cards |
| **Lifegain**† | Life total swings as the deck's defining resource, converted into a win by whatever payoff is attached |
| **Ramp**† | Mana acceleration as the whole identity, not just an enabler |
| **Extra Combats** | Take multiple combat steps in a turn — alpha-strike or repeated-trigger enabler |
| **Extra Turns** | String together additional turns to outpace or close out the game |
| **Toolbox** | Tutor chain that assembles the specific answer or threat needed, piece by piece — not necessarily an infinite loop |
| **Topdeck** | Play with a deliberately low hand size, using extra top-of-library manipulation to compensate |

† **Soft archetypes.** Lifegain and Ramp are structurally noun-shaped (they describe a resource, not a verb), but no sharper community-recognized name exists for "the thing that converts that resource into a win." Lifegain decks still need Aetherflux Reservoir or a drain finisher to actually kill anyone; ramp is technically an enabler every other archetype also uses. Kept here because casual usage treats them as full deck identities, not because they pass the strict test as cleanly as Aristocrats or Voltron do.

**Changes from the current mapping file:**
- `artifacts-matter` (archetype) merges into `artifacts` (theme) — same axis, listed twice.
- `cast-from-exile` (archetype) merges into `exile` (theme) — same axis, listed twice.
- `legendary-matters` and `commander-matters` move from archetype to theme — they describe what the deck is built from (legendary permanents / commander-zone cards), not how it wins.
- `infect` moves from theme to archetype — it's an alternate win condition, not a resource.

---

## Themes — what the deck is built from

| Theme | Resource |
|---|---|
| **Artifacts** | Artifact permanents (absorbs the old `artifacts-matter`) |
| **Treasure** | Treasure tokens specifically |
| **Clones** | Copy effects |
| **Counters** | +1/+1, -1/-1, and other counter types |
| **Energy** | Energy counters (rules-distinct enough from generic counters to keep separate) |
| **Enchantments** | Enchantment permanents (sagas, auras, shrines, curses fold in here) |
| **Equipment** | Equipment permanents |
| **Exile** | Cards played from exile / impulse draw (absorbs the old `cast-from-exile`) |
| **Graveyard** | Cards in the graveyard — self-mill, recursion, discard-as-enabler |
| **Lands** | Lands as the payoff resource, generally (landfall is a sub-tag inside this, not its own theme) |
| **Planeswalkers** | Planeswalker permanents |
| **Sacrifice** | Creatures dying as the trigger |
| **Spellslinger** | Instants and sorceries as the resource (Storm is the archetype riding on top of it — see note below) |
| **Tokens** | Token creatures/permanents generally |
| **Vehicles** | Vehicle permanents |
| **Legendary** | Legendary permanents specifically |
| **Commander-zone** | Cards that reference the commander mechanic itself (recasting, tax reduction) |
| **Devotion** | Colored-mana-symbol density on the battlefield |
| **Toughness Matters** | High-toughness creatures as the payoff resource (absorbs `power` / `power matters`) |
| **Defenders** | Creatures with the Defender keyword — can't attack, built to hold the line rather than close the game itself |
| **Monarch** | The Monarch mechanic — extra card draw tied to holding, and defending, the crown |
| **Tap/Untap** | Repeated untap effects as the value engine |
| **Snow** | Snow-typed permanents as the payoff resource |
| **Tribal: [creature type]** | One entry per creature type with a real dedicated payoff pool (Zombies, Elves, Angels, Dragons, etc.) — same pattern as every other theme, just parameterized by creature type instead of permanent type |

**On Spellslinger specifically**, since it's the one you pushed back on: the existing mapping table already treats `storm` as a sub-variant of `spellslinger`, not the other way around. That's the correct direction — Storm is the verb (cast enough spells to chain a kill), Spellslinger is the noun (the pile of instants/sorceries the verb runs on). You'd never subordinate Aristocrats under Sacrifice; it goes the other way. Spellslinger sits exactly where Sacrifice and Graveyard sit: a resource theme with archetypes (Storm, or plain Aggro/Control dressed in spells) built on top of it.

---

## Open: the 26 unmapped tags with real signal but no home yet

These came out of the EDHREC unmapped-tag review and don't fit any current slug. Sorted into which list they'd land in *if* built out — none of these are added to the mapping file yet, pending a decision on which are worth a full knowledge doc.

**Would become archetypes:**
- Zoo (2.6k) — creature-type-diversity payoffs, no single tribal focus
- Outlaws (0.8k) — multi-tribe (Rogue/Pirate/Mercenary/Assassin/Warrior) synergy package

**Would become themes:**
- Devotion is already on the main list above; keep an eye on whether the count justifies splitting by color
- Modified Creatures (2.1k) — flagged lower priority, real overlap risk with Equipment/Enchantments/Counters already covering most of the same cards

**Promoted 2026-08-06 — no longer open:** Extra Combats, Extra Turns (+ Extra Upkeeps), Toolbox (+ Birthing Pod), and Topdeck are now archetypes. Toughness Matters (+ Power / Power Matters), Monarch, Tap/Untap, and Snow are now themes. See the main tables above.

**Would become tribes:**
- Phyrexians + Praetors (4.5k)
- Birds (3.9k)
- Assassins (3.9k) — moderate priority, borderline
- Dogs (1.5k) — moderate priority
- Dwarves (1.1k) — moderate priority
- Skeletons (0.2k) — low priority

**Would become mechanics-as-sub-variants of an existing theme/archetype** (not new top-level entries — same fold-in pattern as evoke→sacrifice, surveil→graveyard):
- Ninjutsu (8.3k) → Ninjas tribe
- Morph (3.7k) → no clean home yet, candidate for its own small theme
- Cycling (2.4k) → recommended fold into Graveyard (same wiring as surveil/delirium), pending sign-off
- Dungeon (2.2k) → Exile/graveyard-adjacent, needs a decision
- Mutate (1.7k) → no clean home yet
- Foretell (1.1k) → Exile-adjacent (delayed cast from exile)
- Allies (1.0k) → could fold into a general "tribal synergy" pattern rather than a dedicated tribe

Full deck counts and example commanders for all 26 are in `research/edhrec-sync/unmapped-tags.json`.
