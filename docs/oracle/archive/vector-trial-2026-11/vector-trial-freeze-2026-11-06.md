# Vector trial freeze file, dated 2026-11-06

Authority: contract `vector-trial-2026-11.md` §5.9 (SIGNED by Gene 2026-11-06). Written by Architect in slice V-04.
Owner check (A1b, amended 2026-11-06): a 5-card sample of the blank sheet, no card-by-card approval of traps; see §11. Gene checks that the commit of this file precedes the first pool-generation run.

**Status: FROZEN WHEN COMMITTED, with the "Fields still to be filled" block (end of §9) completed first.** Nothing in this file contains an arm, a rank or a grade. Any later change needs a dated amendment at the bottom and a fresh gold set (§5.9). Nothing here authorises a migration, a download, a data write or a sync.

Lists: **W1** (Wilhelt, Zombies), **W2** (Wilhelt, Aristocrats), **M1** (Mendicant, Artifacts).
Card-name claims below are drafted from memory of the printed cards [Approximate]; the sealed picks in §5 and §8 were checked against Scryfall text by the Architect and are re-checked by the Tester. The harness checks every named card against the dated Scryfall snapshot (resolves to one `oracle_id`, Commander-legal, inside the asking commander's identity). A card that fails is replaced by the next card in its reserve line, in the order written, and the replacement is logged by slot id. No other substitution is allowed.

## 1. Approved builds (§5.9 item 1)
Source: hosted `ref_commander_builds`, read-only 2026-11-06, last EDHREC sync 2026-08-06 [Confirmed: docs/oracle/reports/2026-11-06-architect-v02-kickoff-checks.md §1].

| List | Commander (`ref_commanders.id`) | Build | EDHREC slug | Decks | Share of commander | Why chosen |
|---|---|---|---|---|---|---|
| W1 | Wilhelt, the Rotcleaver (7efd346e-9815-4934-b04a-e27b055a23fa; `oracle_id` eada96a1-4964-4ad0-b0e3-2df08d6ae188) | theme `kindred:zombies` | `zombies` | 4,024 | 18.2% | most-played Wilhelt build |
| W2 | same | archetype `aristocrats` | `aristocrats` | 1,013 | 4.6% | second build; about 59% top-card overlap with W1 (contract §4B.1) |
| M1 | Mendicant Core, Guidelight (77e2e6c2-573d-4792-85d8-32de12cc97dc; `oracle_id` b20d74a4-0e08-4779-972a-499f1a2be15a) | theme `artifacts` | `artifacts` | 1,634 | 10.2% | most-played Mendicant build |

- M1 is the `artifacts` slug, **not** the `affinity` build (also theme `artifacts`, 262 decks). Builds are selected by slug.
- Card lists for these builds are currently empty in hosted data (0 rows in `ref_build_cards`). They exist only after the V-05/V-06 sync, which needs owner approval A2. The freeze fixes which builds are used, not their contents.
- No second Mendicant build (grading effort, contract §4B.1).
- All three lists use the no-deck seed (C3, §4B.2). The Archidekt decks never feed the three graded lists.

## 2. Infinite-result name list (item 2, contract §4A.5)
Fixed as a **rule**, because the exact result strings exist only in the dated Spellbook snapshot, which is not yet downloaded:
- A combo counts as infinite if any of its produced-result names, case-insensitive, contains: `infinite`, `win the game`, `wins the game`, `near-infinite`, `unbounded`.
- A combo whose result names are empty or unrecognisable counts as infinite (safe side).
- The harness writes the resulting exact list of qualifying result strings into the §10 append block before any result is read. It is derived from the rule above, not chosen.

## 3. Tag allow-list and weight cutoff (item 3, contract §2.4.3)
- **Weight cutoff:** keep taggings of weight `median` and stronger (`median`, `strong`, `very_strong`). Drop `weak` and weaker.
- **Join:** by `oracle_id` only, never by name. Parent tags are expanded through `child_ids`.
- **Allow-list (slugs seen in the 2026-11-04 sample, contract §2.4.1/§2.4.5):** `ramp`, `mana-rock`, `land-ramp`, `adds-multiple-mana`, `repeatable-treasures`, `draw-engine`, `repeatable-pure-draw`, `repeatable-impulsive-draw`, `long-term-impulsive-draw`, `synergy-exile-cast`, `opponent-loses-life`, `blood-artist-ability`, `rhystic`, `cast-tax`, `draw-hate`.
- **Allow-list expansion rule:** the harness may add only a slug that is a direct child of an allow-listed parent. It must not add any other slug.
- **Excluded always:** `meme`, `activated-ability`, `triggered-ability`, any slug starting `cycle-`, any slug starting `inscryption-`.
- Slugs absent from the dated Oracle Tags file are counted and dropped; the count goes in the report. The tag arm is judged by contract §5.1 (≥ 0.03 nDCG@10 on either commander, traps not worse).

## 4. Staple threshold (item 4, contract §5.3)
A staple is a card in the top 50 of at least 25% of all stored builds that have card data after the sync. Computed offline by the harness. The threshold is not tuned.

## 5. Trap cards (item 5, contract §5.2)
Ten per commander (slots `W-T01` to `W-T10` for Wilhelt, `M-T01` to `M-T10` for Mendicant), graded once per commander, not per build. A trap is a card sharing words with the commander's job but doing a different job. **The cards are sealed**: names, reasons and reserves are in `trial/vector/sealed/gold-key.json`, which is not shown to the grader, the owner, Gene, Designer or Scribe.
- Per commander, 5 traps are original picks that the owner was told about (flagged `exposed` in the key) and 5 are new picks the owner has not seen (`exposed: false`). Slot ids do not reveal which.
- Rules every trap meets (checked by the Tester, V-04c): legal in Commander; colour identity inside the asking commander's (Wilhelt blue and black, Mendicant white and blue); same vocabulary as the commander's job but a different job; not in that commander's stored 50-card build lists; not a deck-dependent, multi-feature or flip card; not in the two fixture decks (mainboard).
- Reserves: 4 per commander, in order, in the key (3 for Mendicant since V-04d: `M-R01`, `M-R02`, `M-R04`). A failed slot is swapped from the reserves in order and logged by slot id.
- **Sealed key SHA-256: `04d1f8479a378b6fbe7ab829e919d6cfe6668393b034ddcea59fb7d8fe9c3862`** (amended 2026-11-06, V-04d, see §11; hash of the exact file bytes; the file carries a 32-byte random salt).

## 6. The 12 deck-dependent cards (item 6, contract §5.6)
All blue or colourless, so each is inside both commanders' identities. The same 12 are graded in each of W1, W2, M1 (a card's grade depends on the build).
1. Rhystic Study, 2. Mystic Remora, 3. Skullclamp, 4. Sai, Master Thopterist, 5. Sol Ring, 6. Ashnod's Altar, 7. Altar of Dementia, 8. Phyrexian Altar, 9. Nim Deathmantle, 10. Scrap Trawler, 11. Etherium Sculptor, 12. Metalworker.
Reserves, in order: Mind Stone, Arcane Signet, Foundry Inspector.
Cards 1 to 6 are the contract's named candidates (§5.6). Cards 7 to 12 are the Zombie/sacrifice payoffs (7 to 9) and artifact payoffs (10 to 12) the contract left open.
Replacement rule from §5.6 still applies after grading: if fewer than 8 cards differ by 2 or more grades between commanders, replace cards the owner graded the same, using the reserve line, and log it. This is the only allowed post-freeze change to this list and it needs a dated amendment.
Seed weights for the blend: commander 0.4, deck centroid 0.6, normalised. Fixed.

