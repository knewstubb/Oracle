# Report: dispatch-first-implementation
Role: Orchestrator
Status: DONE
Task as received: Delegate work to implement

## Summary for the owner

Three implementation agents have been launched to address unnecessary Collection loading, search waiting twice, duplicate price checks, and an AI streaming error that can duplicate tool-call arguments. These are focused fixes using the existing screens and data meanings. The wider advisor and pick-list changes still need their remaining choices/designs reviewed; nothing will be merged or deployed by this dispatch.

DONE means this delegation was executed, not that implementation has finished or passed review.

## Scope accepted for implementation

The owner explicitly requested implementation delegation after the architecture returns. This authorises the ready technical slices below, not every unapproved product proposal.

- T-27 F1/F2/B1: the coordinator read the solution contract, relevant preservation/failure rules and acceptance examples. These sections need no new public API, visual design, data transition or T-28 policy.
- T-34: the coordinator confirmed native first-chunk arguments are assigned at call initialisation and then appended again in `src/lib/adapters/deepseek-adapter.ts`. The scoped fix implements only correct native argument assembly; it does not accept the entire proposed S3 terminal protocol or change what actions the AI is allowed to take.
- T-15/T-28 as whole contracts remain REVIEW. Their reported reference checks are not claimed as coordinator reruns or implementation approval.
- Current source baseline is `0a74e8e`; source equality with a hosted deployment is not established.

[Confirmed: docs/oracle/status.md; src/lib/adapters/deepseek-adapter.ts; returned collection-loading-solutions.md and advisor-tools.md in their named worktrees]

## Common implementation instructions

Read `AGENTS.md`, your role file, current decisions and this complete brief before coding. Preserve copied uncommitted inputs. Only edit your own allowed production/test/report files; do not edit shared contracts or a sibling's worktree.

Implement and verify the actual scoped behaviour, not a skeleton or proposal. Reuse existing components, hooks, helpers, API envelopes and logging. No new abstraction/framework, loose type casts, silent catches, success-shaped failure, unrelated cleanup or speculative performance claims.

### Safety and approval limits

- No migration/schema/SQL changes, stored-data operations, production requests, authentication/credential reads, model calls, paid services or new providers.
- No app server, E2E/browser measurement, fixture seeding or background services. All tests use synthetic data, mocked fetch/auth/database/provider boundaries and no real network. Read the relevant test setup before selecting suites.
- No `.env` or authentication-file copying. Do not invent live credentials or enable an isolation flag to get tests running.
- No commits, merges, pushes, deployments, child delegation or automatic subsequent work.
- No changes to decisions/status/roadmap, role files, dependency manifests/lockfiles, test configuration or shared architecture inputs.
- Stop and report the precise gap if a contract mismatch requires new UI/API/product/schema decisions. Continue unaffected in-scope work rather than guess.
- Restore dependencies only after a chosen validation command fails for a missing package/tool. Prefer the existing lockfile (`npm ci`) in the isolated worktree then; do not change packages or weaken checks.

### Required verification and handoff

- Add focused tests for the exact measurable request/count/fragment invariants and the relevant failure/race cases. Preserve correct existing behaviour; existing tests may have stale expectations, but only change them with source/contract evidence, never merely to pass.
- Use the smallest combined targeted runner selection. Run targeted ESLint over changed production/test files. There is no `typecheck` npm script: use `npx tsc --noEmit` after tooling is available.
- Full project typechecking had pre-existing failures. Record complete failure output in the session workspace and separate unchanged baseline errors from new ones using the baseline revision or untouched source; do not fix unrelated failures or call a Next build proof of type safety.
- Backend endpoint examples must be actual mocked-handler results with deterministic auth/database fixtures, not unauthorised live HTTP calls.
- Record commands/results, exact changed files, each acceptance case, blockers and compatibility/rollback notes in the required role report. Do not claim the real 2s/0.5s loading targets were measured.
- End with a bounded diff/report ready for coordinator review, then stop. Implementation DONE is not merge/deploy permission.

## T-32: Frontend Collection F1/F2

### Inputs

