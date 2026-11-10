# Report: v06-dry-run
Role: Developer
Status: PARTIAL (the dry run ran safely and made no writes, but all three builds came back NOT FOUND because of a bug in the existing sync script; nothing to approve yet)
Task as received: Read AGENTS.md (including the final-message rules) and your role files, then docs/oracle/reports/2026-11-06-gene-review-v04-v05-v09.md for the V-06 dry-run handoff. Run ONLY the read-only dry run of scripts/sync-edhrec-builds.ts for Wilhelt, the Rotcleaver (zombies, aristocrats) and Mendicant Core, Guidelight (artifacts) with the filters plus --dry-run. It must make no database writes. If the dry run could write anything, stop and report. Capture the output (which builds, card counts and names, NOT FOUND cases, theme slug validity). Do NOT run the real sync. Write report docs/oracle/reports/2026-11-06-developer-v06-dry-run.md with a plain-language owner summary.

## Summary for the owner
The preview ran and changed nothing in your database. It could not preview any of the three style lists: the tool said none of them could be found, even though EDHREC does have all three pages. The cause is that EDHREC now lists its style tags in a different layout than the loading tool expects, so the tool cannot see them. This needs a small fix to the tool before the preview is useful. Nothing needs your decision yet.

## Safety check before running
- Everything the script does before it stops in dry-run mode is reading: database SELECTs and EDHREC fetches. The first possible write comes after `if (DRY_RUN) return;` [Confirmed: scripts/sync-edhrec-builds.ts, `runFilteredSync`]. A missing build also aborts before any write.
- Ran only with `--dry-run`. The real sync was not run. No key was printed (output was passed through a redaction filter; the env file was only checked for the key's presence).
- Branch: trial/vector-recommendations. Uncommitted changes in the working tree were left untouched.

## Dry-run output (full)
```
[2026-11-06T02:04:12.148Z] Filtered trial mode: wilhelt-the-rotcleaver/zombies, wilhelt-the-rotcleaver/aristocrats, mendicant-core-guidelight/artifacts
[2026-11-06T02:04:12.149Z] Mode: DRY RUN (reads only, no writes)

DRY RUN REPORT: 3 build(s). No database writes were made.

Wilhelt, the Rotcleaver / zombies
  NOT FOUND on EDHREC (or tag below threshold): nothing would be written for this build.

Wilhelt, the Rotcleaver / aristocrats
  NOT FOUND on EDHREC (or tag below threshold): nothing would be written for this build.

Mendicant Core, Guidelight / artifacts
  NOT FOUND on EDHREC (or tag below threshold): nothing would be written for this build.

Fatal error: Error: 3 target build(s) could not be planned; aborting before any write
    at runFilteredSync (scripts/sync-edhrec-builds.ts:1005:11)
```
Exit code 1 (the intended abort).

## Per-build result
| Build | Found | Cards now | Cards after | Add / replace / remove |
|---|---|---|---|---|
| Wilhelt, the Rotcleaver / zombies | No (NOT FOUND) | not read | not planned | none |
| Wilhelt, the Rotcleaver / aristocrats | No (NOT FOUND) | not read | not planned | none |
| Mendicant Core, Guidelight / artifacts | No (NOT FOUND) | not read | not planned | none |

No card names are available because planning stopped before any card list was built. Both commanders were found in the hosted `ref_commanders` table (otherwise the script would have thrown "Commander not found").

## Diagnosis (read-only checks, no writes)
- EDHREC returns HTTP 200 for the commander pages (`wilhelt-the-rotcleaver`, `mendicant-core-guidelight`) and for all three theme pages (`.../zombies`, `.../aristocrats`, `mendicant-core-guidelight/artifacts`). The three theme slugs are valid on EDHREC. Wilhelt's page shows zombies 2592 decks and aristocrats 922 decks of 23099, both well above the 2% threshold.
- Root cause: `extractTags` reads `tag_counts` as an object of name to count (`Record<string, number>`) [Confirmed: scripts/sync-edhrec-builds.ts lines 111 and 325]. EDHREC now returns `tag_counts` as a list of `{count, slug, value}` entries. The script therefore turns the list into nonsense keys and never finds `zombies`, `aristocrats` or `artifacts`, so every build is "NOT FOUND".
- This is in the original tag-reading code, not in V-05's filter or planning logic. The V-05 safety behaviour (abort before any write when a build is missing) worked as designed.
- Not yet checked: whether the card-extraction step (`extractBuildCards`) also matches EDHREC's current theme-page layout. It was never reached. Expect the dry run to reveal this once tags are fixed.

## Suggested next step (Gene to dispatch)
Fix `extractTags` to accept the list layout (and keep the old layout working), add a unit test using a real EDHREC sample, then rerun this same dry run. Small change, same file, Developer lane. V-06b stays held, and A2 should not be asked until a dry run shows real card counts.

## Changed files
- docs/oracle/reports/2026-11-06-developer-v06-dry-run.md — this report. No code or database changes.

## New decisions made (need owner confirmation)
- none

## Assumptions
- A fix to `extractTags` is in scope for a follow-up task; I did not make it because this task said to run only the dry run.

## Challenges to locked decisions
- none

## Open questions
- Should Gene dispatch the `extractTags` fix as V-06a2 (my recommendation), and should it also cover any card-extraction mismatch found on the next dry run?

## Verification
- `npx tsx scripts/sync-edhrec-builds.ts --commander=wilhelt-the-rotcleaver,mendicant-core-guidelight --theme=zombies,aristocrats,artifacts --dry-run` — ran, exit 1, all three NOT FOUND, no writes made
- `curl` GET (read-only) of the EDHREC commander and theme pages — all HTTP 200; `tag_counts` is a list
- Real sync not run

---

# Follow-up: V-06a2 (tag-reading fix, card-reading check, flag-typo guard)
Status: DONE

## Summary for the owner (follow-up)
The preview now works. It finds all three styles and would add 50 cards to each, and it still changes nothing in your database. I also made the loading tool refuse a mistyped style option (for example a space instead of "=") so it can never quietly turn into a full load of every commander. Nothing needs your decision except whether the card lists look right (see the note on basic lands below); the real load has not been run.

## What was fixed
- Tag reading: EDHREC now gives style tags as a list of {count, slug, value}. The filtered path now reads that list (and still reads the old layout). The unfiltered path's own tag reader is untouched [Confirmed: scripts/sync-edhrec-builds.ts `extractTags`]; note it also cannot read the new layout, so a full unfiltered sync would currently find no tags. Left as is per the task; flag for Gene.
- Card reading: checked against the real theme pages. Same layout as expected (card lists with name, num_decks, potential_decks); no fix needed. Tests assert this on the saved samples.
- Flag guard: any `--commander`/`--theme` argument not in the exact `--flag=value` form (space-separated, valueless, `--commanders=`, wrong case) is now an error raised before any network or database call. Verified: `--commander wilhelt-the-rotcleaver --dry-run` prints "Malformed filter flag" and stops.

## Dry-run result (read-only, no writes, real sync not run)
All three builds found; each currently has 0 card rows, so all 50 are additions (add 50, replace 0, remove 0).

Wilhelt, the Rotcleaver / zombies (build row exists; 50 cards would be added):
Swamp; Island; Sol Ring; Diregraf Captain; Command Tower; Arcane Signet; Rooftop Storm; Diregraf Colossus; Gravecrawler; Death Baron; Undead Augur; Sunken Hollow; Gray Merchant of Asphodel; Headless Rider; Necroduality; Talisman of Dominance; Lord of the Accursed; Cemetery Reaper; Tainted Isle; Hordewing Skaab; Choked Estuary; Zombie Apocalypse; Carrion Feeder; Endless Ranks of the Dead; Path of Ancestry; Midnight Reaper; Cleaver Skaab; Feed the Swarm; Bojuka Bog; Undead Warchief; Gisa and Geralf; Darkwater Catacombs; Fleshbag Marauder; Plague Belcher; Empty the Laboratory; Noxious Ghoul; Dimir Signet; Zul Ashur, Lich Lord; Champion of the Perished; Cryptbreaker; Counterspell; Drowned Catacomb; The Scarab God; Crowded Crypt; Temple of Deceit; Dimir Aqueduct; Watery Grave; Lord of the Undead; Gleaming Overseer; Mikaeus, the Unhallowed

Wilhelt, the Rotcleaver / aristocrats (50 added):
Swamp; Gravecrawler; Command Tower; Island; Sol Ring; Arcane Signet; Diregraf Captain; Rooftop Storm; Undead Augur; Diregraf Colossus; Carrion Feeder; Necroduality; Headless Rider; Talisman of Dominance; Gray Merchant of Asphodel; Sunken Hollow; Plague Belcher; Cryptbreaker; Death Baron; Tainted Isle; Watery Grave; Mikaeus, the Unhallowed; Midnight Reaper; Noxious Ghoul; Warren Soultrader; Path of Ancestry; Drowned Catacomb; Bojuka Bog; Zul Ashur, Lich Lord; Phyrexian Altar; Feed the Swarm; Underground River; Dimir Signet; Choked Estuary; Accursed Marauder; Ashnod's Altar; Unholy Grotto; Shipwreck Marsh; Undead Warchief; Darkwater Catacombs; Poppet Stitcher; Skullclamp; Fleshbag Marauder; Vengeful Dead; Relentless Dead; Zombie Apocalypse; Dark Ritual; Victimize; Hordewing Skaab; Cleaver Skaab

Mendicant Core, Guidelight / artifacts (50 added):
Island; Plains; Sol Ring; Command Tower; Arcane Signet; Seat of the Synod; Etherium Sculptor; Foundry Inspector; Ancient Den; Muraganda Raceway; Razortide Bridge; Kappa Cannoneer; Glacial Fortress; Thought Monitor; Voyager Quickwelder; Swords to Plowshares; Voyage Home; Organic Extinction; Sai, Master Thopterist; Dispatch; Darksteel Citadel; Thopter Spy Network; Thoughtcast; Padeem, Consul of Innovation; Prairie Stream; Bronze Guardian; Solemn Simulacrum; Adarkar Wastes; Path to Exile; Amonkhet Raceway; Emry, Lurker of the Loch; Archway of Innovation; Cyberdrive Awakener; Hallowed Fountain; Talisman of Progress; Academy Ruins; Counterspell; Master of Etherium; Simulacrum Synthesizer; Azorius Signet; Phyrexian Metamorph; Mystic Forge; Illustrious Wanderglyph; Steel Overseer; Losheel, Clockwork Scholar; Esper Sentinel; Riptide Gearhulk; Deserted Beach; Ornithopter of Paradise; Uthros Research Craft

Observation (existing behaviour, not changed): the top-50 is ranked purely by how many decks include a card, so basic lands (Swamp, Island, Plains) and lands/mana rocks fill many slots, and the lists are only the top 50 of about 260 cards on each page. Gene/owner may want to decide whether the vector trial wants that.

## Changed files
- scripts/sync-edhrec-builds-layout.ts — new pure helper reading both tag layouts
- scripts/sync-edhrec-builds-layout.test.ts — tests using real EDHREC samples
- tests/fixtures/edhrec/* — saved real responses (5 pages, fetched once each, trimmed to used fields) and a README
- scripts/sync-edhrec-builds.ts — filtered path uses the new tag reader; type widened
- scripts/sync-edhrec-builds-filters.ts — malformed-flag guard
- scripts/sync-edhrec-builds-filters.test.ts — tests for the guard
- docs/oracle/reports/2026-11-06-developer-v06-dry-run.md — this follow-up

## New decisions made (need owner confirmation)
- none

## Assumptions
- Tag fix limited to the filtered path as instructed, even though the unfiltered reader is also broken by the new layout.
- Fetch used User-Agent `TheOracle/1.0 (commander-deckbuilder; contact: owner)`, one request per page, 1 s apart.

## Challenges to locked decisions
- none

## Open questions
- Should the unfiltered full sync also get the tag fix (it currently finds no tags)?
- Basic lands in the top-50: keep or exclude for the trial?

## Verification
- `npm run check` — tests, typecheck, lint all pass (0 lint errors; existing warnings only)
- Dry run (filters + --dry-run) — 3/3 found, 50 adds each, no writes, real sync not run
- `--commander wilhelt-the-rotcleaver --dry-run` — rejected with "Malformed filter flag" before any network/database call

---

# A2 run: basic-land exclusion and real filtered sync (2026-11-06)
Status: DONE

## Summary for the owner (A2)
The three style lists are now loaded: 50 cards each, with no basic lands (Plains, Island, Swamp and the like are skipped, and the next-most-popular cards fill the gaps). Nothing else in the database changed: the other 1,882 style rows are untouched and no other card lists exist or were touched. The only side effect is that each of the three styles' "how many decks use this" numbers were refreshed to EDHREC's current figures, for example Wilhelt zombies went from 4,024 to 2,592.

## What was done
1. Basic-land exclusion (filtered path only; the unfiltered reader is unchanged). Excluded: Plains, Island, Swamp, Mountain, Forest, Wastes and their Snow-Covered versions. Exclusion happens before the top-50 cut, so each list is a full 50 non-basic cards [Confirmed: scripts/sync-edhrec-builds.ts `extractBuildCards` option `excludeBasics`; scripts/sync-edhrec-builds-layout.ts `isBasicLand`]. Tests: basic names, near-miss names kept (Snow-Covered Stream, Island of Wak-Wak, Swamp Mosquito), and the three real samples each still hold at least 50 non-basic cards. `npm run check`: 221 files, 2587 tests pass, 0 lint errors.
2. Baseline (read-only, V-02): ref_commander_builds 1885 rows; ref_build_cards 0 rows (empty everywhere). The three target build rows existed with 0 cards.
3. Dry run: 3/3 found, 50 adds each, no basics. Final card names per build are the same as the lists the real run saved (below).
4. Real filtered sync with `--commander=wilhelt-the-rotcleaver,mendicant-core-guidelight --theme=zombies,aristocrats,artifacts`. All three finished first time ("50 card rows saved" each). The unfiltered sync was not run; no other writes.
5. Verification (read-only, after):
- Builds 1885 to 1885, none missing, none added. Exactly 3 build rows changed (the targets). Card rows 0 to 150, all in the three builds; 0 card rows for any other build.
- Per build: 50 cards, 0 basics, 0 duplicates, positions 0 to 49. Wilhelt zombies: synergy -0.05 to 0.82, inclusion 0.46 to 0.95, 40 staples, 40 signature. Wilhelt aristocrats: -0.09 to 0.86, 0.47 to 0.96, 43 staples, 41 signature. Mendicant artifacts: -0.09 to 0.66, 0.39 to 0.89, 26 staples, 33 signature. Values are in plausible ranges.
- Changed build rows: Wilhelt/zombies deck count 4024 to 2592; Wilhelt/aristocrats 1013 to 922; Mendicant/artifacts 1634 to 1766 (refreshed from EDHREC by the existing upsert).

## Final card lists (50 each, in saved order)
Wilhelt zombies: Sol Ring; Diregraf Captain; Command Tower; Arcane Signet; Rooftop Storm; Diregraf Colossus; Gravecrawler; Death Baron; Undead Augur; Sunken Hollow; Gray Merchant of Asphodel; Headless Rider; Necroduality; Talisman of Dominance; Lord of the Accursed; Cemetery Reaper; Tainted Isle; Hordewing Skaab; Choked Estuary; Zombie Apocalypse; Carrion Feeder; Endless Ranks of the Dead; Path of Ancestry; Midnight Reaper; Cleaver Skaab; Feed the Swarm; Bojuka Bog; Undead Warchief; Gisa and Geralf; Darkwater Catacombs; Fleshbag Marauder; Plague Belcher; Empty the Laboratory; Noxious Ghoul; Dimir Signet; Zul Ashur, Lich Lord; Champion of the Perished; Cryptbreaker; Counterspell; Drowned Catacomb; The Scarab God; Crowded Crypt; Temple of Deceit; Dimir Aqueduct; Watery Grave; Lord of the Undead; Gleaming Overseer; Mikaeus, the Unhallowed; Tomb Tyrant; Dreadhorde Invasion

Wilhelt aristocrats: Gravecrawler; Command Tower; Sol Ring; Arcane Signet; Diregraf Captain; Rooftop Storm; Undead Augur; Diregraf Colossus; Carrion Feeder; Necroduality; Headless Rider; Talisman of Dominance; Gray Merchant of Asphodel; Sunken Hollow; Plague Belcher; Cryptbreaker; Death Baron; Tainted Isle; Watery Grave; Mikaeus, the Unhallowed; Midnight Reaper; Noxious Ghoul; Warren Soultrader; Path of Ancestry; Drowned Catacomb; Bojuka Bog; Zul Ashur, Lich Lord; Phyrexian Altar; Feed the Swarm; Underground River; Dimir Signet; Choked Estuary; Accursed Marauder; Ashnod's Altar; Unholy Grotto; Shipwreck Marsh; Undead Warchief; Darkwater Catacombs; Poppet Stitcher; Skullclamp; Fleshbag Marauder; Vengeful Dead; Relentless Dead; Zombie Apocalypse; Dark Ritual; Victimize; Hordewing Skaab; Cleaver Skaab; Counterspell; Phyrexian Tower

Mendicant artifacts: Sol Ring; Command Tower; Arcane Signet; Seat of the Synod; Etherium Sculptor; Foundry Inspector; Ancient Den; Muraganda Raceway; Razortide Bridge; Kappa Cannoneer; Glacial Fortress; Thought Monitor; Voyager Quickwelder; Swords to Plowshares; Voyage Home; Organic Extinction; Sai, Master Thopterist; Dispatch; Darksteel Citadel; Thopter Spy Network; Thoughtcast; Padeem, Consul of Innovation; Prairie Stream; Bronze Guardian; Solemn Simulacrum; Adarkar Wastes; Path to Exile; Amonkhet Raceway; Emry, Lurker of the Loch; Archway of Innovation; Cyberdrive Awakener; Hallowed Fountain; Talisman of Progress; Academy Ruins; Counterspell; Master of Etherium; Simulacrum Synthesizer; Azorius Signet; Phyrexian Metamorph; Mystic Forge; Illustrious Wanderglyph; Steel Overseer; Losheel, Clockwork Scholar; Esper Sentinel; Riptide Gearhulk; Deserted Beach; Ornithopter of Paradise; Uthros Research Craft; Vnwxt, Verbose Host; Sea of Clouds

## Changed files
- scripts/sync-edhrec-builds-layout.ts — `isBasicLand`
- scripts/sync-edhrec-builds-layout.test.ts — tests
- scripts/sync-edhrec-builds.ts — `excludeBasics` option used only by the filtered path
- docs/oracle/reports/2026-11-06-developer-v06-dry-run.md — this section

## New decisions made (need owner confirmation)
- none (basic-land exclusion was the owner's decision)

## Assumptions
- "Baseline" taken as full row counts plus the id, deck count and sync time of every build row (no ref_build_cards rows existed).

## Challenges to locked decisions
- none

## Open questions
- Signature flags are very common (33 to 41 of 50) because the existing rule (synergy over 0.15 and inclusion over 0.4) is loose once the list is already the top 50. Does the trial's grading care? Not changed.

## Verification
- `npm run check` — pass (0 lint errors)
- Real filtered sync — 3 builds, 50 rows each, first attempt, no repair needed
- Post-run read-only comparison against baseline — only the 3 target build rows changed; 150 card rows, all in those builds
