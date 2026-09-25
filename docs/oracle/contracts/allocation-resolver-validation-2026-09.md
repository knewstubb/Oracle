# V2 Allocation Resolver Validation — 2026-09

**Scope:** Read-only validation of the V2 allocation suggestion engine against the flushed database. No writes are performed; no destructive RPCs are called.

**Validator:** Architect agent (T-02)

**Date:** 2026-09-25

## 1. What was validated

### 1.1 Codebase and contracts reviewed

| Artifact | Purpose | Status |
|---|---|---|
| `docs/oracle/decisions.md` | Locked decision register; D-007 governs the resolver | [Confirmed: docs/oracle/decisions.md] |
| `src/types/supabase.ts` | Canonical TypeScript schema | [Confirmed: src/types/supabase.ts] |
| `src/lib/allocation-candidates.ts` | Tiered ranking + read-only candidate fetching | [Confirmed: src/lib/allocation-candidates.ts] |
| `src/lib/supply-pool.ts` | In-memory supply pool + batch assignment RPC wrapper | [Confirmed: src/lib/supply-pool.ts] |
| `src/lib/auto-assign.ts` | Tier 1–2 auto-assignment write path | [Confirmed: src/lib/auto-assign.ts] |
| `src/lib/warm-start-resolve.ts` | Batch import + allocation write path | [Confirmed: src/lib/warm-start-resolve.ts] |
| `src/lib/allocation-candidates.test.ts` | Unit tests for tier/scoring | [Confirmed: src/lib/allocation-candidates.test.ts] |
| `src/app/api/allocation/candidates/route.ts` | Read-only single-card candidate API | [Confirmed: src/app/api/allocation/candidates/route.ts] |
| `src/app/api/decks/[id]/picklist/route.ts` | Read-only deck picklist API | [Confirmed: src/app/api/decks/[id]/picklist/route.ts] |

### 1.2 Expected audit file

The handoff referenced `docs/oracle/contracts/audit-2026-09.md` (especially D-007). That file does **not** exist in this worktree. D-007 was read from the locked decisions register instead. [Confirmed: docs/oracle/contracts/audit-2026-09.md missing; docs/oracle/decisions.md line 14]

## 2. Schema-to-code alignment

### 2.1 Core data model matches D-001 / D-007

- `user_cards` holds one row per card identity for a user (card_name + oracle_id). [Confirmed: src/types/supabase.ts lines 1944–1973]
- `user_copies` holds one row per physical copy; proxies are rows with `is_proxy = true`. [Confirmed: src/types/supabase.ts lines 1974–2076]
- `deck_cards` links a card to a deck and optionally references a physical copy via `copy_id`. [Confirmed: src/types/supabase.ts lines 304–385]
- Finish is an independent string column (`finish`) on `user_copies`, not encoded in `printing_id`. [Confirmed: src/types/supabase.ts line 1980; D-004]

### 2.2 Suggestion engine is read-only

The functions that **only** return suggestions and do not write:

- `fetchEnrichedSupply(cardName, userId)` — two SELECTs (user_cards → user_copies with joins). [Confirmed: src/lib/allocation-candidates.ts lines 78–164]
- `getRankedCandidates(cardName, userId, preferredScryfallId?)` — wraps `fetchEnrichedSupply` + tier/score sort. [Confirmed: src/lib/allocation-candidates.ts lines 375–425]
- `getBatchRankedCandidates(cardNames, userId)` — 2 bulk SELECTs, same tier/score logic. [Confirmed: src/lib/allocation-candidates.ts lines 432–484]
- `loadSupplyPool(userId)` — paginated SELECT of all user_cards + user_copies. [Confirmed: src/lib/supply-pool.ts lines 249–335]
- `SupplyPool.getAvailableCopies(cardName)` — in-memory filter/sort, no DB call. [Confirmed: src/lib/supply-pool.ts lines 80–104]

These conform to D-007: "compute layer is reused as a suggestion engine that proposes allocations without writing them." [Confirmed: docs/oracle/decisions.md line 14]

### 2.3 Write paths are separate and explicitly identified

- `autoAssignDeck` writes via `batchAssignDeck`. [Confirmed: src/lib/auto-assign.ts lines 128–138]
- `resolveDeckBatch` writes via `importDeckTheorycrafted` and `batchAssignDeck`. [Confirmed: src/lib/warm-start-resolve.ts lines 151–196]
- `batchAssignDeck` calls the `batch_assign_deck` RPC. [Confirmed: src/lib/supply-pool.ts lines 351–380]