## 7. Multi-feature cards and their features (item 7, contract §5.5)
Features are drafted by an assistant and confirmed by the owner at A1b. Check is commander level.

| Card | Features |
|---|---|
| Mendicant Core, Guidelight | counts artifacts you control; speed mechanic; copies artifact spells at maximum speed |
| Wilhelt, the Rotcleaver | makes replacement tokens when Zombies die; sacrifice a creature to draw |
| Smothering Tithe (Mendicant only) | ramp (Treasure); taxes opponents' draws |
| Rhystic Study | draw engine; tax on opponents' spells |
| Skullclamp | shrinks a creature; draws when it dies |
| Sai, Master Thopterist | makes tokens when you cast artifacts; turns artifacts into cards |
| Mind Stone | mana rock; cycles for a card |
| Ashnod's Altar | sacrifice outlet; adds mana |
| Scrap Trawler | artifact payoff; recursion when an artifact goes to the graveyard |
| Cryptbreaker (Wilhelt only) | makes a Zombie; draws and drains by tapping Zombies; discard cost |

Arms for this check: single query, per-feature merged (RRF constant 60), tag-assisted (tagged arm only). Success rule is contract §5.5, unchanged.

## 8. Flip cards (item 8, contract §5.8)
Used only for Wilhelt's two builds, W1 vs W2.
- **All 12 cards of §6** (all legal for Wilhelt).
- **Six Wilhelt-only cards chosen for build contrast** (slots `F-01` to `F-06`, sealed in the key). Four are new picks the owner has not seen (`F-01` to `F-03` and, since V-04d, `F-06`) and two are original picks flagged `exposed` (`F-04`, `F-05`). A contrast pick is one the style's public data expects and the other style's does not; it is scored only on the trial's own rankings, not on membership of the stored build lists. `F-04` and `F-05` are in the fixture file only, not in either stored list or the fixture mainboard. One unseen reserve (`F-R02`) remains in the key.
- **Sealed key SHA-256: `04d1f8479a378b6fbe7ab829e919d6cfe6668393b034ddcea59fb7d8fe9c3862`** (same file as §5).
- **Controls (5 universal staples):** Arcane Signet, Mind Stone, Talisman of Dominance, Fellwar Stone, Thought Vessel. Rule: stay within the top 30 in both builds and not move more than 10 places between them. Control reserves: Commander's Sphere, Sky Diamond.
- Candidates must be in both builds' candidate pool (legal, in identity), else replaced from the reserve line.
- If fewer than 8 card pairs differ by 2 or more grades, the check is reported inconclusive, not passed (contract §5.8).

