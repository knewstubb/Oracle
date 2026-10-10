# Report: dispatch-astra-solutions
Role: Orchestrator
Status: DONE
Task as received: Great. Set off the architect to create the different solutions we need. Use astra

## Summary for the owner

Three focused Astra architecture assignments have been launched for safer, better-informed AI advice; consistent card/deck actions; and less unnecessary Collection loading. They will deliver build-ready proposals and clearly separate choices needing your approval from already approved rules. They will not change the app or live data.

DONE refers to this dispatch, not completion or acceptance of the agents' solutions.

## Authorisation and limits

The owner's instruction authorises architecture work using GPT-6 Astra, not automatic acceptance of the previous agents' proposals. The scoped exception is recorded in the roadmap; O-006's stale milestone markers remain unchanged.

All agents must read `AGENTS.md`, `.paseo/agents/architect.md`, current decisions, status and the relevant approved review plan. Work against actual local source and schema, but distinguish repository state from verified deployed behaviour. Follow the role's user scoping, identifiers, atomicity and error standards.

For this batch:

- No production application, test, dependency-manifest, migration, spec/mockup, decision, status or roadmap edits. Architecture types and examples stay under the named contract output paths.
- No database access/writes, authentication, application-server startup, mutable or environment-dependent app suites, owner credentials, new services, paid-model experiments or private-data upload.
- No commits, merges, deployments, child delegation, background watchers or automatic continuation into implementation.
- Use existing offline tooling for relevant reference-type/fixture checks where available. Only install dependencies following an actual missing-dependency failure and within task policy; do not install just to rediscover unrelated baseline failures. Never weaken project checks.
- Preserve the frozen input documents. Only the T-28 successor may revise its copied T-28 contract/type files. Other agents must treat those as read-only draft dependencies.
- Each solution must identify the smallest coherent implementation slice, exact existing surfaces to reuse, request/response/error contracts where relevant, tests/acceptance examples, failure/concurrency cases, migration requirements without drafting migrations, rollback/recovery limits and owner gates.
- Recommendations are proposals. Where behaviour needs the owner, give a recommendation with at most three plain-language options and a concrete example. Do not make silent defaults or stop unrelated safe architecture work.
- Finish with the required report, exact checks/results, remaining blockers, and a bounded UX/Backend/Frontend handoff, then stop.

## Assignment A: T-15 advisor contract

**Purpose:** convert the returned AI assessment into a practical M2 advisor contract, not another AI/vendor audit or full new recommendation platform.

### Inputs

- `docs/oracle/contracts/ai-recommendations-assessment-2026-09.md` and `docs/oracle/reports/2026-09-29-architect-t19-ai-recommendations.md`: frozen research input, not an accepted implementation contract.
- `docs/oracle/contracts/card-state-actions.md` and `.types.ts`: frozen T-28 draft; approved decisions take precedence.
- `docs/oracle/reports/2026-09-29-orchestrator-agent-returns-actionable.md`.
- Current `decisions.md`, `roadmap.md`, `status.md` and Plan 1.
- The prior T-14 audit only where necessary; inspect relevant current routes/tools/adapters to verify the findings used in the design.

### Deliver

1. A bounded contract for obtaining factual deck/commander/card/collection context and returning **read-only structured recommendations**. Advice does not itself change deck composition or physical copies. Distinguish this M2 boundary from the later M3 confirmation/apply/undo contract; do not implement M3.
2. Specify source-labelled known/unknown/freshness states, canonical versus printing IDs, finish, face-aware rules, current legality, paired commanders/backgrounds and explicit unset preferences. Do not silently reconstruct missing facts from model memory.
3. Preserve the five approved availability meanings and original/proxy distinction. Define a narrow consumer interface to T-28; do not independently redefine supply/readiness/shortage predicates or assume its interim proposals are approved.
4. Define the structured suggestion shape with real card identity, commander-specific rationale, relevant mechanics/roles, conditional support or anti-synergy, optional cut/package context, provenance and indicative price freshness. No free-form prose parsing for structured actions.
5. Give the smallest verifiable M2 path using existing architecture. Separate deterministic factual validation from evaluated usefulness; do not design a giant knowledge graph or infer that a model swap fixes missing inputs. Jev stays an optional later classifier evaluation, not a production dependency.
6. Specify narrow safeguard solutions for the reported sidebar auto-apply, empty Upgrade refresh and dropped tool-call handling, after checking the relevant source. Explain behaviour changes needing owner confirmation. No automatic destructive refresh or falsely successful fallback.
7. Map existing versus proposed data fields and exact source-of-truth resolution; identify later schema decisions without writing migrations. Preserve user ownership checks in every reused query. Report broader security questions for separate verification rather than expanding into a full vulnerability audit.
8. Provide concrete offline contract examples and a staged evaluation using T-19's matrix and the existing three-real-deck exit gate; preserve owner-calibration items. Include Prosper/Korvold, a paired commander, a multi-face card, banned/unknown card facts, stale ownership, an existing proxy and an unsupported response.
9. Provide an integration checklist for the final revised T-28 interface. Independent design can finish now, but mark final cross-contract acceptance pending that review. Do not read another agent's changing worktree or edit shared files to "keep in sync".

