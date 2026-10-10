# Report: t27-loading-solutions
Role: Architect
Status: DONE
Task as received:
> You are the Architect agent. Read AGENTS.md and .paseo/agents/architect.md before anything else.
> Task T-27: Turn your completed source investigation into the three small Collection-loading solutions and a safe measurement proposal, following Assignment C and the common limits in docs/oracle/reports/2026-09-29-orchestrator-dispatch-astra-solutions.md; the runtime baseline remains blocked and no runtime work is authorised.
> Done when: the named loading-solutions contract and new report provide bounded handoffs, correctness/dependency gates and a measurement setup proposal without redoing the broad audit or changing the app; then stop without delegating, committing or deploying.

## Summary for the owner

The three proposals are ready for review: load only the visible Collection view, search after one pause instead of two, and check price freshness once rather than twice. They preserve existing choices and identify where filters and grouped card totals still need separate decisions. The app is unchanged, and real timing checks remain blocked until a separate test copy and capped run are approved.

## Changed files

- `docs/oracle/contracts/collection-loading-solutions.md` - the only new contract; three bounded implementation slices, request/error/cache contracts, acceptance cases, pagination decision gate, frozen T-28 compatibility map and safe measurement proposal.
- `docs/oracle/reports/2026-09-29-architect-t27-loading-solutions.md` - architecture completion, limitations, input provenance and handoff.
- No reference types/examples were added: this scope changes no public payload and the documented state/clock examples suffice for later focused implementation tests. No application/test/schema/configuration files were edited.

## Completion and remaining gates

**Architecture: DONE for Assignment C. Runtime baseline: still BLOCKED, with no new samples or access checks.** The original baseline report is unchanged. No latency improvement is claimed.

| Deliverable | Result |
|---|---|
| Active-view solution | Explicit hydration gate prevents the initial hidden-grid request on saved-list entry. Keeps saved mobile grid, defaults, independent view caches and stale invalidation behaviour. |
| Search solution | Keeps the existing toolbar's single 300ms pause; removes the second page pause and specifies atomic parameter/page resets, clear/typing races and late-response handling. |
| Price-freshness solution | Supplies one observed timestamp to the existing helper, distinguishing explicit null from omitted input. Covers every route branch, 48-hour boundaries and unknown/error metadata. |
| Coupled correctness | Disconnected status filter is G1, not a fast unchanged-result success. Small non-status slices can proceed to scoped review independently; complete filter sign-off cannot. |
| Larger pagination | G2 recommends printing/finish/Original-or-Proxy groups, with separate row/copy totals and explicit exact-copy selection review. It is not an approved response change or SQL/index plan. |
| Assembly compatibility | Maps frozen T-28 identity, locations, errors, freshness, action preconditions and affected-deck references; flags its unresolved retry/error/relation issues without redefining them. |
| Measurement | Proposes isolated target/fixture, named background-write permission, two controlled profiles, 160 measured attempts plus at most four calibration scenarios, per-scenario/run caps and stop rules. No target was created or accessed. |

### Bounded handoff

- **Frontend:** F1 then F2 in the existing Collection page/hooks/toolbar; no new UI. Verify active-only requests, preference hydration, coherent page resets, raw-input/response races, error/retry and cache invalidation with offline fake fetch/timers.
- **Backend:** B1 can proceed independently after implementation approval. Preserve route payloads, logging and unknown/stale behaviour; reduce only the duplicate timestamp read. No migration or price refresh.
- **Architect/UX/Backend:** G1/G2 and the final reviewed T-28 interface remain separate gates. The shared-copy action and both-deck refresh work is not folded into these small changes.
- **Owner/measurement operator:** approve an isolated representative test copy, dedicated identity and finite Collection run, including only named incidental background saves there. Setup/provisioning and measurement each need explicit authority; neither is authorised now.

The contract contains exact proposed test locations/selectors and rollback boundaries. Implementation acceptance of reduced request work is not the same as proving the 2s/0.5s screen goals.

## New decisions made (need owner confirmation)

