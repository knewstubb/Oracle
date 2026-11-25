# Report: tag-frequency-proposal
Role: Architect (read-only investigation)
Status: DONE
Task as received: Propose the curated list of about 30 to 60 card Tags, chosen from how common each Scryfall tag is across ALL Commander-legal cards, then checked against the owner's collection and EDHREC candidates (owner decision 2026-11-20: "I think we need to determine this across all cards in scryfall").

## Summary for the owner

I propose **40 Tags**: your 13 broad ones plus 27 "what does this card do" Tags. Together they would give a Tag to about **79% of all Commander cards** and **89% of your collection** (2,563 of 2,878 cards). That leaves about 11% of your cards with no Tag, mostly plain creatures with no special job.

Nine of the 13 broad Tags work well from Scryfall's own tags. **Fixing** and **Stax / tax** are weak: Scryfall finds only 3 of 10 well-known fixing cards and 4 of 10 well-known stax cards (for example it misses Command Tower, Rule of Law and Null Rod). **Targeted removal** and **Card selection** are decent but have gaps.

The local Scryfall tag copy is from 7 August 2026. It is good enough to choose the list. It is missing tags for about 630 newer cards, which matters only when the Tags are filled in, not for choosing the list. I did not refresh it.

## Decisions for the owner (recommendation first)

1. **List size.** Recommended: start with the 40 Tags. The earlier audit suggested 13 plus about 15. The extra 12 are all common (each covers 1% to 8% of Commander cards) and adding or removing a Tag later is a one-line change. With you: you would see 27 mechanic Tags such as "Sacrifice outlet", "Token generator", "Lifegain", "+1/+1 counter maker". The alternative is 13 plus 15, which is shorter but leaves out Tags like "Anthem / team pump" (213 of your cards).
2. **The two weak Tags (Fixing, Stax / tax).** Recommended: include them but label them "incomplete until the AI pass", and fill the gaps in a later, separately approved step. With you: for example Command Tower would not show "Fixing" at first. The alternative is to hold both Tags back until the gap-filling is approved, so every Tag you see is trustworthy.
3. **Refreshing Scryfall's tag data.** Recommended: yes, but only just before the Tags are filled in, as its own approval. With you: about 630 newer cards (45 of yours) would get Tags that they lack today. The alternative is to fill from the August copy and refresh later. I did not refresh anything.

## 1. The local Scryfall tag data

- `data/scryfall-tags/oracle-tags.jsonl` and `data/scryfall-tags/oracle-id-tags.json`, both saved 7 Aug 2026 (12:04 and 12:05) [Confirmed: file dates].
- `oracle-tags.jsonl`: **4,524 tags**, all of type "oracle" (function tags). It contains **no art tags** [Confirmed: all 4,524 records have `type = oracle`]. 4,385 tags carry at least one card. Together they cover **35,959 distinct cards**. Tags are in a hierarchy (`parent_ids`, `child_ids`); many parent tags (for example `recursion`, `tutor`, `protection`) hold no cards directly and only mean something through their children.
- `oracle-id-tags.json` is a much smaller derived file: 16,243 cards and only 87 distinct tags [Confirmed: counted]. The app's data layer reads it [Confirmed: `src/lib/scryfall-tags-data.ts`, `loadTagIndex`]. Ranking across all cards needs the full `.jsonl`, not this file.
- **Stale or partial?** Not too stale to rank. Of 32,643 Commander-legal cards, 31,816 (97.5%) carry at least one tag. The 827 with none are mostly newer: 1,017 Commander-legal cards were first printed after 7 Aug 2026 and 628 of them have no tags (the other 199 untagged older cards are mostly plain cards). Tag popularity would not change from a refresh; the missing 628 would only change who gets a Tag.
- **What a refresh would need** (not done): owner approval, then Scryfall's public "Oracle Tags" bulk file fetched as described in the pipeline contract, section 7 [Confirmed: `docs/oracle/contracts/card-tagging-pipeline.md`], and the one-off conversion into the app's file formats. Not started.

## 2. The universe of Commander-legal cards

- The hosted reference table `ref_printings` already holds every printing with `oracle_id` and Commander legality: 120,272 printings, 39,507 distinct cards, of which **32,643 are Commander-legal** (a card counts if any printing is "legal") [Confirmed: read-only queries on 2026-11-20; table last updated 2026-11-15].
- `ref_cards` holds 32,633 rows but has no `oracle_id`, so it cannot be joined to tags. A local MTGJSON file exists (`data/AllPrintings.sqlite`, 2 Jul 2026) but is older and was not needed.
- **Nothing was downloaded.** No Scryfall bulk file, no temp download to delete. Working copies of read-only query results were kept in a temp folder outside the repo and removed afterwards.

