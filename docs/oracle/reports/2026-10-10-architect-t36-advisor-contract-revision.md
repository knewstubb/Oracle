# Report: T-36 advisor contract revision
Role: Architect
Status: DONE
Task as received: Copy docs/oracle/contracts/advisor-tools.md, advisor-tools.types.ts and advisor-tools.examples.ts from /Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t15-advisor-contract-astra/ into this worktree and revise them for D-034 (AI changes apply directly, each undoable with source = ai), D-035 (Scryfall estimate prices) and D-036 (advisor defaults); then reconcile their shared interface with the hardened T-28 contract at /Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t28-contract-hardening-astra/docs/oracle/contracts/card-state-actions.md (read-only; list any changes that T-28 needs in your report rather than editing it). Done when: the revised advisor contract files are in this worktree with no conflict against D-002, D-025–D-039 or the T-28 interface, and your report lists every change and any remaining owner questions.

## Summary for the owner
The AI advisor contract now matches your answers: it can change decks directly, but every change is recorded as `source = ai` and is undoable; buy prices are shown as Scryfall estimates; and it follows your three defaults (keep old upgrade suggestions when refresh fails, ask before adding an infinite-combo package if your preference is unknown, and give fewer explained suggestions instead of padding with generic cards). The contract also imports the shared T-28 card-state availability types so the advisor and the rest of the app speak the same language about copies, locations and the five availability labels.

## Changed files
- `docs/oracle/contracts/advisor-tools.md` — copied from T-15 and revised for D-034 direct apply/undo, D-035 Scryfall estimate prices, D-036 advisor defaults, and T-28 shared availability boundary.
- `docs/oracle/contracts/advisor-tools.types.ts` — copied from T-15 and revised to import T-28 read-only types, add `PlacementSource`, `ActionDescriptor`, `ApplyRequest`/`ApplyResult`, `UndoRequest`/`UndoResult`, and restrict `PriceQuote.provider` to `'scryfall'` with `indicative: true`.
- `docs/oracle/contracts/advisor-tools.examples.ts` — copied from T-15 and revised with 49 offline checks covering direct apply/undo, Scryfall price estimates, D-036 defaults and T-28 availability compatibility.

## Every change from T-15 to T-36
1. **Direct apply (D-034):** removed the read-only recommendation boundary. Suggestions now have `actionability: 'applicable'` and a server-derived `action` descriptor (`sleeve`, `move_from`, `proxy`, `remove`, `move_to_maybeboard`).
2. **`source = 'ai'` (D-034):** every AI placement write uses `PlacementSource = 'ai'`, reusing the existing D-009 `placement_source` column contract.
3. **Undo (D-034):** added `advisor_undo_last_apply` semantics. Undo itself is a manual action (`source = 'manual'`) and reverts the most recent AI operation for that deck/user.
4. **Apply/undo tools:** added `advisor_apply_recommendations` and `advisor_undo_last_apply` to the `AdvisorToolMap`, with `ApplyRequest`/`ApplyResult`/`UndoRequest`/`UndoResult` types carrying `operationId` and `observationToken` to match T-28 atomic action rules.
5. **Scryfall estimate prices (D-035):** `PriceQuote.provider` is now `'scryfall'` only; `indicative` is locked to `true`; a `sourceUpdatedAt` field is added. Removed all Card Kingdom references.
6. **Advisor default (a) — failed Upgrade refresh (D-036):** contract now requires keeping previous Upgrade suggestions and showing "New upgrade analysis is not available yet" instead of clearing the list.
7. **Advisor default (b) — unset combo preference (D-036):** contract requires asking before including an infinite-combo package when `infiniteCombos` preference is unknown; the fixture verifies an unset preference blocks package inclusion.
8. **Advisor default (c) — thin evidence (D-036):** contract requires fewer explained suggestions rather than padding to ten with generic staples; the cap remains ≤10.
9. **T-28 availability boundary:** replaced the custom `AvailabilityRead` supply type with an import of T-28's `AdvisorAvailability` (`ReadState<AdvisorAvailabilityFacts>`). The advisor decorates it with the candidate key but no longer computes supply, readiness, shortage or donor impact.
10. **Re-exported T-28 shared types:** `AdvisorAvailability`, `AdvisorAvailabilityRequest`, `AvailabilityLabel`, `CopyFacts`, `CopyLocation`, `DeckReadiness`, `Finish`, `HolderDeck`, `PrintingRef`, `ReadState`.
11. **Identifier mapping helpers:** added `toT28OracleId`, `fromT28OracleId`, `toT28PrintingId`, `fromT28PrintingId`, `toT28AvailabilityRequest` and `priceKeyFromCopy` to bridge the advisor's wrapper identifiers with T-28's plain strings.
12. **Error codes:** added `apply_failed`, `undo_failed` and `nothing_to_undo` to `AdvisorErrorCode`.
13. **Owner gates:** replaced T-15 O1–O5 with G1–G6, where G1/G2 reflect the new direct-apply/undo choices and G3/G4/G5/G6 lock the D-036/D-035 defaults.
14. **T-28 integration checklist:** expanded to include apply/undo reuse of T-28 RPCs, expected-state checks, operation receipts and `source = 'ai'`.
15. **Examples:** updated from 43 T-15 checks to 49 T-36 checks, adding direct apply/undo, Scryfall price, D-036 default and T-28 stale-read cases.

