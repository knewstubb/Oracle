# Report: t59-import-formats
Role: architect
Status: DONE (T-59b applied; with one caveat: other sites' formats are `[Unverified]`, written from knowledge, no real exports available)
Task as received: T-59: Survey the CSV and text formats other systems use (Archidekt, Moxfield, MTGGoldfish, TappedOut, Deckbox, ManaBox, Deckstats, MTG Arena/MTGO and similar) and write a parsing contract to docs/oracle/contracts/import-formats.md: column-name aliases, line patterns, and section words (Commander, Deck, Maybeboard, Sideboard, Companion and common variants, including "SB:" prefixes and "// Commander" comments) that mark every card under them. Inputs: current parsers src/lib/manabox-import.ts, text-deck-parser.ts, csv-deck-parser.ts; decisions D-005, D-018, D-022, D-046, D-049 (D-046 says the commander is picked after import because ManaBox files don't mark it; state what changes when a list does mark it, as a decision for the owner). Also correct the Scryfall ID row in the column table of docs/oracle/contracts/manabox-import.md (it must not be required; see section 5.1 rule 2), and list sample files for tests. Do not edit decisions.md. Another Developer agent is concurrently editing src/lib/manabox-import.ts (T-58); do not edit source code.

## Summary for the owner
I wrote the plan for reading card lists from other deck sites, including how words like "Commander", "Sideboard" and "Maybeboard" decide where cards go. Today, pasting a list with a Sideboard heading puts those cards into the main deck by mistake; the plan fixes that. You need to decide what should happen when a list says which card is the commander (recommended: tick it for you in the commander picker, which still opens).

## Changed files
- docs/oracle/contracts/import-formats.md — new: current-parser gaps, one shared parsing model, per-site tables (text and CSV), column aliases, section-word table, line patterns, edge cases E-1 to E-22, test-file list
- docs/oracle/contracts/manabox-import.md — Scryfall ID column row now "no (preferred)", with fallback to set + collector number

## Update T-59b (owner answers applied)
Contract is now FINAL, with an ordered T-60 slice list (§12, S-1 to S-8). Owner answers: N-1 agree, N-2 changed (companion/partner/background go in the command zone), N-3 yes, N-4 yes, N-5 yes (file's Proxy column sets the review-row default to Proxy).

Summary for the owner: Lists that name the commander will have it ticked for you in the picker, and the picker still opens. Partner, background and companion cards also get ticked in the command zone. One catch: the app can't yet record a companion as "not a commander", so that part needs a small data change you'll be asked to approve. Under the real rules a companion starts outside the game, not in the command zone, so it must not count towards colour identity or the 100.

Gaps found (details in contract §9 N-2): picker is single-choice today; decks store one commander; a command-zone role (esp. companion) has no home; commander eligibility list excludes companions.

## New decisions made (need owner confirmation; Gene to record, decisions.md not edited)
Amended decisions:
- D-045 — "Proxy column ignored" replaced: the file's Proxy column sets the review-row default to Proxy; owner can still change it (N-5).
- D-019 — same amendment for CSV imports (Archidekt `^Proxy^` label also sets the default); manual proxy setting still works.
- D-046 — "file says nothing about the commander" holds only for ManaBox; a marked commander is pre-ticked in the picker, which still opens (N-1).
- D-018 / D-022 — unchanged for Sideboard/Maybeboard (both to maybeboard, no copies). Companion is explicitly NOT maybeboard now (N-2).
- D-049 — unchanged for ManaBox text (no finish); other sites' `*F*`/`*E*` honoured (N-3); set-code check widened to 2-6.
- D-051 — Foil checkbox is pre-ticked from the file's marker (N-3).
- D-044 — ManaBox no longer the only deck-import route; other sites accepted (N-4).
- D-005 — companion/partner/background now live in the command zone, not the maybeboard relation; needs `command_zone_role` (migration, owner approval) for the companion.
- D-047 — a Proxy row from a file follows the same rule as a hand-picked Proxy.
New for approval:
- N-6: add nullable `deck_cards.command_zone_role` (commander|partner|background|companion); I'll draft the migration on approval.
- N-7: interim until then, companion stays in the main list with a preview note (rules-safe).

## Assumptions
- A-1: A blank line followed by an untitled block stays in the current section (main by default), with a preview note, rather than becoming a sideboard.
- A-2: "Sideboard", "Side" and similar words all map to the maybeboard (D-018).
- A-3: 5 MB / 5,000-line file limit; set codes widened to 2-6 characters.
- Other sites' header names and section wording are from knowledge, not real files.

## Challenges to locked decisions
- D-046 — Other sites do mark the commander, so "the file says nothing" only holds for ManaBox — settle via N-1.
- D-049 — "Check: set code 2-4" in the current parser rejects longer Scryfall codes; widen to 2-6 (implementation detail, no change to the decision).

## Open questions
- Can the owner supply one real export from each of Archidekt, Moxfield, TappedOut, Deckbox, Deckstats and Arena? They would replace the `[Unverified]` rows.
- The ManaBox detection check requires `Scryfall ID` and `ManaBox ID` in the header; the T-58 Developer should confirm how detection treats a CSV missing `Scryfall ID`.

## Verification
- Read src/lib/manabox-import.ts, text-deck-parser.ts, csv-deck-parser.ts and the sample files — claims tagged in the contract.
- No tests run; docs only. No source code or decisions.md edited.
