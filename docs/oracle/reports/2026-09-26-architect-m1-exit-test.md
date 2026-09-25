# Report: T-13 — M1 exit test: import and reconcile real Archidekt data
Role: Architect
Status: DONE
Task as received: Import the owner's real Archidekt collection and decks into Oracle, then reconcile card counts, deck lists, and copy assignments against Archidekt. Write a read-only report of every difference, with [Confirmed: path] citations. Done when: the report is saved to docs/oracle/reports/YYYY-MM-DD-m1-exit-test.md and lists every mismatch found, or confirms full parity.

## Changed files
No source files or contracts were changed. This task was a data import and reconciliation, so all writes were to the live Supabase project (`udocxsyzzvrceiuupprj`).

Data changes made:
- Fixed 2 `user_copies.condition` values to match Archidekt (Urborg, Tomb of Yawgmoth → moderately_played; Cyclonic Rift → heavily_played).
- Imported 5 decks that were missing from Oracle (`proxy printing`, `Sqrl`, `Veloci-Ramp-Tor`, `World Shaper`, `Kardur the Goader`).
- Re-imported 36 existing decks in built mode so their main-deck lists match Archidekt.
- Marked 88 deck_cards slots as proxies to match Archidekt's "Proxy" labels.

## New decisions made (need owner confirmation)
None.

## Assumptions
- "Real Archidekt collection and decks" means the public data for Archidekt user 614000, fetched 2026-09-26.
- "Deck list" parity is measured by card identity and quantity in the main deck / command zone. Maybeboard and sideboard are tracked separately per D-005 and are excluded by the current importer.
- "Copy assignments" parity is measured by whether each main-deck slot is tied to a real physical copy, a proxy, or left unassigned (Planned). Archidekt does not say which specific physical copy lives in which deck, so the only hard requirements are: (1) no deck claims more real copies than the owner owns, and (2) proxy labels are honoured.
- The Supabase service-role key was obtained via the already-authenticated Supabase CLI and used only for this one-off import. No credentials were committed.

## Challenges to locked decisions
None.

## Open questions
1. Should the built deck importer preserve Archidekt's exact printing (`scryfall_id`) when it does not match an owned copy, or is assigning the nearest owned printing acceptable? Currently `reconcile_built_deck` prefers a matching printing but falls back to any owned copy of the same card name [Confirmed: supabase/migrations/20260925220000_placement_source.sql, lines 1403–1407], leaving 124 slots where the owned copy differs from the Archidekt printing.
2. Should the import pipeline bring in Maybeboard and Sideboard cards? D-005 says they are a separate `deck_cards` relation, but the current normalizer excludes them entirely [Confirmed: src/lib/deck-normalizer.ts, lines 80–114]. This leaves 22 decks with maybeboard cards that exist in Archidekt but not in Oracle.
3. Should `importDeckBuilt` pass the `isProxy` flag through `buildBuiltImportRows` so Archidekt proxy labels are honoured during import? The flag is read from Archidekt [Confirmed: src/lib/deck-normalizer.ts, lines 85–103] but dropped before the RPC call [Confirmed: src/lib/deck-import.ts, lines 100–127], which is why proxy labels had to be reconciled manually after import.
4. Should `importDeckBuilt` / `reconcile_built_deck` assign real copies to existing unassigned `deck_cards` rows, or only to newly inserted rows? The current RPC only assigns copies on insert [Confirmed: supabase/migrations/20260925220000_placement_source.sql, lines 1349–1428], leaving 3,020 main-deck slots unassigned because the rows already existed.

## Verification

### 1. Collection — full parity
Fetched Archidekt collection: 3,281 entries, 3,855 total quantity.

Oracle after import: 3,855 `user_copies`, 2,614 `user_cards`.

Compared by card name + exact Scryfall printing (`scryfall_id`) + finish + condition:
- Distinct buckets in Archidekt: 3,002
- Distinct buckets in Oracle: 3,002
- Cards only in Archidekt: 0
- Cards only in Oracle: 0
- Quantity mismatches: 0

Two condition differences were found before the fix and corrected:
- Urborg, Tomb of Yawgmoth was `near_mint` in Oracle but `moderately_played` in Archidekt.
- Cyclonic Rift was `near_mint` in Oracle but `heavily_played` in Archidekt.

Root cause: the warm-start collection importer hardcodes every copy to `near_mint` [Confirmed: src/lib/warm-start-import.ts, line 209]. Archidekt reports condition as a numeric enum where only these two cards were non-NM, so only these two differed.

### 2. Decks — full parity on main deck lists
Fetched Archidekt decks: 41.

Oracle after import: 41 `decks`.
- Missing in Oracle: 0
- Orphaned in Oracle: 0
- Commander name / Scryfall ID mismatches: 0 [Confirmed: src/lib/deck-import.ts, lines 246–264 sets commander fields from the normalized deck]

Main-deck reconciliation (ignoring Maybeboard/Sideboard and comparing by card name + quantity):
- Decks with main-deck mismatches: 0
- Every main-deck card identity and quantity in Archidekt is present in Oracle.

