# Proposed 100-card sample — owner review

**Status:** Candidate list only. These cards have not been hand-labelled or sent to an AI model.

## Source and selection

- Scryfall Oracle Cards snapshot: updated 2026-10-01 21:01 UTC.
- Scryfall Oracle Tags snapshot: updated 2026-10-01 21:00 UTC.
- Sample universe: 32,116 distinct Oracle identities marked Commander-legal in that snapshot. This refines the earlier rough “about 30,000” figure for this particular sample.
- Each card below is a distinct Oracle identity. Card names link to Scryfall.
- Groups A and B were selected using a fixed random seed (`20261002`) from a **provisional draft mapping**. Group A has matching functional labels; Group B has Tagger labels but none matched the draft mapping. Group C and 20 cards in Group D are deliberately chosen examples. Group D also includes five cards with no Oracle Tagger labels, to check that the process can correctly leave an ordinary card unlabelled.
- Mapping is preliminary and will change during accuracy review. Group membership should be reconfirmed after the UUID-to-Oracle label mapping is approved.

This sample tests known distinctions and tricky cases. It is deliberately enriched and should not be used by itself to estimate the rate of tagging errors across every card in the game.

## A. Useful existing Scryfall functional labels — 25 cards

1. [Bilbo, Thief in the Night](https://scryfall.com/card/hob/33/bilbo-thief-in-the-night)
2. [Nihiloor](https://scryfall.com/card/afc/53/nihiloor)
3. [Opal Palace](https://scryfall.com/card/soc/390/opal-palace)
4. [Transforming Flourish](https://scryfall.com/card/tdc/39/transforming-flourish)
5. [Glint](https://scryfall.com/card/dtk/55/glint)
6. [Maze Skullbomb](https://scryfall.com/card/one/231/maze-skullbomb)
7. [Nerd Rage](https://scryfall.com/card/pip/34/nerd-rage)
8. [Theorist's Proxy](https://scryfall.com/card/fra/44/theorists-proxy)
9. [Mold Folk](https://scryfall.com/card/clb/133/mold-folk)
10. [Whisper, Blood Liturgist](https://scryfall.com/card/cmm/198/whisper-blood-liturgist)
11. [Refocus](https://scryfall.com/card/frf/47/refocus)
12. [Mask of Avacyn](https://scryfall.com/card/cmr/466/mask-of-avacyn)
13. [Spark Rupture](https://scryfall.com/card/mat/5/spark-rupture)
14. [Stream of Unconsciousness](https://scryfall.com/card/mor/52/stream-of-unconsciousness)
15. [Mogg Assassin](https://scryfall.com/card/exo/88/mogg-assassin)
16. [Vedalken Dismisser](https://scryfall.com/card/mma/69/vedalken-dismisser)
17. [Pilfering Imp](https://scryfall.com/card/grn/81/pilfering-imp)
18. [Emeria Captain](https://scryfall.com/card/znr/11/emeria-captain)
19. [Grim Tutor](https://scryfall.com/card/m21/103/grim-tutor)
20. [Swell of Courage](https://scryfall.com/card/ddf/31/swell-of-courage)
21. [Vadrok, Apex of Thunder](https://scryfall.com/card/iko/214/vadrok-apex-of-thunder)
22. [Glimmer of Genius](https://scryfall.com/card/kld/49/glimmer-of-genius)
23. [Shark Typhoon](https://scryfall.com/card/frc/44/shark-typhoon)
24. [Staunch Throneguard](https://scryfall.com/card/cmm/412/staunch-throneguard)
25. [Indulgent Tormentor](https://scryfall.com/card/ima/94/indulgent-tormentor)

These are seed-selected cards whose current Scryfall labels match one or more broad roles/mechanics in the draft map. The human review will check whether those matches are actually useful.

## B. Tagger labels present, but no match in the current draft mapping — 25 cards

1. [Deceptive Frostkite](https://scryfall.com/card/tdc/19/deceptive-frostkite)
2. [Marauding Raptor](https://scryfall.com/card/lcc/228/marauding-raptor)
3. [Toils of Night and Day](https://scryfall.com/card/bok/57/toils-of-night-and-day)
4. [Fire Nation Ambushers](https://scryfall.com/card/tle/229/fire-nation-ambushers)
5. [Providence](https://scryfall.com/card/emn/37/providence)
6. [Staff of the Mind Magus](https://scryfall.com/card/m15/234/staff-of-the-mind-magus)
7. [Nezumi Ronin](https://scryfall.com/card/chk/130/nezumi-ronin)
8. [Drudge Skeletons](https://scryfall.com/card/gvl/36/drudge-skeletons)
9. [Glittering Lynx](https://scryfall.com/card/pcy/11/glittering-lynx)
10. [Tormenting Voice](https://scryfall.com/card/znr/172/tormenting-voice)
11. [Ojutai Monument](https://scryfall.com/card/dtk/242/ojutai-monument)
12. [Alms of the Vein](https://scryfall.com/card/soi/98/alms-of-the-vein)
13. [Falkenrath Gorger](https://scryfall.com/card/inr/152/falkenrath-gorger)
14. [Shu Yun, the Silent Tempest](https://scryfall.com/card/frf/52/shu-yun-the-silent-tempest)
15. [Abzan Guide](https://scryfall.com/card/ktk/162/abzan-guide)
16. [Port Town](https://scryfall.com/card/msc/256/port-town)
17. [Thought Dissector](https://scryfall.com/card/dst/152/thought-dissector)
18. [Adarkar Windform](https://scryfall.com/card/csp/26/adarkar-windform)
19. [Leonin Lightscribe](https://scryfall.com/card/stx/20/leonin-lightscribe)
20. [Testament of Faith](https://scryfall.com/card/ody/55/testament-of-faith)
21. [Spellrune Painter // Spellrune Howler](https://scryfall.com/card/mid/160/spellrune-painter-spellrune-howler)
22. [Sokka, Tenacious Tactician](https://scryfall.com/card/tla/242/sokka-tenacious-tactician)
23. [Sphere of Truth](https://scryfall.com/card/ody/52/sphere-of-truth)
24. [Gutless Plunderer](https://scryfall.com/card/fdn/60/gutless-plunderer)
25. [Cunning Bandit // Azamuki, Treachery Incarnate](https://scryfall.com/card/bok/99/cunning-bandit-azamuki-treachery-incarnate)

These are seed-selected cards with at least one Scryfall tag, but no tag matched a useful family in the current draft map. They check whether the vocabulary or mapping is missing relevant labels.

## C. Prosper/exile and Korvold/sacrifice contrasts — 25 cards

**Exile access and payoffs (10):**

1. [Prosper, Tome-Bound](https://scryfall.com/card/afc/2/prosper-tome-bound)
2. [Light Up the Stage](https://scryfall.com/card/dsc/166/light-up-the-stage)
3. [Jeska's Will](https://scryfall.com/card/mkc/156/jeskas-will)
4. [Stolen Strategy](https://scryfall.com/card/clb/807/stolen-strategy)
5. [Gonti, Lord of Luxury](https://scryfall.com/card/otc/135/gonti-lord-of-luxury)
6. [Valakut Exploration](https://scryfall.com/card/znr/175/valakut-exploration)
7. [Ignite the Future](https://scryfall.com/card/clb/797/ignite-the-future)
8. [Passionate Archaeologist](https://scryfall.com/card/clb/656/passionate-archaeologist)
9. [Laelia, the Blade Reforged](https://scryfall.com/card/soc/246/laelia-the-blade-reforged)
10. [Containment Construct](https://scryfall.com/card/soc/344/containment-construct)

**Sacrifice, death, Treasures, and payoffs (15):**

11. [Korvold, Fae-Cursed King](https://scryfall.com/card/eoc/120/korvold-fae-cursed-king)
12. [Deadly Dispute](https://scryfall.com/card/msc/794/deadly-dispute)
13. [Viscera Seer](https://scryfall.com/card/soc/229/viscera-seer)
14. [Blood Artist](https://scryfall.com/card/soc/209/blood-artist)
15. [Mayhem Devil](https://scryfall.com/card/eoc/121/mayhem-devil)
16. [Pitiless Plunderer](https://scryfall.com/card/lcc/208/pitiless-plunderer)
17. [Zulaport Cutthroat](https://scryfall.com/card/soc/233/zulaport-cutthroat)
18. [Pawn of Ulamog](https://scryfall.com/card/soc/223/pawn-of-ulamog)
19. [Goblin Bombardment](https://scryfall.com/card/mh2/279/goblin-bombardment)
20. [Ashnod's Altar](https://scryfall.com/card/cmm/368/ashnods-altar)
21. [Mirkwood Bats](https://scryfall.com/card/ltr/95/mirkwood-bats)
22. [Village Rites](https://scryfall.com/card/inr/137/village-rites)
23. [Grim Haruspex](https://scryfall.com/card/clb/754/grim-haruspex)
24. [Academy Manufactor](https://scryfall.com/card/otc/251/academy-manufactor)
25. [Smothering Tithe](https://scryfall.com/card/cmm/57/smothering-tithe)

The human labels should call out differences such as “play from exile” versus “cast from exile,” “this turn” versus a longer permission, creating Treasure versus spending it, and sacrificing a permanent versus a creature merely dying.

## D. Modes, conditions, other card faces, and no-label cases — 25 cards

1. [Austere Command](https://scryfall.com/card/msc/121/austere-command) — choose two different effects.
2. [Cryptic Command](https://scryfall.com/card/ima/48/cryptic-command) — modal spell combining counter, bounce, tapping, and draw.
3. [Bala Ged Recovery // Bala Ged Sanctuary](https://scryfall.com/card/znr/180/bala-ged-recovery-bala-ged-sanctuary) — spell or land face.
4. [Fire // Ice](https://scryfall.com/card/dmr/215/fire-ice) — split card with distinct modes.
5. [Wear // Tear](https://scryfall.com/card/moc/343/wear-tear) — split card with two kinds of removal.
6. [Valki, God of Lies // Tibalt, Cosmic Impostor](https://scryfall.com/card/khm/114/valki-god-of-lies-tibalt-cosmic-impostor) — front and back faces with different roles.
7. [Sejiri Shelter // Sejiri Glacier](https://scryfall.com/card/znr/37/sejiri-shelter-sejiri-glacier) — protection spell or land face.
8. [Valakut Awakening // Valakut Stoneforge](https://scryfall.com/card/znr/174/valakut-awakening-valakut-stoneforge) — hand filtering or land face.
9. [Doomskar](https://scryfall.com/card/khm/9/doomskar) — board wipe with a delayed foretell option.
10. [Rite of Oblivion](https://scryfall.com/card/mid/237/rite-of-oblivion) — sacrifice cost plus flashback.
11. [Faithless Looting](https://scryfall.com/card/soc/244/faithless-looting) — chosen self-discard and graveyard casting.
12. [Cathartic Reunion](https://scryfall.com/card/ecc/91/cathartic-reunion) — discard as a cost, then draw.
13. [Thoughtseize](https://scryfall.com/card/2xm/109/thoughtseize) — opponent hand disruption, not self-discard.
14. [Farewell](https://scryfall.com/card/mkc/64/farewell) — choose one or more mass-exile modes.
15. [Murderous Rider // Swift End](https://scryfall.com/card/moc/258/murderous-rider-swift-end) — Adventure spell face and creature face.
16. [Mogg War Marshal](https://scryfall.com/card/plst/DMR-131/mogg-war-marshal) — enters/dies triggers and echo cost.
17. [Skullclamp](https://scryfall.com/card/msc/210/skullclamp) — Equipment and creature-death draw.
18. [Ophiomancer](https://scryfall.com/card/soc/118/ophiomancer) — token creation depends on controlling no Snake.
19. [Reassembling Skeleton](https://scryfall.com/card/tdc/195/reassembling-skeleton) — activated return from the graveyard.
20. [Dreadhorde Invasion](https://scryfall.com/card/frc/48/dreadhorde-invasion) — upkeep, Army tokens, counters, and life payment.
21. [Gigantosaurus](https://scryfall.com/card/m19/185/gigantosaurus) — no Oracle Tagger label; check that no unsupported mechanic is invented.
22. [Scaled Wurm](https://scryfall.com/card/cns/178/scaled-wurm) — no Oracle Tagger label; check that no unsupported mechanic is invented.
23. [Oreskos Swiftclaw](https://scryfall.com/card/m19/31/oreskos-swiftclaw) — no Oracle Tagger label; check that no unsupported mechanic is invented.
24. [Silvercoat Lion](https://scryfall.com/card/m13/35/silvercoat-lion) — no Oracle Tagger label; check that no unsupported mechanic is invented.
25. [Ancient Brontodon](https://scryfall.com/card/xln/175/ancient-brontodon) — no Oracle Tagger label; check that no unsupported mechanic is invented.

## What owner review would look like

1. Review this list and suggest replacements if a card or build case seems unhelpful.
2. I draft a plain-English first pass from each card's Oracle text, without looking at Scryfall's labels or Haiku results.
3. You accept, correct, or mark each draft as unsure in the worksheet. We lock those agreed descriptions before comparing them with Scryfall or Haiku.
4. The report compares Scryfall-only, Haiku fallback, and combined labels, with special attention to the distinctions called out above. For a stronger independent check, a second person can blind-label a small sample afterward.

The sample list does not authorize an AI run or spending. Haiku is not called until the card list and review approach are accepted and spend is explicitly approved.

## How detailed a label should be

Use short plain-English descriptions. Capture every distinct thing the card does **when leaving it out could change which deck would want the card**. You do not need to restate every game rule or use a special code.

For example, for **Maze Skullbomb**, useful notes would be:

- It can sacrifice **itself** to draw a card.
- Its other ability also sacrifices itself, draws a card, and gives a creature **you control** +3/+3 and trample **until end of turn**.
- It is a one-use effect for that copy, not a repeatable sacrifice outlet after the artifact is gone.

“Sacrifice and draw” is a good start, but it misses that the sacrificed object is an artifact, that both choices draw a card, and that the second choice buffs your own creature temporarily. “Sacrifices creatures” or “repeatable draw engine” would be inaccurate. If the text is unclear, write **unsure** rather than guessing. Reviewers may use different wording; the important thing is to agree on the same rules-supported meaning before comparing with Scryfall or Haiku.
