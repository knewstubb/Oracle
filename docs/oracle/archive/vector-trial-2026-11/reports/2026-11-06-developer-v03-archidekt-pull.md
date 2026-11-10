# Report: v03-archidekt-pull
Role: Developer
Status: DONE
Task as received: Slice V-03. Read AGENTS.md, your role files and docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md (V-03). Create a standalone script on a new branch trial/vector-recommendations that fetches, once each, https://archidekt.com/decks/15628123/artifacts (Mendicant Core, Guidelight) and https://archidekt.com/decks/19277239/a_rot_to_process (Wilhelt, the Rotcleaver) and writes two JSON fixtures into a trial folder (e.g. trial/vector/fixtures/): card name, quantity, board/category, printing id (scryfall id), plus the commander. Reuse only the existing Archidekt fetch helper, not deck-saving code. NO database connection, NO writes to any user table, nothing through import routes. Respect Archidekt rate limits (one request each, polite User-Agent). Also output a list of cards that may not match later. Run the script once, check fixtures, run the smallest relevant check (e.g. lint/typecheck for the new file). Do not merge. Write report ...

## Summary for the owner
Both of your decks have been copied once each into two files for the trial; nothing in the app, your decks on Archidekt, or your data was changed. Each deck came through as exactly 100 cards plus a maybeboard (52 extra cards for Mendicant, 44 for Wilhelt), with the right commander. A short list of cards that might be hard to match later is attached; nothing for you to decide yet, except one question about the maybeboards (see open questions).

## Changed files
- trial/vector/pull-archidekt-fixtures.ts — new standalone script; calls only `fetchDeck` from `src/lib/archidekt-client.ts` (unchanged), adds a polite User-Agent by wrapping `fetch` inside this script only, counts requests
- trial/vector/fixtures/mendicant-core-artifacts.json — 139 rows (1 commander, 86 mainboard rows = 99 cards, 52 maybeboard)
- trial/vector/fixtures/wilhelt-rot-to-process.json — 128 rows (1 commander, 83 mainboard rows, 44 maybeboard); mainboard + commander quantity = 100
- trial/vector/fixtures/unmatched-risk-list.txt — 103 entries that may not match later (96 are just maybeboard, 7 are two-faced names)

Fixture fields per card: `name`, `quantity`, `board` (commander / mainboard / maybeboard / sideboard), `categories` (Archidekt's own tags), `scryfall_id` (printing id, from Archidekt `card.uid`), `set`, `collector_number`, `type_line`. Top level: source URL, deck id, deck name, `commanders`, `fetched_at`.

Branch: `trial/vector-recommendations` (created from main; not merged, not pushed).

## New decisions made (need owner confirmation)
- Maybeboard cards are kept in the fixtures but labelled `board: "maybeboard"`, so the plan's rule ("all non-land, non-commander cards, used whole", C4) can be applied to the mainboard only. Gene/Architect to confirm in the freeze file (V-04).

## Assumptions
- Archidekt's `card.uid` is the Scryfall printing id `[Confirmed: src/lib/archidekt-client.ts ArchidektCard; all 267 rows hold UUID-shaped values]`. Not independently checked against Scryfall (V-08 does that).
- Board is derived from the `categories` list: "Commander" → commander, "Maybeboard" → maybeboard, "Sideboard" → sideboard, else mainboard. Land status is not computed here; `type_line` is stored so the harness can decide.
- Finish (foil/etched) is not captured; not requested, and not part of the printing id.
- The existing helper sends no User-Agent, so the script wraps global `fetch` to send `OracleApp-vector-trial/0.1 (single read-only fixture pull; owner decks only)`. The helper itself is untouched.

## Challenges to locked decisions
- none

## Open questions
- Mendicant's mainboard rows sum to 99 + 1 commander = 100; Wilhelt's likewise. Should maybeboard cards ever be used in the trial (for example as "cards the owner already considered")? Default: ignored.
- One Mendicant card name arrives censored from Archidekt as "Lantern ****** Lanterns' Lift" (a two-faced card, front name masked). It will not match by name; match by printing id instead. Unresolved by me.

## Verification
- `npx tsx trial/vector/pull-archidekt-fixtures.ts` (run once) — 2 requests total (one per deck), no errors; commanders "Mendicant Core, Guidelight" and "Wilhelt, the Rotcleaver" found.
- Fixture check — every row has a UUID-shaped printing id (0 missing); mainboard+commander quantity = 100 in both.
- `npx eslint trial/vector/pull-archidekt-fixtures.ts` — clean.
- `npx tsc --noEmit` on the script alone (strict) — clean. The full `npm run typecheck`/`npm test` were not run: no app code changed.
- Safety: the script imports no Supabase code and no route handlers; it writes only to `trial/vector/fixtures/`.

## Cards that may not match later (summary; full list in unmatched-risk-list.txt)
- Two-faced / split names written "A // B": Thousand Moons Smithy // Barracks of the Thousand, Hengegate Pathway // Mistgate Pathway, The Everflowing Well // The Myriad Pools, Clearwater Pathway // Murkwater Pathway, Murderous Rider // Swift End, Poppet Stitcher // Poppet Factory. Name lookup may need front-face matching or printing id.
- Censored name: "Lantern ****** Lanterns' Lift" (Mendicant).
- All maybeboard cards (96 rows) are flagged as "not in deck", not as matching problems.
