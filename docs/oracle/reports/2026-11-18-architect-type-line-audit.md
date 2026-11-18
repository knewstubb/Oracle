# Report: type-line-audit
Role: Architect
Status: DONE
Task as received: Align how the app reads and uses a card's type line with the established Magic: The Gathering convention (Comprehensive Rules section 205), everywhere in the app. Deliverable 1 only (AUDIT); no build. Owner decision 2026-11-18: "I want our app to align to this exactly." Later owner decisions (parent notification): (1) show ALL card types for a card, no combined "artifact creature" type; (2) ignore tokens for now; (3) follow the Comprehensive Rules order (supertypes, card types, subtypes after the dash) and add Basic and Snow filters; (4) the one-bucket "primary type" rule is still open, flag it with the recommendation to keep the current priority order and give Kindred and rare types their own buckets.

## Summary for the owner
Nothing in your collection is read wrongly today: every type, subtype and "Legendary" answer the connector gives for your 2,832 cards matches the Magic rules. The gaps are things the app cannot do yet or does inconsistently. There is no Basic or Snow filter, Kindred and Battle cards fall into "Other" on the deck page, the deck "Group: Type" option groups by your category names instead of by type, and the Collection "Hide Basics" button does nothing because the data it reads is empty. One decision is yours: which single group a multi-type card sits in when the app must pick one (recommendation in "New decisions").

