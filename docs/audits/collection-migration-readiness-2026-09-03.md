# Collection Migration Readiness Audit

> Date: 2026-09-03
> Owner: Delivery Lead
> Scope: Product behavior, collection migration, data integrity, recovery, security, performance, tests, operations, repository hygiene, and documentation
> Decision: **NO-GO as the sole source of truth; usable as a secondary/test system while blockers are resolved**

## Executive Summary

The Oracle has substantial working product surface: authentication, collection browsing, instance-level copies, deck allocation, CSV import/export, price data, storage locations, and automated tests. It is not yet safe to replace Archidekt as the only authoritative copy of the collection.

The main barriers are not missing UI polish. They are data-safety and operational controls:

1. Collection replacement deletes live rows before the complete import is validated and cannot roll back.
2. Large imports are split into independently committed chunks, so interruption leaves a partial collection.
3. A successful replacement creates new copy IDs and loses deck allocation links.
4. The CSV export is not a complete, proven restore format.
5. CI runs authenticated, state-mutating tests against the production URL.
6. Some multi-row allocation flows are non-atomic; the undo route also lacks user ownership scoping while using the service-role client.
7. No verified database backup/restore rehearsal, staging environment, durable mutation audit, or production alerting is documented.
8. Quality gates are not green: 277 unit tests fail, TypeScript does not parse generated Supabase types, lint has 334 errors, and production builds ignore TypeScript errors.
9. Database migrations and Edge Functions are split across multiple directories, including paths outside the application Git repository.
10. Product and feature documentation describes superseded table names and guarantees that the current implementation does not provide.

## Migration Decision

### Safe today

- Continue evaluating collection browsing and deck workflows with non-authoritative data.
- Keep the Archidekt export and another independent backup unchanged.
- Use non-destructive manual testing only after disabling production-mutating CI.
- Export data for inspection, but do not treat the CSV as a complete disaster-recovery backup.

### Not safe today

- Do not use Collection **Replace** with the only copy of the collection.
- Do not make Oracle the sole system of record.
- Do not delete Archidekt data after import.
- Do not rely on current CI, tests, or build success as proof that migration is safe.
- Do not delete or consolidate migration/function trees until deployed Supabase history is reconciled.

## Release Gates Before Authoritative Migration

All gates are required unless the user explicitly accepts the residual risk.

| Gate | Required evidence | Current state |
|---|---|---|
| Production-mutating CI removed | E2E uses isolated test project and deterministic reset/cleanup | **Fail** |
| Native database backup | Fresh backup of user cards, copies, decks, deck cards, storage, and preferences | **Unknown / not documented** |
| Restore rehearsal | Backup restored into isolated Supabase project and row/invariant checks pass | **Fail / no evidence** |
| Staged import | Complete file parsed/resolved into an import run before live rows change | **Fail** |
| Atomic cutover | One Postgres transaction/RPC applies the approved import | **Fail** |
| Allocation preservation | Matched copies retain IDs or allocations are deterministically relinked | **Fail** |
| Round-trip fidelity | Export → clean restore reproduces counts and required metadata | **Fail / untested** |
| Import idempotency | Retry/resume cannot duplicate or partially replace copies | **Fail** |
| Tenant safety | Every user-data route is RLS-backed or ownership-scoped and tested with two users | **Fail** |
| Green quality gate | Typecheck, lint baseline, critical unit/integration tests, build, isolated E2E | **Fail** |
| Canonical schema source | One committed migration/function tree reproduces deployed schema | **Fail** |
| Operational detection | Failed/partial import and sudden count-drop alerts plus durable audit event | **Fail** |

## Critical Findings

### 1. Destructive collection replacement is non-transactional

`src/app/api/collection/import/route.ts` deletes all `user_copies`, then attempts to delete `user_cards`, then starts parsing/resolving/inserting. A malformed file, timeout, failed lookup, process crash, or batch error can leave an empty or partial collection. The `user_cards` deletion error is swallowed.

