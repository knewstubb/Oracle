# Report: tester-v04c-check
Role: Tester
Status: PARTIAL (all hard rules pass; four soft findings for Gene, listed below; nothing was changed except this report)
Task as received: Read-only check in the clean trial worktree (branch trial/vector-clean, uncommitted edits) of the V-04b and V-06c work: (1) sealed key SHA-256 against the freeze file; (2) each new trap's rules text has its stated wrong function (one batched Scryfall /cards/collection request), legality and colour identity for all 36; (3) no trap name in any owner-facing file, count leftovers elsewhere; (4) new picks not in the stored build lists (read-only SELECT) or the two fixture decks, overlaps by slot id; (5) sheet format has no section or arm leak; (6) the seed rule in the contract matches V-06c and no stale "signature cards" wording remains. Slot ids only; no card names.

## Summary for the owner
The sealed set of look-alike cards is intact and every card in it is legal and in the right colours. The grading sheet and the signed documents no longer reveal which cards are look-alikes. Nothing needs your decision. I found four small things for Gene to look at (listed below). None of them changes what you will see, and none blocks the freeze.

## Results by check

### 1. Sealed key hash: PASS
The key file's SHA-256 is the same as the hash written in the freeze file (sections 5, 8 and 9 all carry the same value, and it matches the Architect's report). The file was not edited during the check.

### 2. Rules check against Scryfall: PASS on every hard rule, one soft finding
One batched request to Scryfall (36 identifiers by `oracle_id`): 36 found, 0 missing.
- **Commander legality:** all 36 legal.
- **Colour identity:** all 36 inside the asking commander's (Wilhelt blue/black; Mendicant white/blue). Colourless cards: M-T03, M-T05, M-R01, M-R02.
- **Stored name matches the `oracle_id`:** all 36.
- **No duplicate `oracle_id` anywhere in the key:** 0 duplicates. None of the 36 also appears in the freeze file's deck-dependent, multi-feature or control lists.
- **Counts:** 10 traps per commander (5 exposed, 5 new each), 4 reserves per commander, 6 flip slots (3 new, 3 exposed), 2 flip reserves. All as required.
- **Wrong function (rules text read against the stated reason):**
  - PASS: W-T02, W-T03, W-T04, W-T05, W-T06, W-T07, W-T08, W-T09, W-T10, W-R01 to W-R04, M-T01, M-T03, M-T04, M-T05, M-T06, M-T07, M-T08, M-T09, M-T10, M-R01 to M-R04. Text-only bodies (W-T02, W-T05, W-R02, W-R03, M-T03, M-R01, M-R02) really have no engine or payoff text. The sacrifice cards make the opponent, or everyone, sacrifice, which is the opposite of what Wilhelt wants. The artifact cards stop, destroy, counter or copy something other than an artifact spell.
  - **WEAK (soft finding A): M-T02.** The reason says it "shuts off activated abilities". The rules text only does that to one chosen opponent permanent, and only if the player has a full party. It is still not an artifact payoff, but the reason overstates it. Suggest rewording the reason, or swapping from the reserve line (M-R03 is a cleaner match, M-R04 too).
  - **WEAK (soft finding B): W-T01 (exposed original).** The text creates Zombie tokens and draws cards from discards, which is arguably useful for a Zombie deck rather than clearly wrong. It is exposed anyway, so scoring treats it separately. Gene may want to treat it as a low-confidence trap.
  - Flip slots F-01 to F-06 and F-R01, F-R02 are contrast picks, not wrong-function traps, so check (d) is not applicable to them. See finding C.

### 3. Names in owner-facing files: PASS in the clean worktree
I searched every file in the clean worktree (excluding the sealed key, `node_modules`, `.git` and build output) for all 36 names. 55 files contain at least one name; none is the freeze file, the sheet format, status.md or any 2026-11-06 report except the Developer dry-run report.