### Owned outputs

- `docs/oracle/contracts/advisor-tools.md`
- `docs/oracle/contracts/advisor-tools.types.ts` if justified
- `docs/oracle/contracts/advisor-tools.examples.ts` if useful for reproducible pure offline checks
- `docs/oracle/reports/2026-09-29-architect-t15-advisor-solutions.md`

**Stop condition:** an implementable bounded advisor proposal with explicit unknowns, typed examples, safeguard slices and remaining owner/interface gates exists. No repeated broad research and no paid benchmark.

## Assignment B: T-28 bounded contract hardening

**Purpose:** revise the existing draft at its precise gaps, not repeat the original state audit. A fresh Astra successor is used because the available CLI cannot change the previous Opus agent's model in place; the previous agent remains idle and must not edit these outputs.

### Inputs

- Frozen original `docs/oracle/contracts/card-state-actions.md`, `.types.ts` and `docs/oracle/reports/2026-09-29-architect-t28-card-state-actions.md`.
- Current decisions and Plans 1/2; `docs/oracle/reports/2026-09-29-orchestrator-agent-returns-actionable.md`.
- Frozen T-27 loading report for already discovered pick-list field/refresh issues.

### Correct and deliver

1. Mark every normative rule as already approved, necessary technical enforcement, or a proposal requiring owner review. Do not quietly enact all-deck shortage scope, casual readiness, Missing-copy restoration/location, proxy printing or generic/tracked conversion.
2. Prepare a usable **Commander-first approved subset** with explicitly gated examples for unresolved choices. Do not invent a global retired-folder convention or delete/re-enable excluded copies. Give the owner a compact decision table only for genuinely unresolved behaviour, not technical details agents can settle.
3. Resolve prose/type consistency and invalid/unknown data treatment. The current types say readiness can be null only for an unspecified format while the prose also requires unknown readiness on failed data. Ensure no failed/partial eligibility information can become Playable, Unowned or empty success. Invalid quantities must be surfaced rather than silently normalised by `max(quantity, 1)` without an approved/reportable anomaly contract.
4. Fix retry semantics: the existing draft says a second Proxy request encountering a filled slot must not report failure and assumes it contains the proxy just created. A different concurrent actor can fill the slot. Specify how an exact retry is distinguished from a conflicting action or unknown outcome; do not equate any `slot_already_filled` with success. Cover repeated Sleeve/Move/Proxy, an intervening transfer, timeouts and actual same-operation replay.
5. Make options/action preconditions and freshness typed enough that failed row lookups, unsupported multi-quantity tracked rows or stale copies do not expose falsely executable actions. The existing `proxyAction` field is unconditional even on error rows; reconcile this with the approved explicit-error rules without inventing a new UX.
6. Preserve exact source identity, original/proxy/printing/finish and unknown locations; prove both donor and destination refresh keys. Sleeve cannot steal from any deck, regardless of a legacy activity/allocate flag. Do not infer shelf locations.
7. Resolve the Maybeboard relation definition against D-005/D-018 and actual current schema. Do not silently replace the locked relation with a convenient category heuristic. Document any representational ambiguity or required later migration as a gate; no migration drafts in this batch.
8. Keep identity resolution discrete and unambiguous. An approximate name fallback must not authorise physical moves when canonical identity remains unknown; state an explicit resolver/error path.
9. Expand the existing acceptance examples only for these gaps. Keep executable reference checks reproducible in the allowed contract example file rather than an unrecorded temporary script. Include the original Sol Ring journey, proxy-heavy shortage, generic basics, multi-quantity anomaly, row failure, concurrency and both-deck refresh.
10. Supply a change log from the frozen draft, a small read-only availability interface T-15 can consume, and the exact owner/UX/Backend gates. Do not build APIs, UI, schema or data conversions.

### Owned outputs

- Revise `docs/oracle/contracts/card-state-actions.md` and `.types.ts` in this successor worktree only.
- `docs/oracle/contracts/card-state-actions.examples.ts` if needed for reproducible pure offline verification.
- `docs/oracle/reports/2026-09-29-architect-t28-contract-hardening.md`
- Keep the original Architect report unchanged as provenance.

