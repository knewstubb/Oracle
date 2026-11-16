# Developer report: CC-07 filterable collection search

Status: PARTIAL (S0–S3 built, tested, pushed; S4 and the signed-in live check remain for the Tester)

## What was done
- **S0 view applied.** Project `udocxsyzzvrceiuupprj`, migration `connector_collection_copies_view`, the amended draft only (no blanket push, additive, nothing dropped). Moved to `supabase/migrations/20261116200000_connector_collection_copies_view.sql`; rollback stays in drafts. Admin-SQL checks: 4,550 copies; 69 Elf cards; 213 flying cards; 100 cards with no facts; 392 mono-green creature copies; 2,770 free copies; anon cannot read; signed-in role can; security_invoker on.
- **S1** (53898be): search reads the view, exact `total` and `totalCopies`, no scan cap, true `only_free` (excludes In your hand and Missing).
- **S2** (d549494): filters for types, colours (+match mode, colourless included), subtypes, keywords, roles, mana value, location, proxies, rules text. Coverage and unknown-word notes with suggestions. Roles use the shared classifier (no duplicated rules), ceiling 5,000 names. Defaults as approved: roles any, keywords all, creature types any.
- **S3** (281c19d): `get_collection_summary` with filters and `group_by` (type, colour, location, kind, role). No input gives the old answer. Max 60 groups, role groups overlap and the answer says so.

## Verification
- Connector tests: 232 passed, 4 skipped (live MCP). eslint clean on the connector. tsc: no connector errors; remaining errors are pre-existing (AddToPicklist.test.tsx).
- Live read-only: the role step's worst case (all owned names read from the card library, run as admin SQL) took about 1.9 s, well under the 8 s limit. No stop needed.

## Deviations / notes
- Role search does an extra page-level library read to show roles on rows.
- The grouped summary type has no coverage field, so coverage text is in `note`.
- Filters without `group_by` group by type.
- 100 owned cards have no card facts: data task for Gene.
- The slice A contract's search line is not yet marked superseded (Scribe).

## Remaining for the Tester (S4)
- Signed-in connector run as the owner (no sign-in token was available; no workaround attempted): confirm only the owner's rows come back, and a real role search is timed end to end.
- Run the contract's acceptance scenarios (section 13.7).
- Not touched: CC-08, categories.
