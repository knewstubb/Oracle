# Report: import-row-editing
Role: architect
Status: DONE
Task as received: The owner approved the import row-editing design. Read docs/oracle/specs/import-row-editing.md (rev 4), docs/oracle/mockups/import-row-editing.html, docs/oracle/reports/2026-10-20-designer-import-row-editing.md, docs/oracle/decisions.md and docs/oracle/status.md. Task: write a contract in docs/oracle/contracts/ for per-copy import attributes (Original/Proxy, language, finish normal/foil/etched, condition NM/LP/MP/HP/DMG) so the Developer can build it. Today import holds one condition and language per row (check the actual import code and schema to confirm, tag [Confirmed: path]). Cover: the import data shape per copy; how defaults vs file-supplied vs owner-edited values are tracked (for the "From your file" dot); what finish and condition proxies are stored with now that they are hidden (propose and justify); how D-051 (language splitting rows) and D-047 (Unsleeved on deck imports) interact; any migration needed (do not run it; draft only, non-destructive, and say what is deployed per status.md); how it maps into user_copies; and multi-user safety. Also list the Developer tasks in suggested order and the tests required (identifier-resolution rules remain unit-tested discrete functions). Do not change app code or decisions.md. Write the report per the report format and flag open questions for the owner in plain language.

## Update 3 (owner answers, 2026-10-20)
- **Unsleeved corrected.** Unsleeved means "the physical card is not in the deck, owned or not". The earlier "no physical copy yet" wording was wrong and is withdrawn. Re-checked against D-047, D-025, D-031: no conflict. The import still creates and links no copy for an Unsleeved line (the card may already be in the collection; adding one would duplicate it or invent ownership). So an Unsleeved line offers **Finish only** (stored as the slot's requested finish). Language and condition have nowhere to go without a new copy or new slot columns; either is a new decision, so I kept D-047's behaviour and left it as the one open question (below).
- **Text import** now uses the same preview, row editor, defaults bar and bulk bar as CSV; the Foil checkbox is gone. Text files supply no finish, condition or language, so no "From your file" dot ever shows and the defaults bar does the work. Text import is deck-only (collection is CSV only).
- **Decision for Gene to update (owner approval given): D-051** (Foil checkbox sentence). D-049's "owner fixes foils afterwards" is superseded in practice; the rest stays.
- **Migrations approved by owner** (deck per-copy attributes, `ref_printings.finishes`); headers updated to "approved, not yet applied". Neither was run. Card-data refresh approved to run after the code is merged.
- Answers recorded: foil proxy remembers finish (yes); row stays together on language edit (yes); unrecognised file values use the default and are counted (yes); unlisted file finish is kept and marked.
- **Does this break anything?** No. Treating Unsleeved like an Original (with language and condition) would: it needs a collection copy per line (duplicates owned cards, invents ownership for unowned ones) or new deck-slot columns.

Final Developer order (contract §12): 1 pure core; 2 apply both migrations (filename order, one push); 3 sync + resolver; 4 parser (drop `isFoil`); 5 collection write; 6 deck write (text through same path); 7 run card-data refresh; 8–10 screen state, screen, clean-up. **Steps 8–10 are blocked until T-56 is merged** (the screens are on branch `test-t56-local`, status REVIEW); steps 1–7 can start on main now.

## Summary for the owner
The design can be built without changing how your collection is stored. Each physical copy on the import screen will carry its own type, language, finish and condition, and the "From your file" dot simply marks values that came from your file and that you haven't changed. One small behind-the-scenes change is needed for deck imports (so foil, language and condition are kept instead of being reset); I've drafted it but not applied it, and it needs your approval. Six questions below need your call, mainly whether a foil card turned into a Proxy should remember it was foil.

## Changed files
- docs/oracle/contracts/import-row-editing.md — the contract (data shape, tracking, proxies, D-051/D-047, mapping, migration, safety, tests, task order)
- docs/oracle/contracts/import-row-editing.types.ts — reference types and request/RPC row shapes
- supabase/migrations/20261020120000_deck_import_per_copy_attributes.sql — DRAFT, not applied; deck import keeps per-copy finish, language, condition
- supabase/migrations/20261020120100_ref_printings_finishes.sql — DRAFT, not applied; adds `ref_printings.finishes` (Scryfall's finishes per printing, nullable)
- docs/oracle/reports/2026-10-20-architect-import-row-editing.md — this report (updated for the finish-availability addition)

No app code and no decisions.md change.

## New decisions made (need owner confirmation)
- Value precedence is owner edit, then file, then defaults bar; the current value is always computed, never stored, so "changing defaults only updates untouched copies" holds by construction.
- Proxies store `condition = NULL` and keep the finish they would have as an Original (hidden); alternative of always non-foil rejected (reasons in contract §5).
- Row key is fixed from the file's values at preview time and never recomputed after edits; an owner language edit never splits or moves a row (spec Challenge 2).
- Unsleeved lines show and store only Finish (as the slot's requested finish); the import adds and links no copy for them (the card may already be owned). Language and condition are hidden. Still open with the owner (Q3).
- A file value the app does not recognise counts as "not in the file" (default used, one counted notice), instead of silently becoming Near Mint.
- Per-copy Finish replaces the text-file Foil checkbox; text import uses the same editor (owner approved).
- New migration supersedes the unapplied T-57 draft (one approval instead of two).

- Finish rule (contract §5A): finishes come from Scryfall's per-printing list, stored once on the printing table and carried on each preview row. A file finish Scryfall doesn't list is kept and flagged; a defaults-bar finish the card lacks falls back to the card's own finish; bulk skips cards lacking the finish; the server rejects owner-chosen unlisted finishes.

## Assumptions
- ManaBox condition values are the five seen in the samples plus `dmg`; only `near_mint` appeared in the samples [Confirmed: docs/oracle/samples/manabox/*.csv for the values present; the rest is Approximate].
- No CHECK constraint on `user_copies.condition/language/finish` exists outside the repo's migrations [Approximate].
- T-56 screens will be merged before Developer starts the screen work; they are on `test-t56-local`, not main [Confirmed: git, status.md].

## Challenges to locked decisions
- D-051 — names a "Foil checkbox" on text-file rows; per-copy Finish makes it redundant — remove the checkbox, and let Gene note it in the register after owner approval. Row-splitting wording needs no change if "as imported" is read as the file's values (contract §4).
- D-045/D-047 — not contradicted. D-047's "split by count" is replaced in implementation by per-copy type; the outcome is the same.

## Open questions
Plain-language, for the owner:
1. **Do the "Importing as" defaults matter for your files?** ManaBox files fill in foil, condition and language on every card, so for those files the defaults bar changes nothing (every value shows the "From your file" dot). It only applies to text files and blank cells. Keep as designed?
2. **When you mark a foil card as Proxy, should the Proxy remember it was foil?** Recommended yes: nothing is lost, and switching back to Original restores it. You would see no difference on screen. Alternative: Proxies are always non-foil, simpler but loses the information.
3. (Answered: yes.)
4. **Still open — Unsleeved cards on deck imports:** an Unsleeved card is simply not in the deck, and you may or may not own it, so the import leaves your collection alone for it. That means only Finish can be remembered on those lines; Language and Condition are hidden. If you want them recorded for Unsleeved cards, that is a new decision (it would add copies to your collection or need new storage). Default: Finish only.
5. **Text-file "Foil" tickbox:** the new per-copy Finish replaces it. OK to remove it?
6. **A condition or language in the file the app doesn't recognise** (for example "Poor"): use your default and show one quiet line saying how many were replaced. OK?
7. **Finish only where the card comes in it:** choices come from Scryfall's list for that exact printing; a card with one finish shows no Finish control. If your file says Foil on a card with no foil, we keep your file's value and mark it "not listed by Scryfall" (alternative: quietly switch to non-foil). If your default is Foil, cards without foil stay non-foil and one line says how many. Bulk "Set finish" skips cards that lack it and says how many it changed. OK?
8. **Approvals needed:** (a) the small stored-data change for deck imports; (b) adding a "finishes" list to printings, plus a one-time card-data refresh to fill it (until then nothing is restricted). Neither touches existing cards; both are drafts, not applied.

Designer-facing impact: Finish control hidden when only one finish exists; select with only listed options otherwise; unlisted file value shown as "not listed by Scryfall"; defaults help text and bulk note ("Applies to 5 of 7 copies") change. Details in contract §5A.

Still open for the Designer: Unsleeved line layout (Q4); whether basic-land rows with the generic switch on show no Edit button (assumed).

## Verification
- Addition: checked that Scryfall's finishes are not stored or fetched today (`ref_printings` columns, sync mapping, resolver columns); the reconciliation screen's "finishes" are owned-copy finishes. Draft migration not run.
- Read spec rev 4, Designer report, decisions, status, `manabox-import.md` and types, and the actual import code (`manabox-import.ts`, `manabox-collection-import.ts`, `manabox-deck-import.ts`, both import routes, `manabox-import/types.ts`, `identity-resolver.ts`) and the RPC migrations — claims tagged in the contract.
- Counted Condition/Language/Foil values in the three sample CSVs — all `near_mint` / `en` / `normal`.
- Not run: the mockup was not opened in a browser (spec and Designer report relied on); the draft migration was not executed or linted; no tests run (no code changed). Rollup and foil-count queries were not audited for proxy exclusion (flagged in contract §5 as Approximate).