## 3. How each Scryfall tag was measured

Per tag the CSV gives: Commander-legal cards carrying it directly, and carrying it or any more specific sub-tag; share of all 32,643; your cards (same two counts); and distinct cards in the EDHREC pool; classification; how the existing mapping treats it; and 3 example cards (the most-played first, by stored EDHREC rank).

Full ranked table (4,209 tags with at least one Commander-legal card):

`docs/oracle/reports/evidence/tag-frequency/tag-frequency.csv`

The 40 proposed Tags with their numbers:

`docs/oracle/reports/evidence/tag-frequency/proposed-tags.csv`

Notes on the measurement:

- **Sub-tags are counted.** A parent such as `tutor` has 0 cards directly but 1,114 through its children. The existing mapping looks only at exact tag names and never follows children [Confirmed: `src/lib/scryfall-category-mapping.ts`, `suggestCategoriesFromTags` looks up `TAG_TO_CATEGORY[tag]` only].
- **Your collection:** the live `user_cards` table holds **2,879** rows for your account, 2,878 of them Commander-legal. The 2,832 in the brief is out of date (or counted differently); I used 2,878. 2,834 of the 2,878 (98.5%) have at least one Scryfall tag.
- **EDHREC candidates are not available for your commanders.** The hosted EDHREC tables are nearly empty: `ref_build_cards` holds 450 rows (3 builds), `ref_commander_builds` and `ref_edhrec_recommendations` hold 0 rows [Confirmed: read-only counts]. The only broad copy is a local snapshot dated 12 Sep 2026 (`data/commander-context`, 1,885 builds, 94,250 rows, 7,891 distinct cards) with no link from a build to its commander [Confirmed: `data/commander-context/manifest.json`]. I used those 7,891 cards as a stand-in "EDHREC pool". It leans to popular cards, so treat it as a rough check [Approximate]. Loading builds for your own commanders is already listed as RQ-08 and needs your approval.

## 4. Useful versus not useful

Of the 4,209 tags with cards, I classified **235 as useful** for deck building (116 roles, 119 mechanics). Every tag with 150 or more Commander-legal cards (394 tags) was classified by hand-built lists; **1,600 rarer tags were not reviewed one by one**, and 7 mid-sized tags (for example `cast-trigger`, `peek-library`) are marked "needs review".

| Class | Tags | Why not useful | Existing mapping treats it |
|---|---|---|---|
| Set, era or printing (`cycle-*`, `*-with-set-mechanic`, type errata) | 1,670 | About the card's printing history, not what it does | Not mapped |
| Creature types (`typal-*`) | 219 | Tribal is handled by creature-type data | 27 typal tags mapped to Tribal |
| One situation only (`hate-*`, combat-only) | 209 | Helps against one thing, not a general job | One tag (`hate-graveyard`) is not mapped either |
| Rules structure (`activated-ability`, `triggered-ability`, `modal`) | 115 | Describes how the text is built | Not mapped |
| Naming, flavour, cosmetic (`alliteration`, `punny-name`) | 54 | Names and jokes | Not mapped |
| Keyword already printed on the card (`evasion`, `ward`) | 33 | The card face already says it | `evasion` mapped as Utility (medium) |
| Colour or colour pie | 28 | Colour identity is stored already | Not mapped |
| Umbrella (`removal`, `draw`, `hate`) | 39 | Only groups its sub-tags | `recursion` and `bounce` mapped |

Of the 67 mapped tag names that exist in the data, 52 are classified useful. Five mapped names do not exist in Scryfall's data at all (`counterspell-hard`, `protects-player`, `reanimate-any`, `token-generator`, `etb`) [Confirmed: compared `TAG_TO_CATEGORY` keys with the tag file]. The mapping has no art tags.

## 5. The proposed list

### 5a. The 13 broad Tags

Counts are Commander-legal cards (of 32,643), your cards (of 2,878) and the EDHREC pool (of 7,891). "Spot check" is how many of 10 well-known cards the Scryfall mapping catches [Approximate: my own picks, a few were poor choices].

