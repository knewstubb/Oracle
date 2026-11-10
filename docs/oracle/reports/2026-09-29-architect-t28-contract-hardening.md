# Report: t28-contract-hardening
Role: Architect
Status: PARTIAL
Task as received:
> You are the Architect agent. Read AGENTS.md and .paseo/agents/architect.md before anything else.
> Task T-28: Harden the frozen existing card-state contract only at the listed approval, error, identity and retry gaps, following Assignment B and the common limits in docs/oracle/reports/2026-09-29-orchestrator-dispatch-astra-solutions.md; this is a bounded Astra revision, not a fresh broad audit.
> Done when: the revised contract/types, reproducible reference examples and new completion report distinguish approved rules from gated proposals and give a safe Commander-first handoff; then stop without application/schema edits, delegation, commits or deployment.

## Summary for the owner

The revised rules separate what you have already approved from choices still awaiting approval, and prevent failed lookups or repeated clicks from being mistaken for successful card moves. The Commander handoff is ready for review, with conditional examples for the unresolved choices. Nothing in the app or your collection has changed.

## Completion boundary

**The bounded hardening deliverables are complete; implementation acceptance remains PARTIAL.** This status does not mean the frozen inconsistencies were left in place. It means the unresolved product choices and the current Maybeboard representation cannot truthfully be declared approved or production-ready.

The revision is limited to Assignment B. It retains the original report as provenance, corrects the copied contract/types, adds persistent pure reference examples, and provides a conditional Commander-first handoff. No application, application test, dependency manifest, schema/migration, spec/mockup, decision, status or roadmap file was edited. No other agent/worktree was consulted, delegated to or synchronised with; no authentication, app server, database access, deployment, commit or paid-model work occurred.

## Changed files

- `docs/oracle/contracts/card-state-actions.md` - revised authority register, explicit unknown/error states, relation/identity gates, exact-operation retry semantics, owner decision pack, scoped shortage proposals, schema inventory and Commander-first Backend/Frontend/UX/T-15 handoff.
- `docs/oracle/contracts/card-state-actions.types.ts` - matching known/unknown and ready/blocked types, required write operation/observation fields, historical receipt versus current-read distinction, conditional Proxy policy, discrete identity/eligibility references and read-only advisor availability interface.
- `docs/oracle/contracts/card-state-actions.examples.ts` - 127 reproducible offline reference assertions covering the original journey and only the bounded hardening gaps; also includes a strict-type negative example prohibiting executable Proxy on a blocked row.
- `docs/oracle/reports/2026-09-29-architect-t28-contract-hardening.md` - this completion report.

These four files are the only successor deliverables. The worktree arrived with uncommitted planning documents and frozen child outputs; those are not this agent's changes.

## Corrections from the frozen draft

| Gap | Result |
|---|---|
| Approved rules blended with proposals | Contract authority register identifies approved behaviour; all technical requirements inherit enforcement status; explicitly marked proposal sections stay gated. No all-deck shortage default, Casual rule, excluded-copy restoration, proxy-printing policy or land conversion was adopted. |
| Primary category treated as locked Maybeboard membership | Separate main/optional membership retained. Generated schema has no durable relation field; import receives a relation flag but persists categories, while readers use inconsistent category tests. A reviewed adapter/discriminator decision is required; ambiguous rows produce explicit unknowns. |
| Quantity coercion and actionable multi-quantity rows | Invalid quantities and overflow are errors, not quantity 1. Tracked quantity greater than 1 is a blocked anomaly; neither assignment nor automatic splitting occurs. |
| Readiness null only for Casual | Null readiness now carries an explicit issue for stale/partial/failed or unverified facts. Failed assigned-copy checks cannot yield Playable. Independent failure to load free supply does not erase separately verified readiness. |
| Error rows still offered Proxy | Ready/blocked union prohibits all executable actions on a blocked row. A ready row can still have a gated Proxy offer pending its printing/finish policy. |
| Filled slot assumed to prove a successful retry | Required operation ID, server fingerprint, durable receipt and revision preconditions distinguish exact replay, new conflicting action, pending action and unknown outcome. A replay never re-sleeves a copy after an intervening transfer. |
| Approximate name match authorised movement | Discrete exact reference resolution must yield one canonical oracle ID; unresolved/ambiguous/error cases cannot authorise physical actions or be labelled Unowned. |
| Location/copy identity and donor refresh | Exact copy ID, canonical ID, printing, independent finish and recorded location are retained. Sleeve cannot take a held copy regardless of activity/allocation flags. Both numeric donor/destination cache-key sets are verified by the references. |
| Unrecorded temporary checks | Persistent examples and standalone commands now accompany the contract. They are not represented as database or browser tests. |
| Advisor could inherit proposals | Small read-only T-15 interface shares availability facts and freshness, without action descriptors, write authority, global shortage policy or Casual assumptions. Final cross-contract acceptance remains pending. |

