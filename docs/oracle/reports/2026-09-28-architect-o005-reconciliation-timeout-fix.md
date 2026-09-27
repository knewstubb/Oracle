# Report: O-005 reconciliation timeout — performance correction
Role: Architect
Status: DONE (draft corrected and validated locally; not deployed)
Task as received: Task O-005 performance correction: diagnose and correct the live timeout in get_import_reconciliation using the confirmed evidence in docs/oracle/reports/2026-09-28-orchestrator-reconciliation-timeout.md and the deployed/draft migrations. The live user has 1,744 unsettled claims; both the all-claims RPC and latest batch 26fd945c-ce3f-465f-8740-e3e707c4b041 return PostgreSQL 57014 statement_timeout, while remote migration history lacks local draft 20260927120000. Preserve the approved slot-state and post-finalize badge rules, and do not deploy or alter live data.

## Summary for the owner
The reconciliation screen timed out because of how the database looked up card details (set, collector number, image). For every card row with another printing to offer, the query read the whole 115,000-printing catalogue from start to finish. At your collection size that happened about 400–480 times in a single page load.

I changed the query so it looks up each printing once, directly, the way you'd use an index at the back of a book. On a test copy built to match your live data sizes, the screen's data now loads in about 0.1 seconds instead of about 9 seconds. The output is identical, character for character.

The same slow lookup also existed in "Allocate Cards" for unowned cards being proxied, where it would have taken about 4 seconds. That's fixed the same way. None of the approved slot states or badge rules changed. Nothing has been deployed, and no live data was touched.

## Diagnosis — the expensive query shape

[Confirmed: supabase/migrations/20260926140000_import_reconciliation_redesign.sql §3; tests/db-perf/fixtures/20260927120000.draft-before-perf-fix.sql §1]

Both the deployed function and the earlier draft build each row's `alternatePrintings` with a correlated subquery, which runs once per row:

```sql
FROM printing_supply a
LEFT JOIN public.ref_printings arp ON arp.scryfall_id::text = a.printing_id
WHERE a.card_name = rf.card_name AND a.printing_id <> rf.imported_printing_id
```

`ref_printings.scryfall_id` is a `uuid` primary key (live index `scryfall_printings_pkey`). Because of the `::text` cast on the indexed column, Postgres can't use that index. Each run of the subquery therefore does a full sequential scan of `ref_printings`: 115,115 rows, 106 MB on live according to `supabase inspect db table-stats`. The `instances` subquery is also correlated and rescans every in-scope instance per row, but that is a secondary cost.

EXPLAIN ANALYZE of the function body, on a local dataset sized to live (1,744 unsettled claims, 115,115 printings, 3,855 copies, 3,812 slots, 39 decks, about 1,450 rows):

| Variant | ref_printings access | Body execution | RPC wall time |
|---|---|---|---|
| Deployed 20260926140000 | `Seq Scan on ref_printings arp … rows=115115 loops=407` | 14,852 ms | 7.2–9.8 s |
| Draft before fix | `Seq Scan on ref_printings arp … rows=115115 loops=479` | 17,238 ms | 8.5–9.7 s |
| Draft after fix | `Index Scan using ref_printings_pkey … rows=1 loops=2011` | 110 ms | 91–106 ms |

That is about 47–55 million catalogue rows read per page load before the fix. Live cancels at about 8.5 s (57014), which matches these numbers. Batch scope doesn't help, because all 1,744 claims belong to the latest batch.

`finalize_import_claims` has a second instance of the same pattern: `WHERE rp.scryfall_id::text = btrim(v_claim.printing_id) LIMIT 1`, run once per unowned card being proxied. In the test it took 3,907 ms before the fix and 130 ms after, with 88 such lookups.

`get_deck_conflict_counts` has no catalogue lookups or per-row subqueries. It measured 15–16 ms and was not changed.