| Tag | Scryfall tags used (with sub-tags) | All cards | % | Yours | EDHREC pool | Spot check | How complete |
|---|---|---|---|---|---|---|---|
| Targeted removal | `removal` minus sweepers, player burn, land removal | 4,911 | 15.0 | 393 | 858 | 7/10 | Good. Misses "destroy target permanent" cards (Beast Within, Chaos Warp, Generous Gift). Includes aura/equipment/vehicle removal. |
| Card draw | `draw` | 4,048 | 12.4 | 439 | 1,296 | 9/10 | Good. Misses Fact or Fiction. Overlaps Card selection. |
| Ramp | `ramp` | 2,136 | 6.5 | 326 | 982 | 10/10 | Good. Includes rituals and land ramp. |
| Recursion | `recursion` | 2,130 | 6.5 | 197 | 616 | 8/10 | Good. Reanimation is 97% inside it. |
| Card selection | `scry`, `surveil`, `top-deck-manipulation`, `loot`, `rummage` | 1,614 | 4.9 | 174 | 427 | 9/10 | Decent. Misses Magus of the Wheel. |
| Protection | `protection` | 1,261 | 3.9 | 106 | 406 | 9/10 | Good. Misses Deflecting Swat. |
| Tutor | `tutor` | 1,114 | 3.4 | 153 | 368 | 10/10 | Good. Includes land tutors. |
| Fixing | `mana-fix`, `mana-filter`, `dual-land`, `tutor-land-basic` | 1,056 | 3.2 | 279 | 462 | 3/10 | **Weak.** Misses Command Tower, Exotic Orchard, Mana Confluence, City of Brass, Fellwar Stone, Arcane Signet, Farseek. |
| Board wipe | `sweeper` | 904 | 2.8 | 73 | 235 | 10/10 | Good. |
| Hand disruption | `hand-disruption` | 655 | 2.0 | 24 | 106 | 10/10 | Good. |
| Stax / tax | `tax`, `lockdown`, `mass-land-denial` | 643 | 2.0 | 61 | 178 | 4/10 | **Weak.** Misses Rule of Law, Thalia, Drannith Magistrate, Null Rod, Trinisphere, Sphere of Resistance. |
| Counterspell | `counterspell` | 520 | 1.6 | 70 | 127 | 10/10 | Good. |
| Graveyard hate | `hate-graveyard` | 408 | 1.2 | 38 | 116 | 10/10 | Good, though small. |

**Where the earlier audit said 4 of 13 had no mapping** (fixing, card selection, graveyard hate, stax/tax): all four have Scryfall tags that can carry them (above). The existing code maps none of them [Confirmed: no key for them in `TAG_TO_CATEGORY`]. After writing a mapping, two are good (Graveyard hate, Card selection), one is partial (Fixing) and one is weak (Stax / tax).

**Fallbacks, not to be run now:** Fixing: a plain rule on the card (lands that make two or more colours, rocks that make any colour). Stax / tax: the AI pass in the pipeline contract, limited to your collection and EDHREC candidates, with your spot check. Targeted removal and Card selection gaps: the same AI pass.

### 5b. The 27 mechanic Tags, most common first