**Stop condition:** bounded inconsistencies are corrected, approved versus proposed behaviour is unambiguous, reference types/examples agree, and a focused owner decision pack plus downstream handoff is provided. Report PARTIAL/BLOCKED for any genuinely unresolved section without guessing.

## Assignment C: T-27 loading solutions follow-up

**Purpose:** use the existing Astra investigation context to turn its smallest ranked candidates into implementation-ready solution slices. The baseline remains BLOCKED; this task does not authorise runtime measurement.

### Inputs

- Your unchanged `docs/oracle/reports/2026-09-29-architect-t27-loading-baseline.md`.
- Updated current decisions/status/roadmap and Plan 3.
- Frozen original T-28 contract/type/report for compatibility only; do not edit it or consume the successor's changing outputs.

### Deliver

1. Precisely scope the three initial Collection changes: only active view data including persisted/mobile hydration; one search pause with coherent page reset; one price-freshness read per handler. Reuse existing components/hooks/routes and preserve error, cache and freshness semantics. Do not design new UI.
2. Include the already confirmed disconnected status-filter issue as an explicit coupled correctness dependency, not an assumption that unchanged results are fast. Identify whether each slice is independent or must wait for a shared response/behaviour decision.
3. Give contract examples/invariants and focused acceptance selectors for cold saved-list entry, grid/list switch, rapid typing/clear, filter/sort on later pages, stale responses, error/retry and unknown price metadata. State before/after **request-work** expectations without inventing latency gains.
4. Outline the larger printing-pagination problem as a separate decision/contract gate. Recommend a page unit with examples of same printing/different finishes/proxies and stable totals/order, but do not silently approve changed row/selection semantics or draft SQL/index changes. No full data-layer redesign.
5. Detail a safe measurement-environment proposal using the existing safety guards. Explain the smallest isolated fixture and handling of background conversation/health writes, profiles, request cap, failure retention and meaningful usable-content milestone. Do not create the environment, read secrets, authenticate, run requests, seed data or claim timings.
6. Keep pick-list source/eligibility and both-deck refresh changes as T-28-dependent work; map the shared interface, not a competing implementation. Keep broader deck/value/reconciliation optimisations queued until evidence warrants them.
7. End with bounded Frontend/Backend handoffs, dependency order, rollback limits and the plain approval needed to obtain real timings.

### Owned outputs

- `docs/oracle/contracts/collection-loading-solutions.md`
- `docs/oracle/reports/2026-09-29-architect-t27-loading-solutions.md`
- Original baseline report unchanged.

**Stop condition:** the three small source-backed solutions and the safe measurement proposal are ready for review. Report architecture completion separately from the still-blocked runtime baseline. Do not re-run the broad investigation.

## Launch records

Actual workspaces and launches:

- T-15: agent `c99e3ba7-eb4e-44da-b861-298f48c8aadc`, `wks_19e1812d9f081ce8`, `/Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t15-advisor-contract-astra`, branch `task/t15-advisor-contract-astra-20260929`.
- T-28 successor: agent `bb0c8bd5-39f4-4dae-95f9-08b1ba32dc10`, `wks_e3dd512b148e3fb1`, `/Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t28-contract-hardening-astra`, branch `task/t28-contract-hardening-astra-20260929`.
- T-27 existing: agent `43a8b166-8075-4ff4-8e93-f4f7e7837747`, workspace `wks_80128d9fcb9c0212`, `/Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t27-loading-baseline`.

Both `paseo run -d --provider copilot/gpt-6-astra` calls returned `running` with the intended worktree. `paseo send --no-wait` returned `sent` for T-27. All launches remain parent-scoped; completion/permission notifications should be handled using these known IDs, without a polling loop.

Post-launch inspection verified all three as `running`, `copilot/gpt-6-astra`, normal Agent mode, with parent `c3f14e05-5dae-4530-a342-5ff1dec17019` and the intended worktrees. The two fresh agents resolved to provider-default `medium` reasoning; the existing T-27 retained `high`. No reasoning override was set in this dispatch.

The two fresh agents each requested `git --no-pager status --short`. The complete commands were checked in their scoped logs and individually approved: T-15 request `3a18616f-a6a1-4186-a282-e54c5d705475`, T-28 request `ec797214-1701-4465-a488-b28805ff103b`. No blanket permission or permission for runtime/data operations was granted.

The original T-28 Opus agent `0a31b64d-6208-4de4-b8f3-f792f72b9fe6` remains idle in its original worktree. The new agent has the narrower correction brief above, not a duplicate broad audit. The T-19 research agent remains idle; T-15 is a new independent contract task using its frozen results.

