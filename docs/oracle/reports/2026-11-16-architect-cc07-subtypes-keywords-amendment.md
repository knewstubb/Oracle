# Report: cc07-subtypes-keywords-amendment
Role: Architect
Status: DONE
Task as received: Owner decisions on CC-07: (1) APPROVED applying the read-only lookup (record only; developer applies). (2) APPROVED colourless cards appear when searching a colour. (3) CHANGED: owner requires searching by subtype (Elf, Equipment) and by keyword (flying, haste, deathtouch). Audit where subtypes/keywords come from, why subtypes appear dropped, what Scryfall stores, what is available vs needs backfill; if backfill needed design a safe additive script flagged for owner approval and say how the connector degrades; amend contract and slices. No app code.

## Summary for the owner
Claude can search your collection by creature type (Elf, Kithkin), Equipment and similar, and by keyword (flying, haste, deathtouch), with no data fix needed. The earlier worry was a misreading: cards that show a bare dash simply have no subtype (Instants, Sol Ring). Your two approvals are recorded; nothing was applied by me.

## Findings [Live = read-only queries on the hosted project, 2026-11-16]
- Cause of "dropped subtypes": a misreading. The library writes "types — subtypes" always, so cards with no subtypes end in a dash. Of 17,937 creature rows only 1 ends in a dash (Nameless Race, genuinely none). Source file check: Ancient Den has no subtypes. [Confirmed: scripts/sync-card-keywords.ts, data/AllPrintings.sqlite; Live]
- Format: comma separated ("Creature — Elf, Druid"); multi-word subtypes (Time Lord) stay whole.
- Keywords: stored as a list on the library (803 distinct, 16,121 cards filled; empty means none). Same list Scryfall calls keywords. Only 2 library cards (0 of yours) show a keyword at a line start while the list is empty. [Live]
- Owned cards: 2,832; 100 (3.5%) have no library match, so cannot match. Dry run of the exact view logic: 69 Elf, 38 Equipment, 3 Kithkin, 213 flying, 37 haste, 42 deathtouch, 6 flying+haste; 0 suspicious empty subtype lists. [Live]
- Kinship is an ability word, not a creature type; works as a keyword for 12 cards.
- Backfill: NOT needed. Conditional additive fallback script specified (contract 12.6), flagged for owner approval, with honest "N cards unsearchable" degradation. Not triggered.

## Amendments
- View gets two columns (subtypes, keywords); still one read-only view, same rollback, same approval. The version to apply is the amended file.
- Search and summary inputs: subtypes, keywords, keywords_match (all by default). Whole-entry, case-insensitive match; unknown word gives zero results with a spelling suggestion; coverage note covers the 100 unmatched cards.
- Read handle gains contains and overlaps (still select-only).
- Earlier "main types only" limitation withdrawn.

## Slice changes
- S0 (developer applies the amended view; read check as a normal signed-in user; add: 69 Elf, 213 flying distinct cards; if numbers differ, stop and trigger the 12.6 fallback with owner approval).
- S2 grows: subtypes, keywords, keywords_match, spelling suggestion note, handle contains/overlaps, tool description (keywords are printed abilities, not rules-text words; Kinship is a keyword). Acceptance: "Elf creatures not in a deck" total matches direct count; "flying and haste" returns exactly the 6; "flying or haste" returns the union; unknown word returns zero plus suggestion; subtype+colour+type combine; 100-card coverage note appears.
- S3: summary accepts the same new filters (no new group_by). Acceptance: filtered totals equal search totals.
- S1, S4 unchanged (S4 Tester adds Elf/Equipment/flying checks vs direct counts).

## Changed files
- docs/oracle/contracts/connector-collection-search.md — status, corrected limit 2, section 4 note, new section 12
- docs/oracle/contracts/connector-collection-search.types.ts — subtypes, keywords, keywords_match, row keywords
- supabase/drafts/20261116200000_connector_collection_copies_view.draft.sql — two columns added (DRAFT, not applied)
- docs/oracle/reports/2026-11-16-architect-cc07-subtypes-keywords-amendment.md — this report

## New decisions made (need owner confirmation)
- Keyword search means printed keyword abilities, default "all of these".
- Subtype search matches any listed subtype, whole word.

## Assumptions
- View not yet applied (status.md not checked for a later apply); if applied, use create or replace.

## Challenges to locked decisions
- none (my own earlier finding 3.2 item 2 is corrected)

## Open questions
- Owner: keyword search "all" by default, OK? Subtype "any"?

## Verification
- Read-only SQL on hosted project and local source file — results as cited; no writes, no migration applied, no app code.