- None enacted. All implementation mechanics are reviewable architecture proposals.
- **Pagination recommendation:** group matching printing/finish/copy-type copies into one row, with exact copies still available for selection. For example, two nonfoil originals, one foil original, one etched original, one proxy and one alternate printing of Sol Ring represent six copies but five rows. This changes page/count/selection meaning and requires review.
- **Measurement recommendation:** use an isolated test copy rather than the shared-readonly smoke exception, with the proposed profiles, finite caps and explicit permission for conversation/health background saves only in that copy. No approval was inferred from the existing speed goals.

## Assumptions

- The same local application revision `0a74e8e` remains the source subject. It was not matched to a running deployment.
- The original T-28 draft is compatibility input only, not approved final behaviour. Its successor output was not read.
- F1/F2/B1 do not alter ownership, printing/finish meaning, Missing eligibility, deck actions or stored data.
- A small protocol fixture can validate the measurement setup but cannot establish performance at the owner's collection size. Representative counts/profile inputs remain required.

## Challenges to locked decisions

- None. The contract explicitly retains D-003/D-004 identity/finish boundaries, D-028's eligibility gate, D-030's honest states and D-032/D-033 assembly requirements.

## Open questions

- Approve or revise the three scoped implementation handoffs; this architecture dispatch is not permission to implement/release them.
- Decide the larger list page/selection unit before G2; settle Collection filter meanings against reviewed shared rules before G1 acceptance.
- Approve a verified measurement target, dedicated fixture/account, representative sizes, profile and request budget, including background-write handling. Runtime timing remains blocked without them.
- Final T-28 cross-contract acceptance must resolve the frozen draft's unknown/error readiness, unconditional Proxy action, exact retry identity, relation and invalid-quantity gaps before assembly integration. No owner decision was fabricated to unblock that work.

## Verification

- Read `AGENTS.md` and `.paseo/agents/architect.md` first; then Assignment C/common limits, updated decisions/status/roadmap, Plan 3, the unchanged baseline and frozen T-28 contract/types/report.
- `git --no-pager status --short && git --no-pager log -1 --format='%h %s'` - source revision `0a74e8e`; pre-existing planning/frozen-input changes identified and preserved.
- Targeted `view`/`rg`/`glob` inspection - limited to the reused Collection page/toolbar/hooks, price helper/two route entry/branch sites, generated printing metadata type, cache/key definitions, E2E guard documentation and frozen T-28 interface sections. No broad deck/AI/database audit was repeated.
- `rg` caller search for `useCollectionRollup`, `useCollectionPrintings`, `isPriceDataStale`, `getLastRefreshTimestamp` and `CollectionToolbar` - confirmed the Collection integration surface and the three rollup/one printing freshness sites. Existing toolbar test names/accessible selectors were inspected, not executed.
- `shasum -a 256` - frozen input fingerprints recorded before output; retained for final unchanged-input comparison:

```text
67df7fd5f3d12c5ac62048057bc77e3f482ceed3a4fcb5655ce00b4fc531c4c5  docs/oracle/reports/2026-09-29-architect-t27-loading-baseline.md
bc7110d635eadde6f2767603503cb999149926fc53c8a8061b9db7c7305e9d07  docs/oracle/contracts/card-state-actions.md
6d9ea4d8b2110f3d24c2cc52cee8237e2d0abab7050db709f8e379b1fa8022a8  docs/oracle/contracts/card-state-actions.types.ts
da1887581f4667c3c7449701f896a7f761374676111611d72030e0adfa7d7686  docs/oracle/reports/2026-09-29-architect-t28-card-state-actions.md
```

- `python3 - <<'PY' ... PY` documentation-only assertions - PASS: both outputs read back, balanced code fences, 20 unique cited source paths exist, required report/contract sections present, and proposed run arithmetic is 160 measured / 164 maximum scenarios. All four frozen input hashes still match.
- `git --no-pager diff --no-index --check /dev/null <each new output>` - PASS, no whitespace findings; exit 1 is the expected new-file diff. `git --no-pager diff --check` - PASS. Final `git --no-pager status --short` adds only the named contract/report to the initial worktree state; no application changes.
- No executable reference type was introduced, so no typecheck/build/app suite is claimed.
- No secrets/config discovery, authentication, browser/server startup, API/database request, fixture creation, runtime measurement, dependency installation, migration, test change, service creation, delegation, commit, merge or deployment occurred. The earlier measurement evidence was neither refreshed nor represented as current access verification.