Detailed change log: contract section 18. Acceptance matrix: A1-A36. Multiple assertions cover failure-state, quantity and retry permutations; 127 is the reference assertion count, not 127 application acceptance tests.

## Source evidence and limits

The following relevant source was inspected in this worktree. Confirmed means local source, not verified deployment:

- Maybeboard representation: `deck_cards` has categories but no relation discriminator; the import RPC receives `is_maybeboard` and inserts separate optional rows; its successor matches using text containment, unlike the deck-list primary-category predicate. [Confirmed: src/types/supabase.ts; supabase/migrations/20260926120000_import_maybeboard_relation.sql; supabase/migrations/20260926130000_exact_printing_import.sql; src/app/api/decks/route.ts]
- Retry/theft gap: `_move_copy_to_slot` returns early on matching target copy and permits a non-force move from a holder whose allocation flag is false. `add_proxy_to_slot` chooses newest printing/nonfoil and reports a filled target without durable operation identity. [Confirmed: supabase/migrations/20260925220000_placement_source.sql]
- Identity gap: the trigger permits name fallback; supply is resolved by name/front-face fallback. A discrete printing resolver exists, but its owned-card helper lacks the scope needed for direct reuse and its CSV fallback/default chain is not this contract. [Confirmed: supabase/migrations/20260916065913_index_friendly_scryfall_lookup_in_identity_trigger.sql; src/lib/allocation-candidates.ts; src/lib/identity-resolver.ts]
- Pick-list failures/locations: candidate failure leaves an empty map; the component reads `storageLocationName` while the supply response has `locationName`; movement refreshes only the current deck and confirmation depends on a legacy status field. [Confirmed: src/app/api/decks/[id]/picklist/route.ts; src/components/PicklistV2.tsx; src/lib/allocation-candidates.ts]
- Refresh keys: numeric deck-key factories include pick-list/allocation prefixes outside `decks`; Collection reads share the `collection` prefix. [Confirmed: src/hooks/useDeckQueryKeys.ts; src/hooks/useCollectionRollup.ts; src/hooks/useCollectionPrintings.ts]
- Format facts: Commander exact 100, constructed minimum 60, cube minimum 360, Casual no target, and current unknown-format Commander fallback. The latter is not used to manufacture known readiness in the reference. [Confirmed: src/lib/format-config.ts]
- Relevant schema keys/relationships, historical PK/rename evidence and uniqueness are inventoried in section 14.5. This is not a live RLS/index/schema audit. [Confirmed: src/types/supabase.ts; supabase/migrations/20260730032938_rename_card_tables.sql; supabase/migrations/20260730044951_rename_tables_prefix_convention.sql; supabase/migrations/20260812220000_fix_locations_unique_constraint.sql; supabase/migrations/20260907061042_fix_user_cards_unique_constraint.sql]

Unchanged peripheral findings in the copied draft retain attribution to the frozen original report. This task did not expand its inherited security observations into a security review or repeat the original state audit.

### Frozen provenance

SHA-256 before revision:

```text
bc7110d635eadde6f2767603503cb999149926fc53c8a8061b9db7c7305e9d07  card-state-actions.md
6d9ea4d8b2110f3d24c2cc52cee8237e2d0abab7050db709f8e379b1fa8022a8  card-state-actions.types.ts
da1887581f4667c3c7449701f896a7f761374676111611d72030e0adfa7d7686  2026-09-29-architect-t28-card-state-actions.md
```

The original report's hash was rechecked after revision and is unchanged. Its earlier completion and test claims remain historical, not substituted for this successor's checks.

## New decisions made (need owner confirmation)

No product decision was enacted. Contract section 14.4 contains the compact recommendation-first owner pack:

- Q1: shortage deck scope and detailed matching; the two-deck examples do not choose a global policy or a reserved retired folder.
- G-D1: treatment/location of previously excluded copies; keep eligibility unchanged pending approval, with no deletion proposal in this slice.
- G-M3: printing/finish policy for a newly created proxy; conditional example policy is not owner approval.
- G-D2/G-D3: generic/tracked conversion and multi-quantity row transition, preserving real copies and list totals.
- G-O1: Casual readiness, deferred independently of Commander.