The browser importer sends the first chunk as `replace` and later chunks as `add`. At approximately 3,650 copies this is multiple independent commits. Cancel, browser close, network loss, or one failed request cannot restore the pre-import state.

**Required fix:** stage the whole import under an `import_run_id`, validate it, present reconciliation totals, then execute the approved swap/reconciliation in one database transaction. Never delete before validation.

### 2. Replacement breaks deck allocations

Deleting `user_copies` nulls `deck_cards.copy_id`. Re-imported copies receive new IDs and the collection importer does not relink deck slots. Even a technically successful replace can make decks incomplete.

**Required fix:** preserve matched copy IDs or include allocation reconciliation in the atomic cutover. Show the user the expected allocation impact before approval.

### 3. Export is not a complete restore artifact

The export includes card/printing, finish, condition, proxy, purchase price, and date. It omits missing status, storage location, language, source provenance, proxy target, notes, copy identity, decks, and allocation relationships. The importer does not preserve all exported semantics, and no export/import round-trip test exists.

**Required fix:** define a versioned Oracle backup format with manifest, schema version, source hash, counts/checksums, full metadata, allocations, and restore verification. Keep a human-portable CSV separately.

### 4. CI mutates production

`.github/workflows/e2e-tests.yml` targets `https://oracle-alpha-two.vercel.app`, restores an authenticated session, and runs tests on push/PR. `tests/e2e/card-movement.spec.ts` performs allocation mutations without guaranteed teardown.

**Immediate action:** disable the workflow or point it to an isolated project before further production use. Rotate the stored Playwright session and review whether tests changed real allocations.

### 5. Allocation undo is an authorization and atomicity risk

`src/app/api/allocation/undo/route.ts` uses the service-role client but does not scope copy/slot reads and writes to the authenticated user. It clears one slot and restores another in separate calls, leaving a crash/race window.

`add-proxy` has a related insert-then-assign window with best-effort rollback.

**Required fix:** ownership guards, advisory lock, source/target validation, and all writes inside one Postgres RPC transaction.

### 6. Recovery and observability are not established

No repository evidence demonstrates automatic database backups, PITR retention, restore rehearsal, RPO/RTO, mutation audit logs, error tracking, slow-query monitoring, or alerts for partial imports/count drops.

**Required fix:** verify hosted controls, document them, rehearse restore, and add durable import/allocation audit events before authoritative migration.

## High Findings

### Import correctness

- Add/import retry has no per-run idempotency key and can duplicate copies.
- Sync reconciles mainly by printing quantity and can lose finish/proxy/condition/date distinctions.
- Sync unlink/delete/insert steps are independently committed.
- Normalizing Moxfield/ManaBox to an Archidekt-shaped CSV loses original source identity.
- Archidekt parsing does not restore the Oracle export's Proxy column.
- Hand-written CSV parsing does not fully support escaped quotes or multiline fields.
- The legacy default `upsert` path remains exposed and does not reliably receive `userId`.
- Existing-card reads and some list endpoints remain vulnerable to PostgREST's 1,000-row cap.

### Collection correctness and performance

- Card-name list requests fetch all matching copies, sort in memory, then paginate.
- Pagination occurs before grouping, so one printing's quantity can split across pages.
- Quantity/price sorting can become page-local rather than globally correct.
- Status filters are represented in the toolbar but are not wired into the list query.
- Proxy/missing toggle visibility depends on current-page counts.
- Unbounded parallel batches trade latency for database/request pressure and server memory.

A database-side collection projection/RPC (or denormalized sortable fields) is the correct long-term fix; further application-layer batch loops will remain fragile.

### Schema and authorization

- Normal user routes frequently use `createAdminClient()`, so RLS cannot contain missing filters.
- At least one aggregate route was found without user scoping; all admin-client routes require systematic review.
- `user_cards` conflict/uniqueness assumptions must be verified against the deployed schema.
- Atomic RPC definitions exist in root migration trees, but the repository has multiple competing migration histories and no confirmed canonical replay path.