Before dispatch, 329 documentation copies across the three workspaces were byte-verified. The machine-readable snapshot manifest and extracted exact prompts are in the session workspace under `files/astra-solutions-input-manifest.json` and `files/astra-t15-prompt.txt`, `astra-t28-prompt.txt`, `astra-t27-prompt.txt`. No environment or authentication files were copied.

### Provider configuration

The available Paseo CLI exposes no named-profile discovery, and `agent update` cannot change the model. Provider model discovery confirms `copilot/gpt-6-astra` is available. New launches select the owner-requested model and omit a reasoning override, allowing provider defaults; the existing T-27 agent retains its current Astra settings. Normal permission mode remains; no Allow All or blanket permission grants.

### Three-line handoffs

T-15:

```text
You are the Architect agent. Read AGENTS.md and .paseo/agents/architect.md before anything else.
Task T-15: Create the advisor-tool and safe-proposal solution contract from the frozen T-19 assessment and current approved rules, following Assignment A and the common limits in docs/oracle/reports/2026-09-29-orchestrator-dispatch-astra-solutions.md.
Done when: the named advisor contract, justified reference types/examples and completion report provide a bounded implementation handoff with verified facts, explicit owner/T-28 gates and no app or database changes; then stop without delegating, committing or deploying.
```

T-28:

```text
You are the Architect agent. Read AGENTS.md and .paseo/agents/architect.md before anything else.
Task T-28: Harden the frozen existing card-state contract only at the listed approval, error, identity and retry gaps, following Assignment B and the common limits in docs/oracle/reports/2026-09-29-orchestrator-dispatch-astra-solutions.md; this is a bounded Astra revision, not a fresh broad audit.
Done when: the revised contract/types, reproducible reference examples and new completion report distinguish approved rules from gated proposals and give a safe Commander-first handoff; then stop without application/schema edits, delegation, commits or deployment.
```

T-27 follow-up:

```text
You are the Architect agent. Read AGENTS.md and .paseo/agents/architect.md before anything else.
Task T-27: Turn your completed source investigation into the three small Collection-loading solutions and a safe measurement proposal, following Assignment C and the common limits in docs/oracle/reports/2026-09-29-orchestrator-dispatch-astra-solutions.md; the runtime baseline remains blocked and no runtime work is authorised.
Done when: the named loading-solutions contract and new report provide bounded handoffs, correctness/dependency gates and a measurement setup proposal without redoing the broad audit or changing the app; then stop without delegating, committing or deploying.
```

## Changed files

- `docs/oracle/roadmap.md` - records the explicit architecture-only owner exception.
- `docs/oracle/status.md` - records the authorised work and actual task state as launch completes.
- `docs/oracle/reports/2026-09-29-orchestrator-dispatch-astra-solutions.md` - shared limits, complete bounded briefs, input/output ownership and launch provenance.
- Isolated worktree input snapshots - current documentation plus only named frozen child deliverables; no secrets copied.

## New decisions made (need owner confirmation)

- None. Earlier child proposals remain unapproved. Astra is the explicitly requested model, not a new production AI provider decision.

## Assumptions

- "Create the different solutions" authorises the three architecture scopes discussed immediately before the instruction, not production implementation.
- Independent drafts can be prepared against frozen interface inputs; final cross-contract acceptance must wait for reviewed outputs.

## Challenges to locked decisions

- None. Any newly discovered contradiction must be reported rather than worked around.

## Open questions

- Existing product/data choices, actual UI approval, safe measurement environment and final contract acceptance remain.

## Verification

- CLI help/model discovery - GPT-6 Astra available; profile discovery and in-place model change are not exposed by the available CLI.
- Existing T-27 inspection - idle, GPT-6 Astra, correct worktree and parent, no pending permissions before follow-up.
- Input preparation - 329 copied documentation files byte-verified; original child outputs preserved and only named report/contract files copied as research input.
- `paseo run -d --provider copilot/gpt-6-astra ...` - two actual agent IDs returned with `running` status and intended worktrees.
- `paseo send 43a8b166-8075-4ff4-8e93-f4f7e7837747 --no-wait --prompt-file ... --json` - follow-up accepted with `sent`.
- `paseo inspect` for the three known IDs - all running; exact Astra model, normal mode, correct parent and worktree verified.
- Scoped agent logs and individual `paseo permit allow` calls - initial read-only Git status requests approved; no broad grants.
- `git --no-pager diff --check` and local report/link/task-state checks - passed. No implementation, child-output acceptance or runtime test is claimed.