Technical enforcement choices (error discriminants, exact identity, operation receipts, revision preconditions and both-deck refresh) do not need the owner to choose implementation details. They still require downstream contract/schema implementation review; no storage design has been deployed.

## Assumptions

- Repository source and migrations are the available evidence; current live equivalence is unverified.
- Fixture relation/commander/assignment facts are explicitly supplied as known. This does not claim a production membership adapter already exists.
- Synthetic IDs, cards and policy labels in examples are reference inputs, not real collection data or valid production credentials.
- Existing recorded default storage remains an ordinary release destination where the approved action uses it, not an inference about a previous shelf. Excluded-copy restoration/location is separately gated.
- No contract consumer is migrated merely because the draft types now differ; future Backend/Frontend work must adapt the named existing surfaces coherently.

## Challenges to locked decisions

- None. D-005/D-018 remain authoritative despite the current representation ambiguity. A category heuristic is not used to work around them.
- D-028 remains authoritative: no excluded copies were deleted, restored, assigned or made available.

## Open questions

| Owner / downstream gate | Bounded next handoff |
|---|---|
| Owner | Resolve only the conditional product choices above; approve the eventual visual board separately. These do not block further Commander UX preparation on verified fixtures. |
| Backend/Architect | G-M4: establish a durable membership source and reviewed legacy ambiguity handling; any additive discriminator/backfill needs separate approval. |
| Backend/Architect | G-M1/M2/M9: coherent transaction locks, explicit target/source, user ownership, durable replay records/consumed IDs, observation revisions and safe reconciliation. No migration draft is included. |
| Backend | First slice reuses pick-list/card-status/card-actions readers and allocation assign/claim transports; add approved Proxy only after G-M3 and Maybeboard release after G-M5. Imports, broad replacement and conversions remain later gates. |
| UX/Frontend | Use the existing pick-list/card components and confirmations; show blocked/stale facts explicitly, preserve copy details, distinguish existing/new proxy, confirm transfers and invalidate both decks. No mockup or component was changed here. |
| T-15 / coordinator | Review the successor's read-only interface against the advisor proposal before final cross-contract acceptance. No changing sibling output was read. |
| Rollout | Verify live schema/ownership constraints and isolated concurrency/browser behaviour under a later authorised handoff. Retain receipt/copy history on rollback; disable unsafe writes rather than reverting to legacy theft/retry behaviour. |

## Verification

- `node --experimental-strip-types docs/oracle/contracts/card-state-actions.examples.ts` - final result: **127 passed**, exit 0, Node v26.0.0. Node emitted a module-type detection warning; no project package setting was changed to suppress it.
- Strict standalone TypeScript check - **passed**, exit 0, TypeScript 5.9.3, including the expected compile-time rejection of executable Proxy on a blocked row:

```sh
/Users/bradknewstubb/.copilot/session-state/040f09dd-817c-4f8d-a9db-70f87910b0d3/files/t28-tooling/node_modules/.bin/tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions docs/oracle/contracts/card-state-actions.types.ts docs/oracle/contracts/card-state-actions.examples.ts
```

- Tool availability: no local/global `tsc` or `tsx` was available. `npm exec --offline --package typescript -- tsc --version` failed with `ENOTCACHED`. Only after that actual missing-tool failure, TypeScript 5.9.3 was installed into the task-specific session folder using `--no-save --no-package-lock --ignore-scripts --no-audit --no-fund`; no repository dependency files changed. The temporary tooling directory was removed after the final checks. Reproduction uses the standalone `tsc` command in contract section 18.
- Local Markdown link check using Node filesystem reads - **3 contract links valid**.
- Explicit Node whitespace/newline check across the three contract files - **clean**. `git diff --check` - clean for tracked changes. A preliminary `git diff --no-index --check /dev/null ...` returned the normal difference exit status 1 without diagnostic output and stopped its `&&` chain; it was replaced by the explicit all-file check, not reported as a completed check of all outputs.
- `shasum -a 256 docs/oracle/reports/2026-09-29-architect-t28-card-state-actions.md` - original report unchanged at the hash above.
- Initial/final `git status --short` and `git diff --name-only` inspection - tracked modifications remain the pre-existing decisions/roadmap/status inputs; successor output is confined to the named contract/example/report paths.
- No app suite, database concurrency test, server, browser, authentication or deployed-runtime verification was run. The pure references prove contract examples/types, not implementation correctness or deployment readiness.

Bounded handoff delivered; stopped without implementation, delegation, commit or deployment.