| Tag | Scryfall tags used | All cards | % | Yours | 3 examples |
|---|---|---|---|---|---|
| Direct damage or life loss to opponents | `burn-player`, `drain-life`, `opponent-loses-life`, `group-slug` | 2,573 | 7.9 | 218 | Blood Artist; Lightning Bolt; Boros Charm |
| +1/+1 counter maker | `gives-pp-counters`, `repeatable-pp-counters` | 2,491 | 7.6 | 278 | Rhythm of the Wild; The Great Henge; Orcish Bowmasters |
| Lifegain | `lifegain` | 2,468 | 7.6 | 251 | Swords to Plowshares; Blood Artist; Tireless Provisioner |
| Token generator | `repeatable-token-generator` | 1,750 | 5.4 | 210 | Smothering Tithe; Black Market Connections; Tireless Provisioner |
| Play from exile (impulse) | `impulse`, `repeatable-impulse`, `castable-from-exile`, `gives-castable-from-exile` | 1,674 | 5.1 | 167 | Jeska's Will; Mosswort Bridge; Professional Face-Breaker |
| Anthem / team pump | `power-boost-to-all`, `toughness-boost-to-all`, `anthem`, `keyword-anthem` | 1,599 | 4.9 | 213 | Garruk's Uprising; Return of the Wildspeaker; Rhythm of the Wild |
| Death trigger | `death-trigger` | 1,533 | 4.7 | 163 | Solemn Simulacrum; Skullclamp; Blood Artist |
| Mana sink | `mana-sink`, `bottomless-mana-sink` | 1,504 | 4.6 | 124 | Rogue's Passage; War Room; Karn's Bastion |
| Sacrifice outlet | `sacrifice-outlet` | 1,400 | 4.3 | 136 | Victimize; Deadly Dispute; Ashnod's Altar |
| Discard outlet | `discard-outlet` | 1,242 | 3.8 | 91 | Faithless Looting; Frantic Search; Windfall |
| Counters payoff | `counters-matter`, `pp-counters-matter` | 1,234 | 3.8 | 141 | Hardened Scales; Everflowing Chalice; Inspiring Call |
| Cast trigger | `cast-trigger-you` | 1,157 | 3.5 | 120 | Path of Ancestry; Storm-Kiln Artist; Beast Whisperer |
| Graveyard payoff | `cards-in-graveyard-matter`, `graveyard-fuel` | 1,030 | 3.2 | 77 | Shifting Woodland; Underworld Breach; Cabal Ritual |
| Artifact payoff | `synergy-artifact` | 1,028 | 3.1 | 110 | Urza's Saga; Deadly Dispute; Storm-Kiln Artist |
| Self-mill | `mill-self` | 986 | 3.0 | 123 | Takenuma, Abandoned Mire; Syr Konrad, the Grim; Consider |
| Copy / clone | `copy` | 918 | 2.8 | 69 | Scute Swarm; Phyrexian Metamorph; Flusterstorm |
| Tapper | `tapper-creature` | 652 | 2.0 | 32 | Authority of the Consuls; Dispatch; Blind Obedience |
| Steal / gain control | `theft`, `control-changing-effects` | 608 | 1.9 | 30 | Etali, Primal Storm; Ragavan, Nimble Pilferer; Dauthi Voidwalker |
| Creature-enters payoff | `creaturefall` | 589 | 1.8 | 103 | Garruk's Uprising; Impact Tremors; The Great Henge |
| Spellslinger payoff | `synergy-instant`, `synergy-sorcery` | 531 | 1.6 | 56 | Storm-Kiln Artist; Archmage Emeritus; Guttersnipe |
| Mill opponents | `mill-opponent`, `mill-any` | 435 | 1.3 | 26 | Syr Konrad, the Grim; Etali, Primal Storm; Ragavan, Nimble Pilferer |
| Group hug | `group-hug`, `selective-group-hug` | 399 | 1.2 | 21 | Faerie Mastermind; Loran of the Third Path; Dawn's Truce |
| Free cast / cheat into play | `free-cast-another` | 371 | 1.1 | 34 | Mosswort Bridge; Rishkar's Expertise; Etali, Primal Storm |
| Cost reducer | `cost-reducer` | 297 | 0.9 | 38 | Herald's Horn; Foundry Inspector; Jet Medallion |
| Landfall | `landfall` | 270 | 0.8 | 50 | Tireless Provisioner; Scute Swarm; Avenger of Zendikar |
| Treasure generator | `repeatable-treasures` | 191 | 0.6 | 19 | Smothering Tithe; Black Market Connections; Tireless Provisioner |
| Blink | `flicker` | 181 | 0.6 | 17 | Ephemerate; Conjurer's Closet; Displacer Kitten |

Precision is not checked. Some examples are loose: Swords to Plowshares appears under Lifegain because it gives life to the target's controller, and Everflowing Chalice appears under Counters payoff because it uses counters itself. The pipeline contract's 100-card review is the place to measure that [Confirmed: `card-tagging-pipeline.md`, sampling section].

**Small by design.** Landfall, Treasure generator and Blink are under 1% of cards but you named them; keep them. Token generator via Scryfall covers repeatable creators only; one-shot token makers (for example Raise the Alarm) are not covered and need the fallback.

### 5c. Overlap and nesting

- **Dropped from the 42 candidates:** *Lands matter* (Landfall is 100% inside it) and *Pinger* (82% inside Direct damage, 57% already in Targeted removal). That gives the 40.
- **Kept but overlapping:** Treasure generator is 100% inside Token generator and 97% inside Ramp (kept because you named it). Card selection overlaps Card draw (loot, rummage) and Discard outlet (54%). Free cast is 67% inside Play from exile. Mill opponents and Self-mill overlap by about half.
- **Nested, not proposed as separate Tags:** Mana rock (350), Mana dork (418) and Land ramp (582) sit entirely inside Ramp. Reanimation (970) sits inside Recursion. Spot removal (4,700) sits inside Targeted removal. Repeatable draw (1,805) sits inside Card draw.
- **Left out on purpose (common, but not a universal job):** `card-advantage` (5,938; a grab-bag parent), `hand-neutral` / `hand-positive` (accounting labels), `gains-pp-counters` (cards that put counters on themselves), `thingfall`, `tap-outlet`, `saboteur`, `multiple-bodies`, `burn-planeswalker`, `utility-land`, `refund`, `martyr`. Any can be added as a row later.