## 9. Snapshots, model, recipe, fixtures (item 9)
**Fixed now:**
- **Sealed key:** `trial/vector/sealed/gold-key.json`, SHA-256 `04d1f8479a378b6fbe7ab829e919d6cfe6668393b034ddcea59fb7d8fe9c3862` (see §5). Any change to the key changes the hash and needs a dated amendment and a fresh gold set.
- **Embedding model:** option 1, `BAAI/bge-small-en-v1.5`, 384 dimensions, run locally (contract §3). Second table with option 2 only if the result is "iterate" (§5.4).
- **Recipe:** v2 (contract §2.3), arms `v2-base` (four lines) and `v2-tagged` (five lines). Excluded fields as listed in §2.3.
- **Fixed constants:** RRF constant 60; k = 20; blend weights 0.4/0.6; go/stop thresholds as in §5.4.
- **Archidekt fixtures, read-only, no ownership data, no DB write:**
  - `trial/vector/fixtures/mendicant-core-artifacts.json` (deck 15628123, "Arti-facts", pulled 2026-11-06T01:29:16Z), SHA-256 `12032f1f1f7df4278a8b33302ae0d3005ed478a672ee87af6b221f2f62b90635`. 139 rows: 1 commander, 86 mainboard rows (99 cards), 52 maybeboard.
  - `trial/vector/fixtures/wilhelt-rot-to-process.json` (deck 19277239, "A Rot to Process", pulled 2026-11-06T01:29:18Z), SHA-256 `65cc31733c4141854d882e7ff4e3abb0ce039a1ef651703dc7dd87eda51f3652`. 128 rows: 1 commander, 83 mainboard rows (99 cards), 44 maybeboard.
  - `unmatched-risk-list.txt` (SHA-256 `7f253b56a60a382909cadfd2f6fa5d580d4cbe1512203192fed58458261df899`) is a note, not an input.