## Method
Read-only SELECTs on the live database (`connector_collection_copies`, `ref_cards`, `ref_printings`, `user_cards`), plus a read of the code. Nothing was written. Counts are per distinct owned card ("cards") and per physical copy ("copies"). Owner has 2,832 cards, 4,550 copies, all with library facts (0 without; the CC-07 contract's "100 cards have no facts" is out of date) [Live].

Comparison parser used for the counts (what the new rule should do): per face, text before the dash = supertypes and card types (split on spaces AND commas), text after the dash = subtypes (split on commas). Baseline file for the build: `docs/oracle/reports/evidence/2026-11-18-type-line-baseline.json`.

## 1. What the data looks like (important for the parser)
The card library holds type lines in TWO formats. A parser must read both.
- `ref_cards` (32,633 rows, what the connector and card window read): MTGJSON style. Supertypes, card types and subtypes are each comma separated, and a card with no subtypes ends in a bare dash. Examples from the owner's collection: `Artifact, Creature — Golem`, `Legendary Enchantment, Creature — God`, `Basic, Snow Land — Swamp`, `Kindred, Sorcery — Eldrazi`, `Artifact, Land —`, `World Enchantment —`, `Basic Land —` (Wastes). 1,603 rows have commas between types; 11,237 end in a bare dash; 189 are two-faced. [Live]
- Mixed inside `ref_cards`: 30 rows, mostly the back face of a two-faced card, use the Scryfall style (types separated by spaces): `Artifact // Artifact Creature — Golem`, `Legendary Artifact Creature — Robot // Legendary Artifact — Vehicle`. Subtypes in those faces are still comma separated. [Live]
- `ref_printings` (120,272 rows) and anything fetched from Scryfall: Scryfall style, `Legendary Artifact Creature — Human Artificer`, no commas, no bare dash. Subtypes are space separated here, so a two-word subtype such as `Time Lord` cannot be told apart from two subtypes. [Live]
- `user_cards.type_line` is empty on all 2,832 owned cards. [Live]
- Multi-word subtypes survive only in the comma format (`Legendary Creature — Time Lord, Doctor`).
- Old name `Tribal`: 0 rows in `ref_cards`, 4 in `ref_printings`. `Kindred`: 78 in `ref_cards`, 196 in `ref_printings`. [Live]

## 2. Every place that reads a type line today
Convention = Comprehensive Rules 205: supertypes, then card types, then subtypes after the dash; a card may have several card types; two faces are joined by ` // `.

Key to the Deviates column: SUB = plain substring match on the whole line (a subtype or supertype word can be mistaken for a type); PRI = collapses to one type; NOB = no Basic/Snow/Kindred/rare types; FACE = front face only or either face by rule not by the CR; DUP = a separate copy of the same logic.

### 2.1 Connector search, summary and database view
| Place | What it does | Deviates |
|---|---|---|
| `supabase/migrations/20261116200000_connector_collection_copies_view.sql` flags `t_creature` ... `t_battle` | `lower(type_line) LIKE '%word%'` on the whole line, either face | SUB; only 8 types (no Kindred, Conspiracy, Dungeon, Phenomenon, Plane, Scheme, Vanguard); no Basic, Snow or other supertype flag [Confirmed: the migration] |
| same view, `primary_type` | first match in the order Land, Creature, Planeswalker, Battle, Instant, Sorcery, Artifact, Enchantment, else `Other`, FRONT face only | PRI, SUB, FACE. Order differs from every other place (Land first here, Creature first elsewhere) [Confirmed: the migration] |
| same view, `subtypes` | lower-case text after the dash, split on commas, union of both faces | Correct for the comma format. Wrong for the Scryfall format (would give one word `human artificer`). No link to the card type the subtype belongs to. [Confirmed: the migration] |
| `src/lib/connector/tools/collection-filters.ts` (`CARD_TYPES`, `types` input, `legendary` input) | eight card types only; `legendary` = `ilike '%legendary%'` on the whole line (either face) | SUB, NOB, FACE. No `basic`, `snow`, `supertypes` input. |
| `src/lib/connector/tools/collection-query.ts` (`TYPE_COL`, `appFilter`) | maps the eight types to the view flags and keeps a row if ANY flag is true | NOB |
| `src/lib/connector/tools/get-collection-summary.ts` (`group_by` type) | groups on `primary_type`, `Other` when missing | PRI, NOB |
| `src/lib/connector/tools/collection-view.ts` (`NarrowRow`, `DETAIL_COLS`) | carries the flags, `primary_type`, `subtypes`, `type_line` | follows the view |
| `src/lib/connector/tools/card-facts.ts` | returns `type_line` text as stored | none (passes the text through) |
| `docs/oracle/contracts/connector-collection-search.md` sections 5, 12 and `.types.ts` | document the above, including "an Artifact Creature counts as Creature" for counts | docs to update [Confirmed] |
| `src/lib/connector/__tests__/view-db.ts` | test stand-in that re-implements the view's SQL in TypeScript (`has(t, 'creature')`, `PRIMARY.find`) | DUP; must change together with the view |
| `scripts/sync-commanders-daily.ts` lines 378-379 | writes `is_legendary` and `is_creature` on `ref_cards` from `toLowerCase().includes(...)` | SUB, FACE (either face) [Confirmed] |

### 2.2 Commander rules
| Place | What it does | Deviates |
|---|---|---|
| `src/lib/commander-eligibility.ts` | front face; `\bLegendary\b` and `\bCreature\b`, Vehicle/Spacecraft with power and toughness, `Background` | Word-boundary match, so SUB risk is low. Treats `Background` and `Vehicle` as words anywhere in the line, not as subtypes after the dash. Front face only (correct for commanders). |
| `src/lib/commander-pairing.ts` | `\bLegendary\b` + `\bBackground\b`; `\bTime Lord Doctor\b` | `Time Lord Doctor` only matches the Scryfall style; the library's `Time Lord, Doctor` never matches (live: 17 library cards) [Live] |
| `src/lib/scryfall-client.ts` (108-113) | `typeLine.includes('Legendary')`, `includes('Creature')`, then Legendary AND Creature = commander | SUB, DUP; misses Legendary Vehicles/Spacecraft that `commander-eligibility.ts` accepts |
| `src/lib/tool-registry.ts` (324-338, 1772, 1790-1791, 1819-1820) | `is_legendary && is_creature` flags or `type_line?.includes(...)` | SUB, DUP, and the same Legendary-Creature-only rule |
| `src/app/api/brew/chat/route.ts` (68-77) | prompt text about Legendary Creature/Artifact commanders | wording only, correct |

### 2.3 Collection screen and routes
| Place | What it does | Deviates |
|---|---|---|
| `src/lib/allocation-rollup.ts` (line 89, 101) feeding `/api/collection/rollup-v2` | reads `user_cards.type_line`, which is EMPTY for all 2,832 cards | The value is always `''` [Live] |
| `src/components/collection/CollectionRollupTab.tsx` (107) "Hide Basics" | `!r.typeLine.includes('Basic Land')` | SUB, and acts on the empty value above, so **the button hides nothing today**. Also would miss `Basic, Snow Land` (comma format). Basic is a supertype, not the two-word phrase. |
| `src/app/api/collection/rollup/route.ts` (335) and `rollup/[cardDefinitionId]/route.ts` (63) | `isBasicLand = /\bBasic\b/i.test(user_cards.type_line)` | Right idea (Basic as a word), but reads the empty column, so `isBasicLand` is always false; price and "add" suppression for basics never fires [Live + Confirmed] |
| `src/components/collection/PrintingListView.tsx` `shortType` | text before the dash, first match of Creature, Planeswalker, Instant, Sorcery, Enchantment, Artifact, Land, Battle, else first word | PRI, SUB, NOB. "Artifact Creature" shows as Creature; `Kindred, Sorcery` shows Sorcery; `Basic Land` shows Land (fine); a line starting `Legendary` with no match shows `Legendary`. Its own doc comment even says "Artifact Creature gives Artifact", the code gives Creature. |
| `src/app/api/collection/printings/route.ts` | passes `type_line` from `ref_printings` (Scryfall style) | none, display only |
| `src/lib/basic-lands.ts` (`isBasicLand` by NAME list) | eleven hard-coded names (five basics, Wastes, five Snow-Covered) | DUP of "Basic" by name. Misses Snow-Covered Wastes and any future basic; used for deck-slot logic in `CardGroupSection.tsx`, `CardsTab.tsx`, `supply-pool.ts`, `reconcile-overuse.ts`, `deck-chat-facts.ts`, `deck-health.ts`, `api/decks/route.ts` |
| `src/lib/spare-copy-browse.ts` (`TYPE_WORDS`, `buildFilter`, `prefilterFor`) | type words matched with `t.toLowerCase().includes(w)`; DB prefilter `ilike '%land%'`; lands via `isLandTypeLine` | SUB on both the word match and the prefilter; the free-text fallback `includes(k)` matches ANY word, including subtypes |
| `src/lib/card-repository.ts` (350-352) `searchOwnedByType` | `typeLine.toLowerCase().includes(typeKeyword)` on the whole line | SUB; a keyword like `elf` matches any part of the line |

### 2.4 Deck page: grouping and categories
| Place | What it does | Deviates |
|---|---|---|
| `src/components/CardsTab.tsx` `getCardTypeGroup` + `groupByType` ("Group: Type") | does NOT read the type line. It reads the card's first category name (`primary_category`) and matches `includes('creature')` etc. | A custom category such as "Ramp" or "Removal" lands in `Other`. Battle, Kindred and rare types have no bucket (`typeOrder` lists seven + Other). Not a type grouping at all. `sortCards` "type" sorts by category name too. |
| `src/lib/card-definition-resolver.ts` `deriveDefaultCategory` | front face, `includes` order Creature, Planeswalker, Battle, Instant, Sorcery, Artifact, Enchantment, Land, else `Other`. Used to fill a default category on add/import (`api/decks/[id]/cards/route.ts`, `manabox-deck-import.ts`, `chat-proposal-confirm.ts`) | SUB, PRI, NOB, DUP. `Kindred, Sorcery` becomes Sorcery; `Basic Land` becomes Land. Because of the order a front-face Land Creature (Land Creature — Forest Dryad) becomes Creature here, but the view calls it Land (Land is first in its order) and deck health counts it as a land: different answers for one card. No owned card has Land and Creature on the same face, so this is not visible in the owner's data today. |
| `src/lib/deck-normalizer.ts` (`deriveMoxfieldCategory` 171, `classifyCard` 288) | same order and `includes`, front face | SUB, PRI, NOB, DUP (two copies in this file) |
| `src/lib/deck-import.ts` `deriveCategory` (60-68) | same order, `includes`, front face | SUB, PRI, NOB, DUP; slightly different order (Land last) |
| `src/components/DeckEditor.tsx` `getPrimaryType` | `typeLine.toLowerCase().includes(t)` over the WHOLE line, order Creature, Instant, Sorcery, Enchantment, Artifact, Planeswalker, Land | SUB, PRI, FACE (not front face); different order again |
| `src/lib/scryfall-category-mapping.ts` | category name `Tribal` for kindred themes (lines 180-394) | Uses the retired word Tribal as a category label; the card type is now Kindred |
| `src/components/brew-v2/useCurveBuckets.ts` (14) | `/\bLand\b/i.test(card.type_line)` on the whole line | FACE: a spell with a land back face (`Instant // Land`, 4 owned) counts as a land in the curve |
| `src/components/WorkbenchTab.tsx` (112), `brew-v2` tooltips, `CommanderDetailModal.tsx`, `ChatPanel.tsx`, `SuggestedCommanders.tsx`, `CardTooltip.tsx` | display `type_line` text as stored | none (display only; shows commas as stored, e.g. `Artifact, Creature — Golem`) |

### 2.5 Deck health and roles
| Place | What it does | Deviates |
|---|---|---|
| `src/lib/card-roles.ts` `frontFaceTypeLine`, `isLandTypeLine` | front face, `\bland\b` | Word match on the whole front face (includes subtypes). OK today. A Land Creature counts as a land. |
| `src/lib/card-roles.ts` `isRamp` (110) | `\b(instant|sorcery)\b` on the front face | Same; Kindred Instant works because Instant is present |
| `src/lib/card-window-roles.ts` `cardWindowRoles` | land if `isLandTypeLine`, else `isBasicLand(name)` when no type line | Falls back to the name list, not the Basic supertype |
| `src/lib/deck-health.ts` (149) and `deck-health-server.ts` | `isLandTypeLine` or `isBasicLand(name)` | as above |
| `src/lib/deck-health.ts` `countDeckTypes` (193) | front face, splits on `\s+[—-]\s+`, then `\bcreature\b` etc. per type; one card adds to EVERY type it has (Artifact Creature counts as both) | This one is closest to the CR (several types per card). Only 7 types (no Battle, Kindred). The split needs a space after the dash, so `Artifact, Land —` (trailing dash) is not split; harmless today because nothing follows. |
| `src/lib/spare-copy-browse.ts`, `deck-health-gap.ts`, `deck-health-buy.ts` | pass the type line into the role function | none |
| `src/lib/commander-resolver.ts` (239) | `typeLine.toLowerCase().includes('time lord')` | SUB (works only because `Time Lord` is a whole phrase) |
| `src/lib/price-store.ts` (12) | comment says "Any card with Basic in the type_line" | comment only |
| `src/app/api/decks/[id]/cards/[cardId]/roles/route.ts` | feeds `cardWindowRoles` from `ref_cards.type_line` | none |

### 2.6 AI and import text
`src/app/api/ai/brew/investigate/route.ts` (309) and `src/lib/mcp-client.ts` (585-599, 821) pull a type line out of free text with regular expressions and carry it through as an opaque string. `src/app/api/brew/skeleton/route.ts` shows the prompt example `Creature — Human Wizard`. None interpret it. No change needed beyond what the parser exposes.

### 2.7 Tests that encode the old reading (80 test files mention a type line)
Tests that will need a decision when behaviour changes: `src/lib/connector/__tests__/collection-search-filters.test.ts`, `collection-summary-groups.test.ts`, `collection-search-cc14.test.ts` (types, legendary, primary-type counts), `view-db.ts`, `src/lib/deck-health*.test.ts`, `src/lib/commander-eligibility.test.ts`, `src/components/collection/CollectionRollupTab.test.tsx`, `src/components/DeckEditor.test.tsx`, `src/lib/spare-copy-browse.test.ts`, `src/lib/basic-lands-import.test.ts`. The rest only use type lines as fixture text.

### 2.8 Summary of deviations from the convention
1. Substring matching on the whole line (view flags, legendary filter, `includes` in 8 places). On today's data it causes no wrong answer (section 3), so this is a risk, not a live bug.
2. No Basic or Snow (or World, Ongoing, Elite, Host) anywhere as a typed supertype; Basic is detected by the empty `user_cards` column or by a name list.
3. Kindred, Battle and the rare types are missing from filters and groups; Kindred is `Other` in the deck "Group: Type" and is counted under its other type everywhere else.
4. One-bucket "primary type" with five different priority orders (view: Land first; `deriveDefaultCategory`, `deck-normalizer`, `deck-import`: Creature first, Land last; `DeckEditor`: Creature, Instant, Sorcery...; `PrintingListView`: Creature first, Land late).
5. Legendary read from either face by design in the connector (`legendary` filter, either face); commander code reads the front face. Today 0 owned cards differ.
6. Two data formats (comma and Scryfall) and an empty `user_cards.type_line`, with three parsers that each assume one format.
7. `Tribal` still used as a category name.
8. The deck "Group: Type" reads the category name, not the type line.

## 3. Real counts from the owner's collection [Live, 2026-11-18]
2,832 cards, 4,550 copies. Cards and copies, any face of a two-faced card.

By supertype
| Supertype | Cards | Copies | Which |
|---|---|---|---|
| Legendary | 385 | 430 | on 0 cards only on the back face |
| Basic | 7 | 645 | Forest, Island, Mountain, Plains, Swamp, Wastes, Snow-Covered Swamp |
| Snow | 2 | 3 | Snow-Covered Swamp, Ohran Frostfang (Snow Creature — Snake) |
| World | 1 | 2 | Tombstone Stairwell (`World Enchantment —`) |
| Ongoing, Elite, Host | 0 | 0 | |

By card type (a card is counted under each type it has)
| Card type | Cards | Copies |
|---|---|---|
| Creature | 1,472 | 1,878 |
| Artifact | 340 | 477 |
| Instant | 346 | 521 |
| Sorcery | 317 | 443 |
| Land | 306 | 1,197 |
| Enchantment | 238 | 287 |
| Planeswalker | 23 | 26 |
| Kindred | 4 | 4 |
| Battle | 0 | 0 |
| Conspiracy, Dungeon, Phenomenon, Plane, Scheme, Vanguard | 0 | 0 |

Multi-type combinations (union of both faces), cards / copies: Artifact + Creature 121 / 163; Creature + Enchantment 31 / 33; Artifact + Land 9 / 9; Artifact + Enchantment 3 / 4; Enchantment + Land 2 / 3; Creature + Land 3 / 3; Kindred + Sorcery 2 / 2; Kindred + Artifact 1 / 1; Kindred + Enchantment 1 / 1. Two-faced cards add combinations such as Creature + Sorcery 26 / 46 (Adventure and Omen cards), Creature + Instant 8 / 11, Instant + Land 4 / 4. Full list in the baseline file.

Old view `primary_type` (front face), cards / copies: Creature 1,470 / 1,876; Land 294 / 1,184; Instant 338 / 510; Sorcery 289 / 395; Artifact 214 / 309; Enchantment 204 / 250; Planeswalker 23 / 26; Battle 0; Other 0. Sums to 2,832 and 4,550.

Where the one-bucket rule loses information today: 121 Artifact Creature cards are grouped Creature only; 4 Kindred cards are grouped under their other type; 12 cards (13 copies) have a Land only on the back face and are counted as Land by the filter but not by the front-face bucket; the 3 Creature + Land cards have the Land on the back face only (none has both on one face), so a Land Creature on one face does not exist in the collection yet.

Subtypes: 236 distinct, baseline file has every one with cards and copies. Top: Human 313 / 399, Warrior 95 / 120, Zombie 94 / 115, Wizard 89 / 107, Elf 71 / 96, Soldier 70 / 101, Dragon 68 / 83, Sliver 61 / 63, Druid 60 / 86. Land subtypes: Forest 13 / 193, Swamp 12 / 174, Island 11 / 143, Mountain 10 / 151, Plains 10 / 117. Two-word subtype kept as one entry: `time lord` is not in the owner's collection; `urza's` appears as its own entry because the library writes `Land — Urza's, Cave`.

Old flags vs the Comprehensive Rules reading: 0 mismatches over all 2,832 cards for all eight type flags, and 0 mismatches over all 32,633 library cards for a subtype that contains a type word (the case the substring match could misread). The risk is latent, for example a future subtype containing `land`, `battle` or `creature` text.

## 4. Odd type lines found
| Line | Count (owned) | What it means for the parser |
|---|---|---|
| Trailing bare dash: `Artifact —`, `Artifact, Land —`, `Basic Land —`, `World Enchantment —` | 1,100 owned cards, 1,679 copies (11,237 library rows) | Empty subtype list, not an error |
| `Basic, Snow Land — Swamp` | 1 (Snow-Covered Swamp) | Two supertypes joined by a comma; "Basic Land" substring test fails on it |
| `Kindred, Sorcery — Eldrazi` and three more | 4 | New name Kindred in the data; no `Tribal` rows in `ref_cards`, 4 in `ref_printings` |
| Space-separated back face: `Artifact // Artifact Creature — Golem` | 30 library rows (some owned) | Parser must split card types on spaces too |
| Two faces with different types: `Creature — Dragon // Sorcery — Omen`, `Creature — Zombie, Knight // Instant — Adventure`, `Instant // Land`, `Enchantment // Land — Cave`, `Legendary Creature — Human, Warrior, Bard // Enchantment — Saga` | 65 two-faced cards, 89 copies | Per-face parse; `Instant // Land` has a Land back face but is not a land permanent |
| Rooms: `Enchantment — Room // Enchantment — Room` | 3 | Two identical faces |
| Enchantment subtypes: Aura 50, Saga 13, Class 1 (Druid Class), Cartouche 1, Room 3, Plan 1 (Construct a Cosmic Cube), Background 1, Curse 3 | all handled | No `Case` or `Siege` owned (15 and 0 in the library: `Enchantment — Case`) |
| Saga that is also a creature: `Enchantment, Creature — Saga, Drake` (Summon: Valefor etc.) | 4 | Two card types plus two subtypes |
| Artifact subtypes: Equipment 39, Vehicle 10, Spacecraft 16, Treasure 1, Clue 1, Food 4 | handled | |
| Planeswalker subtypes (Ajani, Nissa, Liliana, ...) are names | 23 cards | handled as subtypes |
| `Land — Urza's, Cave` | 1 | library splits "Urza's Cave" into two entries |
| `Artifact, Creature — Assembly-Worker` | 1 | hyphenated subtype kept whole |
| Library only (none owned): `Plane`, `Vanguard`, `Scheme` (also `Ongoing Scheme`), `Conspiracy`, `Phenomenon`, `Hero` (a card type), `Stickers`, `Summon, Dragon —` (old "Summon" cards), `Poly, Artifact —`, `pLAnE — sECreT, LaIR` (Un-card with garbled capitals) | 148 / 106 / 102 / 27 / 12 / 21 / 1 / 8 / 1 / 1 library cards | Rare types must parse without error; unknown words should land in a visible "unknown" bucket, not crash. Case-insensitive match needed for the Un-card. |
| Tokens, art-series, Elemental (type word inside creature names, not type lines) | 0 owned; tokens out of scope by owner decision | not in `ref_cards` type lines of owned cards |
| Dungeon, Battle | 0 owned | |

## 5. Baseline from the OLD code/view
File: `docs/oracle/reports/evidence/2026-11-18-type-line-baseline.json` (type flags, primary type, Legendary, supertypes, card types and combinations, 236 subtypes, two-faced counts, timings).

Query timings, database side only, one `EXPLAIN ANALYZE` run each on the live database (4,550 copies), 2026-11-18:
| Query (what the connector asks) | Time |
|---|---|
| Creature + green filtered read, ordered by name | 37.5 ms |
| Whole collection narrow read with `primary_type`, ordered | 94.0 ms |
| Subtype overlap (`elf`, `druid`) | 48.4 ms |
| Legendary (`ilike '%legendary%'`) | 29.1 ms |
| Detail read of 200 copies (type line + keywords) | 57.9 ms |
| Planning time on each | 4 to 6 ms |
Every call scans the whole view (4,550 rows through a join to 32,633 library rows); the type flags are computed per row each time. The CC-07 contract measured about 160 ms for the first version. Single run each, noisy; treat as an order of magnitude and re-run the same five queries after the build.

## Changed files
- `docs/oracle/reports/2026-11-18-architect-type-line-audit.md` - this report
- `docs/oracle/reports/evidence/2026-11-18-type-line-baseline.json` - old-view baseline counts and timings for later comparison

## New decisions made (need owner confirmation)
- Primary-type bucket (still open, flagged as requested). Recommendation: keep one priority order for the places that must show a single group, make it the same everywhere, and add own buckets for Kindred and for the rare types (Battle, Conspiracy, Dungeon, Phenomenon, Plane, Scheme, Vanguard). Suggested order: Land, Creature, Planeswalker, Battle, Instant, Sorcery, Artifact, Enchantment, Kindred, then the rare ones, which is the existing view order (so no count changes on today's data except 4 Kindred cards moving to their own bucket). What you would see: a card with Land and Creature on the same face (none owned today) stays under Land (as in the Connector summary today), an Artifact Creature stays under Creature, Kindred shows as its own group. Trade-off: Kindred Instant/Sorcery cards would no longer be counted with Instants/Sorceries in "by type" totals, but every type filter still finds them (multi-type, per your decision 1). Alternative: Creature before Land (the deck-page order today); then such cards (none owned today) move out of Land.
- Per decision 1 the filter and the card window show ALL card types. The single bucket is only for places that must show one group (summary counts, deck groups).
- Deck "Group: Type" should read the type line instead of the category name (so a custom category "Ramp" no longer sends Sol Ring to Other). This changes what you see on the deck page, so it needs your yes before the build.
- "Hide Basics" in the Collection will start working (it hides nothing today). It will then hide the five basics, Wastes and Snow-Covered Swamp (7 cards, 645 copies).

## Assumptions
- Library `ref_cards.type_line` stays the single source; no new write to `user_cards` (contract CC-07 rejected that).
- Parser is one shared pure function (tested), reading both formats, used by the app and mirrored by a SQL function in the (draft) view; no database change is applied.
- Tokens are ignored (owner decision 2). Rare types parse and are filterable but are not tested against owned data (none owned).
- "Legendary on either face" stays for the connector filter (0 owned cards differ; owner can change).

## Challenges to locked decisions
- none (no decision in `docs/oracle/decisions.md` is touched; CC-07 contract text about `primary_type` and type flags will need an amendment after owner approval).

## Open questions
- Which single group a multi-type card goes under (see New decisions).
- Should the connector's `legendary` filter keep "either face", or read the front face only like commander eligibility? No owned card differs, so this is only about future cards.
- The CC-07 contract says "100 owned cards (3.5%) have no library facts"; live shows 0 now. Confirm the amendment may correct the number.

## Verification
- Live read-only SELECTs through the connected Supabase tool: copy and card totals, token counts per face, type combinations, supertypes, old flags vs rule-based tokens (0 mismatches), library-wide odd tokens and subtype-contains-type-word check (0), format counts for `ref_cards` and `ref_printings`, five `EXPLAIN ANALYZE` timings. No write statement was run.
- `git -C <worktree> status` showed a clean tree before the report; no build, test or typecheck run (audit only, no code changed).
