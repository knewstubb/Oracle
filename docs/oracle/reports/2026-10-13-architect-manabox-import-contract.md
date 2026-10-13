# Report: ManaBox import contract (T-53)

Role: Architect
Status: DONE
Task as received: Write the contract for ManaBox import (collection via CSV; one deck per file via CSV or text export) in docs/oracle/contracts/manabox-import.md, per decisions D-044 to D-049 and the T-53 line in docs/oracle/status.md, using the sample files in docs/oracle/samples/manabox/ and stating which existing import code (src/lib/csv-import.ts, csv-deck-parser.ts, text-deck-parser.ts, import-engine-v2.ts, src/app/api/collection/import/) is reused or replaced. Done when: the contract maps every column and text-line part of all five sample files to stored data, covers per-card Original/Proxy, deck format, add-to-collection versus list-only, basics-to-generic, token skipping and unmatched lines, lists any migration needed, and your report is written.

## Revision note (2026-10-13)

Revised per T-53 handoff update and the T-54 spec §7 "Needed" rows / §12 G1–G2:
- Token detection now uses only resolved Scryfall card data (`layout = 'token'` / `'double_faced_token'` or `type_line` contains `Token`); the set-code allow-list is removed so real sets like TDM are never skipped.
- Added a non-writing preview endpoint returning combined rows, skipped tokens and unmatched lines.
- Commit now accepts a per-row proxy count (0…qty) instead of a boolean.
- Collection import is add-only and never replaces existing copies or clears deck sleeves.
- Confirmed "Add to collection" creates new copies and sleeves them into the deck; existing owned copies are never pulled in (D-047).
- Added setting commander on an existing deck via `PATCH /api/decks/[id]`.
- Open questions reduced to one (finish editing for text exports).

## Revision note 2 (2026-10-13)

Revised per owner decisions on main commit 151967d:
- D-047 revised: deck import now uses a per-card **Original / Proxy / Unsleeved** split (default Original), replacing the deck-level add-to-collection / list-only switch. Original and Proxy create new owned copies and sleeve them; Unsleeved creates a Planned slot to be sleeved later from owned copies.
- D-050: collection import is add-only and never replaces the collection or clears deck sleeves; collection and deck imports are separate screens.
- D-051: preview rows split by language, combine conditions (each copy keeps its own condition), skip tokens in collection imports too, and text-file rows carry a per-row Foil checkbox.
- D-052: after a deck import the commander picker opens immediately on the new deck.
- Open questions: none.

## Summary for the owner

The contract is ready. It explains exactly how each part of a ManaBox CSV or text file becomes cards and decks in Oracle: which columns become `user_copies`, which become `deck_cards`, how text lines without a Scryfall ID are looked up by set and collector number, and why the file's own Proxy column is ignored. For deck imports, each card is now Original, Proxy or Unsleeved — Original and Proxy create new copies and sleeve them, while Unsleeved adds the card to the list to be sleeved later. Collection scans only add cards and never replace your collection. After a deck import, the commander picker opens straight away. No database migration is needed; the existing tables already support everything.

## Changed files

- `docs/oracle/contracts/manabox-import.md` — the contract, revised to D-047 (Original/Proxy/Unsleeved per card), D-050 (add-only collection), D-051 (row combining, text-file foil, collection token skipping) and D-052 (immediate commander picker).
- `docs/oracle/contracts/manabox-import.types.ts` — matching TypeScript types.

## New decisions made (need owner confirmation)

- None. The contract builds on the already-approved decisions D-044 to D-049 and the owner decisions D-050 to D-052 recorded on 2026-10-13.

## Assumptions

- ManaBox text exports use front-face names for double-faced cards, as noted in D-049 and visible in `Strixhaven.txt`.
- Token detection relies only on resolved Scryfall card data, not set codes, so real sets like `TDM` are never mistaken for token sets.
- A ManaBox deck file is treated as a list import, not a "built" physical-deck import. Per D-047 revised, each card is Original, Proxy or Unsleeved instead of a deck-level mode switch.
- Original and Proxy counts create new physical copies and sleeve them into the deck; Unsleeved counts create Planned slots; none of them pull from existing owned copies (D-047 revised).

## Challenges to locked decisions

- None.

## Open questions

None. All owner questions have been decided and are reflected in D-050 to D-052.

## Verification

- Reviewed all five sample files in `docs/oracle/samples/manabox/` and confirmed every column (CSV) and line part (text) is mapped in the contract.
- Cross-checked every requirement from D-044 to D-052 against the contract sections:
  - D-044: §2.1, §3, §5.1, §6
  - D-045: §3 table (`Proxy` ignored), §9, §15.1, §15.2
  - D-046: §7.2, §7.4, §15.3
  - D-047 revised: §8, §12.2, §15.2
  - D-048: §10
  - D-049: §5.1 (set+collector lookup), §6 (text grammar), §11 (token skipping and unmatched lines)
  - D-050: §1, §12.1, §15.1
  - D-051: §3 (condition handling), §11.1, §13.3 (row combining / text foil)
  - D-052: §7.4, §15.2, §15.3
- Confirmed token detection no longer uses a set-code allow-list and cannot skip real sets like `TDM`.
- Confirmed the preview contract matches the T-54 §7 "Needed" rows and §12 G1.
- Confirmed no deck-level add-to-collection / list-only switch remains in the contract.
- Confirmed no schema migration is needed by checking existing columns in `src/types/supabase.ts` and the migrations that created them.
- TypeScript compiler could not be run because `node_modules` is not installed in this worktree; the types file is a pure interface file with no runtime code.