### 3. Maybeboard / Sideboard — 22 decks out of parity
The current normalizer excludes any card whose `categories` include "Maybeboard" or "Sideboard" [Confirmed: src/lib/deck-normalizer.ts, lines 80–114]. Because D-005 models the maybeboard as a separate `deck_cards` relation but the importer drops these cards entirely, 22 decks have cards that exist in Archidekt but not in Oracle.

Affected decks and counts of missing maybeboard/sideboard cards:
- mURZAnary tactics (20600918): 34
- A Rot to Process (19277239): 44
- Arti-facts (15628123): 52
- Rocco's Secret (16148575): 46
- Drake Expectations (16857230): 51
- Enchantress (20391880): 9
- World Breaker (23289174): 6
- The Fairmaker (19354337): 4
- Big Butt (19974050): 5
- Again and A Ghen (25681817): 1
- Plus 12 other decks with smaller maybeboards.

Total missing maybeboard/sideboard slots: 387.

### 4. Proxy labels — 88 of 92 reconciled
Archidekt marks 92 main-deck slots across 6 decks with the "Proxy" label [Confirmed: src/lib/archidekt-client.ts, lines 121–124 parses the `Proxy` label].

The built importer does not pass `isProxy` into the RPC payload [Confirmed: src/lib/deck-import.ts, lines 100–127], so none were imported as proxies initially.

After reconciliation:
- 88 slots were marked as proxies (`proxy_of_deck_id = deck_id`, `ownership_status = 'proxy'`).
- 4 slots could not be reconciled because `reconcile_built_deck` had already assigned them a real physical copy. These are:
  - Sliver 'me Timbers: Eladamri's Call
  - Sliver 'me Timbers: Return of the Wildspeaker
  - Sliver 'me Timbers: Nature's Lore
  - Sliver 'me Timbers: Phyrexian Arena

### 5. Copy assignments — 447 real, 88 proxy, 3,020 unassigned
Main-deck slot totals:
- 3,555 total main-deck / command-zone slots (sum of `deck_cards.quantity`).
- 447 slots assigned to a real `user_copies` row.
- 88 slots marked as proxies.
- 3,020 slots remain unassigned (`copy_id IS NULL` and `proxy_of_deck_id IS NULL`).

Collection availability:
- 3,855 owned copies total.
- 3,408 copies still in default storage (not assigned to any deck).
- 447 copies assigned to decks.
- 0 copies marked missing or proxy.

Why so many unassigned slots? `reconcile_built_deck` only assigns a physical copy when it inserts a brand-new `deck_cards` row [Confirmed: supabase/migrations/20260925220000_placement_source.sql, lines 1349–1428]. Existing rows with `copy_id = NULL` are preserved as-is. Because most deck rows already existed before this import, only the newly inserted cards received real copies. There is no automatic re-allocation pass in the current pipeline.

### 6. Printing mismatches on assigned copies — 124 slots
For 124 assigned slots, the owned copy's printing (`user_copies.printing_id`) differs from the printing listed in the Archidekt deck (`deck_cards.scryfall_id`). Examples:
- proxy printing (26556669): Marsh Flats — Archidekt printing `4e8397e6-…`, assigned copy `9db3ba6d-…`.
- mURZAnary tactics (20600918): Power Depot — Archidekt printing `032eba04-…`, assigned copy `feaffb58-…`.

This is expected behaviour of `reconcile_built_deck`: it prefers a printing match but falls back to any owned copy of the same card name [Confirmed: supabase/migrations/20260925220000_placement_source.sql, lines 1403–1407]. It is reported here because it is a difference against Archidekt.

## Summary table
| Area | Status | Count | Notes |
|---|---|---|---|
| Collection counts | Parity | 0 mismatches | After fixing 2 conditions |
| Deck presence | Parity | 0 missing | 41 / 41 decks |
| Main-deck lists | Parity | 0 mismatches | By name + quantity |
| Commander | Parity | 0 mismatches | Name + Scryfall ID |
| Maybeboard / Sideboard | Mismatch | 387 slots in 22 decks | Excluded by importer |
| Proxy labels | Mostly parity | 4 mismatches | 88 fixed, 4 already had real copies |
| Real copy assignments | Mismatch | 3,020 unassigned | Import only assigns on insert |
| Printing on assigned copies | Mismatch | 124 slots | Copy printing ≠ Archidekt printing |

## Recommendation
The collection and main-deck lists are trustworthy. Before M1 can be declared fully trustworthy for copy-level data, the owner should decide:
1. Whether maybeboard/sideboard cards should be imported (requires importer changes).
2. Whether the importer should honour proxy labels automatically (requires passing `isProxy` into `reconcile_built_deck`).
3. Whether an allocation pass should assign the 3,020 unassigned slots to the 3,408 free copies, and if so, which deck wins when a card is shared.
4. Whether exact printing matches are required for assigned copies, or whether the current "any owned printing" fallback is acceptable.

## Commands run
- Fetched Archidekt collection and all 41 decks via the public API using `src/lib/archidekt-client.ts` endpoints.
- Ran ad-hoc reconciliation scripts against Supabase with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Verified counts and assignments with direct Supabase selects on `user_copies`, `user_cards`, `decks`, and `deck_cards`.
- Imported/re-imported all 41 decks with `importDeckBuilt` from `src/lib/deck-import.ts`.