## Changed files
- `supabase/migrations/20260927120000_import_reconciliation_slot_states.sql` — still DRAFT and not applied. I corrected this draft in place, because it has not been deployed and it already replaces the timing-out function. The changes:
  - `get_import_reconciliation`: a new `printing_ref` CTE resolves each displayed printing once, with a primary-key probe. The text is cast to uuid only when it is a canonical lowercase uuid, and the original `scryfall_id::text = printing_id` equality is kept as a recheck, so the set of matches is exactly the old one. `instances` and `alternatePrintings` are now pre-aggregated with GROUP BY and joined, instead of correlated per row. `row_keys` is folded into `row_progress`.
  - `finalize_import_claims`: the proxy branch uses the same primary-key probe.
  - Header item 6 documents the fix.
  - No signature, grant, table, index or row changes.
- `tests/db-perf/reconciliation-perf.mjs` — the reproducible harness (in-process PGlite; never connects to a remote database).
- `tests/db-perf/fixtures/20260927120000.draft-before-perf-fix.sql` — a verbatim pre-fix copy of the draft, used as the semantic reference. Marked never-apply.
- `docs/oracle/reports/2026-09-28-architect-o005-reconciliation-timeout-fix.md` — this report.

## New decisions made (need owner confirmation)
- I corrected the undeployed draft in place rather than adding a second forward migration. When the draft is deployed, it delivers both the O-005 slot states and the timeout fix. The deployed function stays slow until then.

## Assumptions
- Live row distributions resemble the synthetic ones. The volumes are live figures; the mix of printings, ownership and resolutions is synthetic.
- Live `ref_printings.scryfall_id` values are lowercase canonical uuids, the Postgres `uuid::text` form. Other strings behave exactly as before because of the recheck, and the harness covers uppercase, whitespace-padded and non-uuid ids.

## Challenges to locked decisions
- None.

## Open questions
- None blocking.

## Verification
- `supabase inspect db table-stats` / `index-stats` (read-only, live) — `ref_printings` has 115,115 rows (106 MB) and a uuid PK index `scryfall_printings_pkey`; `import_sleeve_claims` has 1,744 rows.
- Full harness run with all three variants (earlier run, same dataset before the edge-case rows were added): the deployed and pre-fix plans show `Seq Scan on ref_printings arp loops=407` / `loops=479`, and the fixed plan shows an index scan. Timings are in the table above.
- Final run: `PGLITE_MODULE=/tmp/oracle-pglite/node_modules/@electric-sql/pglite/dist/index.js SKIP_SLOW=1 node tests/db-perf/reconciliation-perf.mjs` gave RESULT: PASS (exit 0):
  - `get_import_reconciliation` output IDENTICAL to the pre-fix draft for all four combinations: all-claims and batch scope, `p_include_resolved` true and false. Payloads are about 1.4–2.0 MB of JSON.
  - `get_deck_conflict_counts` output IDENTICAL.
  - `finalize_import_claims` return value and resulting deck_cards / user_copies / user_cards / claims state IDENTICAL (state hash `43f5577719485d9eb0e5decb72e94e6f` for both).
- Nothing deployed. No live writes. Remote migration history not touched.

## What remains before deployment
1. Owner approval of the draft `20260927120000`, covering the O-005 slot states plus this performance fix.
2. Run the harness once more on the reviewer's machine, using the command above. It takes about 1 minute; drop `SKIP_SLOW=1` to see the deployed plan too, about 2 minutes.
3. Backend/Orchestrator deploy the migration with `supabase db push`. No data migration is involved, and rollback means re-applying §3/§9/§10 of `20260926140000`.
4. After deployment, repeat the Orchestrator's read-only live checks: the all-claims RPC and batch `26fd945c-ce3f-465f-8740-e3e707c4b041` should both return in well under the ~8 s timeout. This is the only confirmation on real data.
5. The Frontend load-error patch in `evil-tiger` (it stops the false "all reconciled" state) still needs its own review, separate from this fix.