- `docs/oracle/contracts/collection-loading-solutions.md`: sections 1-5, 7, 11; F1/F2 only.
- `docs/oracle/reports/2026-09-29-architect-t27-loading-solutions.md`.
- Existing Collection page, toolbar, hooks and tests; Plan 3.

This is a nonvisual optimisation/fix of the existing UI under explicit owner instruction, not permission to invent a component design. Reuse its skeletons, error/retry content, controls, tokens and responsive behaviour; no new mockup is needed for preserving them.

### Owned implementation

- `src/app/collection/page.tsx`
- `src/hooks/useCollectionRollup.ts`
- `src/hooks/useCollectionPrintings.ts` only if necessary for the existing enabling/query behaviour
- `src/components/collection/CollectionToolbar.tsx`
- Directly related colocated page/hook/toolbar test files
- `docs/oracle/reports/2026-09-29-frontend-t32-collection-loading.md`

Do not edit API routes, price-store, provider adapters, shared query/provider configuration, UI specs or database code.

### Acceptance

1. Resolve persisted/mobile view before enabling either dataset. Saved list must never start a hidden initial rollup request; saved grid still wins on mobile. Preserve absent/invalid preference defaults from the contract.
2. Both hooks remain unconditional; enable exactly the active dataset after view resolution. Additive rollup enable defaults preserve other callers. Disabled data is not a zero-owned/empty-success result.
3. Hidden query invalidation does not trigger hidden requests; returning to stale data revalidates. Preserve independent view caches, existing freshness and page/sort state.
4. Retain one toolbar 300ms search pause; remove the second page pause. Commit search/filter/sort parameters and their correct page resets together, with no new-filter/old-page request.
5. Test rapid input/clear, stale prop synchronisation, unmount, filter while typing, switching views, reversed responses and explicit failure/retry. Use real QueryClient with mocked fetch and fake timers, not only mocked hooks/callback counts.
6. Show the active response's rows/totals/loading/error state. Keep the value banner independent. Do not invent complete proxy/original totals from a page or redesign the banner.
7. Status filtering (G1), grouped pagination (G2), retired Missing behaviour and unsupported sorts are out of scope. Document these pre-existing limits explicitly; unchanged status-filter results are not a passed filter journey.

Focused starting command:
`npm test -- src/components/collection/CollectionToolbar.test.tsx src/app/collection/page.test.tsx`
Add your directly relevant hook tests to that same runner if used.

## T-33: Backend price freshness B1

### Inputs

- `docs/oracle/contracts/collection-loading-solutions.md`: sections 1-3, 6-7, 11; B1 only.
- `docs/oracle/reports/2026-09-29-architect-t27-loading-solutions.md`.
- Existing price helper, both Collection routes and their direct tests.

### Owned implementation

- `src/lib/price-store.ts`
- `src/app/api/collection/rollup/route.ts`
- `src/app/api/collection/printings/route.ts`
- Direct colocated helper/route tests
- `docs/oracle/reports/2026-09-29-backend-t33-price-freshness.md`

Do not edit hooks, Collection components/page, other APIs, provider code, types/schema/migrations or broad pagination logic.

### Acceptance

1. Add the optional observed timestamp argument to existing async `isPriceDataStale`; omitted/undefined still performs one lookup. Explicit timestamp or null performs zero lookups.
2. Each reached route freshness branch obtains exactly one timestamp and derives both metadata fields from it. Cover all three rollup sites and every printings return path; normal rollup copies/timestamp work remains parallel.
3. Keep the strict greater-than-48-hours threshold, valid future-timestamp semantics, valid payloads, user scope, card-data errors, and metadata null/logging behaviour. Malformed runtime timestamp logs a value-free diagnostic and becomes unknown/stale, not apparently fresh.
4. Mock auth/database boundaries, freeze the clock and assert actual timestamp-query counts: explicit null does not refetch, omitted value does once, metadata failure logs once and returns null/stale, failures before the freshness stage start no metadata work.
5. No price fetch/refresh, cache-duration change, extra endpoint, broad query refactor or data writes.

Focused starting command:
`npm test -- src/lib/price-store.test.ts src/app/api/collection/rollup/route.test.ts src/app/api/collection/printings/route.test.ts`