## New decisions made (need owner confirmation)
- **Undo granularity (G2):** one undo per accepted suggestion (or per batched apply), not per atomic sub-step. This matches what the owner sees but is less granular than a per-sub-step undo.
- **Move-from impact confirmation:** the advisor will show the donor deck's readiness impact before applying a Move from [deck], and only applies it after the owner accepts that impact. This is implied by D-034 but not explicitly locked.

## Assumptions
- T-28's `card-state-actions.types.ts` will be present at `docs/oracle/contracts/card-state-actions.types.ts` when the contracts are merged; the advisor types import from that path.
- The existing `placement_source` column (D-009) is sufficient to tag AI placements; no additional schema change is required for M2.
- AI apply reuses the same RPCs, locks and receipt rules as manual actions (T-28 §7.4); no separate "AI transaction" path is designed.
- Undo of a batched apply reverts the whole batch atomically.

## Challenges to locked decisions
None. All changes are grounded in D-034, D-035, D-036 and existing D-009.

## Open questions
- **Undo granularity (G2):** Do you want one undo per accepted suggestion, or one undo per atomic sub-step (e.g., separate undo for a cross-deck move's source release and destination sleeve)?
- **Move-from confirmation:** When the advisor suggests moving a copy from another deck, should it show the donor deck's readiness drop and require an explicit "yes, move it" before applying, or can it apply with a visible but pre-confirmed impact?
- **Batch apply scope:** Can the owner select multiple suggestions and apply them as one batched operation, or is apply limited to one suggestion at a time?

## T-28 changes expected (read-only; not edited)
The advisor contract reconciles with T-28's read-only availability boundary but expects the following T-28 deltas to support AI apply/undo and price decoration:
1. **Batch availability API:** T-28 currently defines a single-key `AdvisorAvailabilityRequest`. The advisor needs a batch interface returning `(AdvisorAvailabilityRequest, AdvisorAvailability)[]` so it can decorate up to 100 candidate keys in one call. Alternatively, T-28 can expose a single-key function and the advisor wraps it.
2. **Operation receipt source tagging:** T-28 `OperationReceipt` does not yet surface `placementSource`. To support "undo last AI operation", the receipt should record the originating source (`manual`/`ai`/`import`) or expose a query that returns the most recent `source = 'ai'` operation per deck/user.
3. **Apply/undo action naming:** The advisor's `advisor_apply_recommendations` maps to T-28 actions (`sleeve`, `move_from`, `proxy`, `remove`, `move_to_maybeboard`). T-28 may want to add an `advisor` source tag or request-kind field to the receipt so undo can filter AI-initiated operations without inspecting the action name.
4. **Price in availability facts:** T-28 `AdvisorAvailabilityFacts` does not include price. The advisor decorates with its own `PriceQuote` derived from `ref_printings` for M2. T-28 may later choose to own price freshness, but this is not required for M2.
5. **Maybeboard relation representation (T-28 G-M4):** The advisor's `move_to_maybeboard` action remains gated on T-28 resolving durable separate membership for `deck_cards` under D-005/D-018. This is already noted as a T-28 gate, not a new decision.

## Verification
- `node --experimental-strip-types docs/oracle/contracts/advisor-tools.examples.ts` — 49 checks passed.
- Strict `tsc --noEmit` could not be run because TypeScript is not installed in this worktree. The files are written for strict mode and use only type-only imports from the T-28 types file; runtime verification passed under Node's native TypeScript stripper.
- No conflicts identified against D-002, D-025–D-039 or the T-28 read-only interface.