### Quality gates

Validation run on 2026-09-03:

- `npm test -- --reporter=dot`: **53 failed files, 61 passed, 1 skipped; 277 failed tests, 1,065 passed, 1 skipped**.
- `npx tsc --noEmit`: **failed** because `src/types/supabase.ts` contains Supabase CLI upgrade text at lines 2075–2076.
- `npm run lint`: **334 errors, 340 warnings**.
- `next.config.ts` sets `typescript.ignoreBuildErrors: true`, so a production build can succeed despite type errors.
- CI runs E2E only; it does not run unit tests, lint, strict typecheck, build, migration replay, or schema drift checks.

The large number of passing tests is useful, but the failing baseline means regressions cannot be distinguished from existing breakage.

## Repository and Documentation Audit

### Current sources of truth

| Area | Source |
|---|---|
| Runtime behavior | `app/src/` |
| Build/dependencies | `app/package.json`, lockfile, Next/Vitest/Playwright config |
| Deployment | `app/vercel.json`, `app/.github/workflows/` |
| Intended normalized card schema | `.kiro/steering/schema-card-data.md`, verified against deployed DB before changes |
| Feature history | `.kiro/specs/<feature>/` where present |
| Operational/product docs | `app/docs/`, after code verification |

### Current structural risk

`app/` is the Git repository. `.kiro/`, root `research/`, root `specs/`, and root `supabase/` sit outside it. Production-relevant migrations and Edge Functions therefore exist outside the application audit trail. There are also migration copies/collisions under `app/supabase`, `supabase/migrations`, and `supabase/supabase/migrations`.

**Target organization:** one repository and one canonical `supabase/` directory. Either make the workspace root the repository or move required `.kiro`, research, specs, migrations, and functions under `app/`. Reconcile deployed migration history before moving/deleting files.

## Cleanup Classification

### Keep and make authoritative

- `app/src/`, package/lock/config files.
- Active sync scripts referenced by package scripts or workflows.
- Current feature specs after terminology corrections.
- The deployed-equivalent Supabase migration/function history after reconciliation.
- The Archidekt source export and database backups until restore is proven.

### Archive after transferring unique decisions

- `.kiro/specs/CODE-CLEANUP-AUDIT.md` and `SPEC-VALIDITY-AUDIT.md` (dated snapshots now superseded by this audit).
- Root `specs/list-views/` if its unique decisions are moved into current feature specs.
- Completed one-off migration/backfill/fix scripts, only after execution status and recovery value are recorded.
- Notion-era research utilities once no source data depends on them.
- Historical research outputs after durable conclusions are promoted to `app/docs/`.

### Safe to regenerate/delete locally

After confirming no active process is using them:

- `.next/`, `playwright-report/`, `test-results/`, `tsconfig.tsbuildinfo`, `node_modules/`.
- `.DS_Store` files.
- Empty duplicate research directories.
- Local Supabase `.temp/` data.

These are workspace cleanup actions, not product fixes.

### Do not delete yet

- Any Supabase migration/function tree.
- Ignored databases, CSVs, exports, environment files, or Playwright auth session before backup/security review.
- `import-engine.ts`, `import-engine-v2.ts`, or `deck-import-legacy.ts` while live callers remain.
- Active EDHREC/Scryfall scripts and mapping files.
- Any apparent orphan test until the feature is explicitly retired or a replacement test exists.

## Documentation Drift to Correct

- The living spec still uses `physical_copies`, `physical_copy_id`, `card_definitions`, and `scryfall_printings`; current names are `user_copies`, `copy_id`, `user_cards`, and `ref_printings`/`ref_cards`.
- Collection import requirements describe a non-destructive quantity-group upsert model that was superseded by instance rows.
- The delivery log says sync preserves allocation, which is not guaranteed by the current implementation.
- Roadmaps call CSV export a "full backup," which is false for relational state.
- Infrastructure docs call production-targeted E2E and security hardening "built" without noting the production mutation and admin-client gaps.
- The application README is still the create-next-app template.

