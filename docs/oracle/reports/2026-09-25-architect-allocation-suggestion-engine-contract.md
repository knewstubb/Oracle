# Report: allocation-suggestion-engine-contract
Role: Architect
Status: DONE
Task as received: Task T-03: Write the contract for the allocation suggestion engine that reuses the V2 resolver compute layer without writing allocations. Use docs/oracle/contracts/allocation-resolver-validation-2026-09.md and docs/oracle/decisions.md D-007 as inputs. Output: docs/oracle/contracts/allocation-suggestion-engine.md and docs/oracle/contracts/allocation-suggestion-engine.types.ts. Done when: the contract defines the read-only API, request/response types, error shapes, and which functions or RPCs are allowed, with Confirmed path citations, plus a report per AGENTS.md.

## Changed files
- `docs/oracle/contracts/allocation-suggestion-engine.md` — Human-readable contract defining the read-only allocation suggestion engine API, request/response shapes, error shapes, allowed compute functions/RPCs, forbidden operations, tier semantics, scoring rules, and multi-user constraints.
- `docs/oracle/contracts/allocation-suggestion-engine.types.ts` — TypeScript contract types for the suggestion engine API and allowed compute-layer signatures.

## New decisions made (need owner confirmation)
- **Batch endpoint method and path**: I specified `POST /api/allocation/candidates/batch` because large card-name lists exceed practical query-string limits. The existing single-card endpoint is `GET /api/allocation/candidates`.
- **Batch request `preferredScryfallByName` field**: I added an optional per-name preferred `scryfall_id` map so the batch endpoint can preserve printing preferences; the current `getBatchRankedCandidates` helper hard-codes `null` for preferred printing.
- **Error code enum**: I introduced stable `code` values (`MISSING_PARAMETER`, `INVALID_BODY`, `EMPTY_BATCH`, `INTERNAL_ERROR`) in the TypeScript contract. Existing routes return plain `error` strings today.

## Assumptions
- The V2 resolver compute layer is `src/lib/allocation-candidates.ts`. It is explicitly described as read-only and reuses `computeAllocationV2`'s scoring logic internally.
- The suggested API surface should layer on top of the existing `GET /api/allocation/candidates` route and add a new batch route, rather than replacing existing allocation write paths.
- The contract file at `docs/oracle/contracts/allocation-resolver-validation-2026-09.md` could not be read because it does not exist in the repo; I treated the actual implementation and D-007 as the source of truth.

## Challenges to locked decisions
- None. The contract strictly builds on D-007 (retire destructive resolver, reuse compute as suggestion engine) and does not reopen any locked decision.

## Open questions
- Should the batch endpoint also accept `oracle_id` lookups in addition to card names? The current compute layer resolves by `card_name` only.
- Should the existing `GET /api/allocation/candidates` route adopt the stable `code` field from the new contract, or remain plain-string errors for backward compatibility?
- The referenced input document `docs/oracle/contracts/allocation-resolver-validation-2026-09.md` was missing. Does it exist elsewhere under a different name, and should this contract be reconciled against it once located?

## Verification
- Reviewed existing V2 compute layer: `src/lib/allocation-candidates.ts` exposes `getRankedCandidates`, `getBatchRankedCandidates`, `fetchEnrichedSupply`, `fetchBatchEnrichedSupply`, `classifyTier`, and `scoreCandidate`, all read-only.
- Reviewed existing API route: `src/app/api/allocation/candidates/route.ts` implements the single-card endpoint and already returns `{ candidates: RankedCandidate[] }`.
- Reviewed schema types: `src/types/supabase.ts` confirms `user_copies.printing_id` is a `scryfall_id`, `user_cards.oracle_id` is the canonical id, and `deck_cards.copy_id` is the assignment FK.
- Attempted to run `npm run test -- src/lib/allocation-candidates.test.ts` and `npx vitest --run src/lib/allocation-candidates.test.ts`; both failed because `node_modules` is not installed in this worktree. Type-check and test verification are therefore pending environment setup.
- Noted but did not fix: `src/lib/allocation-candidates.test.ts` references field names that do not match the current implementation (`cardDefinitionId`, `scryfallPrintingId`, `isFoil`, `storageLocationId`, `storageLocationName`). This is a pre-existing mismatch outside the scope of the contract task and should be addressed under T-01 (schema/code audit) or T-02 (V2 resolver validation).