## T-34: Backend native streamed argument assembly

### Inputs

- `docs/oracle/contracts/advisor-tools.md`: section 2 adapter finding and S3's native-fragment accumulation invariant only.
- `docs/oracle/reports/2026-09-29-architect-t15-advisor-solutions.md`.
- `src/lib/adapters/deepseek-adapter.ts`, `src/lib/provider-adapter.ts` and existing adapter test patterns.

### Owned implementation

- `src/lib/adapters/deepseek-adapter.ts`
- A directly colocated adapter test, e.g. `src/lib/adapters/deepseek-adapter.test.ts`
- `docs/oracle/reports/2026-09-29-backend-t34-native-stream-arguments.md`

`provider-adapter.ts` is read-only for this task. Do not change tool executor/registry, sidebar/context, API routes, provider/model selection, schema or dependency files.

### Precise bug and acceptance

The first native tool delta can include ID, function name **and a nonempty arguments fragment**. Current code seeds the accumulator with that fragment, then the append block adds it a second time. The resulting invalid JSON can cause an otherwise valid call to be dropped.

1. Implement the smallest correct native accumulation fix: each provider arguments delta is appended exactly once, preserving stable provider indices/IDs and interleaved calls. Header-only first deltas and later fragments retain existing valid behaviour.
2. Exercise the real adapter against a fully mocked OpenAI SDK async iterable: complete JSON in the first delta; a partial first fragment plus subsequent pieces; header-only then arguments; two interleaved calls; empty-argument object; mixed normal text plus calls.
3. Assert the resulting parsed arguments are exactly the supplied object, calls are neither duplicated nor dropped, each supplied fragment is emitted once, and start/end/done event relationships are preserved. Verify valid non-streaming normalisation is unchanged.
4. Add a failing regression before the fix and demonstrate it passes afterward. No live provider request, key, paid model or app tool dispatch.
5. Do not expand this into DSML handling, a new terminal-error protocol or the read-only advisor rollout. Existing malformed-response handling, full S3 error propagation, S1/S2 owner choices and T-28 integration remain separate gates. Clearly label this as **one native streaming defect fixed**, not "AI safeguards complete".
6. If correct valid-fragment support reveals a protocol ambiguity requiring broader design, report the exact case rather than inventing new API/UI behaviour.

Focused starting command:
`npm test -- src/lib/adapters/deepseek-adapter.test.ts`
Reuse an existing relevant provider suite if discovered and safe/offline.

## Workspaces and launch records

All worktrees are isolated from `refs/heads/main` at `0a74e8e`:

- T-32: agent `e84c067c-1ae6-4841-a325-9a954294378f`, `wks_24324760a7b010c1`, `/Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t32-collection-client`, branch `task/t32-collection-client-20260929`.
- T-33: agent `dd416894-ced2-4498-a71e-365b343f194f`, `wks_653c84edff0aecf6`, `/Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t33-price-freshness`, branch `task/t33-price-freshness-20260929`.
- T-34: agent `348a4ff4-a18c-4693-a5fe-9867fb16c955`, `wks_aad140aa82a969d0`, `/Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t34-native-stream-fragments`, branch `task/t34-native-stream-fragments-20260929`.

All three `paseo run -d --provider copilot` calls returned actual agent IDs, `running` status and their intended worktrees. Source and documentation inputs were prepared before launch; 326 documentation copies were byte-verified. The session-only input manifest is `files/implementation-input-manifest.json`, with exact extracted three-line prompts `files/implementation-t32-prompt.txt`, `implementation-t33-prompt.txt` and `implementation-t34-prompt.txt`.

The available CLI has no named-profile discovery. Launches used the current Copilot provider and its defaults, without copying the previous Architect model/reasoning overrides. Inspection resolved all three to `claude-sonnet-5`, `medium` reasoning, normal Agent mode, `running`, and parent `c3f14e05-5dae-4530-a342-5ff1dec17019`. Each task has one role and disjoint production ownership; there is no concurrent edit of one file.

