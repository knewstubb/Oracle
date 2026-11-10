# Report: t15-advisor-solutions
Role: Architect
Status: DONE
Task as received: You are the Architect agent. Read AGENTS.md and .paseo/agents/architect.md before anything else.
Task T-15: Create the advisor-tool and safe-proposal solution contract from the frozen T-19 assessment and current approved rules, following Assignment A and the common limits in docs/oracle/reports/2026-09-29-orchestrator-dispatch-astra-solutions.md.
Done when: the named advisor contract, justified reference types/examples and completion report provide a bounded implementation handoff with verified facts, explicit owner/T-28 gates and no app or database changes; then stop without delegating, committing or deploying.

## Summary for the owner

The design is ready for review: the advisor would explain recommendations using real card and collection facts without changing a deck, and would clearly say when information is missing or old. It also defines how to stop accidental sidebar edits, preserve existing Upgrade suggestions when refresh cannot replace them, and show failed AI replies honestly. Nothing in the app or collection changed; the visible behaviour choices and final shared card-state rules still need approval before building.

## Changed files

- `docs/oracle/contracts/advisor-tools.md` - bounded M2 contract, verified source map, proposed tool/request/result/error boundaries, three safeguard slices, schema inventory, evaluation plan, owner gates and final T-28 integration checklist.
- `docs/oracle/contracts/advisor-tools.types.ts` - self-contained reference shapes separating canonical and printing IDs, known/unknown/freshness, model selections, server facts, read-only availability, suggestions and terminal errors.
- `docs/oracle/contracts/advisor-tools.examples.ts` - 43 reproducible pure offline reference checks using public card names, deliberately synthetic identifiers, fixed timestamps and no application dependencies.
- `docs/oracle/reports/2026-09-29-architect-t15-advisor-solutions.md` - this completion report.

No production source, application tests, dependency manifest/lockfile, migration,
spec/mockup, decision, status or roadmap was edited. Frozen T-19/T-28 inputs remain
unchanged. The pre-existing dirty planning documents and copied untracked inputs
were retained, not treated as this task's changes.

## New decisions made (need owner confirmation)

None enacted. The contract labels approved rules, necessary enforcement, proposals
and owner gates separately.

- O1: recommend read-only sidebar suggestion cards now, with deck editing remaining manual until M3 confirmation/undo exists.
- O2: recommend keeping old Upgrade suggestions and explaining refresh is unavailable, rather than clearing them.
- O3: recommend asking before including an infinite-combo package when preference is unset; no invented bracket, budget, collection or house-rule defaults.
- O4: recommend fewer grounded recommendations when evidence is sparse; relevance, diversity and usefulness thresholds still need owner calibration.
- O5: recommend clearly labelled Scryfall indicative prices for initial review, with Card Kingdom prices explicitly unknown. This does not silently replace the roadmap's Card Kingdom requirement.

Technical proposals also awaiting contract acceptance include a 24-hour public
rules/legality cache bound, the versioned advisor transport, candidate/tool budgets,
and ephemeral M2 suggestions. These do not authorize implementation or migration.

## Assumptions

- DONE means the architecture assignment and its owned artifacts are complete,
  not that T-15 is accepted, T-17/T-18 may automatically start, or M2 passed.
- Current approved decisions and the explicit architecture dispatch supersede the
  frozen drafts where they disagree. No milestone marker is changed.
- Repository schema/migrations establish local design evidence, not verified live
  schema, data coverage, RLS enforcement or hosted behaviour.
- Named card examples use the frozen T-19 research as expected historical cases.
  Current rules and legality must be re-fetched/verified at implementation evaluation.
- Synthetic `fixture-*` identifiers exercise shape and boundary behaviour only;
  they are intentionally invalid production UUIDs and cannot pass the real-card
  database exit gate. No real-looking identifiers were invented.
- The independent advisor design can finish against the frozen T-28 input, but
  no availability algorithm from that draft is silently adopted. Final acceptance
  requires the reviewed successor and versioned read interface.

## Challenges to locked decisions

- None. The contract preserves the locked physical-copy model, independent finish,
  canonical/printing separation, Maybeboard relation, availability meanings,
  original-only shortages, generic-basic exception and explicit failed-data states.
- Current implementation differences are correction targets, not reasons to
  change locked decisions. In particular, no category-only workaround is adopted
  for the unresolved Maybeboard representation.

## Verified findings and corrections to research input

1. Sidebar add/remove events cause browser-side batch writes without a separate
   confirmation. The current registry tools return display text and the executor
   emits events; they do not themselves invoke the placement RPC as T-19's tool
   table suggested. Both capability dispatch and browser event handling must be
   protected. [Confirmed: src/lib/tool-registry.ts; src/lib/tool-executor.ts;
   src/contexts/OracleContext.tsx]
2. Upgrade refresh deletes stored content, writes an empty list and returns success;
   authentication is present but its deck existence query is not owner-scoped.
   The narrowly proposed fix performs no write and retains old suggestions.
   [Confirmed: src/app/api/decks/[id]/upgrade/refresh/route.ts;
   src/components/UpgradeTab.tsx]