## 6. Overall coverage of the proposed 40 Tags

| Measure | All Commander-legal cards (32,643) | Your cards (2,878) | EDHREC pool (7,891) |
|---|---|---|---|
| At least one of the 13 broad Tags | 16,605 (50.9%) | 1,779 (61.8%) | 4,686 (59.4%) |
| At least one of the 40 Tags | 25,593 (78.4%) | 2,563 (89.1%) | 7,070 (89.6%) |
| **No Tag from the 40** | 7,050 (21.6%) | 315 (10.9%) | 821 (10.4%) |
| At least one Scryfall tag of any kind (for comparison) | 31,816 (97.5%) | 2,834 (98.5%) | 7,868 (99.7%) |

Your 315 cards without a Tag: about 174 creatures, 95 other spells and artifacts, and 44 lands (45 of your cards were first printed after the August tag copy; 44 of yours have no Scryfall tag at all). Among all Commander cards with no Tag, about 4,800 are creatures: plain creatures often have no deck-building job. The audit's "39% of your cards in the 13 broad Tags" (old mapping, no sub-tags) compares with 61.8% here, because sub-tags are counted and more Scryfall tags are mapped.

## 7. How the existing mapping treats the 13 (for reference)

The existing mapping gives each Scryfall tag a deck category; it was written for category suggestions, not for Tags [Confirmed: `src/lib/scryfall-category-mapping.ts`, `TAG_TO_CATEGORY`, 72 entries]. Using only its exact tag names, it reaches 19,103 Commander cards (58.5%) and 1,717 of yours (59.7%) with any category, but by Tag: Ramp 1,339 of 2,136; Fixing 509 of 1,056; Card draw 3,618 of 4,048; Card selection 927 of 1,614; Tutor 1,025 of 1,114; Targeted removal 4,483 of 4,911; Board wipe 818 of 904 (only as a second category of `sweeper`); Counterspell 370 of 520; Protection 1,005 of 1,261; Recursion 1,450 of 2,130; Graveyard hate 250 of 408; Stax / tax 457 of 643; Hand disruption 578 of 655. Those last four rows exist only because other mapped tags happen to overlap. Direct mapping to Tags would need sub-tag expansion.

## Changed files
- `.agents/tasks/tag-frequency/report.md` — this report
- `docs/oracle/reports/2026-11-20-architect-tag-frequency-proposal.md` — copy of this report
- `docs/oracle/reports/evidence/tag-frequency/tag-frequency.csv` — all 4,209 tags with counts and classes
- `docs/oracle/reports/evidence/tag-frequency/proposed-tags.csv` — the 40 proposed Tags (plus 2 dropped, marked)

## New decisions made (need owner confirmation)
- The three decisions above.

## Assumptions
- A card is Commander-legal if any of its printings is "legal" in `ref_printings`.
- A tag "carries" a card if the card has the tag or any more specific sub-tag.
- Examples are ordered by stored EDHREC rank (lowest first); cards with no rank come last.
- The EDHREC pool is every card in the 12 Sep 2026 local snapshot, because builds cannot be tied to your commanders.

## Challenges to locked decisions
- none

## Open questions
- Which precision threshold makes a Tag "good enough to show"? The pipeline contract proposes gates for the 100-card review; not tested here.
- The 2,832 vs 2,879 collection count: which is intended?

## Verification
- Read `data/scryfall-tags/oracle-tags.jsonl` (4,524 tags, 35,959 cards) and `oracle-id-tags.json` (16,243 cards, 87 tags) — counts as above.
- Read-only queries to hosted `ref_printings`, `user_cards`, `ref_cards`, `ref_build_cards`, `ref_commander_builds`, `ref_edhrec_recommendations` and the local `data/commander-context` snapshot — numbers as above.
- Tag counts and the CSVs were produced by a throwaway script in a temp folder outside the repo; no repo code was changed, no database write, no migration, no Scryfall download.