## Recommended Work Order

### Phase 0 — Contain risk now

1. Disable production-mutating E2E.
2. Disable/hide collection Replace and Sync, or add a hard warning while they remain unsafe.
3. Preserve Archidekt and the source export as authoritative.
4. Verify current Supabase backup/PITR settings; take a fresh native backup.
5. Fix the generated type file so validation tools can run meaningfully.

### Phase 1 — Safe migration path

1. Create versioned import-run staging tables and a dry-run reconciliation report.
2. Build atomic approval/cutover RPC with allocation preservation.
3. Define source-specific identity and retry/idempotency behavior.
4. Build complete backup export plus restore tool and round-trip tests.
5. Test at 3,650+ copies, including interruption, retry, malformed CSV, and unmatched cards.

### Phase 2 — Trustworthy release process

1. Create isolated Supabase/Vercel test environment.
2. Repair critical test harness and make migration tests deterministic.
3. Add CI: typecheck, lint baseline, unit/integration tests, build, migration replay, isolated E2E.
4. Fix IDOR/non-atomic allocation routes and move normal user operations to RLS-backed clients.
5. Add import/allocation audit logs, error tracking, and alerts.

### Phase 3 — Simplify and organize

1. Consolidate repository and Supabase boundaries.
2. Reconcile/archive stale specs and audits.
3. Classify scripts as active, maintenance, or archive.
4. Remove duplicate/legacy endpoints only after caller and deployment-log checks.
5. Replace in-memory collection list assembly with a database projection/RPC.

## Product Direction Captured

The user has narrowed the product to a fundamentals-first collection and deck system. These decisions govern the next implementation plan:

1. **One-time cutover:** Archidekt remains the collection authority until a single reviewed migration. Oracle becomes authoritative afterward; ongoing Archidekt reconciliation is not an MVP requirement.
2. **Allocation preservation with review:** Preserve existing copy-to-deck assignments when they can be matched deterministically. Recalculate and explicitly review the remainder rather than silently discarding or guessing.
3. **Authoritative deck imports:** An explicit CSV/text reimport replaces that deck's composition. It must not affect other decks or collection ownership. The treatment of Oracle-only metadata on unchanged rows still needs confirmation.
4. **Private first release, tenant-safe foundation:** Release one serves one user, but all data access, imports, restores, and allocation mutations must remain user-scoped so future multi-user support does not require a security rewrite.
5. **Separate staging accepted:** The user is willing to create an isolated Supabase project for migration rehearsals and automated tests.
6. **Reduced feature surface:** Historical scanner runtime residue was removed on 2026-09-03; any future physical capture tool must produce the supported CSV/text input rather than introduce another write path. Card Kingdom pricing, AI Brew, and Monitor/Upgrade are frozen and must not expand while collection, deck, allocation, backup, and recovery fundamentals are stabilized.
7. **No deadline:** Safety and verifiable recovery take priority over migration speed.
8. **Current authority retained:** Archidekt and independent exports remain authoritative until all agreed migration and restore gates pass.

### Clarification: required migration fidelity

"Required fidelity" means deciding which facts must survive the one-time migration exactly. This determines the import schema, reconciliation report, backup format, and acceptance tests.

- **Identity fidelity:** card name/oracle identity, exact printing, set and collector number.
- **Ownership fidelity:** quantity and one row per physical copy.
- **Copy fidelity:** finish, condition, language, purchase price, and acquired/date-added value.
- **Oracle-only fidelity:** storage location, missing state, notes, proxy relationships, stable copy IDs, and deck allocations.