The read-only APIs (`/api/allocation/candidates`, `/api/decks/[id]/picklist`) do not import these write paths. [Confirmed: src/app/api/allocation/candidates/route.ts, src/app/api/decks/[id]/picklist/route.ts]

## 3. Tier logic and ranking

### 3.1 Tier definitions (current implementation)

| Tier | Meaning | Auto-selectable | Source |
|---|---|---|---|
| 1 | Unallocated original in storage | Yes | [Confirmed: src/lib/allocation-candidates.ts lines 305–306, 317–319] |
| 2 | Unallocated proxy in storage | Yes | [Confirmed: src/lib/allocation-candidates.ts lines 305–306, 317–319] |
| 3 | Already assigned to another deck (all decks claim equally) | No | [Confirmed: src/lib/allocation-candidates.ts lines 322–323] |
| 4 | Removed — treated as Tier 3 | — | [Confirmed: src/lib/allocation-candidates.ts lines 313–315] |
| 5 | No copy exists; print new proxy (synthetic entry) | No | [Confirmed: src/lib/allocation-candidates.ts lines 382–401, 440–459] |

### 3.2 Scoring

`scoreCandidate` awards:
- +2 if `printingId === preferredScryfallId`
- +1 if `finish === 'nonfoil'`
- +1 if `condition === 'near_mint'`

[Confirmed: src/lib/allocation-candidates.ts lines 347–366]

## 4. Mismatches and failures found

### 4.1 Unit tests are stale and fail

`src/lib/allocation-candidates.test.ts` uses property names that do not exist in the implementation:

- `cardDefinitionId` — implementation uses `cardId`. [Confirmed: src/lib/allocation-candidates.test.ts line 11 vs src/lib/allocation-candidates.ts line 31]
- `scryfallPrintingId` — implementation uses `printingId`. [Confirmed: src/lib/allocation-candidates.test.ts line 12 vs src/lib/allocation-candidates.ts line 32]
- `isFoil` — implementation uses `finish`. [Confirmed: src/lib/allocation-candidates.test.ts line 13 vs src/lib/allocation-candidates.ts line 33]
- `storageLocationId` / `storageLocationName` — implementation uses `locationId` / `locationName`. [Confirmed: src/lib/allocation-candidates.test.ts lines 16–17 vs src/lib/allocation-candidates.ts lines 36–37]

Because the helper builds entries with the wrong field names, `scoreCandidate` sees `printingId: undefined` and `finish: undefined`, so:
- Printing matches never score.
- The non-foil bonus never applies.
- Only the `condition === 'near_mint'` bonus can apply.

**Test output:**

```
 FAIL  src/lib/allocation-candidates.test.ts
   classifyTier
     returns 4 for copy assigned to a boxed-status deck
       Expected: 4, Received: 3
   scoreCandidate
     gives +2 for matching scryfall printing
       Expected: 2, Received: 0
     gives +1 for non-foil
       Expected: 1, Received: 0
     scores accumulate: matching + non-foil + near_mint = 4
       Expected: 4, Received: 1
```

[Confirmed: test run output]

### 4.2 Tier 4 test contradicts current tier model

The test still expects `classifyTier` to return `4` for copies assigned to boxed/archived decks. The implementation collapsed Tier 4 into Tier 3 when "all decks started claiming cards equally." [Confirmed: src/lib/allocation-candidates.ts lines 313–324; src/lib/allocation-candidates.test.ts lines 50–72]

The test file needs to be updated to expect Tier 3 for all assigned copies, or the Tier 4 semantic needs to be re-introduced if the owner wants it.

### 4.3 Batch candidate API ignores preferred printing

`getRankedCandidates` accepts `preferredScryfallId` and passes it to `scoreCandidate`. `getBatchRankedCandidates` hard-codes `null` for the preferred printing. [Confirmed: src/lib/allocation-candidates.ts lines 406 vs 464]

This means the deck picklist (`/api/decks/[id]/picklist`) cannot prefer the deck's requested `scryfall_id` when batching candidates. The single-card API (`/api/allocation/candidates`) supports it, but the more common picklist path does not.

### 4.4 Finish nullability vs scoring assumption

The schema allows `user_copies.finish` to be `null`. The implementation maps null to `'nonfoil'` when building `EnrichedSupplyEntry`, so `scoreCandidate` reliably awards the non-foil bonus. This is a sensible default, but it means a deliberately null finish is treated as non-foil. No failure, just a semantic note. [Confirmed: src/types/supabase.ts line 1980; src/lib/allocation-candidates.ts lines 156, 284, 317]

## 5. Real-data validation attempt

### 5.1 Validation script

A read-only validation script was created at `scripts/validate-allocation-resolver.ts`. It:

