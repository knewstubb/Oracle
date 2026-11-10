# Report: v04d
Role: Architect
Status: DONE
Task as received: V-04d: In the clean trial worktree, apply Gene's decisions in docs/oracle/reports/2026-11-06-gene-signoff-amendment.md section 2 (swap M-T02 for M-R03, mark W-T01 confidence low, replace F-06 with F-R01 or F-R02 after checking stored lists and fixture mainboards, reword F-01, F-03, F-04, F-05 reasons, remove the per-list trap count from the sheet format), update the key hash with a dated freeze §9 amendment, and name no card in any message or report (slot ids only).

## Summary for the owner
One weak look-alike card was swapped for a better one, and one other test card was replaced because it could not tell the two styles apart. A few labels were fixed. Nothing changes in the app and nothing is needed from you.

## Changed files
- trial/vector/sealed/gold-key.json — sealed key: M-T02 swapped, W-T01 marked low confidence, F-06 replaced, four flip reasons reworded (now 34 slots)
- docs/oracle/contracts/vector-trial-freeze-2026-11-06.md — new key hash in all three places, dated amendment in the amendments section, reserve and contrast wording
- docs/oracle/contracts/vector-trial-grading-sheet-format.md — per-list trap counts removed
- docs/oracle/reports/2026-11-06-architect-v04d.md — this report

## Slot changes (ids only)
- M-T02: now holds the former M-R03 pick; old M-T02 pick dropped. M-R03 slot removed; Mendicant reserves are M-R01, M-R02, M-R04.
- W-T01: `confidence: low`, exposed, outside gate 4.
- F-06: now holds the former F-R01 pick; old F-06 pick dropped. Only F-R02 remains as flip reserve.
- F-01, F-03, F-04, F-05: reasons reworded to "public-data contrast".
- New key SHA-256: `04d1f8479a378b6fbe7ab829e919d6cfe6668393b034ddcea59fb7d8fe9c3862` (old `f03c5084f0a5ef3de27f18591036183b958f6054828e7322f9a36996aca4a0d2`).

## New decisions made (need owner confirmation)
- None. Removing the used reserve slots (rather than renumbering) is a bookkeeping call within Gene's decision.

## Assumptions
- "Dropped, not kept as a reserve" means the old picks leave the key, so the key falls from 36 to 34 slots.

## Challenges to locked decisions
- none

## Open questions
- F-02 still says "not in the Zombies build list" (same stored-list wording Gene reworded for F-01, F-03, F-04, F-05). Not in the handoff, so left; Gene may want it reworded.
- The old hash still appears in the V-04b report as history; left unchanged.

## Verification
- One batched POST to Scryfall /cards/collection for M-T02 (after swap), M-R03, M-R04, F-06, F-R01, F-R02 by oracle_id: 6 found, 0 not found; all Commander-legal; M-T02/M-R03 inside W/U, F-R01 inside U/B.
- Read-only SELECT of the three stored 50-card lists plus the two fixture decks: the new M-T02 and new F-06 picks appear in none of them; the old F-06 pick was in two stored lists.
- Key is valid JSON, 34 unique oracle_ids; `shasum -a 256` of the key equals the hash in all three places in the freeze file.
- No database writes, no migration.