| Place | Files with a match | Slots matched |
|---|---|---|
| Freeze file | 0 | none |
| Sheet format | 0 | none |
| status.md | 0 | none |
| All reports from 2026-11-04 and 2026-11-06, including the three Architect reports | 0 owner-facing leaks of new picks; 7 reports match old exposed slots only (F-04, F-05, F-06) | F-04, F-05, F-06 |
| Contract (vector-trial-2026-11.md) and the trial brief | 2 | F-04 (4 times in the contract, once in the brief), M-T07 (once in the contract). Both are exposed originals |
| Everything else (knowledge files, scripts, source code, public test data, the owner's fixture deck, research pages) | 46 | mostly F-04, F-05, F-06, M-T01, M-T05, M-T10, W-T01, W-T10 (all exposed originals or ordinary famous cards) |

**New (unseen) picks:** the only slots with any match in the clean worktree are F-01 and F-03, in 3 public EDHREC test-data files (`tests/fixtures/edhrec/`). Everything else with a match is an exposed original. No new trap slot (W-T02, W-T04, W-T05, W-T06, W-T09, M-T02, M-T03, M-T04, M-T06, M-T09) and no reserve appears in any non-sealed file.

**Stale copy outside the clean worktree (soft finding D):** the original repo folder still has the old, un-scrubbed versions: the freeze file there has 14 old slot matches (W-T01, W-T03, W-T07, W-T08, W-T10, W-R04, M-T01, M-T05, M-T07, M-T08, M-T10, F-04, F-05, F-06) and the V-04 report there has 1 (W-T07). These are the original, already-exposed names, not the new picks. Nothing in the original folder should be shown to the owner, and Gene's review should read only the clean worktree copies. The original folder's collection files also contain a few exposed names (the owner's own cards).

### 4. Not in stored build lists or fixture decks: PASS for all new picks
Read-only SELECT of `ref_build_cards` for the three trial builds (Zombies 50, Aristocrats 50, Artifacts 50 rows, matching V-07's expectation; all other builds of the two commanders have 0 rows). Fixtures: mainboard rows of both fixture decks resolved by printing id through Scryfall (83 and 86 distinct cards).
- Overlap with a stored build list: **F-06 only** (in both Zombies and Aristocrats lists). No other slot overlaps.
- Overlap with a fixture deck mainboard: **F-06 only** (Wilhelt fixture deck). The Architect's report said F-04 to F-06 are in the fixture deck; by oracle id, only F-06 is on the mainboard. F-04 and F-05 appear in the fixture file but not on its mainboard (they are maybeboard or similar), so they do not count under the fixed fixture rule.
- No new trap, reserve or new flip pick overlaps a stored list or fixture deck.

### 5. Sheet format leaks: PASS, with one minor observation
- No `section` column, no type-specific headings, no arm, rank, source or combo hint. The header, column list and example agree with each other and with the freeze amendment. Row ids are assigned after shuffling.
- A1b sample is defined as 5 pool-only rows with the full card text.
- **Minor observation (not a failure):** the context table in the format file says W1 holds "the 10 Wilhelt trap rows" and W2 holds no trap rows. This shows the count and the list, but not any identity. It also means a card that appears in only one of W1 or W2 is slightly more likely to be a look-alike or multi-feature card than one that appears in both, because ordinary pool and deck-dependent rows repeat across lists. The owner already knows traps exist, so I would call this low risk. Gene decides whether it is worth a note.

### 6. Seed rule vs V-06c: PASS
The contract (section 4B.2) says: stored 50 cards of the build; keep synergy greater than 0, one `oracle_id`, Commander-legal, inside identity, not the commander; sort by synergy descending, then inclusion descending, then name ascending; take 8; missing or negative synergy never qualifies; `is_signature` ignored; fewer than 5 qualifying cards falls back to the commander seed and says "no build signal"; the seed pick cards are removed from the candidate list; weights 0.5 / 0.5 (0.3 / 0.3 / 0.4 with a deck). The kickoff builds row (section 1.3) now says "at least 5 cards meeting the seed rule", the freeze file carries the dated V-06c line, and the header has Update 6.
- No rule or check still says "signature cards". Remaining mentions are: the header reason (the 33 to 41 of 50 finding), the old-flag definition and "trial ignores it" notes, and one historical observation in section 1.1 ("39 and 41 of them signature cards") that describes old data, not a rule. I would leave that one.
- Outside the contract, "signature card" wording remains only in older, dated reports (2026-11-04 and the 2026-11-06 kickoff, plus Gene's and the Architect's own amendment reports), which describe history.

## Findings for Gene (soft, none blocks)
- **A. M-T02:** reason overstated; consider rewording or swapping from the reserve (a swap changes the key hash, which needs a dated freeze amendment per freeze section 9).
- **B. W-T01 (exposed):** arguably a decent Zombie pick; low-confidence trap.
- **C. Flip slots:** F-01 and F-03 have reasons saying "in the Zombies build list", but they are not in the stored Zombies list (they only appear in EDHREC's wider public data). F-04 and F-05 are in neither stored list. F-06 is in both lists and the fixture deck, so it cannot distinguish the two builds by stored data. The contrast then rests on the trial's own rankings, not on the stored lists. Gene should confirm that is the intended meaning of "contrast pick" for the flip scoring.
- **D. Stale un-scrubbed copies** of the freeze file and V-04 report remain in the original folder.
- Also noted: status.md rows for V-04b and V-06c still read TODO (Gene's file; the work exists in the worktree).

## Changed files
- docs/oracle/reports/2026-11-06-tester-v04c-check.md — this report. Nothing else written. Scratch results (Scryfall response, stored list copy) were kept only in the system temp folder.

## New decisions made (need owner confirmation)
- none

## Assumptions
- Wrong-function check is a Tester reading of the rules text, not a rating of how good the card is for the deck; findings A and B are judgement calls, flagged rather than failed.
- Name matching is by front-face name, case-insensitive, whole word. A match can be an unrelated sentence containing the same words; counts above are upper bounds.
- "Owner-facing" means freeze file, sheet format, reports and status.md.

## Challenges to locked decisions
- none (D-003, D-009, D-012 are not touched; matching used `oracle_id`, not printing id, except as a lookup key for fixtures)

## Open questions
- Does Gene want M-T02 swapped, and F-04 to F-06 treated as weak contrast cards (finding C)?

## Verification
- `shasum -a 256` of the sealed key vs the freeze file hash — match
- One batched POST to Scryfall `/cards/collection` (36 `oracle_id` identifiers) — 36 found, 0 not found; legality and colour identity checked on the response
- Read-only REST SELECTs on `ref_commander_builds` and `ref_build_cards` — 50, 50, 50 rows for the three trial builds; no writes
- Fixture mainboards resolved by printing id through Scryfall (2 requests per deck, no misses)
- Name scan across both repo folders — counts in section 3
- `npm run typecheck`, `npm run lint`, `npm test`: not run; this task changed documents and a sealed data file only, and the task said read-only