Initial scoped role/brief documentation requests were individually approved after inspecting each agent's logs. T-32 request IDs: `f029fa5e-1530-47f0-89d7-1d54e2f77a47`, `bdd64df1-5feb-4488-8dfe-ddd5cda9a98d`; T-33: `54674048-55ed-4af6-ab2b-33e2bd00786b`, `471f8908-d9a1-43af-a371-9d96e89f6b05`; T-34: `9305dfa4-b15a-4130-ad1a-20857052a4a5`, `501b3b6d-142b-42c1-9c54-c3f2c0ea34e8`. No blanket permission, live-data permission or Allow All mode was granted.

### Three-line handoffs

T-32:

```text
You are the Frontend agent. Read AGENTS.md and .paseo/agents/frontend.md before anything else.
Task T-32: Implement the accepted Collection F1/F2 active-view and single-pause search fixes using the scope, preserved UI, exact owned files and verification in docs/oracle/reports/2026-09-29-orchestrator-dispatch-first-implementation.md and the frozen collection-loading-solutions contract.
Done when: the scoped implementation and focused offline regressions are complete, changed files pass appropriate checks or clearly document unchanged baseline blockers, and the named completion report exists; stop without new UI/schema decisions, delegation, commit, merge or deployment.
```

T-33:

```text
You are the Backend agent. Read AGENTS.md and .paseo/agents/backend.md before anything else.
Task T-33: Implement the accepted Collection B1 single-price-freshness-read solution using the scope, exact owned files and verification in docs/oracle/reports/2026-09-29-orchestrator-dispatch-first-implementation.md and the frozen collection-loading-solutions contract.
Done when: helper and all handler branches meet the lookup-count, clock, null/error and unchanged-payload tests and the named completion report records actual results; stop without live data/runtime calls, unrelated code, delegation, commit, merge or deployment.
```

T-34:

```text
You are the Backend agent. Read AGENTS.md and .paseo/agents/backend.md before anything else.
Task T-34: Fix only native streamed tool-call argument duplication and its valid-fragment cases in the DeepSeek adapter, following the exact scope, owned files and offline verification in docs/oracle/reports/2026-09-29-orchestrator-dispatch-first-implementation.md.
Done when: a regression proves first-delta and interleaved arguments accumulate once, valid existing call modes are preserved, and the named completion report records checks and remaining AI gates; stop without broad AI protocol changes, live model calls, delegation, commit, merge or deployment.
```

## Changed files

- `docs/oracle/roadmap.md` - owner-directed bounded implementation exception, without a milestone transition.
- `docs/oracle/status.md` - T-32/T-33/T-34 work ownership, dependencies and actual launch status.
- `docs/oracle/reports/2026-09-29-orchestrator-dispatch-first-implementation.md` - exact implementation briefs, safe verification and acceptance boundaries.
- Isolated input snapshots and session-only launch manifest/prompts - current approved context and only necessary frozen child deliverables.

## New decisions made (need owner confirmation)

- None. Current instruction authorises these behaviour-preserving fixes. New advisor/pick-list interactions, pricing-source changes, shortage scope, excluded-copy disposition and other earlier proposals remain unapproved.

## Assumptions

- Implementation delegation is not permission to bypass unresolved product/schema/UX gates or deploy unfinished work.
- The existing screen design is the reference for the nonvisual loading fixes; new presentation requirements must be escalated.

## Challenges to locked decisions

- None.

## Open questions

- Remaining T-15/T-28 choices and cross-contract acceptance before wider AI/pick-list work.
- Real performance measurement setup/run approval remains absent.
- Returned implementation must be reviewed and verified before any owner-approved merge/deployment.

## Verification

- Reviewed the accepted Collection contract sections and native-fragment defect against current code.
- Confirmed source revision/dirty documentation and prepared three disjoint worktrees.
- Documentation input copies - 326 byte comparisons passed; no environment/auth files copied.
- Three actual `paseo run -d --provider copilot` calls - returned running agents and exact worktrees above.
- `paseo inspect` for each new ID - running, intended worktree, provider-default Sonnet 5/medium, normal Agent mode and expected parent verified.
- Scoped logs and individual `paseo permit allow` requests - initial role/brief reads allowed; no broad grants.
- `git --no-pager diff --check` and local link/new-report/task-state assertions - passed. No child implementation test result or completion claimed by this dispatch.