Recommended default: preserve all source fields available in the Archidekt export, retain the original source row/hash for audit, preserve Oracle-only data when it can be matched safely, and block cutover on unexplained rows. Do not silently downgrade exact printings to card-name-only ownership.

### Clarification: recovery posture

A staging project and a backup solve different problems:

- **Staging** is an isolated place to rehearse migrations, destructive operations, restore procedures, and automated tests without touching production.
- **A database backup/PITR** recovers production after deletion, corruption, or operator error.
- **The portable CSV export** is useful for inspection and interoperability, but it is not a full backup because it does not reproduce decks, allocations, copy identity, storage, preferences, or all metadata.

Recommended private-MVP posture: separate staging, a managed/native backup at least daily, a fresh snapshot before high-risk mutations, recovery point objective of no more than 24 hours, recovery time objective of one business day, and a successful restore rehearsal before cutover. The current Supabase plan and enabled backup controls still need confirmation.

### Clarification: repository boundary

The current workspace has a nested Git repository at `app/`, while Kiro specifications and production-relevant Supabase assets exist beside it. Those sibling assets are not included when `app/` is cloned or committed.

Two valid end states exist:

- Make `The_Oracle/` the Git root and retain `app/` as the deployment subdirectory. This preserves the current workspace layout but requires carefully absorbing or preserving the nested repository history.
- Keep `app/` as the Git root, move durable `.kiro`, canonical Supabase, research, and specification assets inside it, then open `app/` as the workspace root. This is the smaller Git/deployment change but requires updating workspace paths.

Recommended default: keep `app/` as the repository and make it the canonical project/workspace root. Reconcile deployed Supabase migration and function history before moving or deleting any database assets.

## Fundamentals-First MVP Interview

Please answer these together; recommendations are included so only meaningful disagreements need discussion.

1. **Weekly value:** What are the three jobs Oracle must do reliably each week to be worth switching from Archidekt? Suggested shortlist: know what you own, maintain authoritative deck lists, and know where each physical copy is allocated.
2. **Migration fidelity:** Choose **A** (preserve exact printing, quantity, finish, condition, language, purchase price, date added, and source row), **B** (printing, quantity, finish, condition only), or **C** (card name and quantity only). Recommendation: **A**.
3. **Existing Oracle data:** Choose **A** (keep decks and Oracle-authored metadata, replace collection ownership from Archidekt, reconcile allocations), **B** (back up then rebuild Oracle data), or **C** (merge both collections). Recommendation: **A**; avoid ambiguous collection merging.
4. **Allocation outcome:** Choose **A** (every assignment survives exactly), **B** (preserve deterministic matches and review/recalculate the rest), or **C** (recalculate all assignments). Current answer appears to be **B**; please confirm.
5. **Deck reimport behavior:** Should unchanged cards preserve Oracle categories, selected printing, proxy/ownership state, and valid allocation while the imported file authoritatively adds/removes quantities? Recommendation: **yes**; removed slots release copies and unmatched additions enter review.
6. **Post-cutover collection maintenance:** Choose **A** (manual per-copy editing plus safe additive CSV import), **B** (manual editing only), or **C** (continued authoritative Archidekt imports). Recommendation: **A** if bulk purchases are common, otherwise **B**; do not choose C for a one-time cutover.
7. **Operations and structure:** What Supabase plan is active, are backups/PITR enabled, and does production contain unique data? Also confirm the recommended repository choice: keep `app/` as Git root, move durable project assets into it after migration-history reconciliation, and open it as the workspace root.

Unresolved imported rows will default to blocking cutover unless each exception is explicitly reviewed and accepted.

## Go/No-Go Rule

Oracle becomes eligible to replace Archidekt only when Phase 0 and Phase 1 gates pass in an isolated environment, a native restore rehearsal succeeds, the imported collection reconciles to agreed totals/metadata, and the user approves the dry-run report. Until then, Archidekt plus independent exports remain the authoritative backup.
