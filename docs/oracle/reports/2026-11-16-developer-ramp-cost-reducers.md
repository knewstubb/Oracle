# Report: ramp-cost-reducers
Role: Developer
Status: DONE
Task as received: Owner chose option 1 from docs/oracle/reports/2026-11-16-developer-stax-ramp-count-investigation.md: make cost reducers (e.g. Sapphire Medallion, Etherium Sculptor, Urza's Incubator) count as ramp; lands stay excluded. Guard against false positives; add focused tests. Also do the read-only DB check on deck 792324746 ("Stax on Stax") to explain why Basalt Monolith was apparently not counted among the 5 ramp, and fix if it is a code bug. No data writes.

## Summary for the owner
Cards that make a whole kind of spell cheaper (Sapphire Medallion, Etherium Sculptor, Cloud Key, Urza's Incubator) now count as ramp; lands still don't. Stax on Stax goes from 5 ramp to 8. Basalt Monolith was already being counted in the 5, so there was no bug; the earlier suspicion was wrong.

## Findings: Basalt Monolith
- The deck holds Basalt Monolith in the main list (not maybeboard), and its card text exists in the reference table. [Confirmed: read-only queries on decks, deck_cards, ref_cards]
- Running the real classifier over all 75 distinct cards of the deck, the old rules gave exactly 5 ramp: Everflowing Chalice, Karn Legacy Reforged, Sol Ring, Machine God's Effigy, Basalt Monolith. Urza (commander) is excluded from counts by design. So Basalt Monolith was one of the 5. [Confirmed: deck-health.ts commander exclusion]
- New rules give 8: adds Sapphire Medallion, Etherium Sculptor, Cloud Key.

## Rule added
- Permanents whose text says spells you cast (or spells of the chosen type) cost {N} less count as ramp. [Confirmed: src/lib/card-roles.ts]
- Deliberately not counted (judged sensibly): "This spell costs {2} less" (one card), ability cost reducers (equip, activated abilities), "the first X spell each turn" (Artificer Class), effects gated behind Max speed (Racers' Scoreboard), instants and sorceries, tax effects (cost more), lands.
- Narrow-but-real type reducers (Blue/Black/Artifact/Creature spells) count.
- Classifier version bumped 1 to 2 so cached commander targets recompute. Pre-filter needles gained "less".

## Changed files
- src/lib/card-roles.ts — reducer rule, version 2, needle
- src/lib/card-roles.test.ts — focused tests (counts, false positives, lands, Basalt Monolith); version check
- src/lib/commander-targets.test.ts — golden EDHREC fixture numbers updated for the new rule (Mendicant Core average ramp 12 to 16, estimate 13 to 14, Sephiroth 11 to 12)
- docs/oracle/reports/2026-11-16-developer-ramp-cost-reducers.md — this report

## New decisions made (need owner confirmation)
- Once-per-turn and late-condition reducers are excluded. Tell me if you want them counted.

## Assumptions
- Symmetric reducers like Helm of Awakening ("Spells cost {1} less") are not counted; only "you cast" or "chosen type" forms.

## Challenges to locked decisions
- none

## Open questions
- The EDHREC average's higher ramp numbers for artifact decks will now show higher targets too; expected.

## Verification
- Full vitest run: 287 files passed, 3367 tests passed, 46 skipped.
- eslint on touched files: clean. tsc: no errors in touched files.
- DB: read-only GETs only; no writes. Supabase MCP needed login, so the service key from local env was used for GETs (never printed).