3. Streaming DeepSeek handling strips DSML-like text and skips malformed native
   calls; non-streaming additionally reconstructs DSML calls with regex. The
   safeguard must cover both modes. A first streaming delta containing arguments
   is also appended twice in the inspected accumulator; this is included in
   downstream acceptance cases. [Confirmed: src/lib/adapters/deepseek-adapter.ts]
4. Existing model-facing ownership excludes proxies and invents printing/finish
   defaults; preference retrieval inserts defaults or returns them on errors.
   Neither is a valid source for the proposed factual advisor contract.
   [Confirmed: src/lib/card-repository.ts; src/lib/user-preferences.ts]
5. Face-level/current-rule facts are absent from the relevant stored projections
   and current direct-client type. A transient validated public-facts DTO is the
   smallest path; a persistent facts platform is not a prerequisite.
   [Confirmed: src/types/supabase.ts; src/lib/scryfall-client.ts]
6. The ledger drops `card_kingdom_prices`; the inspected price helper reads Scryfall
   fields. Card Kingdom pricing is therefore not established by T-19's inventory.
   It is an explicit remaining roadmap gate, not a relabelled estimate.
   [Confirmed: supabase/migrations/20260730070439_drop_legacy_tables.sql;
   src/lib/price-store.ts]

These are local source findings. No runtime vulnerability certification, current
public-card lookup, paid benchmark or deployed behaviour observation is claimed.

## Open questions

- Owner review of O1-O5 and the T-16 visual examples.
- Final reviewed T-28 candidate/slot availability interface, exact identity,
  coherent freshness/snapshot semantics, failure states, Maybeboard relation and
  invalid-quantity handling. Its excluded-copy, proxy-printing, shortage-scope and
  generic/tracked conversion gates remain owned by T-28, not redefined here.
- Separately verify global preference schema and whether stored values were
  explicitly chosen; generated defaults are not owner consent.
- Verify a real Card Kingdom source or obtain explicit acceptance of a limited
  price-source substitution; no such approval was assumed.
- Broader user-isolation findings in legacy AI/session/action paths require separate
  verification before reuse or sharing the app. This task did not expand into an audit.
- Safe environment, representative data, runtime/model budget and owner-calibrated
  quality thresholds before the three-real-deck M2 exit test. That test was not run.

## Bounded handoff

- **UX:** T-16 reviews read-only recommendation cards, current/unknown availability,
  original/proxy distinctions, conditional rationale, source-labelled prices and
  failures. No Apply/undo interaction is implied.
- **Backend:** after approval, implement the three narrow safeguards, then one
  scoped Commander context/facts path, the final T-28 adapter and validated native
  submission tool using existing chat/provider/resolver surfaces. No new service,
  recommendation platform, automatic inventory write or generator is needed.
- **Frontend:** consume versioned validated events; remove advisor auto-apply and
  prose parsing; retain old Upgrade content on unavailable refresh; suppress late
  results and make incomplete/error states explicit.
- **Orchestrator:** reconcile the final T-28 interface using the checklist in the
  contract before acceptance. Retain separate owner, schema, safe-evaluation,
  milestone, implementation and release gates.

## Verification

- Read `AGENTS.md`, the Architect role, the full Assignment A/common limits, current
  decisions/status/roadmap, Plan 1, frozen T-19 assessment/report, frozen T-28
  contract/types and the returned-work coordinator report.
- Inspected the relevant local routes, tool registry/executor, provider adapter,
  sidebar consumer, Upgrade UI, identity/commander/price/build/preference readers,
  generated schema and historical/current migrations. Exact evidence and source
  limitations are recorded in the contract.
- `node docs/oracle/contracts/advisor-tools.examples.ts` - **PASS: 43 pure reference
  checks**, final run after fixture corrections.
- Initial offline compiler attempt,
  `npm exec --offline --no --package=typescript -- tsc ...` - **blocked:
  ENOTCACHED**; this worktree had no local TypeScript tools and the npm metadata
  was not cached. Native Node checks passed independently.
- Following that actual missing-tool failure,
  `npm exec --yes --package=typescript@5.9.3 -- tsc --noEmit --strict --target ES2022 --module nodenext --moduleResolution nodenext --allowImportingTsExtensions --skipLibCheck docs/oracle/contracts/advisor-tools.types.ts docs/oracle/contracts/advisor-tools.examples.ts`
  - **PASS**. Restored the compiler into npm's execution cache only; no project
  dependencies or manifests changed. No private code/data was uploaded.
- Final repeat of the same strict check using
  `npm exec --offline --yes --package=typescript@5.9.3 -- tsc ...` - **PASS**, no
  application imports, ambient app setup, server or database needed.
- Read-only formatting/link check over all three contract files - **PASS**:
  ASCII, no trailing whitespace, final newlines, two valid companion links.
- `git --no-pager diff --check` - **PASS**. The separate owned-file check also
  covered the untracked contract files, which ordinary diff checks do not include.
- `git --no-pager status --short` and `git --no-pager diff --stat` - confirmed the
  existing tracked planning changes remain the same three files; this task added
  only its named contract artifacts and this report.
- Not run: application suites, authenticated requests, database queries/writes,
  app server, private-data upload, model experiments or three-real-deck exit test.
  No agents were delegated, and no commits, merges or deployments were made.

Stop condition met for architecture. Final cross-contract acceptance and runtime
delivery remain gated; no automatic continuation into implementation.