- **Fixed fixture rule (§5.6 with owner decision 2026-11-06):**
  1. Use only rows with `board = mainboard`. **Maybeboard cards are ignored** (owner confirmed 2026-11-06). They are not in the deck centroid, and they do not count as "already in the deck" when filtering recommendations. This holds for every list and every arm.
  2. Drop the commander row and every land (decided by the Scryfall type line of the resolved `oracle_id`; the fixture's own `type_line` is null). Basic lands (Plains, Island, Swamp) are removed.
  3. Use all remaining cards whole: no sampling, no trimming. A card with quantity above 1 counts once.
  4. Map each printing id (`scryfall_id`) to an `oracle_id` through hosted `ref_printings`; the printing id is a lookup key only (D-003). Cards that cannot be mapped are listed and excluded, never guessed.
  5. Two-faced names written "A // B" and the masked Mendicant name ("Lantern ****** Lanterns' Lift") are matched by printing id, never by name. Names that map to more than one `oracle_id` (223 in `ref_printings`, V-02 §5) count as unresolved if reached by name.
  6. Fixtures contain no ownership data and are never built from EDHREC inclusion.
  7. Any change to a fixture file changes its SHA-256 and therefore needs a dated amendment and a fresh gold set.

**Fields still to be filled (cannot be known until the downloads exist; not a design choice).** These are filled by the slice that does the download, and the file is committed only after they are filled and before any pool is generated:

| Field | Value |
|---|---|
| Scryfall Oracle Cards snapshot date and SHA-256 | 2026-11-05 (`oracle-cards-20261105220203.jsonl.gz`, 39,287 cards), SHA-256 of the .gz `49563a2d2a4e638079a769120d595602c60c467a07713d3f28ea7e5d6652bf82` (V-11, filled 2026-11-06) |
| Scryfall Oracle Tags file date and SHA-256 | 2026-11-05 (`oracle-tags-20261105220031.jsonl.gz`, 4,601 tags), SHA-256 of the .gz `d5ef0b131dbc7cb9ecc142bbdc4c02c904017f6f7ec3e54eb0dbde1cbbeade05` (V-12, filled 2026-11-06) |
| Commander Spellbook snapshot date and SHA-256 | 2026-11-06 (file built 2026-11-06T02:12:25Z, version 7.3.4, 119,491 variants), SHA-256 of the .gz `a99622c08c4fbe0d626d7656907929e117e9b1a39bb21cd9cc38689e9c183d5b` (V-13, filled 2026-11-06) |
| Model file revision (Hugging Face commit hash) | `BAAI/bge-small-en-v1.5` at `5c38ec7c405ec4b44b94cc5a9bb96e735b38267a`, ONNX fp32 file `onnx/model.onnx` SHA-256 `828e1496d7fabb79cfa4dcd84fa38625c0d3d21da474a00f08db0f559940cf35`, run with @huggingface/transformers 4.3.2, CLS pooling, L2-normalised (V-11, filled 2026-11-06) |

## 10. Appended later by the harness, before any result is read
- Infinite-result string list (derived from §2).
- Frozen combo lists per commander: L-cmd (5 most popular qualifying combos), top-10 set, L-deck fixtures, L-negative, L-cross (derived from the Spellbook snapshot; contract §5.7). **Appended later by the harness.**
- Gene checks each append is committed before the first result is opened.

## 11. Amendments
- **2026-11-06 (V-04b, blinding).** The owner had been told which cards were traps. Five of ten traps per commander were replaced with unseen picks, three of the six Wilhelt contrast picks were replaced, and all trap and contrast identities moved into the sealed key (§5, §8, §9). The 5 kept traps per commander and 3 kept contrast cards are `exposed` in the key. The deck-dependent cards (§6), multi-feature cards (§7) and controls (§8) are unchanged and exposed by design. Trap rows now appear inside each commander's first list on the grading sheet, with no section label. A1b is now the 5-card sample check. Scoring uses unexposed traps first (contract §5.2, §5.4, §5.8). No grade existed yet, so no fresh gold set is needed.
- **2026-11-06 (V-04d, sealed key amended; Gene decisions in `docs/oracle/reports/2026-11-06-gene-signoff-amendment.md` §2).** Old key SHA-256 `f03c5084f0a5ef3de27f18591036183b958f6054828e7322f9a36996aca4a0d2`; new key SHA-256 `04d1f8479a378b6fbe7ab829e919d6cfe6668393b034ddcea59fb7d8fe9c3862`. Changes, by slot id: (1) `M-T02` now holds the former `M-R03` pick (the old `M-T02` pick is dropped, not kept as a reserve); Mendicant reserves are now `M-R01`, `M-R02`, `M-R04`, in that order. (2) `W-T01` is marked `confidence: low`: it stays an exposed trap, is reported separately, and counts in neither numerator nor denominator of gate 4. (3) `F-06` now holds the former `F-R01` pick (checked in neither stored list nor either fixture mainboard); the old `F-06` pick is dropped; the only flip reserve left is `F-R02`. (4) Reasons for `F-01`, `F-03`, `F-04`, `F-05` reworded to "public-data contrast" with no claim about stored lists. (5) The sheet format no longer states a per-list trap count. Key now holds 34 slots. The swapped slots were re-checked with one batched Scryfall request (legal in Commander, inside the commander's colour identity, 0 not found). No grade existed, so no fresh gold set is needed.
- **2026-11-06 (V-06c).** Build seeds follow the amended contract §4B.2 (top 8 stored cards by synergy; `is_signature` ignored). No freeze item changes.
