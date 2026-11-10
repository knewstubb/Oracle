# Report: v04-freeze-sheet
Role: Architect
Status: PARTIAL (freeze file and sheet format written; four snapshot fields and the exact infinite-result strings cannot be filled until the downloads exist, see Open questions)
Task as received: Slice V-04. Read AGENTS.md, your role files, docs/oracle/reports/2026-11-06-gene-signoff-next-slices.md (V-04 handoff) and the signed contract docs/oracle/contracts/vector-trial-2026-11.md (§5.9 Freeze, §5.2). Write the freeze file and grading-sheet format as specified in the V-04 handoff. Owner decisions: maybeboard cards are IGNORED when filtering 'already in deck' (owner confirmed 2026-11-06); pgvector is listed as available in the owner's Supabase dashboard. No data writes, no builds. Write report docs/oracle/reports/2026-11-06-architect-v04-freeze-sheet.md in the standard format with a plain-language owner summary ending with a 'For Brad (plain words)' line.

## Summary for the owner
The test's ground rules are now written down in one dated file: which three deck builds are tested, which cards are used for the tricky checks, which card lists from your two Archidekt decks count (main deck only, never the maybeboard), and which settings are fixed. A second file defines the grading sheet you will fill in, which shows only card text and a blank grade, with nothing about where a card came from. Please skim the first file (about 10 minutes) and change any card you dislike; four dates and fingerprints can only be filled once the card data is downloaded.

For Brad (plain words): The test cards and rules are now locked on paper before any result exists, and your grading sheet shows only the card and a blank box, so nobody (including the assistant) can bend the test toward an answer.

## Changed files
- docs/oracle/contracts/vector-trial-freeze-2026-11-06.md — the dated freeze file, all nine §5.9 items, with a block for harness-appended combo lists
- docs/oracle/contracts/vector-trial-grading-sheet-format.md — sheet format per §5.2/C7: no arm, rank, source or combo hint; sealed key kept separate
- docs/oracle/reports/2026-11-06-architect-v04-freeze-sheet.md — this report

Contract files created (for Gene to hand on): the two contract files above. No types file, no migration, nothing in `src/`.

## New decisions made (need owner confirmation)
- **Card choices drafted by Architect** (owner skim, A1b): 10 traps per commander, the 12 deck-dependent cards (6 are the contract's own candidates, 6 new), 10 multi-feature cards with features, 6 Wilhelt-only flip cards, 5 control staples. Each has an ordered reserve line for the case where the harness finds a card illegal or out of identity.
- **Maybeboard rule** stated as "ignored" everywhere (centroid, fixture use, "already in deck" filter), per the owner's 2026-11-06 confirmation.
- **Infinite-result list fixed as a keyword rule** (contains "infinite", "win the game", "near-infinite", "unbounded"; unclear counts as infinite), because exact strings need the Spellbook snapshot. The harness appends the derived list before any result.
- **Tag allow-list** seeded from the 2026-11-04 sample slugs, expansion limited to children of allow-listed parents; weight cutoff "median and stronger".
- **Grade sheet folds combo-only cards into the "pool" section** so the grader cannot tell their source.
- **Fixture rule:** mainboard only, lands and commander dropped, quantity counted once, printing id to `oracle_id` through hosted `ref_printings`, "//" and masked names matched by printing id. Fixture files pinned by SHA-256.

## Assumptions
- Card names and their roles are drafted from memory of printed cards [Approximate]; none was checked against the Scryfall snapshot in this slice (no data access used). The harness checks legality, identity and uniqueness and swaps from the reserve lines. A few traps were deliberately borderline. [Scrubbed 2026-11-06 by V-04b: trap names were removed from this report; trap identities are now sealed.]
- Fixture counts and hashes were read from the files on 2026-11-06 [Confirmed: trial/vector/fixtures/*.json, `shasum -a 256`; mainboard quantity 99 + commander in both].
- Build facts come from the V-02 report [Confirmed: docs/oracle/reports/2026-11-06-architect-v02-kickoff-checks.md §1].

## Challenges to locked decisions
- none

## Open questions
- **Snapshot fields cannot be filled yet (item 9).** Contract §5.9 wants the Scryfall, Tags and Spellbook snapshot dates and the model revision fixed at freeze, but those files are not downloaded and downloading is a later gate. The freeze file has a "to fill" table; Gene should decide who fills it (suggest the slice that does each download) and confirm the file is committed only after it is complete and before any pool. Until then the freeze is not valid.
- **Item 2 and the combo lists are derived, not typed.** Same reason; the harness appends them (§10 of the freeze file). Gene to confirm this satisfies "fixed before results" (it follows the contract's own "appended later" clause for combos; the infinite-result list is the new case).
- **pgvector:** the owner reports it available in the Supabase dashboard. That closes the V-02 "not verified" item only as the owner's statement; it is not recorded in the freeze file because it is not a freeze item. Gene to update status.md and the contract §1.2 note in V-09. [Approximate: not checked by me]
- **A1b skim** is still owed by the owner (about 10 minutes).
- The freeze file is not committed. Committing is Gene's step, and its timing relative to pool generation is the Gene check in §5.9.

## Verification
- `shasum -a 256` on the three fixture files — hashes recorded in the freeze file
- Python read of both fixture JSONs — board counts: Mendicant 1 commander, 86 mainboard rows (99 cards), 52 maybeboard; Wilhelt 1 commander, 83 mainboard rows (99 cards), 44 maybeboard; "//" and masked names found as listed
- Read-through against contract §5.9: items 1 to 9 each present; combo lists marked "Appended later by the harness"; freeze file contains no arm, rank or grade
- No build, test, database access or data write was run.