- Reads all decks for a given user (the `allocate` flag is not consistently set in existing data, so the script does not filter on it).
- Reads all `deck_cards` for those decks, treating generic basic lands as satisfied (matching the picklist semantics in `/api/decks/[id]/picklist`).
- Calls `getBatchRankedCandidates` for unresolved slots.
- Validates sort order, tier semantics, auto-selectable flags, and demand-vs-auto-selectable-supply.
- Performs a single-card spot check with `getRankedCandidates`.
- Outputs a JSON report to stdout.

It does **not** call `allocation_clear_active_decks`, `batch_assign_deck`, or any write RPC. [Confirmed: scripts/validate-allocation-resolver.ts]

### 5.2 Real-data run results

Executed against the flushed database for user `da7ccf96-2c73-431c-9d03-952463f82dcc` (36 decks).

| Metric | Value |
|---|---|
| Decks examined | 36 |
| Unresolved non-land slots | 3,050 |
| Total candidate rows generated | 9,910 |
| Runtime errors | 0 |
| Global validation issues | 0 |

**Top-tier distribution per unresolved slot:**

| Top tier | Slots | Meaning |
|---|---|---|
| 1 | 2,801 | At least one free original in storage |
| 2 | 0 | No free proxies in storage |
| 3 | 1 | Copy currently assigned to another deck |
| 4 | 0 | Tier removed |
| 5 | 248 | No owned/proxy copy exists — print new proxy |

[Confirmed: `/tmp/allocation-validation-report.json` produced by `scripts/validate-allocation-resolver.ts`]

Spot checks:
- **Tier 5 correctness:** `"Agadeem's Awakening // Agadeem, the Undercrypt"` in *Bugface Neverdie* returns a single synthetic Tier 5 candidate. The user has no `user_cards` / `user_copies` rows for that card name or its front face, so Tier 5 is correct. [Confirmed: direct `user_cards`/`user_copies` query]
- **Tier 3 correctness:** `"Power Depot"` in *Arti-facts* returns one Tier 3 candidate. The physical copy (`user_copies.id = 107515`) is assigned to `deck_cards.id = 28547` in deck *mURZAnary tactics*. [Confirmed: direct `user_copies` + `deck_cards` join query]
- **Sort/semantic validation:** No sort-order violations or semantic contradictions (e.g., Tier 3 marked auto-selectable) were detected across all 9,910 candidate rows.

**Demand-vs-supply observations:**
- 249 unresolved slots report demand exceeding auto-selectable supply. All of these are Tier 5 slots where the auto-selectable supply is zero.
- Cross-deck contention is expected if auto-assign were run: e.g., `Sol Ring` is demanded by 28 decks but only 14 free originals exist; `Arcane Signet` by 27 decks with 15 free originals; `Command Tower` by 26 decks with 17 free originals. The suggestion engine correctly surfaces the available free copies per deck; resolving contention is the job of the batch allocator (`warm-start-resolve.ts`), not the suggestion engine.

### 5.3 DFC fallback

The resolver includes a double-faced card fallback: if the full `cardName` containing ` // ` is not found in `user_cards`, it tries the front-face name. [Confirmed: src/lib/allocation-candidates.ts lines 93–104] The real-data Tier 5 case for `"Agadeem's Awakening // Agadeem, the Undercrypt"` confirms this fallback ran and correctly found no copies under either name.

## 6. Open questions

1. **Missing audit file:** `docs/oracle/contracts/audit-2026-09.md` was referenced but does not exist. Should it be created from T-01, or was it renamed?
2. **Stale unit tests:** Should `src/lib/allocation-candidates.test.ts` be updated to match the current `EnrichedSupplyEntry` shape and collapsed Tier 3/4 model?
3. **Picklist preferred printing:** Should `getBatchRankedCandidates` accept and use a map of `cardName → preferredScryfallId` so the picklist can score print-matches, or is the single-card API sufficient?

## 7. Verdict

The V2 allocation suggestion engine is structurally aligned with the schema and D-007: it is read-only, uses `user_cards` + `user_copies` + `deck_cards`, respects finish as an independent attribute, and separates suggestion computation from write paths.

Real-data validation against the flushed database succeeded with zero runtime errors and zero validation contradictions. The engine correctly produces Tier 1 suggestions for free originals, Tier 3 suggestions for copies already assigned to another deck, and Tier 5 synthetic suggestions for missing cards.

The existing unit tests in `src/lib/allocation-candidates.test.ts` are broken (stale `EnrichedSupplyEntry` shape + stale Tier 4 expectation) and need repair. The picklist batch API also does not propagate preferred printing IDs, which is a functional gap but not a validation failure.
